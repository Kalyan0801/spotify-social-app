import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { RefreshSpotifyButton } from "./RefreshSpotifyButton";
import { prisma } from "@/lib/prisma";
import { FriendsPanel } from "./FriendsPanel";

type DashboardPageProps = {
  searchParams?: Promise<{ friend?: string }> | { friend?: string };
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<{ friend?: string }>).then === "function"
      ? await (searchParams as Promise<{ friend?: string }>)
      : ((searchParams ?? {}) as { friend?: string });

  const selectedFriendId = resolvedSearchParams.friend;

  const currentUser = await prisma.user.findUnique({
    where: {
      spotifyUserId: session.spotifyUserId,
    },
  });

  if (!currentUser) {
    redirect("/");
  }

  let viewingUserId = currentUser.id;

  if (selectedFriendId && selectedFriendId !== currentUser.id) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: currentUser.id, userBId: selectedFriendId },
          { userAId: selectedFriendId, userBId: currentUser.id },
        ],
      },
    });

    if (friendship) {
      viewingUserId = selectedFriendId;
    }
  }

  const [viewingUser, myTopData] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewingUserId },
      include: {
        topArtists: {
          orderBy: { rank: "asc" },
          take: 10,
        },
        topTracks: {
          orderBy: { rank: "asc" },
          take: 10,
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: currentUser.id },
      include: {
        topArtists: {
          orderBy: { rank: "asc" },
          take: 10,
        },
        topTracks: {
          orderBy: { rank: "asc" },
          take: 10,
        },
      },
    }),
  ]);

  const activeUser = viewingUser ?? myTopData;

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto max-w-4xl space-y-8">
        <h1 className="mb-4 text-3xl font-bold">Dashboard</h1>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <p className="mb-2 text-sm text-neutral-400">Signed in as</p>
          <p className="text-xl font-semibold">{session.user.name}</p>
          <p className="text-neutral-300">{session.user.email}</p>
          {session.user.image ? (
            <img
              src={session.user.image}
              alt="Profile"
              className="mt-4 h-16 w-16 rounded-full"
            />
          ) : null}
          <RefreshSpotifyButton
            actions={
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="rounded-full border border-neutral-700 px-5 py-2 transition hover:bg-neutral-800"
                >
                  Sign out
                </button>
              </form>
            }
          />
        </div>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
          <p className="text-sm text-neutral-400">
            Viewing taste profile:
            <span className="ml-2 font-semibold text-white">
              {viewingUserId === currentUser.id
                ? "You"
                : activeUser?.displayName ?? activeUser?.email ?? "Friend"}
            </span>
          </p>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-4 text-xl font-semibold">Top Artists</h2>

            {activeUser?.topArtists.length ? (
              <div className="space-y-3">
                {activeUser.topArtists.map((artist) => (
                  <div key={artist.id} className="flex items-center gap-3">
                    {artist.image ? (
                      <img
                        src={artist.image}
                        alt={artist.name}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : null}
                    <div>
                      <p className="font-medium">
                        {artist.rank}. {artist.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-400">
                No artist data yet. Click Refresh Spotify Data.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-4 text-xl font-semibold">Top Tracks</h2>

            {activeUser?.topTracks.length ? (
              <div className="space-y-3">
                {activeUser.topTracks.map((track) => (
                  <div key={track.id} className="flex items-center gap-3">
                    {track.image ? (
                      <img
                        src={track.image}
                        alt={track.name}
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : null}
                    <div>
                      <p className="font-medium">
                        {track.rank}. {track.name}
                      </p>
                      <p className="text-sm text-neutral-400">
                        {track.artistNames.join(", ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-400">
                No track data yet. Click Refresh Spotify Data.
              </p>
            )}
          </section>
        </div>

        <FriendsPanel
          selectedFriendId={viewingUserId === currentUser.id ? null : viewingUserId}
        />
      </div>
    </main>
  );
}