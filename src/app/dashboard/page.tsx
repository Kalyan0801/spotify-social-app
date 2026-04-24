import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-3xl font-bold">Dashboard</h1>

        <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
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
        </div>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-full border border-neutral-700 px-5 py-2 hover:bg-neutral-900"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}