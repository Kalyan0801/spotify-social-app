import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateCompatibility } from "@/lib/compatibility";
import {
  ensureArtistLastFmCached,
  getSimilarsBySpotifyArtistIds,
  getTagsBySpotifyArtistIds,
} from "@/lib/artist-tags";
import {
  ensureTrackTagsCached,
  getTagsBySpotifyTrackIds,
} from "@/lib/track-tags";
import { HiddenGemArtists } from "./HiddenGemArtists";

type FriendPageProps = {
  params: Promise<{
    friendId: string;
  }>;
};

function orderedPair(userId1: string, userId2: string) {
  return userId1 < userId2
    ? { userAId: userId1, userBId: userId2 }
    : { userAId: userId2, userBId: userId1 };
}

export default async function FriendComparisonPage({ params }: FriendPageProps) {
  const { friendId } = await params;

  const session = await auth();

  if (!session?.spotifyUserId) {
    redirect("/");
  }

  const currentUser = await prisma.user.findUnique({
    where: {
      spotifyUserId: session.spotifyUserId,
    },
    include: {
      topArtists: {
        where: { timeRange: "medium_term" },
        orderBy: { rank: "asc" },
      },
      topTracks: {
        where: { timeRange: "medium_term" },
        orderBy: { rank: "asc" },
      },
    },
  });

  if (!currentUser) {
    redirect("/");
  }

  const friend = await prisma.user.findUnique({
    where: {
      id: friendId,
    },
    include: {
      topArtists: {
        where: { timeRange: "medium_term" },
        orderBy: { rank: "asc" },
      },
      topTracks: {
        where: { timeRange: "medium_term" },
        orderBy: { rank: "asc" },
      },
    },
  });

  if (!friend) {
    redirect("/dashboard");
  }

  const pair = orderedPair(currentUser.id, friend.id);

  const friendship = await prisma.friendship.findUnique({
    where: {
      userAId_userBId: pair,
    },
  });

  if (!friendship) {
    redirect("/dashboard");
  }

  // Last.fm cache is global by artist/track id — fill gaps here so a friend
  // doesn't need to refresh for tags/similars (only for Spotify tops already in DB).
  const artistsForCache = [
    ...currentUser.topArtists.map((artist) => ({
      spotifyArtistId: artist.spotifyArtistId,
      name: artist.name,
    })),
    ...friend.topArtists.map((artist) => ({
      spotifyArtistId: artist.spotifyArtistId,
      name: artist.name,
    })),
  ];
  const tracksForCache = [
    ...currentUser.topTracks.map((track) => ({
      spotifyTrackId: track.spotifyTrackId,
      name: track.name,
      artistNames: track.artistNames,
    })),
    ...friend.topTracks.map((track) => ({
      spotifyTrackId: track.spotifyTrackId,
      name: track.name,
      artistNames: track.artistNames,
    })),
  ];

  await ensureArtistLastFmCached(artistsForCache, {
    onlyMissing: true,
    delayMs: 120,
  });
  await ensureTrackTagsCached(tracksForCache, {
    onlyMissing: true,
    delayMs: 120,
  });

  const artistIds = artistsForCache.map((artist) => artist.spotifyArtistId);
  const trackIds = tracksForCache.map((track) => track.spotifyTrackId);
  const [tagsByArtistId, similarsByArtistId, tagsByTrackId] = await Promise.all(
    [
      getTagsBySpotifyArtistIds(artistIds),
      getSimilarsBySpotifyArtistIds(artistIds),
      getTagsBySpotifyTrackIds(trackIds),
    ]
  );

  const compatibility = calculateCompatibility(
    currentUser.topArtists,
    friend.topArtists,
    currentUser.topTracks,
    friend.topTracks,
    tagsByArtistId,
    similarsByArtistId,
    tagsByTrackId
  );

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard" className="mb-8 inline-block text-sm text-green-400">
          ← Back to dashboard
        </Link>

        <section className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex items-center gap-4">
            {friend.image ? (
              <img
                src={friend.image}
                alt={friend.displayName ?? "Friend"}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800">
                ?
              </div>
            )}

            <div>
              <p className="text-sm text-neutral-400">Music compatibility with</p>
              <h1 className="text-3xl font-bold">
                {friend.displayName ?? "Unnamed user"}
              </h1>
            </div>
          </div>

          <div className="mt-8">
            <p className="text-sm uppercase tracking-[0.25em] text-neutral-500">
              Compatibility Score
            </p>
            <p className="mt-2 text-6xl font-bold text-green-400">
              {compatibility.score}%
            </p>
          </div>

          <div className="mt-8 space-y-4 border-t border-neutral-800 pt-6">
            <p className="text-sm font-medium text-neutral-300">Score breakdown</p>
            {(
              [
                {
                  key: "artists",
                  label: "Shared artists",
                  value: compatibility.breakdown.artistSim,
                  hint: "Exact Spotify artist overlap",
                },
                {
                  key: "tracks",
                  label: "Shared tracks",
                  value: compatibility.breakdown.usedSharedTracks
                    ? compatibility.breakdown.trackSim
                    : null,
                  hint: compatibility.breakdown.usedSharedTracks
                    ? `Bonus +${Math.round(compatibility.breakdown.trackBoost * 100)} pts (not in base mix)`
                    : "No shared tracks — not counted in score",
                },
                {
                  key: "tags",
                  label: "Taste tags",
                  value: compatibility.breakdown.usedLastFmTags
                    ? compatibility.breakdown.tagSim
                    : null,
                  hint: compatibility.breakdown.usedLastFmTags
                    ? "Last.fm artist + track tags"
                    : "No tag data yet — refresh Spotify data",
                },
                {
                  key: "similar",
                  label: "Similar artists",
                  value: compatibility.breakdown.usedLastFmSimilar
                    ? compatibility.breakdown.softArtistSim
                    : null,
                  hint: compatibility.breakdown.usedLastFmSimilar
                    ? "Last.fm near-matches (not exact IDs)"
                    : "No similar-artist data yet — refresh Spotify data",
                },
              ] as const
            ).map((row) => {
              const pct =
                row.value === null ? null : Math.round(row.value * 100);
              return (
                <div key={row.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-sm text-white">{row.label}</p>
                      <p className="text-xs text-neutral-500">{row.hint}</p>
                    </div>
                    <p className="shrink-0 text-sm tabular-nums text-neutral-300">
                      {pct === null ? "—" : `${pct}%`}
                    </p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <HiddenGemArtists
            friendId={friend.id}
            friendDisplayName={friend.displayName}
            artists={compatibility.hiddenGemArtists.map((artist) => ({
              id: artist.id,
              spotifyArtistId: artist.spotifyArtistId,
              name: artist.name,
              image: artist.image,
              rank: artist.rank,
              fitScore: artist.fitScore,
              reason: artist.reason,
            }))}
          />

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-1 text-xl font-semibold">
              Hidden Gem Tracks From {friend.displayName}
            </h2>
            <p className="mb-4 text-sm text-neutral-500">
              Songs you don&apos;t share that still sit near your taste.
            </p>

            {compatibility.hiddenGemTracks.length ? (
              <div className="space-y-3">
                {compatibility.hiddenGemTracks.map((track) => (
                  <div key={track.id} className="flex items-center gap-3">
                    {track.image ? (
                      <img
                        src={track.image}
                        alt={track.name}
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : null}
                    <div>
                      <p>{track.name}</p>
                      <p className="text-sm text-neutral-400">
                        {track.artistNames.join(", ")}
                      </p>
                      <p className="text-sm text-green-400/90">{track.reason}</p>
                      {track.fitScore > 0 ? (
                        <p className="text-xs text-neutral-500">
                          {Math.round(track.fitScore * 100)}% fit
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-400">No hidden gem tracks found.</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}