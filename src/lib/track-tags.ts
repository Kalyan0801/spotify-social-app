import { prisma } from "@/lib/prisma";
import { fetchTrackTopTags } from "@/lib/lastfm";

/** Re-fetch Last.fm track tags if older than this. */
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

type TrackForEnrichment = {
  spotifyTrackId: string;
  name: string;
  artistNames: string[];
};

type EnsureTrackTagOptions = {
  onlyMissing?: boolean;
  delayMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFresh(updatedAt: Date, now: number): boolean {
  return now - updatedAt.getTime() < CACHE_TTL_MS;
}

/**
 * Ensures Last.fm track-tag cache rows exist for the given Spotify tracks.
 * Cache is global by Spotify track id.
 */
export async function ensureTrackTagsCached(
  tracks: TrackForEnrichment[],
  options: EnsureTrackTagOptions = {}
): Promise<{ refreshed: number; skipped: number }> {
  if (!process.env.LASTFM_API_KEY || tracks.length === 0) {
    return { refreshed: 0, skipped: tracks.length };
  }

  const onlyMissing = options.onlyMissing ?? false;
  const delayMs = options.delayMs ?? 250;

  const unique = new Map<string, TrackForEnrichment>();
  for (const track of tracks) {
    if (!unique.has(track.spotifyTrackId)) {
      unique.set(track.spotifyTrackId, track);
    }
  }

  const ids = [...unique.keys()];
  const existing = await prisma.trackTagCache.findMany({
    where: { spotifyTrackId: { in: ids } },
  });
  const byId = new Map(existing.map((row) => [row.spotifyTrackId, row]));

  const now = Date.now();
  let refreshed = 0;
  let skipped = 0;

  for (const track of unique.values()) {
    const row = byId.get(track.spotifyTrackId);
    // Empty tag arrays count as missing — Last.fm often returns nothing on
    // first try (title mismatch); don't permanently cache a dead miss.
    const needFetch = onlyMissing
      ? !row || row.tags.length === 0
      : !(row && isFresh(row.updatedAt, now) && row.tags.length > 0);

    if (!needFetch) {
      skipped += 1;
      continue;
    }

    const primaryArtist = track.artistNames[0] ?? "";
    const { tags } = await fetchTrackTopTags(track.name, primaryArtist);

    await prisma.trackTagCache.upsert({
      where: { spotifyTrackId: track.spotifyTrackId },
      update: {
        trackName: track.name,
        artistName: primaryArtist,
        tags,
      },
      create: {
        spotifyTrackId: track.spotifyTrackId,
        trackName: track.name,
        artistName: primaryArtist,
        tags,
      },
    });

    refreshed += 1;
    if (delayMs > 0) await sleep(delayMs);
  }

  return { refreshed, skipped };
}

export async function getTagsBySpotifyTrackIds(
  spotifyTrackIds: string[]
): Promise<Map<string, string[]>> {
  if (spotifyTrackIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.trackTagCache.findMany({
    where: { spotifyTrackId: { in: spotifyTrackIds } },
    select: { spotifyTrackId: true, tags: true },
  });

  return new Map(rows.map((row) => [row.spotifyTrackId, row.tags]));
}
