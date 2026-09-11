export default function GraphLoading() {
  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 h-4 w-36 animate-pulse rounded bg-neutral-800" />
        <div className="mb-2 h-8 w-64 animate-pulse rounded bg-neutral-800" />
        <div className="mb-6 h-4 w-full max-w-xl animate-pulse rounded bg-neutral-800" />

        <div className="flex h-[min(70vh,720px)] items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-950">
          <div className="text-center">
            <div className="mx-auto mb-4 h-3 w-3 animate-pulse rounded-full bg-green-500" />
            <p className="text-sm text-neutral-300">Building your music graph…</p>
            <p className="mt-2 text-xs text-neutral-500">
              Scoring friends with Spotify + Last.fm signals
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
