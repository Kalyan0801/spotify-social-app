"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type UserSummary = {
  id: string;
  displayName: string | null;
  email: string | null;
  spotifyUserId: string;
  image: string | null;
};

type IncomingRequest = {
  id: string;
  sender: UserSummary;
};

type OutgoingRequest = {
  id: string;
  receiver: UserSummary;
};

export function FriendsPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedFriendId = searchParams.get("friend");
  const [pendingFriendId, setPendingFriendId] = useState<string | null>(null);
  const [isNavigating, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [friends, setFriends] = useState<UserSummary[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);
  const [message, setMessage] = useState("");

  async function loadFriends() {
    const res = await fetch("/api/friends");
    const data = await res.json();

    if (res.ok) {
      setFriends(data.friends);
      setIncomingRequests(data.incomingRequests);
      setOutgoingRequests(data.outgoingRequests);
    }
  }

  async function searchUsers(value: string) {
    setQuery(value);
    setMessage("");

    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const res = await fetch(`/api/users/search?q=${encodeURIComponent(value)}`);
    const data = await res.json();

    if (res.ok) {
      setSearchResults(data.users);
    }
  }

  async function sendRequest(receiverId: string) {
    setMessage("");

    const res = await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverId }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error ?? "Could not send request");
      return;
    }

    setMessage("Friend request sent.");
    setSearchResults([]);
    setQuery("");
    await loadFriends();
  }

  async function respondToRequest(requestId: string, action: "accept" | "reject") {
    setMessage("");

    const res = await fetch("/api/friends/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error ?? "Could not update request");
      return;
    }

    setMessage(
      action === "accept" ? "Friend request accepted." : "Request rejected."
    );

    await loadFriends();
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadFriends();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="mb-4 text-xl font-semibold">Friends</h2>

      <div className="mb-6">
        <label className="mb-2 block text-sm text-neutral-400">
          Search users
        </label>

        <input
          value={query}
          onChange={(event) => searchUsers(event.target.value)}
          placeholder="Search by name or email"
          className="w-full rounded-xl border border-neutral-700 bg-black px-4 py-3 text-white outline-none focus:border-green-500"
        />

        {searchResults.length > 0 ? (
          <div className="mt-3 space-y-2">
            {searchResults.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between rounded-xl border border-neutral-800 bg-black p-3"
              >
                <UserRow user={user} />

                <button
                  onClick={() => sendRequest(user.id)}
                  className="rounded-full bg-green-500 px-4 py-2 text-sm font-medium text-black hover:bg-green-400"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {message ? (
          <p className="mt-3 text-sm text-neutral-300">{message}</p>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-medium">Your Friends</h3>
            <Link
              href="/dashboard"
              className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 transition hover:bg-neutral-800"
            >
              View my profile
            </Link>
          </div>

          {friends.length ? (
            <div className="space-y-2">
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className={`rounded-xl border bg-black p-3 transition ${
                    selectedFriendId === friend.id
                      ? "border-green-500"
                      : "border-neutral-800 hover:border-green-500"
                  }`}
                >
                  <UserRow user={friend} />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isNavigating && pendingFriendId === friend.id}
                      onClick={() => {
                        setPendingFriendId(friend.id);
                        startTransition(() => {
                          router.push(`/friends/${friend.id}`);
                        });
                      }}
                      className="rounded-full border border-green-600 px-3 py-1 text-xs text-green-400 transition hover:bg-green-950/40 disabled:cursor-wait disabled:opacity-70"
                    >
                      {isNavigating && pendingFriendId === friend.id
                        ? "Opening…"
                        : "View compatibility"}
                    </button>
                    <Link
                      href={`/dashboard?friend=${friend.id}`}
                      className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 transition hover:bg-neutral-800"
                    >
                      {selectedFriendId === friend.id ? "Viewing" : "View profile"}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400">No friends yet.</p>
          )}
        </div>

        <div>
          <h3 className="mb-3 font-medium">Incoming Requests</h3>

          {incomingRequests.length ? (
            <div className="space-y-2">
              {incomingRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-xl border border-neutral-800 bg-black p-3"
                >
                  <UserRow user={request.sender} />

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => respondToRequest(request.id, "accept")}
                      className="rounded-full bg-green-500 px-3 py-1 text-sm text-black"
                    >
                      Accept
                    </button>

                    <button
                      onClick={() => respondToRequest(request.id, "reject")}
                      className="rounded-full border border-neutral-700 px-3 py-1 text-sm"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400">No incoming requests.</p>
          )}
        </div>

        <div>
          <h3 className="mb-3 font-medium">Sent Requests</h3>

          {outgoingRequests.length ? (
            <div className="space-y-2">
              {outgoingRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-xl border border-neutral-800 bg-black p-3"
                >
                  <UserRow user={request.receiver} />
                  <p className="mt-2 text-xs text-neutral-500">Pending</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400">No sent requests.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function UserRow({ user }: { user: UserSummary }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {user.image ? (
        <img
          src={user.image}
          alt={user.displayName ?? "User"}
          className="h-10 w-10 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-sm">
          ?
        </div>
      )}

      <div className="min-w-0">
        <p className="truncate font-medium">
          {user.displayName ?? "Unnamed user"}
        </p>
        <p className="truncate text-xs text-neutral-400">@{user.spotifyUserId}</p>
      </div>
    </div>
  );
}