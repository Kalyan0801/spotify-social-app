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
import { SocialGraph } from "./SocialGraph";

const mediumTerm = {
  where: { timeRange: "medium_term" as const },
  orderBy: { rank: "asc" as const },
};

export default async function GraphPage() {
  const session = await auth();

  if (!session?.spotifyUserId) {
    redirect("/");
  }

  const currentUser = await prisma.user.findUnique({
    where: { spotifyUserId: session.spotifyUserId },
    include: {
      topArtists: mediumTerm,
      topTracks: mediumTerm,
    },
  });

  if (!currentUser) {
    redirect("/");
  }

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: currentUser.id }, { userBId: currentUser.id }],
    },
    include: {
      userA: {
        include: {
          topArtists: mediumTerm,
          topTracks: mediumTerm,
        },
      },
      userB: {
        include: {
          topArtists: mediumTerm,
          topTracks: mediumTerm,
        },
      },
    },
  });

  const friends = friendships.map((friendship) =>
    friendship.userAId === currentUser.id ? friendship.userB : friendship.userA
  );

  // One shared Last.fm cache load for you + all friends (same signals as /friends/[id]).
  const artistsForCache = [
    ...currentUser.topArtists.map((artist) => ({
      spotifyArtistId: artist.spotifyArtistId,
      name: artist.name,
    })),
    ...friends.flatMap((friend) =>
      friend.topArtists.map((artist) => ({
        spotifyArtistId: artist.spotifyArtistId,
        name: artist.name,
      }))
    ),
  ];
  const tracksForCache = [
    ...currentUser.topTracks.map((track) => ({
      spotifyTrackId: track.spotifyTrackId,
      name: track.name,
      artistNames: track.artistNames,
    })),
    ...friends.flatMap((friend) =>
      friend.topTracks.map((track) => ({
        spotifyTrackId: track.spotifyTrackId,
        name: track.name,
        artistNames: track.artistNames,
      }))
    ),
  ];

  await ensureArtistLastFmCached(artistsForCache, {
    onlyMissing: true,
    delayMs: 60,
  });
  await ensureTrackTagsCached(tracksForCache, {
    onlyMissing: true,
    delayMs: 60,
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

  const graphFriends = friends.map((friend) => {
    const hasTasteData =
      friend.topArtists.length > 0 || friend.topTracks.length > 0;

    const compatibility = hasTasteData
      ? calculateCompatibility(
          currentUser.topArtists,
          friend.topArtists,
          currentUser.topTracks,
          friend.topTracks,
          tagsByArtistId,
          similarsByArtistId,
          tagsByTrackId
        )
      : null;

    return {
      id: friend.id,
      displayName: friend.displayName,
      image: friend.image,
      compatibility: compatibility?.score ?? null,
    };
  });

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-block text-sm text-green-400"
        >
          ← Back to dashboard
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold">Your Music Graph</h1>
          <p className="mt-2 text-neutral-400">
            Compatibility uses the same Spotify + Last.fm signals as each
            friend comparison page (artists, tracks, tags, similar artists).
          </p>
        </div>

        {graphFriends.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-10 text-center">
            <p className="text-lg text-neutral-200">No friends on your graph yet</p>
            <p className="mt-2 text-sm text-neutral-500">
              Add friends from the dashboard to see taste connections here.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-block rounded-full bg-green-500 px-5 py-2 font-medium text-black hover:bg-green-400"
            >
              Go to dashboard
            </Link>
          </div>
        ) : (
          <SocialGraph
            currentUser={{
              id: currentUser.id,
              displayName: currentUser.displayName,
              image: currentUser.image,
            }}
            friends={graphFriends}
          />
        )}
      </div>
    </main>
  );
}
