import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** The café's Supabase, over https for RPCs and wss for Realtime; none on a demo-only or local build. */
function supabaseOrigins(): string[] {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return [u.origin, `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`];
  } catch {
    return [];
  }
}

const YOUTUBE = ["https://www.youtube.com", "https://www.youtube-nocookie.com"];
const SPOTIFY = ["https://open.spotify.com", "https://open.spotifycdn.com"];

/**
 * Without nonces, so pages stay static: Next's own inline scripts need 'unsafe-inline'. The rest is pinned to what the
 * café loads: the jukebox's YouTube and Spotify players, the Supabase project, and blob: for the clip and the day card.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${[...YOUTUBE, ...SPOTIFY].join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins().join(" ")}`.trim(),
  `frame-src ${[...YOUTUBE, ...SPOTIFY].join(" ")}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // a hosted café is https only; this machine's own café runs on plain http://127.0.0.1
  ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile lives in $HOME).
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // YouTube's player needs to know the embedding site, so the origin (never the path or #k=) is sent
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
