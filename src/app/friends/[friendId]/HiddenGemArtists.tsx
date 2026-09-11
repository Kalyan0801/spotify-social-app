"use client";

import { useEffect, useId, useState } from "react";

export type GemArtistCard = {
  id: string;
  spotifyArtistId: string;
  name: string;
  image: string | null;
  rank: number;
  fitScore: number;
  reason: string;
};

type Recommendation = {
  name: string;
  artistName: string;
  image: string | null;
  source: "friend" | "lastfm";
  fitScore: number;
  reason: string;
  sharedTags: string[];
};

type HiddenGemArtistsProps = {
  friendId: string;
  friendDisplayName: string | null;
  artists: GemArtistCard[];
};

export function HiddenGemArtists({
  friendId,
  friendDisplayName,
  artists,
}: HiddenGemArtistsProps) {
  const titleId = useId();
  const [selected, setSelected] = useState<GemArtistCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recs, setRecs] = useState<Recommendation[]>([]);

  useEffect(() => {
    if (!selected) return;

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      setRecs([]);

      try {
        const res = await fetch("/api/friends/gem-recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            friendId,
            spotifyArtistId: selected!.spotifyArtistId,
            artistName: selected!.name,
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load recommendations");
        }
        if (!cancelled) {
          setRecs(data.recommendations ?? []);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selected, friendId]);

  useEffect(() => {
    if (!selected) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  return (
    <>
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="mb-1 text-xl font-semibold">
          Hidden Gem Artists From {friendDisplayName}
        </h2>
        <p className="mb-4 text-sm text-neutral-500">
          Ranked by fit with your taste. Click one for song ideas near your tags.
        </p>

        {artists.length ? (
          <div className="space-y-3">
            {artists.map((artist) => (
              <button
                key={artist.id}
                type="button"
                onClick={() => setSelected(artist)}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-neutral-800/80"
              >
                {artist.image ? (
                  <img
                    src={artist.image}
                    alt={artist.name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-sm text-neutral-500">
                    ?
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{artist.name}</p>
                  <p className="truncate text-sm text-green-400/90">
                    {artist.reason}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Their rank #{artist.rank}
                    {artist.fitScore > 0
                      ? ` · ${Math.round(artist.fitScore * 100)}% fit`
                      : ""}
                    {" · "}
                    <span className="text-neutral-400">View songs</span>
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-neutral-400">No hidden gem artists found.</p>
        )}
      </section>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={() => setSelected(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950 p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start gap-3">
              {selected.image ? (
                <img
                  src={selected.image}
                  alt={selected.name}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Song ideas
                </p>
                <h3 id={titleId} className="truncate text-xl font-semibold">
                  {selected.name}
                </h3>
                <p className="text-sm text-green-400/90">{selected.reason}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                Close
              </button>
            </div>

            <p className="mb-4 text-sm text-neutral-500">
              Picked for overlap with tags from your own top artists and tracks.
            </p>

            {loading ? (
              <p className="text-sm text-neutral-400">Finding songs…</p>
            ) : null}

            {error ? <p className="text-sm text-red-400">{error}</p> : null}

            {!loading && !error && recs.length === 0 ? (
              <p className="text-sm text-neutral-400">
                No recommendations yet for this artist.
              </p>
            ) : null}

            <div className="space-y-3">
              {recs.map((track) => (
                <div
                  key={`${track.source}-${track.name}`}
                  className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/80 p-3"
                >
                  {track.image ? (
                    <img
                      src={track.image}
                      alt={track.name}
                      className="h-12 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-neutral-800 text-xs text-neutral-500">
                      ♪
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{track.name}</p>
                    <p className="truncate text-sm text-neutral-400">
                      {track.artistName}
                    </p>
                    <p className="text-sm text-green-400/90">{track.reason}</p>
                    <p className="text-xs text-neutral-500">
                      {track.source === "friend"
                        ? "From their listening"
                        : "Artist top track"}
                      {track.fitScore > 0
                        ? ` · ${Math.round(track.fitScore * 100)}% tag fit`
                        : " · no tag overlap yet"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
