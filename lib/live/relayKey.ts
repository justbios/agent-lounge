"use client";

import { useSyncExternalStore } from "react";
import { ROOM_KEY } from "./hookConfig.mjs";

const STORE = "relay.key";
const LOCAL_HOSTS = /^(127\.0\.0\.1|localhost|\[::1\])$/;
const listeners = new Set<() => void>();
let current: string | null | undefined;

function read(): string | null {
  try {
    const k = localStorage.getItem(STORE);
    return k && ROOM_KEY.test(k) ? k : null;
  } catch {
    return null;
  }
}

/** A link like https://…/#k=<key> carries the room to another device; the key then leaves the address bar. */
function fromHash(): string | null {
  const m = /[#&]k=([A-Za-z0-9_-]{20,128})/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return m[1];
}

function persist(key: string) {
  try {
    localStorage.setItem(STORE, key);
  } catch {}
}

function snapshot(): string | null {
  if (current === undefined) {
    const shared = fromHash();
    if (shared) persist(shared);
    current = shared ?? read();
  }
  return current;
}

function onHash() {
  const shared = fromHash();
  if (shared) saveKey(shared);
}

function subscribe(fn: () => void) {
  if (!listeners.size) window.addEventListener("hashchange", onHash);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) window.removeEventListener("hashchange", onHash);
  };
}

export function saveKey(key: string) {
  current = key;
  persist(key);
  for (const fn of listeners) fn();
}

export function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function useRelayKey(): string | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

const never = () => () => {};

/** true on a deployed site, false on this machine's own Relay, null while the page is still server-rendered. */
export function useHosted(): boolean | null {
  return useSyncExternalStore(never, () => !LOCAL_HOSTS.test(location.hostname), () => null);
}

export async function roomOf(key: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
