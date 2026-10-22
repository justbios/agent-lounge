"use client";

import { useSyncExternalStore } from "react";

const KEY = "relay.halloween";

/** The Halloween week, from 22 October this year to 1 November, by the clock of whoever is looking. */
export function halloweenAt(d: Date): boolean {
  const day = d.getDate();
  return (d.getMonth() === 9 && day >= 22) || (d.getMonth() === 10 && day === 1);
}

/** A dev build takes `?halloween=1` or `?halloween=0` on the address, to see the week on any day or not at all. */
function forced(): boolean | null {
  if (process.env.NODE_ENV === "production" || typeof location === "undefined") return null;
  const v = new URLSearchParams(location.search).get("halloween");
  return v === "1" ? true : v === "0" ? false : null;
}

/** This viewer switched the week off this year; next year it comes back on its own. */
function offIn(year: number): boolean {
  try {
    return localStorage.getItem(KEY) === `off-${year}`;
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const id = setInterval(cb, 60_000);
  return () => {
    listeners.delete(cb);
    clearInterval(id);
  };
}

/** 0 not the week · 1 the week, switched off here · 2 the week */
function read(): 0 | 1 | 2 {
  const now = new Date();
  if (!(forced() ?? halloweenAt(now))) return 0;
  return offIn(now.getFullYear()) ? 1 : 2;
}

function toggle() {
  const year = new Date().getFullYear();
  try {
    if (offIn(year)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, `off-${year}`);
  } catch {}
  listeners.forEach((cb) => cb());
}

export interface Halloween {
  /** it is the week: the shop sells its pieces and the jukebox has its record */
  week: boolean;
  /** the week, and this viewer left it on: the view outside, the black cat and the costumes */
  on: boolean;
  /** switches the view, the cat and the costumes off or back on for this viewer, until next year */
  toggle: () => void;
}

/** The Halloween week as this viewer sees it, checked once a minute. */
export function useHalloween(): Halloween {
  const s = useSyncExternalStore(subscribe, read, () => 0);
  return { week: s > 0, on: s === 2, toggle };
}
