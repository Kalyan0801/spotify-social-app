import { prisma } from "@/lib/prisma";
import { fetchArtistTopTracks, fetchTrackTopTags } from "@/lib/lastfm";
import {
  ensureArtistLastFmCached,
  getTagsBySpotifyArtistIds,
} from "@/lib/artist-tags";
import {
  ensureTrackTagsCached,
  getTagsBySpotifyTrackIds,
} from "@/lib/track-tags";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const REC_LIMIT = 3;
/** Ranking-only bump so friend listens sort above Last.fm fills — not shown as tag fit. */
const FRIEND_SOURCE_BOOST = 0.15;

export type GemTrackRecommendation = {
  name: string;
  artistName: string;
  image: string | null;
  source: "friend" | "lastfm";
  fitScore: number;
  reason: string;
  sharedTags: string[];
};

type CachedTopTrack = {
  name: string;
  tags: string[];
};

type MyTasteItem = {
  spotifyArtistId?: string;
  spotifyTrackId?: string;
  name: string;
  rank: number;
  artistNames?: string[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function rankWeight(rank: number): number {
  return Math.pow(2, -(rank - 1) / 6);
}

function isFresh(updatedAt: Date, now: number): boolean {
  return now - updatedAt.getTime() < CACHE_TTL_MS;
}

/**
 * Tag fit: sum of my rank-weights for tags on the candidate track,
 * divided by (top-rank weight × 3) and capped at 1.
 */
function tagHitScore(
  itemTags: string[],
  myTagWeights: Map<string, number>
): { score: number; shared: string[] } {
  if (!itemTags.length || myTagWeights.size === 0) {
    return { score: 0, shared: [] };
  }

  const shared: string[] = [];
  let weighted = 0;
  for (const tag of itemTags) {
    const w = myTagWeights.get(tag);
    if (w === undefined) continue;
    shared.push(tag);
    weighted += w;
  }

  if (!shared.length) return { score: 0, shared: [] };
  return {
    score: Math.min(1, weighted / (rankWeight(1) * 3)),
    shared,
  };
}

function buildMyTagWeights(
  artistTags: Map<string, string[]>,
  trackTags: Map<string, string[]>,
  myArtists: MyTasteItem[],
  myTracks: MyTasteItem[]
): Map<string, number> {
  const weights = new Map<string, number>();

  for (const artist of myArtists) {
    if (!artist.spotifyArtistId) continue;
    const tags = artistTags.get(artist.spotifyArtistId) ?? [];
    const w = rankWeight(artist.rank);
    for (const tag of tags) {
      weights.set(tag, (weights.get(tag) ?? 0) + w);
    }
  }

  for (const track of myTracks) {
    if (!track.spotifyTrackId) continue;
    const tags = trackTags.get(track.spotifyTrackId) ?? [];
    const w = rankWeight(track.rank);
    for (const tag of tags) {
      weights.set(tag, (weights.get(tag) ?? 0) + w);
    }
  }

  return weights;
}

async function ensureArtistTopTracksCached(
  spotifyArtistId: string,
  artistName: string
): Promise<CachedTopTrack[]> {
  const existing = await prisma.artistTopTracksCache.findUnique({
    where: { spotifyArtistId },
  });

  if (existing && isFresh(existing.updatedAt, Date.now())) {
    const parsed = Array.isArray(existing.tracks)
      ? (existing.tracks as CachedTopTrack[])
      : [];
    const usable = parsed.filter(
      (t) => t && typeof t.name === "string" && Array.isArray(t.tags)
    );
    // Re-fetch if every cached track has empty tags (useless for scoring).
    if (usable.length && usable.some((t) => t.tags.length > 0)) {
      return usable;
    }
  }

  if (!process.env.LASTFM_API_KEY) {
    return [];
  }

  const { tracks } = await fetchArtistTopTracks(artistName);
  const enriched: CachedTopTrack[] = [];

  for (const track of tracks) {
    const { tags } = await fetchTrackTopTags(track.name, track.artistName);
    enriched.push({ name: track.name, tags });
    await sleep(120);
  }

  await prisma.artistTopTracksCache.upsert({
    where: { spotifyArtistId },
    update: {
      artistName,
      tracks: enriched,
    },
    create: {
      spotifyArtistId,
      artistName,
      tracks: enriched,
    },
  });

  return enriched;
}

function reasonFromTags(shared: string[], source: "friend" | "lastfm"): string {
  if (shared.length) {
    return `Shares your tags: ${shared.slice(0, 2).join(", ")}`;
  }
  if (source === "friend") {
    return "From their listening";
  }
  return "Popular for this artist";
}

/**
 * Recommend a few songs for a hidden-gem artist, ranked by overlap with the
 * viewer's Last.fm tag profile. Prefers the friend's own tracks by that artist.
 * Prefer `getCachedGemTrackRecommendations` from the API so results persist.
 */
export async function computeGemTrackRecommendations(input: {
  spotifyArtistId: string;
  artistName: string;
  myArtists: MyTasteItem[];
  myTracks: MyTasteItem[];
  friendTracks: Array<{
    name: string;
    artistNames: string[];
    image: string | null;
    spotifyTrackId: string;
  }>;
}): Promise<GemTrackRecommendation[]> {
  const artistKey = normalizeName(input.artistName);

  const myArtistIds = input.myArtists
    .map((a) => a.spotifyArtistId)
    .filter((id): id is string => Boolean(id));
  const myTrackIds = input.myTracks
    .map((t) => t.spotifyTrackId)
    .filter((id): id is string => Boolean(id));

  const friendByArtist = input.friendTracks.filter((track) =>
    track.artistNames.some((name) => normalizeName(name) === artistKey)
  );

  // Backfill here (not only on page load): empty cache rows are re-fetched.
  await ensureArtistLastFmCached(
    [
      { spotifyArtistId: input.spotifyArtistId, name: input.artistName },
      ...input.myArtists
        .filter((a) => a.spotifyArtistId)
        .map((a) => ({
          spotifyArtistId: a.spotifyArtistId as string,
          name: a.name,
        })),
    ],
    { onlyMissing: true, delayMs: 80 }
  );

  await ensureTrackTagsCached(
    [
      ...input.myTracks
        .filter((t) => t.spotifyTrackId)
        .map((t) => ({
          spotifyTrackId: t.spotifyTrackId as string,
          name: t.name,
          artistNames: t.artistNames ?? [],
        })),
      ...friendByArtist.map((t) => ({
        spotifyTrackId: t.spotifyTrackId,
        name: t.name,
        artistNames: t.artistNames,
      })),
    ],
    { onlyMissing: true, delayMs: 80 }
  );

  const [artistTags, trackTags, lastFmTracks] = await Promise.all([
    getTagsBySpotifyArtistIds([...myArtistIds, input.spotifyArtistId]),
    getTagsBySpotifyTrackIds([
      ...myTrackIds,
      ...friendByArtist.map((t) => t.spotifyTrackId),
    ]),
    ensureArtistTopTracksCached(input.spotifyArtistId, input.artistName),
  ]);

  const myTagWeights = buildMyTagWeights(
    artistTags,
    trackTags,
    input.myArtists,
    input.myTracks
  );
  const gemArtistTags = artistTags.get(input.spotifyArtistId) ?? [];

  const scored: Array<GemTrackRecommendation & { rankScore: number }> = [];
  const seen = new Set<string>();

  for (const track of friendByArtist) {
    const key = normalizeName(track.name);
    if (seen.has(key)) continue;
    seen.add(key);

    const trackLevel = trackTags.get(track.spotifyTrackId) ?? [];
    // Fall back to the gem artist's tags when the track has none.
    const tags = trackLevel.length ? trackLevel : gemArtistTags;
    const { score, shared } = tagHitScore(tags, myTagWeights);
    scored.push({
      name: track.name,
      artistName: track.artistNames[0] ?? input.artistName,
      image: track.image,
      source: "friend",
      fitScore: score,
      reason: reasonFromTags(shared, "friend"),
      sharedTags: shared.slice(0, 3),
      rankScore: score + FRIEND_SOURCE_BOOST,
    });
  }

  for (const track of lastFmTracks) {
    const key = normalizeName(track.name);
    if (seen.has(key)) continue;
    seen.add(key);

    const tags = track.tags.length ? track.tags : gemArtistTags;
    const { score, shared } = tagHitScore(tags, myTagWeights);
    scored.push({
      name: track.name,
      artistName: input.artistName,
      image: null,
      source: "lastfm",
      fitScore: score,
      reason: reasonFromTags(shared, "lastfm"),
      sharedTags: shared.slice(0, 3),
      rankScore: score,
    });
  }

  scored.sort(
    (a, b) => b.rankScore - a.rankScore || a.name.localeCompare(b.name)
  );

  const withTagFit = scored.filter((t) => t.fitScore > 0);
  const friendFills = scored.filter((t) => t.source === "friend");
  const pool = withTagFit.length
    ? withTagFit
    : friendFills.length
      ? friendFills
      : scored;

  return pool.slice(0, REC_LIMIT).map(({ rankScore: _, ...track }) => track);
}

function parseCachedRecommendations(value: unknown): GemTrackRecommendation[] {
  if (!Array.isArray(value)) return [];
  const out: GemTrackRecommendation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string" || typeof row.artistName !== "string") {
      continue;
    }
    out.push({
      name: row.name,
      artistName: row.artistName,
      image: typeof row.image === "string" ? row.image : null,
      source: row.source === "friend" ? "friend" : "lastfm",
      fitScore: typeof row.fitScore === "number" ? row.fitScore : 0,
      reason: typeof row.reason === "string" ? row.reason : "",
      sharedTags: Array.isArray(row.sharedTags)
        ? row.sharedTags.filter((t): t is string => typeof t === "string")
        : [],
    });
  }
  return out;
}

