"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { startMusic } from "./music";
import type { Social } from "./useSocial";
import { TrackId, isTrack, trackOf } from "./tracks";
import { Tune, cleanTune } from "./tune";

const KEY = "relay.music";
const VOL_KEY = "relay.music.vol";
const TRACK_KEY = "relay.music.track";
const TUNE_KEY = "relay.music.tune";
const DEFAULT_VOL = 0.6;

interface Music {
  on: boolean;
  vol: number;
  track: TrackId;
  tune: Tune | null;
  tuneAt: number;
}

const OFF: Music = { on: false, vol: DEFAULT_VOL, track: "lofi", tune: null, tuneAt: 0 };

function readTune(): Pick<Music, "tune" | "tuneAt"> {
  try {
    const raw = JSON.parse(localStorage.getItem(TUNE_KEY) ?? "null") as { tune?: unknown; at?: unknown } | null;
    const tune = cleanTune(raw?.tune);
    return tune && typeof raw?.at === "number" ? { tune, tuneAt: raw.at } : { tune: null, tuneAt: 0 };
  } catch {
    return { tune: null, tuneAt: 0 };
  }
}
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
      ...readTune(),
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
    localStorage.setItem(TUNE_KEY, JSON.stringify(music.tune ? { tune: music.tune, at: music.tuneAt } : null));
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
  /** who put the café's record on, when someone else did */
  by: string | null;
  /** the record is the whole café's: everyone with the sound on hears the same one */
  shared: boolean;
  /** a view link only listens to what the café plays */
  canPick: boolean;
  toggle: () => void;
  setVol: (v: number) => void;
  /** puts a record on and starts playing it */
  play: (track: TrackId) => void;
  /** music from a link, playing in place of the record */
  tune: Tune | null;
  /** when the link was put on, so everyone hears it from the same second */
  tuneAt: number;
  playTune: (tune: Tune) => void;
}

/**
 * The café's jukebox: silent until switched on, then the café's record, louder as more agents work. Sound and volume are
 * this browser's own; the record is the last one anyone in the café put on, or this browser's own pick before that.
 */
export function useCafeSound(
  working: number,
  social: Pick<Social, "disc" | "spin" | "room" | "name">,
  canPick: boolean,
): CafeSound {
  const mine = useSyncExternalStore(subscribe, snap, () => OFF);
  const { on, vol } = mine;
  const { disc, spin } = social;
  const track = disc?.track ?? mine.track;
  const tune = disc ? (disc.tune ?? null) : mine.tune;
  const tuneAt = disc ? disc.at : mine.tuneAt;
  const linked = tune != null;
  const workingRef = useRef(working);
  const volRef = useRef(vol);

  useEffect(() => {
    workingRef.current = working;
    volRef.current = vol;
  }, [working, vol]);

  useEffect(() => {
    if (!on || linked) return;
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
  }, [on, track, linked]);

  return {
    on,
    vol,
    track,
    by: disc && disc.by !== social.name ? disc.by : null,
    shared: social.room != null,
    canPick,
    toggle: () => {
      // Browsers only let audio start inside a click, and the effect runs after it.
      if (!on) audio();
      setMusic({ on: !on });
    },
    setVol: (v) => setMusic({ vol: Math.min(1, Math.max(0, v)) }),
    play: (next) => {
      if (!canPick) return;
      audio();
      setMusic({ on: true, track: next, tune: null });
      spin(next);
    },
    tune,
    tuneAt,
    playTune: (t) => {
      if (!canPick) return;
      setMusic({ on: true, tune: t, tuneAt: Date.now() });
      spin(track, t);
    },
  };
}
