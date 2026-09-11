# Spotify Social Graph

A social music app built on Spotify listening data. Users sign in with Spotify, sync their top artists and tracks, connect with friends, and explore how their tastes relate — through a compatibility score, shared favorites, hidden-gem recommendations, and an interactive music graph.

## What you can do

- **Sign in with Spotify** and sync ranked top artists / tracks
- **Find and friend other users**, then view their profiles
- **Compare taste** with a friend (compatibility score, shared artists/tracks, breakdown)
- **Discover hidden gems** — artists and tracks from an artist a friend loves that fit your taste
- **Explore the music graph** — you at the center, friends around you, edges sized by compatibility

## Backend overview

The app is a **Next.js App Router** full-stack project:

- **UI routes** (`src/app/...`) are mostly React Server Components that read Postgres and compute scores on the server
- **API routes** (`src/app/api/...`) handle mutations and client-triggered work (Spotify refresh, friend requests, gem song fetches)
- **Auth** is NextAuth with the Spotify provider (`src/auth.ts` → `/api/auth/[...nextauth]`)
- **Database** is PostgreSQL accessed through Prisma (`src/lib/prisma.ts`)

There is no separate backend service. Spotify and Last.fm are called from the Next.js server; durable state lives in Postgres.

## How data flows

```
Spotify OAuth
    │
    ▼
User row upserted in Postgres
    │
    ▼
POST /api/spotify/refresh-profile
    │  (uses session access token)
    ▼
Spotify Web API  ──►  TopArtist / TopTrack rows (per user)
    │
    ▼
Last.fm enrichment (tags, similars, track tags)
    │
    ▼
Global cache tables keyed by Spotify artist/track id
    │
    ▼
Friend pages / graph / gem API read tops + caches
    │
    ▼
compatibility.ts / gem-recommendations.ts  ──►  scores & recommendations
```

### 1. Sign-in creates (or updates) the user

On Spotify sign-in, NextAuth’s `signIn` callback upserts a `User` by `spotifyUserId` with display name, email, and image. The JWT/session also carries `accessToken` and `spotifyUserId` so later API routes can call Spotify as that user.

Scopes used: `user-top-read`, `user-read-email`.

### 2. Profile refresh syncs listening tops

`POST /api/spotify/refresh-profile`:

1. Loads the signed-in user from the session
2. Calls Spotify `GET /me/top/artists` and `/me/top/tracks` (currently **medium_term**, top 20)
3. In a transaction, **deletes** that user’s existing medium-term tops and **inserts** the new ranked rows
4. Ensures Last.fm caches exist for those artists/tracks
5. Invalidates that user’s gem recommendation cache (tops changed, so old song picks are stale)

Tops are **owned by the user**. They are not shared tables — each friend comparison joins two users’ top lists.

### 3. Last.fm enrichment is global and cached

Last.fm data is expensive and overlapping across users (many people like the same artists). So enrichment is stored **once per Spotify id**, not per user:

| Cache table | Key | Contents |
| --- | --- | --- |
| `ArtistTagCache` | `spotifyArtistId` | Last.fm top tags |
| `ArtistSimilarCache` | `spotifyArtistId` | Similar artists + match strength (JSON) |
| `TrackTagCache` | `spotifyTrackId` | Last.fm track tags |
| `ArtistTopTracksCache` | `spotifyArtistId` | Artist’s Last.fm top tracks + their tags (JSON) |
| `GemRecommendationCache` | `(viewer, friend, artist)` | Precomputed gem song picks for that pair/artist |

Helpers in `artist-tags.ts`, `track-tags.ts`, and `gem-recommendations.ts`:

- Skip rows fresher than **~7 days**
- Can run in **only-missing** mode on friend/graph pages (backfill gaps without a full refresh)
- Fetch sequentially with small delays to respect Last.fm rate limits
- Any user’s refresh can populate a cache row that later benefits everyone

Friend pages do **not** require the friend to refresh for tags/similars — missing cache rows can be filled while viewing them, as long as their Spotify tops are already in the DB.

### 4. Social features read stored tops + caches

- **`/friends/[friendId]`** — verifies friendship, loads both users’ medium-term tops, ensures caches, runs `calculateCompatibility()`
- **`/graph`** — loads you + all friends’ tops, ensures caches once for the whole set, scores each edge with the same compatibility function
- **`POST /api/friends/gem-recommendations`** — for a gem artist, returns deeper track picks (DB cache first, then Last.fm + scoring)

Compatibility itself is **computed on read**, not stored. Only enrichment and gem song results are cached.

## Data model (Postgres)

### Identity & listening

- **`User`** — app user keyed by Spotify id (`spotifyUserId` unique)
- **`TopArtist`** — ranked artists for a user + `timeRange`  
  unique on `(userId, spotifyArtistId, timeRange)`
- **`TopTrack`** — ranked tracks for a user + `timeRange`  
  unique on `(userId, spotifyTrackId, timeRange)`

`rank` is 1-based order from Spotify. Social scoring currently uses `timeRange = "medium_term"`.

### Social graph

