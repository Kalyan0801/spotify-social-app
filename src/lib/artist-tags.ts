import { prisma } from "@/lib/prisma";
import {
  fetchArtistSimilar,
  fetchArtistTopTags,
  type SimilarArtist,
} from "@/lib/lastfm";

/** Re-fetch Last.fm enrichment if older than this. */
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

type ArtistForEnrichment = {
  spotifyArtistId: string;
  name: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFresh(updatedAt: Date, now: number): boolean {
  return now - updatedAt.getTime() < CACHE_TTL_MS;
}

type EnsureLastFmOptions = {
  /**
   * Only fetch artists with no cache row at all (skip TTL refresh of existing rows).
   * Useful on friend-page loads so one user can backfill without a slow full refresh.
   */
  onlyMissing?: boolean;
  delayMs?: number;
};

/**
 * Ensures Last.fm tag + similar-artist cache rows exist for the given Spotify artists.
 * Skips fresh cache entries; fetches missing/stale data sequentially for rate limits.
 * Cache is global by Spotify artist id — any user can populate it for shared scoring.
 */
export async function ensureArtistLastFmCached(
  artists: ArtistForEnrichment[],
  options: EnsureLastFmOptions = {}
): Promise<{ refreshed: number; skipped: number }> {
  if (!process.env.LASTFM_API_KEY || artists.length === 0) {
    return { refreshed: 0, skipped: artists.length };
  }

  const onlyMissing = options.onlyMissing ?? false;
  const delayMs = options.delayMs ?? 250;

  const unique = new Map<string, ArtistForEnrichment>();
  for (const artist of artists) {
    if (!unique.has(artist.spotifyArtistId)) {
      unique.set(artist.spotifyArtistId, artist);
    }
  }

  const ids = [...unique.keys()];
  const [existingTags, existingSimilars] = await Promise.all([
    prisma.artistTagCache.findMany({
      where: { spotifyArtistId: { in: ids } },
    }),
    prisma.artistSimilarCache.findMany({
      where: { spotifyArtistId: { in: ids } },
    }),
  ]);

  const tagsById = new Map(
    existingTags.map((row) => [row.spotifyArtistId, row])
  );
  const similarsById = new Map(
    existingSimilars.map((row) => [row.spotifyArtistId, row])
  );

  const now = Date.now();
  let refreshed = 0;
  let skipped = 0;

  for (const artist of unique.values()) {
    const tagRow = tagsById.get(artist.spotifyArtistId);
    const similarRow = similarsById.get(artist.spotifyArtistId);

    const needTags = onlyMissing
      ? !tagRow || tagRow.tags.length === 0
      : !(tagRow && isFresh(tagRow.updatedAt, now) && tagRow.tags.length > 0);
    const needSimilars = onlyMissing
      ? !similarRow
      : !(similarRow && isFresh(similarRow.updatedAt, now));

    if (!needTags && !needSimilars) {
      skipped += 1;
      continue;
    }

    if (needTags) {
      const { tags } = await fetchArtistTopTags(artist.name);
      await prisma.artistTagCache.upsert({
        where: { spotifyArtistId: artist.spotifyArtistId },
        update: {
          artistName: artist.name,
          tags,
        },
        create: {
          spotifyArtistId: artist.spotifyArtistId,
          artistName: artist.name,
          tags,
        },
      });
    }

    if (needSimilars) {
      const { similars } = await fetchArtistSimilar(artist.name);
      await prisma.artistSimilarCache.upsert({
        where: { spotifyArtistId: artist.spotifyArtistId },
        update: {
          artistName: artist.name,
          similars,
        },
        create: {
          spotifyArtistId: artist.spotifyArtistId,
          artistName: artist.name,
          similars,
        },
      });
    }

    refreshed += 1;
    if (delayMs > 0) await sleep(delayMs);
  }

  return { refreshed, skipped };
}

/** @deprecated Use ensureArtistLastFmCached */
export async function ensureArtistTagsCached(
  artists: ArtistForEnrichment[]
): Promise<{ refreshed: number; skipped: number }> {
  return ensureArtistLastFmCached(artists);
}

export async function getTagsBySpotifyArtistIds(
  spotifyArtistIds: string[]
): Promise<Map<string, string[]>> {
  if (spotifyArtistIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.artistTagCache.findMany({
    where: { spotifyArtistId: { in: spotifyArtistIds } },
    select: { spotifyArtistId: true, tags: true },
  });

  return new Map(rows.map((row) => [row.spotifyArtistId, row.tags]));
}

export async function getSimilarsBySpotifyArtistIds(
  spotifyArtistIds: string[]
): Promise<Map<string, SimilarArtist[]>> {
  if (spotifyArtistIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.artistSimilarCache.findMany({
    where: { spotifyArtistId: { in: spotifyArtistIds } },
    select: { spotifyArtistId: true, similars: true },
  });

  const result = new Map<string, SimilarArtist[]>();
  for (const row of rows) {
    const parsed = Array.isArray(row.similars)
      ? (row.similars as SimilarArtist[])
      : [];
    result.set(
      row.spotifyArtistId,
      parsed.filter(
        (item) =>
          item &&
          typeof item.name === "string" &&
          typeof item.match === "number"
      )
    );
  }
  return result;
}
