import type { SimilarArtist } from "@/lib/lastfm";

type TopArtist = {
  id: string;
  spotifyArtistId: string;
  name: string;
  image: string | null;
  rank: number;
};

type TopTrack = {
  id: string;
  spotifyTrackId: string;
  name: string;
  image: string | null;
  artistNames: string[];
  rank: number;
};

export type HiddenGemArtist = TopArtist & {
  fitScore: number;
  reason: string;
};

export type HiddenGemTrack = TopTrack & {
  fitScore: number;
  reason: string;
};

/** Larger = flatter weights (top ranks still matter, tail decays slower). */
const RANK_HALF_LIFE = 6;
const GEMS_LIMIT = 5;

/** Blend when Last.fm signals are present. Shared tracks are NOT in the base
 *  mix — they only apply as a small boost when overlap exists. */
const ARTIST_BLEND = 0.3;
const TAG_BLEND = 0.35;
const SOFT_ARTIST_BLEND = 0.35;
/** Max score bump from shared tracks: TRACK_BOOST * trackSim (0–1). */
const TRACK_BOOST = 0.12;

function rankWeight(rank: number): number {
  return Math.pow(2, -(rank - 1) / RANK_HALF_LIFE);
}

function normalizeArtistName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Cosine similarity between two sparse vectors keyed by Spotify IDs.
 * Each side gets weight(rank) so #1 counts more than #20.
 */
function weightedCosineSimilarity<T extends { rank: number }>(
  itemsA: T[],
  itemsB: T[],
  getId: (item: T) => string
): number {
  const weightsA = new Map<string, number>();
  const weightsB = new Map<string, number>();

  for (const item of itemsA) {
    weightsA.set(getId(item), rankWeight(item.rank));
  }
  for (const item of itemsB) {
    weightsB.set(getId(item), rankWeight(item.rank));
  }

  return cosineFromMaps(weightsA, weightsB);
}

function cosineFromMaps(
  weightsA: Map<string, number>,
  weightsB: Map<string, number>
): number {
  let dot = 0;
  let sumSqA = 0;
  let sumSqB = 0;

  for (const w of weightsA.values()) {
    sumSqA += w * w;
  }
  for (const w of weightsB.values()) {
    sumSqB += w * w;
  }

  const smaller = weightsA.size < weightsB.size ? weightsA : weightsB;
  const larger = weightsA.size < weightsB.size ? weightsB : weightsA;

  for (const [id, wSmall] of smaller) {
    const wLarge = larger.get(id);
    if (wLarge !== undefined) {
      dot += wSmall * wLarge;
    }
  }

  const denom = Math.sqrt(sumSqA) * Math.sqrt(sumSqB);
  if (denom === 0) return 0;
  return Math.min(1, dot / denom);
}

/**
 * Build a tag vector: for each artist, add rankWeight to each of its Last.fm tags.
 */
function buildArtistTagWeights(
  artists: TopArtist[],
  tagsByArtistId: Map<string, string[]>
): Map<string, number> {
  const weights = new Map<string, number>();

  for (const artist of artists) {
    const tags = tagsByArtistId.get(artist.spotifyArtistId) ?? [];
    const weight = rankWeight(artist.rank);
    for (const tag of tags) {
      weights.set(tag, (weights.get(tag) ?? 0) + weight);
    }
  }

  return weights;
}

/**
 * Build a tag vector from top tracks (finer than artist tags).
 */
function buildTrackTagWeights(
  tracks: TopTrack[],
  tagsByTrackId: Map<string, string[]>
): Map<string, number> {
  const weights = new Map<string, number>();

  for (const track of tracks) {
    const tags = tagsByTrackId.get(track.spotifyTrackId) ?? [];
    const weight = rankWeight(track.rank);
    for (const tag of tags) {
      weights.set(tag, (weights.get(tag) ?? 0) + weight);
    }
  }

  return weights;
}

function mergeTagWeights(
  a: Map<string, number>,
  b: Map<string, number>
): Map<string, number> {
  const out = new Map(a);
  for (const [tag, weight] of b) {
    out.set(tag, (out.get(tag) ?? 0) + weight);
  }
  return out;
}

