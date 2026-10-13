"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { startLofi } from "./lofi";

const KEY = "relay.music";
const VOL_KEY = "relay.music.vol";
const DEFAULT_VOL = 0.6;

interface Music {
  on: boolean;
  vol: number;
}

const OFF: Music = { on: false, vol: DEFAULT_VOL };
const listeners = new Set<() => void>();
let music: Music | null = null;
let ac: AudioContext | null = null;

function read(): Music {
  try {
    const vol = Number(localStorage.getItem(VOL_KEY));
    return {
      on: localStorage.getItem(KEY) === "1",
      vol: localStorage.getItem(VOL_KEY) !== null && vol >= 0 && vol <= 1 ? vol : DEFAULT_VOL,
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

/** The café's music: off until switched on, then lo-fi that gets louder and the typing busier as more agents work. */
export function useCafeSound(working: number): {
  on: boolean;
  vol: number;
  toggle: () => void;
  setVol: (v: number) => void;
} {
  const { on, vol } = useSyncExternalStore(subscribe, snap, () => OFF);
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
    const lofi = startLofi(
      ctx,
      () => workingRef.current,
      () => volRef.current,
    );
    const wake = () => {
      if (ctx.state === "suspended") void ctx.resume();
    };
    document.addEventListener("pointerdown", wake);
    return () => {
      document.removeEventListener("pointerdown", wake);
      lofi.stop();
    };
  }, [on]);

  return {
    on,
    vol,
    toggle: () => {
      // Browsers only let audio start inside a click, and the effect runs after it.
      if (!on) audio();
      setMusic({ on: !on });
    },
    setVol: (v) => setMusic({ vol: Math.min(1, Math.max(0, v)) }),
  };
}
