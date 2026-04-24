import { authOrigin, signIn } from "@/auth";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-3 text-sm uppercase tracking-[0.25em] text-green-400">
          Spotify Social Graph
        </p>

        <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">
          Map your music taste through your friends
        </h1>

        <p className="mb-8 max-w-2xl text-base text-neutral-300 sm:text-lg">
          Sign in with Spotify, build your music profile, connect with friends,
          and see how similar your listening tastes really are.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("spotify", {
              redirectTo: `${authOrigin()}/dashboard`,
            });
          }}
        >
          <button
            type="submit"
            className="rounded-full bg-green-500 px-6 py-3 font-medium text-black transition hover:bg-green-400"
          >
            Sign in with Spotify
          </button>
        </form>
      </div>
    </main>
  );
}