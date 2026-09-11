export default function FriendCompatibilityLoading() {
  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 h-4 w-36 animate-pulse rounded bg-neutral-800" />

        <section className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 animate-pulse rounded-full bg-neutral-800" />
            <div className="space-y-2">
              <div className="h-3 w-40 animate-pulse rounded bg-neutral-800" />
              <div className="h-7 w-56 animate-pulse rounded bg-neutral-800" />
            </div>
          </div>

          <div className="mt-8">
            <p className="text-sm uppercase tracking-[0.25em] text-neutral-500">
              Compatibility Score
            </p>
            <div className="mt-3 flex items-end gap-3">
              <div className="h-14 w-28 animate-pulse rounded-lg bg-neutral-800" />
              <div className="mb-2 flex items-center gap-2 text-sm text-neutral-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
                Calculating taste match…
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-4 border-t border-neutral-800 pt-6">
            <p className="text-sm font-medium text-neutral-300">Score breakdown</p>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between">
                  <div className="h-3 w-28 animate-pulse rounded bg-neutral-800" />
                  <div className="h-3 w-10 animate-pulse rounded bg-neutral-800" />
                </div>
                <div className="h-1.5 animate-pulse rounded-full bg-neutral-800" />
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1].map((i) => (
            <section
              key={i}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
            >
              <div className="mb-4 h-6 w-48 animate-pulse rounded bg-neutral-800" />
              <div className="space-y-3">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="flex items-center gap-3">
                    <div className="h-12 w-12 animate-pulse rounded-full bg-neutral-800" />
                    <div className="space-y-2">
                      <div className="h-3 w-36 animate-pulse rounded bg-neutral-800" />
                      <div className="h-3 w-24 animate-pulse rounded bg-neutral-800" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-neutral-500">
          Pulling Spotify tops and Last.fm tags — this can take a few seconds the
          first time.
        </p>
      </div>
    </main>
  );
}
