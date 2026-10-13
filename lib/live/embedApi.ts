"use client";

export interface YTPlayer {
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getDuration(): number;
  destroy(): void;
}

interface YTEvent {
  target: YTPlayer;
  data: number;
}

interface YTNamespace {
  Player: new (el: HTMLElement, options: Record<string, unknown>) => YTPlayer;
  PlayerState: { ENDED: number };
}

export type YTEvents = Partial<Record<"onReady" | "onStateChange" | "onError", (e: YTEvent) => void>>;

export interface SpotifyPlayback {
  isPaused: boolean;
  duration: number;
  position: number;
}

export interface SpotifyController {
  play(): void;
  seek(seconds: number): void;
  destroy(): void;
  addListener(event: "ready", fn: () => void): void;
  addListener(event: "playback_update", fn: (e: { data: SpotifyPlayback }) => void): void;
}

interface SpotifyApi {
  createController(
    el: HTMLElement,
    options: { uri: string; width?: string | number; height?: number },
    ready: (c: SpotifyController) => void,
  ): void;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
    onSpotifyIframeApiReady?: (api: SpotifyApi) => void;
  }
}

function addScript(src: string, fail: () => void) {
  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  s.onerror = () => {
    s.remove();
    fail();
  };
  document.head.appendChild(s);
}

let yt: Promise<YTNamespace> | null = null;
let spotify: Promise<SpotifyApi> | null = null;

/** YouTube's player API, loaded once; a load that failed (an ad blocker) is tried again next time. */
export function youTubeApi(): Promise<YTNamespace> {
  yt ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    addScript("https://www.youtube.com/iframe_api", () => {
      yt = null;
      reject(new Error("youtube api"));
    });
  });
  return yt;
}

/** Spotify's embed API, loaded once, the same way. */
export function spotifyApi(): Promise<SpotifyApi> {
  spotify ??= new Promise((resolve, reject) => {
    window.onSpotifyIframeApiReady = resolve;
    addScript("https://open.spotify.com/embed/iframe-api/v1", () => {
      spotify = null;
      reject(new Error("spotify api"));
    });
  });
  return spotify;
}
