"use client";

import { useState } from "react";

export function RefreshSpotifyButton() {
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
    <div className="mt-6">
      <button
        onClick={refreshProfile}
        disabled={loading}
        className="rounded-full bg-green-500 px-5 py-2 font-medium text-black disabled:opacity-60"
      >
        {loading ? "Refreshing..." : "Refresh Spotify Data"}
      </button>

      {message ? <p className="mt-3 text-sm text-neutral-300">{message}</p> : null}
    </div>
  );
}