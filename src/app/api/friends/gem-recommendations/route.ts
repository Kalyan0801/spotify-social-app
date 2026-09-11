import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser } from "@/lib/current-user";
import { getCachedGemTrackRecommendations } from "@/lib/gem-recommendations";

function orderedPair(userId1: string, userId2: string) {
  return userId1 < userId2
    ? { userAId: userId1, userBId: userId2 }
    : { userAId: userId2, userBId: userId1 };
}

export async function POST(request: Request) {
  const currentUser = await getCurrentDbUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    friendId?: string;
    spotifyArtistId?: string;
    artistName?: string;
    forceRefresh?: boolean;
  };

  const friendId = body.friendId?.trim();
  const spotifyArtistId = body.spotifyArtistId?.trim();
  const artistName = body.artistName?.trim();
  const forceRefresh = body.forceRefresh === true;

  if (!friendId || !spotifyArtistId || !artistName) {
    return NextResponse.json(
      { error: "Missing friendId, spotifyArtistId, or artistName" },
      { status: 400 }
    );
  }

  const pair = orderedPair(currentUser.id, friendId);
  const friendship = await prisma.friendship.findUnique({
    where: { userAId_userBId: pair },
  });

  if (!friendship) {
    return NextResponse.json({ error: "Not friends" }, { status: 403 });
  }

  // Fast path: serve DB cache without loading Spotify tops again.
  if (!forceRefresh) {
    const existing = await prisma.gemRecommendationCache.findUnique({
      where: {
        viewerUserId_friendUserId_spotifyArtistId: {
          viewerUserId: currentUser.id,
          friendUserId: friendId,
          spotifyArtistId,
        },
      },
    });

    const cacheTtlMs = 1000 * 60 * 60 * 24 * 7;
    if (
      existing &&
      Date.now() - existing.updatedAt.getTime() < cacheTtlMs &&
      Array.isArray(existing.recommendations) &&
      existing.recommendations.length > 0
    ) {
      return NextResponse.json({
        artistName: existing.artistName,
        recommendations: existing.recommendations,
        cached: true,
      });
    }
  }

  const [me, friend] = await Promise.all([
    prisma.user.findUnique({
      where: { id: currentUser.id },
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
    }),
    prisma.user.findUnique({
      where: { id: friendId },
      include: {
        topTracks: {
          where: { timeRange: "medium_term" },
          orderBy: { rank: "asc" },
        },
      },
    }),
  ]);

  if (!me || !friend) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { recommendations, cached } = await getCachedGemTrackRecommendations({
    viewerUserId: currentUser.id,
    friendUserId: friendId,
    spotifyArtistId,
    artistName,
    forceRefresh,
    myArtists: me.topArtists.map((artist) => ({
      spotifyArtistId: artist.spotifyArtistId,
      name: artist.name,
      rank: artist.rank,
    })),
    myTracks: me.topTracks.map((track) => ({
      spotifyTrackId: track.spotifyTrackId,
      name: track.name,
      rank: track.rank,
      artistNames: track.artistNames,
    })),
    friendTracks: friend.topTracks.map((track) => ({
      name: track.name,
      artistNames: track.artistNames,
      image: track.image,
      spotifyTrackId: track.spotifyTrackId,
    })),
  });

  return NextResponse.json({
    artistName,
    recommendations,
    cached,
  });
}