- **`FriendRequest`** — sender → receiver with `PENDING` / `ACCEPTED` / `REJECTED`  
  unique on `(senderId, receiverId)`
- **`Friendship`** — accepted connection stored as an **ordered pair** `(userAId, userBId)` where `userAId < userBId`, so each friendship is one row either way you look it up

API surface:

- `GET /api/friends` — friends + incoming/outgoing pending requests
- `POST /api/friends/request` — send request
- `POST /api/friends/respond` — accept/reject
- `GET /api/users/search` — find users to add

Accepting a request creates the `Friendship` row; comparison and graph edges only use friendships.

### Cache & recommendations

See the cache table list above. `GemRecommendationCache` is viewer-specific (your taste vs their artist), unlike the global Last.fm caches.

## Compatibility score

Friend comparison lives at `/friends/[friendId]` and uses `calculateCompatibility()` in `src/lib/compatibility.ts`.

### Rank weighting

Higher-ranked items matter more. Rank weight decays with a half-life of 6:

```
weight(rank) = 2^(-(rank - 1) / 6)
```

So #1 outweighs #20, but the tail still contributes.

### Signals

| Signal | What it measures | How |
| --- | --- | --- |
| **Artist similarity** | Exact shared artists | Weighted cosine over Spotify artist IDs |
| **Tag similarity** | Shared genres / vibes | Build tag vectors from Last.fm artist + track tags (weighted by rank), then cosine (or Jaccard fallback) |
| **Soft artist similarity** | Near-matches when IDs don’t overlap | Last.fm `artist.getSimilar`: if your artist is “similar” to one on their list (by name), count a partial match; averaged both directions |
| **Track similarity** | Exact shared tracks | Weighted cosine over Spotify track IDs — used only as a **small boost**, not the base score |

### Blending into a 0–100 score

Shared tracks are intentionally **not** in the base mix (they’re usually too sparse). Base score depends on which Last.fm signals are available:

- **Tags + soft similars:** `0.30 * artist + 0.35 * tags + 0.35 * soft`
- **Tags only:** `0.40 * artist + 0.60 * tags`
- **Soft only:** `0.35 * artist + 0.65 * soft`
- **Neither:** artist similarity alone

If there is real track overlap, a small boost is added: up to `0.12 * trackSim`. The final value is rounded to 0–100.

The UI also displays **shared artists**, **shared tracks**, and a **breakdown** of which signals fired.

## Hidden gems

On a friend page, gems are artists/tracks in **their** tops that you don’t already have, ranked by how well they fit **you**.

### Artist gems

For each of their artists you don’t share:

1. Check Last.fm similar-artists both ways (“similar to someone you like” / “similar to someone they like that you know”)
2. Score tag overlap against your personal tag vector
3. Add a small boost for how high they rank that artist

Rough mix: `0.70 * similar + 0.25 * tags + friend-rank boost`. Top 5 by fit score are shown, with a short reason (e.g. “Because you like Radiohead”).

### Track gems (friend page)

Same idea for tracks you don’t share: prefer tracks from artists you already like or that are similar to yours, plus track-tag overlap, plus their rank.

### Deeper track recommendations

`src/lib/gem-recommendations.ts` goes further for a gem artist:

1. Prefer tracks from the friend’s own Spotify tops for that artist
2. Fill with Last.fm artist top tracks (`ArtistTopTracksCache`)
3. Score candidates against your tag profile
4. Store the result in `GemRecommendationCache` keyed by viewer + friend + artist

Friend listens get a small ranking boost so their actual taste sorts above generic Last.fm fills.

## Music graph

`/graph` renders you as the center node and friends in a circle (`@xyflow/react`).

- Edge **color / thickness / opacity** scale with the compatibility score
- Clicking a friend navigates to their comparison page
- Compatibility on the graph uses the same scoring path as the friend page (same tops + same caches)

## Main code map

```
src/app/
  page.tsx                 Landing / Spotify sign-in
  dashboard/               Tops sync UI + friends panel
  friends/[friendId]/     Compatibility UI + gems
  graph/                   Interactive social graph
  api/
    auth/[...nextauth]/   NextAuth handlers
    spotify/refresh-profile/  Sync Spotify tops + warm caches
    friends/               List / request / respond / gem recs
    users/search/          Find users

src/lib/
  compatibility.ts         Score blending, shared items, gem picking
  gem-recommendations.ts   Deeper track recommendations + cache
  lastfm.ts                Last.fm HTTP client
  artist-tags.ts           Artist tag/similar cache helpers
  track-tags.ts            Track tag cache helpers
  prisma.ts                Postgres client
  auth.ts                  NextAuth + Spotify + user upsert

prisma/                    Schema + migrations
```

## Design notes

- **Exact Spotify IDs** catch true overlap; **Last.fm tags + similars** catch “same vibe, different artists.”
- **User tops are private rows; enrichment caches are global** — that split keeps comparisons consistent and cheap.
- **Scores are computed on read**; only enrichment and gem song lists are persisted.
- **Medium-term** tops are the window used for social features — a balance between “right now” and “all time.”
- **Caching + sequential Last.fm fetches** keep the app fast and rate-limit friendly.
