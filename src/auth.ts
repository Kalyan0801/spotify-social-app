import NextAuth from "next-auth";
import { customFetch } from "next-auth";
import Spotify from "next-auth/providers/spotify";
import { prisma } from "@/lib/prisma";

/** App origin only (not `/api/auth`). NextAuth sets `basePath` to `/api/auth` itself. */
export function authOrigin(): string {
  const raw = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!raw) return "http://127.0.0.1:3000";
  return new URL(raw).origin;
}

const spotifyRedirectUri =
  process.env.AUTH_SPOTIFY_REDIRECT_URI ??
  `${authOrigin()}/api/auth/callback/spotify`;

const spotifyDiagnosticFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.startsWith("https://accounts.spotify.com/api/token")) {
    const body = init?.body?.toString() ?? "";
    const params = new URLSearchParams(body);
    const headers = init?.headers ? new Headers(init.headers) : new Headers();

    const currentRedirect = params.get("redirect_uri");
    if (currentRedirect && currentRedirect !== spotifyRedirectUri) {
      if (process.env.AUTH_DEBUG === "1") {
        console.warn("[spotify-oauth] normalizing redirect_uri for token request", {
          from: currentRedirect,
          to: spotifyRedirectUri,
        });
      }
      params.set("redirect_uri", spotifyRedirectUri);
    }

    const safe = {
      grant_type: params.get("grant_type"),
      redirect_uri: params.get("redirect_uri"),
      client_id: params.get("client_id"),
      code_prefix: (params.get("code") ?? "").slice(0, 8),
      has_code_verifier: params.has("code_verifier"),
      authorization_header: headers.get("authorization") ? "present" : "absent",
    };
    if (process.env.AUTH_DEBUG === "1") {
      console.info("[spotify-oauth] token request", safe);
    }

    const nextInit: RequestInit = {
      ...init,
      headers,
      body: params.toString(),
    };

    return fetch(input, nextInit);
  }

  return fetch(input, init);
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Spotify({
      clientId: process.env.AUTH_SPOTIFY_ID!,
      clientSecret: process.env.AUTH_SPOTIFY_SECRET!,
      [customFetch]: spotifyDiagnosticFetch,
      authorization: {
        url: "https://accounts.spotify.com/authorize",
        params: {
          scope: "user-top-read user-read-email",
          redirect_uri: spotifyRedirectUri,
        },
      },
    }),
  ],
  callbacks: {
    /**
     * Always resolve post-auth URLs against `AUTH_URL`, not the request `baseUrl`.
     * Otherwise `trustHost` + `Host: localhost` yields `http://localhost:3000/dashboard`
     * while the session cookie was set on `127.0.0.1` (Spotify callback / dev server).
     */
    async redirect({ url }) {
      const canonical = authOrigin();
      if (url.startsWith("/")) return `${canonical}${url}`;
      try {
        const target = new URL(url);
        if (target.origin === canonical) return url;
        if (process.env.NODE_ENV !== "production") {
          const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
          if (
            loopback.has(target.hostname) &&
            loopback.has(new URL(canonical).hostname)
          ) {
            return `${canonical}${target.pathname}${target.search}`;
          }
        }
      } catch {
        /* ignore invalid absolute url */
      }
      return canonical;
    },
    async signIn({ profile }) {
      const spotifyProfile = profile as {
        id?: string;
        display_name?: string | null;
        email?: string | null;
        images?: { url?: string | null }[];
      };

      if (!spotifyProfile?.id) return false;

      try {
        await prisma.user.upsert({
            where: {
              spotifyUserId: spotifyProfile.id,
            },
            update: {
              displayName: spotifyProfile.display_name ?? null,
              email: spotifyProfile.email ?? null,
              image: spotifyProfile.images?.[0]?.url ?? null,
            },
            create: {
              spotifyUserId: spotifyProfile.id,
              displayName: spotifyProfile.display_name ?? null,
              email: spotifyProfile.email ?? null,
              image: spotifyProfile.images?.[0]?.url ?? null,
            },
        });
        return true;
      } catch (error) {
        console.error("Error upserting user:", error);
        return false;
      }
    },
  },
});