/**
 * Returns gem song recs from DB when fresh; otherwise computes, stores, and returns.
 * Keyed by viewer + friend + artist so each pair keeps its own taste-fit picks.
 */
export async function getCachedGemTrackRecommendations(input: {
  viewerUserId: string;
  friendUserId: string;
  spotifyArtistId: string;
  artistName: string;
  myArtists: MyTasteItem[];
  myTracks: MyTasteItem[];
  friendTracks: Array<{
    name: string;
    artistNames: string[];
    image: string | null;
    spotifyTrackId: string;
  }>;
  /** Force recompute (e.g. after Spotify refresh). */
  forceRefresh?: boolean;
}): Promise<{ recommendations: GemTrackRecommendation[]; cached: boolean }> {
  const {
    viewerUserId,
    friendUserId,
    spotifyArtistId,
    artistName,
    forceRefresh = false,
  } = input;

  if (!forceRefresh) {
    const existing = await prisma.gemRecommendationCache.findUnique({
      where: {
        viewerUserId_friendUserId_spotifyArtistId: {
          viewerUserId,
          friendUserId,
          spotifyArtistId,
        },
      },
    });

    if (existing && isFresh(existing.updatedAt, Date.now())) {
      const recommendations = parseCachedRecommendations(
        existing.recommendations
      );
      if (recommendations.length > 0) {
        return { recommendations, cached: true };
      }
    }
  }

  const recommendations = await computeGemTrackRecommendations({
    spotifyArtistId,
    artistName,
    myArtists: input.myArtists,
    myTracks: input.myTracks,
    friendTracks: input.friendTracks,
  });

  await prisma.gemRecommendationCache.upsert({
    where: {
      viewerUserId_friendUserId_spotifyArtistId: {
        viewerUserId,
        friendUserId,
        spotifyArtistId,
      },
    },
    update: {
      artistName,
      recommendations,
    },
    create: {
      viewerUserId,
      friendUserId,
      spotifyArtistId,
      artistName,
      recommendations,
    },
  });

  return { recommendations, cached: false };
}

/** Drop gem rec caches for a user (call after Spotify refresh). */
export async function invalidateGemRecommendationCachesForUser(
  userId: string
): Promise<void> {
  await prisma.gemRecommendationCache.deleteMany({
    where: {
      OR: [{ viewerUserId: userId }, { friendUserId: userId }],
    },
  });
}
