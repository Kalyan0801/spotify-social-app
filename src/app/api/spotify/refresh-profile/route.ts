import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type SpotifyArtist = {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  images: { url: string }[];
};

type SpotifyTrack = {
  id: string;
  name: string;
  popularity: number;
  album: {
    name: string;
    images: { url: string }[];
  };
  artists: { name: string }[];
};

async function fetchTopItems<T>(
  accessToken: string,
  type: "artists" | "tracks",
  timeRange = "medium_term"
): Promise<T[]> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/top/${type}?limit=20&time_range=${timeRange}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Spotify API error: ${res.status}`);
  }

  const data = await res.json();
  return data.items;
}

export async function POST() {
  const session = await auth();

  if (!session?.accessToken || !session.spotifyUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: {
      spotifyUserId: session.spotifyUserId,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const timeRange = "medium_term";

  const [artists, tracks] = await Promise.all([
    fetchTopItems<SpotifyArtist>(session.accessToken, "artists", timeRange),
    fetchTopItems<SpotifyTrack>(session.accessToken, "tracks", timeRange),
  ]);

  console.info("[spotify-refresh] popularity summary", {
    artistPopularityCount: artists.filter((artist) => artist.popularity != null)
      .length,
    trackPopularityCount: tracks.filter((track) => track.popularity != null)
      .length,
    firstArtistPopularity: artists[0]?.popularity ?? null,
    firstTrackPopularity: tracks[0]?.popularity ?? null,
  });

  await prisma.$transaction([
    prisma.topArtist.deleteMany({
      where: {
        userId: user.id,
        timeRange,
      },
    }),

    prisma.topTrack.deleteMany({
      where: {
        userId: user.id,
        timeRange,
      },
    }),

    prisma.topArtist.createMany({
      data: artists.map((artist, index) => ({
        userId: user.id,
        spotifyArtistId: artist.id,
        name: artist.name,
        image: artist.images?.[0]?.url ?? null,
        genres: artist.genres ?? [],
        popularity: artist.popularity ?? null,
        rank: index + 1,
        timeRange,
      })),
    }),

    prisma.topTrack.createMany({
      data: tracks.map((track, index) => ({
        userId: user.id,
        spotifyTrackId: track.id,
        name: track.name,
        artistNames: track.artists.map((artist) => artist.name),
        albumName: track.album?.name ?? null,
        image: track.album?.images?.[0]?.url ?? null,
        popularity: track.popularity ?? null,
        rank: index + 1,
        timeRange,
      })),
    }),
  ]);

  return NextResponse.json({
    ok: true,
    artistsStored: artists.length,
    tracksStored: tracks.length,
  });
}