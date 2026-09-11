const LASTFM_API_ROOT = "https://ws.audioscrobbler.com/2.0/";
const TAG_LIMIT = 8;
const SIMILAR_LIMIT = 8;
const TOP_TRACKS_LIMIT = 8;

type LastFmTopTagsResponse = {
  toptags?: {
    tag?: Array<{ name?: string; count?: number }> | { name?: string; count?: number };
  };
  error?: number;
  message?: string;
};

type LastFmSimilarResponse = {
  similarartists?: {
    artist?:
      | Array<{ name?: string; match?: string | number }>
      | { name?: string; match?: string | number };
  };
  error?: number;
  message?: string;
};

type LastFmTopTracksResponse = {
  toptracks?: {
    track?:
      | Array<{ name?: string; artist?: { name?: string } }>
      | { name?: string; artist?: { name?: string } };
  };
  error?: number;
  message?: string;
};

export type ArtistTagResult = {
  tags: string[];
};

export type TrackTagResult = {
  tags: string[];
};

export type SimilarArtist = {
  name: string;
  match: number;
};

export type ArtistSimilarResult = {
  similars: SimilarArtist[];
};

export type ArtistTopTrack = {
  name: string;
  artistName: string;
};

export type ArtistTopTracksResult = {
  tracks: ArtistTopTrack[];
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Strip remasters, radio edits, featuring credits, and bracket noise so
 * Last.fm title lookup is more likely to hit.
 */
export function normalizeTrackTitle(title: string): string {
  let cleaned = title.trim();

  cleaned = cleaned.replace(/\s+[–—-]\s+(feat\.?|ft\.?|featuring)\b.*$/i, "");
  cleaned = cleaned.replace(/\s*\((?:feat\.?|ft\.?|featuring)\b[^)]*\)/gi, "");
  cleaned = cleaned.replace(/\s*\[(?:feat\.?|ft\.?|featuring)\b[^\]]*\]/gi, "");

  cleaned = cleaned.replace(
    /\s*[\(\[][^\)\]]*(remaster(?:ed)?|radio\s*edit|album\s*version|single\s*version|deluxe|bonus\s*track|live|mono|stereo|explicit|clean\s*version|\d{2,4})[^\)\]]*[\)\]]/gi,
    ""
  );

  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

async function lastFmGet(
  method: string,
  params: Record<string, string>
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return null;

  const url = new URL(LASTFM_API_ROOT);
  url.searchParams.set("method", method);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("autocorrect", "1");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    console.warn(`[lastfm] ${method} HTTP error`, {
      params,
      status: res.status,
    });
    return null;
  }

  return (await res.json()) as Record<string, unknown>;
}

function parseTopTags(data: LastFmTopTagsResponse | null): string[] {
  if (!data || data.error) return [];

  const raw = data.toptags?.tag;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return list
    .map((entry) =>
      typeof entry.name === "string" ? normalizeName(entry.name) : ""
    )
    .filter((tag) => tag.length > 0)
    .slice(0, TAG_LIMIT);
}

export async function fetchArtistTopTags(
  artistName: string
): Promise<ArtistTagResult> {
  const data = (await lastFmGet("artist.getTopTags", {
    artist: artistName,
  })) as LastFmTopTagsResponse | null;

  if (!data) return { tags: [] };

  if (data.error) {
    console.warn("[lastfm] artist.getTopTags API error", {
      artistName,
      error: data.error,
      message: data.message,
    });
    return { tags: [] };
  }

  return { tags: parseTopTags(data) };
}

/**
 * Fetch track tags via artist + title. Retries with a cleaned title if the
 * first lookup returns nothing (remasters / featuring noise).
 */
export async function fetchTrackTopTags(
  trackName: string,
  artistName: string
): Promise<TrackTagResult> {
  const primaryArtist = artistName.split(",")[0]?.trim() || artistName;
  const attempts = [trackName];
  const cleaned = normalizeTrackTitle(trackName);
  if (cleaned && cleaned.toLowerCase() !== trackName.trim().toLowerCase()) {
    attempts.push(cleaned);
  }

  for (const attempt of attempts) {
    const data = (await lastFmGet("track.getTopTags", {
      artist: primaryArtist,
      track: attempt,
    })) as LastFmTopTagsResponse | null;

    if (!data) continue;

    if (data.error) {
      console.warn("[lastfm] track.getTopTags API error", {
        trackName: attempt,
        artistName: primaryArtist,
        error: data.error,
        message: data.message,
      });
      continue;
    }

    const tags = parseTopTags(data);
    if (tags.length > 0) return { tags };
  }

  return { tags: [] };
}

export async function fetchArtistSimilar(
  artistName: string
): Promise<ArtistSimilarResult> {
  const data = (await lastFmGet("artist.getSimilar", {
    artist: artistName,
  })) as LastFmSimilarResponse | null;

  if (!data) return { similars: [] };

  if (data.error) {
    console.warn("[lastfm] artist.getSimilar API error", {
      artistName,
      error: data.error,
      message: data.message,
    });
    return { similars: [] };
  }

  const raw = data.similarartists?.artist;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const similars: SimilarArtist[] = [];
  for (const entry of list) {
    if (typeof entry.name !== "string" || !entry.name.trim()) continue;
    const matchRaw =
      typeof entry.match === "number"
        ? entry.match
        : typeof entry.match === "string"
          ? Number.parseFloat(entry.match)
          : 0;
    const match = Number.isFinite(matchRaw)
      ? Math.min(1, Math.max(0, matchRaw > 1 ? matchRaw / 100 : matchRaw))
      : 0;
    similars.push({
      name: normalizeName(entry.name),
      match,
    });
    if (similars.length >= SIMILAR_LIMIT) break;
  }

  return { similars };
}

export async function fetchArtistTopTracks(
  artistName: string
): Promise<ArtistTopTracksResult> {
  const data = (await lastFmGet("artist.getTopTracks", {
    artist: artistName,
    limit: String(TOP_TRACKS_LIMIT),
  })) as LastFmTopTracksResponse | null;

  if (!data) return { tracks: [] };

  if (data.error) {
    console.warn("[lastfm] artist.getTopTracks API error", {
      artistName,
      error: data.error,
      message: data.message,
    });
    return { tracks: [] };
  }

  const raw = data.toptracks?.track;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const tracks: ArtistTopTrack[] = [];
  for (const entry of list) {
    if (typeof entry.name !== "string" || !entry.name.trim()) continue;
    tracks.push({
      name: entry.name.trim(),
      artistName:
        typeof entry.artist?.name === "string" && entry.artist.name.trim()
          ? entry.artist.name.trim()
          : artistName,
    });
    if (tracks.length >= TOP_TRACKS_LIMIT) break;
  }

  return { tracks };
}
