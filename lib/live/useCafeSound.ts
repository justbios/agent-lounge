"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { startLofi } from "./lofi";

const KEY = "relay.music";
const listeners = new Set<() => void>();
let on: boolean | null = null;
let ac: AudioContext | null = null;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const snap = () => (on ??= read());

function setMusic(next: boolean) {
  on = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
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
export function useCafeSound(working: number): { on: boolean; toggle: () => void } {
  const enabled = useSyncExternalStore(subscribe, snap, () => false);
  const workingRef = useRef(working);

  useEffect(() => {
    workingRef.current = working;
  }, [working]);

  useEffect(() => {
    if (!enabled) return;
    const ctx = audio();
    if (!ctx) return;
    const lofi = startLofi(ctx, () => workingRef.current);
    const wake = () => {
      if (ctx.state === "suspended") void ctx.resume();
    };
    document.addEventListener("pointerdown", wake);
    return () => {
      document.removeEventListener("pointerdown", wake);
      lofi.stop();
    };
  }, [enabled]);

  return {
    on: enabled,
    toggle: () => {
      // Browsers only let audio start inside a click, and the effect runs after it.
      if (!enabled) audio();
      setMusic(!enabled);
    },
  };
}
