export const SPOTIFY_TYPES = ["track", "album", "playlist", "episode", "show", "artist"] as const;
export type SpotifyType = (typeof SPOTIFY_TYPES)[number];

/** Music from a link: a YouTube (or YouTube Music) video or playlist, or anything Spotify can embed. */
export type Tune =
  | { kind: "youtube"; video?: string; list?: string }
  | { kind: "spotify"; type: SpotifyType; id: string };

const YT_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const YT_LIST = /^[A-Za-z0-9_-]{2,64}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const YT_HOSTS = ["youtube.com", "music.youtube.com", "youtube-nocookie.com"];

const spotifyType = (v: unknown): v is SpotifyType => SPOTIFY_TYPES.includes(v as SpotifyType);

/** Only ids that look like real ones survive, so the player never gets anything else to load. */
export function cleanTune(v: unknown): Tune | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  if (t.kind === "youtube") {
    const video = typeof t.video === "string" && YT_VIDEO.test(t.video) ? t.video : undefined;
    const list = typeof t.list === "string" && YT_LIST.test(t.list) ? t.list : undefined;
    if (!video && !list) return null;
    return { kind: "youtube", ...(video && { video }), ...(list && { list }) };
  }
  if (t.kind === "spotify" && spotifyType(t.type) && typeof t.id === "string" && SPOTIFY_ID.test(t.id)) {
    return { kind: "spotify", type: t.type, id: t.id };
  }
  return null;
}

function fromSpotifyUri(s: string): Tune | null {
  const [scheme, type, id] = s.split(":");
  return scheme === "spotify" ? cleanTune({ kind: "spotify", type, id }) : null;
}

/** What a pasted YouTube, YouTube Music or Spotify link plays, or null when it is none of them. */
export function parseTune(input: string): Tune | null {
  const s = input.trim();
  if (s.startsWith("spotify:")) return fromSpotifyUri(s);
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return cleanTune({ kind: "youtube", video: parts[0], list: u.searchParams.get("list") });
  if (YT_HOSTS.includes(host)) {
    const list = u.searchParams.get("list");
    if (parts[0] === "watch") return cleanTune({ kind: "youtube", video: u.searchParams.get("v"), list });
    if (["shorts", "embed", "live", "v"].includes(parts[0])) return cleanTune({ kind: "youtube", video: parts[1] });
    if (parts[0] === "playlist") return cleanTune({ kind: "youtube", list });
    return null;
  }
  if (host === "open.spotify.com" || host === "play.spotify.com") {
    const [type, id] = parts.filter((p) => !p.startsWith("intl-") && p !== "embed");
    return cleanTune({ kind: "spotify", type, id });
  }
  return null;
}

export const tuneSource = (t: Tune) =>
  t.kind === "spotify" ? "Spotify" : t.video ? "YouTube" : "плейлист YouTube";

/** A track or a single video can be heard from the same second by everyone; an album or playlist starts over. */
export const tuneSyncs = (t: Tune) => (t.kind === "youtube" ? !!t.video : t.type === "track" || t.type === "episode");

export const sameTune = (a: Tune | null | undefined, b: Tune | null | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