function jaccardFromSets(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const tag of a) {
    if (b.has(tag)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function buildNameWeights(artists: TopArtist[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const artist of artists) {
    const key = normalizeArtistName(artist.name);
    const weight = rankWeight(artist.rank);
    weights.set(key, Math.max(weights.get(key) ?? 0, weight));
  }
  return weights;
}

/**
 * Soft artist similarity via Last.fm artist.getSimilar.
 * For each of my artists not exactly shared by Spotify ID, look up similar
 * names and see if the friend has that artist by name. Match strength from
 * Last.fm scales the contribution. Averaged both directions.
 */
function softArtistSimilarity(
  artistsA: TopArtist[],
  artistsB: TopArtist[],
  similarsByArtistId: Map<string, SimilarArtist[]>
): number {
  if (!artistsA.length || !artistsB.length || similarsByArtistId.size === 0) {
    return 0;
  }

  const idsB = new Set(artistsB.map((artist) => artist.spotifyArtistId));
  const idsA = new Set(artistsA.map((artist) => artist.spotifyArtistId));
  const namesB = buildNameWeights(artistsB);
  const namesA = buildNameWeights(artistsA);

  const oneWay = (
    from: TopArtist[],
    toIds: Set<string>,
    toNames: Map<string, number>
  ): number => {
    let dot = 0;
    let sumSqFrom = 0;
    let sumSqTo = 0;

    for (const w of toNames.values()) {
      sumSqTo += w * w;
    }

    for (const artist of from) {
      const w = rankWeight(artist.rank);
      sumSqFrom += w * w;

      // Exact Spotify-ID overlap is already counted in artistSim.
      if (toIds.has(artist.spotifyArtistId)) continue;

      const similars = similarsByArtistId.get(artist.spotifyArtistId) ?? [];
      let best = 0;
      for (const similar of similars) {
        const toWeight = toNames.get(similar.name);
        if (toWeight === undefined) continue;
        best = Math.max(best, toWeight * Math.min(1, Math.max(0, similar.match)));
      }
      dot += w * best;
    }

    const denom = Math.sqrt(sumSqFrom) * Math.sqrt(sumSqTo);
    if (denom === 0) return 0;
    return Math.min(1, dot / denom);
  };

  const aToB = oneWay(artistsA, idsB, namesB);
  const bToA = oneWay(artistsB, idsA, namesA);
  return (aToB + bToA) / 2;
}

function blendScore(parts: {
  artistSim: number;
  trackSim: number;
  tagSim: number;
  softArtistSim: number;
  hasTagSignal: boolean;
  hasSoftSignal: boolean;
  hasTrackSignal: boolean;
}): number {
  const {
    artistSim,
    trackSim,
    tagSim,
    softArtistSim,
    hasTagSignal,
    hasSoftSignal,
    hasTrackSignal,
  } = parts;

  // Base taste score — shared tracks intentionally excluded (too sparse).
  let base: number;
  if (hasTagSignal && hasSoftSignal) {
    base =
      artistSim * ARTIST_BLEND +
      tagSim * TAG_BLEND +
      softArtistSim * SOFT_ARTIST_BLEND;
  } else if (hasTagSignal) {
    base = artistSim * 0.4 + tagSim * 0.6;
  } else if (hasSoftSignal) {
    base = artistSim * 0.35 + softArtistSim * 0.65;
  } else {
    base = artistSim;
  }

  // Optional boost only when there is real track overlap.
  if (hasTrackSignal && trackSim > 0) {
    return Math.min(1, base + TRACK_BOOST * trackSim);
  }

  return base;
}

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

  // Normalize roughly against liking a few strong tags at once.
  const score = Math.min(1, weighted / (rankWeight(1) * 3));
  return { score, shared };
}

/**
 * Score a friend's artist you don't share: Last.fm similar-to-you + tag overlap,
 * with a small boost for how high they rank them.
 */
function scoreArtistGem(
  candidate: TopArtist,
  myArtists: TopArtist[],
  myTagWeights: Map<string, number>,
  tagsByArtistId: Map<string, string[]>,
  similarsByArtistId: Map<string, SimilarArtist[]>
): { fitScore: number; reason: string } {
  const candidateName = normalizeArtistName(candidate.name);
  let bestSimilar = 0;
  let becauseArtist: string | null = null;

  for (const mine of myArtists) {
    const similars = similarsByArtistId.get(mine.spotifyArtistId) ?? [];
    for (const similar of similars) {
      if (similar.name !== candidateName) continue;
      const score =
        Math.min(1, Math.max(0, similar.match)) * rankWeight(mine.rank);
      if (score > bestSimilar) {
        bestSimilar = score;
        becauseArtist = mine.name;
      }
    }
  }

  const myByName = new Map(
    myArtists.map((artist) => [normalizeArtistName(artist.name), artist])
  );
  const candidateSimilars =
    similarsByArtistId.get(candidate.spotifyArtistId) ?? [];
  for (const similar of candidateSimilars) {
    const mine = myByName.get(similar.name);
    if (!mine) continue;
    const score =
      Math.min(1, Math.max(0, similar.match)) * rankWeight(mine.rank);
    if (score > bestSimilar) {
      bestSimilar = score;
      becauseArtist = mine.name;
    }
  }

  const { score: tagScore, shared } = tagHitScore(
    tagsByArtistId.get(candidate.spotifyArtistId) ?? [],
    myTagWeights
  );

  const friendBoost = 0.12 * rankWeight(candidate.rank);
  const fitScore = Math.min(
    1,
    bestSimilar * 0.7 + tagScore * 0.25 + friendBoost
  );

  let reason: string;
  if (becauseArtist) {
    reason = `Because you like ${becauseArtist}`;
  } else if (shared.length) {
    reason = `Shares your tags: ${shared.slice(0, 2).join(", ")}`;
  } else {
    reason = `In their top #${candidate.rank}`;
  }

  return { fitScore, reason };
}

function scoreTrackGem(
  candidate: TopTrack,
  myArtists: TopArtist[],
  myArtistsByName: Map<string, TopArtist>,
  myTagWeights: Map<string, number>,
  tagsByTrackId: Map<string, string[]>,
  similarsByArtistId: Map<string, SimilarArtist[]>
): { fitScore: number; reason: string } {
  const primaryArtistName = candidate.artistNames[0] ?? "";
  const primaryKey = normalizeArtistName(primaryArtistName);
  const knownArtist = myArtistsByName.get(primaryKey);

  let bestSimilar = 0;
  let becauseArtist: string | null = null;

  if (knownArtist) {
    bestSimilar = rankWeight(knownArtist.rank);
    becauseArtist = knownArtist.name;
  } else if (primaryKey) {
    for (const mine of myArtists) {
      const similars = similarsByArtistId.get(mine.spotifyArtistId) ?? [];
      for (const similar of similars) {
        if (similar.name !== primaryKey) continue;
        const score =
          Math.min(1, Math.max(0, similar.match)) * rankWeight(mine.rank);
        if (score > bestSimilar) {
          bestSimilar = score;
          becauseArtist = mine.name;
        }
      }
    }
  }

  const { score: tagScore, shared } = tagHitScore(
    tagsByTrackId.get(candidate.spotifyTrackId) ?? [],
    myTagWeights
  );

  const friendBoost = 0.12 * rankWeight(candidate.rank);
  const fromKnownArtist = knownArtist ? 0.15 : 0;
  const fitScore = Math.min(
    1,
    bestSimilar * 0.65 + tagScore * 0.25 + friendBoost + fromKnownArtist
  );

  let reason: string;
  if (knownArtist) {
    reason = `More from ${knownArtist.name}`;
  } else if (becauseArtist) {
    reason = `Because you like ${becauseArtist}`;
  } else if (shared.length) {
    reason = `Shares your tags: ${shared.slice(0, 2).join(", ")}`;
  } else {
    reason = `In their top #${candidate.rank}`;
  }

  return { fitScore, reason };
}

function pickHiddenGemArtists(
  myArtists: TopArtist[],
  friendArtists: TopArtist[],
  myArtistIds: Set<string>,
  myTagWeights: Map<string, number>,
  tagsByArtistId: Map<string, string[]>,
  similarsByArtistId: Map<string, SimilarArtist[]>
): HiddenGemArtist[] {
  const scored: HiddenGemArtist[] = [];

  for (const artist of friendArtists) {
    if (myArtistIds.has(artist.spotifyArtistId)) continue;
    const { fitScore, reason } = scoreArtistGem(
      artist,
      myArtists,
      myTagWeights,
      tagsByArtistId,
      similarsByArtistId
    );
    scored.push({ ...artist, fitScore, reason });
  }

  scored.sort((a, b) => b.fitScore - a.fitScore || a.rank - b.rank);
  return scored.slice(0, GEMS_LIMIT);
}

function pickHiddenGemTracks(
  myArtists: TopArtist[],
  friendTracks: TopTrack[],
  myTrackIds: Set<string>,
  myTagWeights: Map<string, number>,
  tagsByTrackId: Map<string, string[]>,
  similarsByArtistId: Map<string, SimilarArtist[]>
): HiddenGemTrack[] {
  const myArtistsByName = new Map(
    myArtists.map((artist) => [normalizeArtistName(artist.name), artist])
  );
  const scored: HiddenGemTrack[] = [];

  for (const track of friendTracks) {
    if (myTrackIds.has(track.spotifyTrackId)) continue;
    const { fitScore, reason } = scoreTrackGem(
      track,
      myArtists,
      myArtistsByName,
      myTagWeights,
      tagsByTrackId,
      similarsByArtistId
    );
    scored.push({ ...track, fitScore, reason });
  }

  scored.sort((a, b) => b.fitScore - a.fitScore || a.rank - b.rank);
  return scored.slice(0, GEMS_LIMIT);
}

export function calculateCompatibility(
  currentUserArtists: TopArtist[],
  friendArtists: TopArtist[],
  currentUserTracks: TopTrack[],
  friendTracks: TopTrack[],
  tagsByArtistId: Map<string, string[]> = new Map(),
  similarsByArtistId: Map<string, SimilarArtist[]> = new Map(),
  tagsByTrackId: Map<string, string[]> = new Map()
) {
  const currentArtistIds = new Set(
    currentUserArtists.map((artist) => artist.spotifyArtistId)
  );

  const currentTrackIds = new Set(
    currentUserTracks.map((track) => track.spotifyTrackId)
  );

  const sharedArtists = friendArtists.filter((artist) =>
    currentArtistIds.has(artist.spotifyArtistId)
  );

  const sharedTracks = friendTracks.filter((track) =>
    currentTrackIds.has(track.spotifyTrackId)
  );

  const artistSim =
    currentUserArtists.length && friendArtists.length
      ? weightedCosineSimilarity(
          currentUserArtists,
          friendArtists,
          (a) => a.spotifyArtistId
        )
      : 0;

  const trackSim =
    currentUserTracks.length && friendTracks.length
      ? weightedCosineSimilarity(
          currentUserTracks,
          friendTracks,
          (t) => t.spotifyTrackId
        )
      : 0;

  const tagWeightsA = mergeTagWeights(
    buildArtistTagWeights(currentUserArtists, tagsByArtistId),
    buildTrackTagWeights(currentUserTracks, tagsByTrackId)
  );
  const tagWeightsB = mergeTagWeights(
    buildArtistTagWeights(friendArtists, tagsByArtistId),
    buildTrackTagWeights(friendTracks, tagsByTrackId)
  );

  const tagCosine =
    tagWeightsA.size && tagWeightsB.size
      ? cosineFromMaps(tagWeightsA, tagWeightsB)
      : 0;

  const tagJaccard = jaccardFromSets(
    new Set(tagWeightsA.keys()),
    new Set(tagWeightsB.keys())
  );

  const tagSim = tagCosine > 0 ? tagCosine : tagJaccard;
  const hasTagSignal = tagWeightsA.size > 0 && tagWeightsB.size > 0;

  const softArtistSim = softArtistSimilarity(
    currentUserArtists,
    friendArtists,
    similarsByArtistId
  );
  const hasSoftSignal = softArtistSim > 0;
  const hasTrackSignal = sharedTracks.length > 0 && trackSim > 0;

  const score = Math.round(
    blendScore({
      artistSim,
      trackSim,
      tagSim,
      softArtistSim,
      hasTagSignal,
      hasSoftSignal,
      hasTrackSignal,
    }) * 100
  );

  const hiddenGemArtists = pickHiddenGemArtists(
    currentUserArtists,
    friendArtists,
    currentArtistIds,
    tagWeightsA,
    tagsByArtistId,
    similarsByArtistId
  );

  const hiddenGemTracks = pickHiddenGemTracks(
    currentUserArtists,
    friendTracks,
    currentTrackIds,
    tagWeightsA,
    tagsByTrackId,
    similarsByArtistId
  );

  return {
    score,
    sharedArtists,
    sharedTracks,
    hiddenGemArtists,
    hiddenGemTracks,
    breakdown: {
      artistSim,
      trackSim,
      tagSim,
      softArtistSim,
      usedLastFmTags: hasTagSignal,
      usedLastFmSimilar: hasSoftSignal,
      usedSharedTracks: hasTrackSignal,
      trackBoost:
        hasTrackSignal && trackSim > 0 ? TRACK_BOOST * trackSim : 0,
    },
  };
}
