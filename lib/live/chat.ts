"use client";

import { useSyncExternalStore } from "react";

export interface ChatMsg {
  id: number;
  /** ms since the epoch */
  at: number;
  author: string;
  body: string;
}

export const BODY_MAX = 500;
const KEEP = 200;
const READ_KEY = "relay.chatRead";

/** Whatever came back from the room, cut down to well-formed messages. */
export function cleanMsgs(v: unknown): ChatMsg[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((m) => {
    const o = m as Partial<ChatMsg> | null;
    const text = typeof o?.author === "string" && typeof o.body === "string";
    const ok = o && Number.isInteger(o.id) && typeof o.at === "number" && text;
    return ok ? [{ id: o.id!, at: o.at!, author: o.author!.slice(0, 24), body: o.body!.slice(0, BODY_MAX) }] : [];
  });
}

export function mergeMsgs(a: ChatMsg[], b: ChatMsg[]): ChatMsg[] {
  const by = new Map(a.map((m) => [m.id, m]));
  for (const m of b) by.set(m.id, m);
  return [...by.values()].sort((x, y) => x.id - y.id).slice(-KEEP);
}

type Read = Record<string, number>;

const listeners = new Set<() => void>();
let read: Read | null = null;

function load(): Read {
  try {
    const v = localStorage.getItem(READ_KEY);
    return v ? (JSON.parse(v) as Read) : {};
  } catch {
    return {};
  }
}

const snap = () => (read ??= load());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** The newest message this browser has seen in the café behind `slot`, or null before it ever looked. */
export function useReadUpTo(slot: string | null): number | null {
  const all = useSyncExternalStore(subscribe, snap, () => null);
  return slot && all ? (all[slot] ?? null) : null;
}

export function markRead(slot: string, id: number) {
  const cur = snap();
  if ((cur[slot] ?? -1) >= id) return;
  read = { ...cur, [slot]: id };
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(read));
  } catch {}
  listeners.forEach((l) => l());
}
