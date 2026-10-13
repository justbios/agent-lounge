"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { startMusic } from "./music";
import { TrackId, isTrack, trackOf } from "./tracks";

const KEY = "relay.music";
const VOL_KEY = "relay.music.vol";
const TRACK_KEY = "relay.music.track";
const DEFAULT_VOL = 0.6;

interface Music {
  on: boolean;
  vol: number;
  track: TrackId;
}

const OFF: Music = { on: false, vol: DEFAULT_VOL, track: "lofi" };
const listeners = new Set<() => void>();
let music: Music | null = null;
let ac: AudioContext | null = null;

function read(): Music {
  try {
    const vol = Number(localStorage.getItem(VOL_KEY));
    const track = localStorage.getItem(TRACK_KEY);
    return {
      on: localStorage.getItem(KEY) === "1",
      vol: localStorage.getItem(VOL_KEY) !== null && vol >= 0 && vol <= 1 ? vol : DEFAULT_VOL,
      track: isTrack(track) ? track : OFF.track,
    };
  } catch {
    return OFF;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const snap = () => (music ??= read());

function setMusic(next: Partial<Music>) {
  music = { ...snap(), ...next };
  try {
    localStorage.setItem(KEY, music.on ? "1" : "0");
    localStorage.setItem(VOL_KEY, String(music.vol));
    localStorage.setItem(TRACK_KEY, music.track);
  } catch {}
  listeners.forEach((l) => l());
}

function audio(): AudioContext | null {
  try {
    ac ??= new AudioContext();
    if (ac.state === "suspended") void ac.resume();
  } catch {}
  return ac;
}

export interface CafeSound {
  on: boolean;
  vol: number;
  track: TrackId;
  toggle: () => void;
  setVol: (v: number) => void;
  /** puts a record on and starts playing it */
  play: (track: TrackId) => void;
}

/** The café's jukebox: silent until switched on, then the chosen record, louder as more agents work. */
export function useCafeSound(working: number): CafeSound {
  const { on, vol, track } = useSyncExternalStore(subscribe, snap, () => OFF);
  const workingRef = useRef(working);
  const volRef = useRef(vol);

  useEffect(() => {
    workingRef.current = working;
    volRef.current = vol;
  }, [working, vol]);

  useEffect(() => {
    if (!on) return;
    const ctx = audio();
    if (!ctx) return;
    const band = startMusic(
      ctx,
      trackOf(track),
      () => workingRef.current,
      () => volRef.current,
    );
    const wake = () => {
      if (ctx.state === "suspended") void ctx.resume();
    };
    document.addEventListener("pointerdown", wake);
    return () => {
      document.removeEventListener("pointerdown", wake);
      band.stop();
    };
  }, [on, track]);

  return {
    on,
    vol,
    track,
    toggle: () => {
      // Browsers only let audio start inside a click, and the effect runs after it.
      if (!on) audio();
      setMusic({ on: !on });
    },
    setVol: (v) => setMusic({ vol: Math.min(1, Math.max(0, v)) }),
    play: (next) => {
      audio();
      setMusic({ on: true, track: next });
    },
  };
}
