"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type RefreshSpotifyButtonProps = {
  actions?: ReactNode;
};

export function RefreshSpotifyButton({ actions }: RefreshSpotifyButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshProfile() {
    setLoading(true);
    setMessage("");

    const res = await fetch("/api/spotify/refresh-profile", {
      method: "POST",
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error ?? "Something went wrong");
    } else {
      setMessage(
        `Saved ${data.artistsStored} artists and ${data.tracksStored} tracks.`
      );
    }

    setLoading(false);
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={refreshProfile}
          disabled={loading}
          className="rounded-full bg-green-500 px-5 py-2 font-medium text-black transition hover:bg-green-400 disabled:opacity-60"
        >
          {loading ? "Refreshing..." : "Refresh Spotify Data"}
        </button>
        {actions}
      </div>

      {message ? <p className="mt-3 text-sm text-neutral-300">{message}</p> : null}
    </div>
  );
}