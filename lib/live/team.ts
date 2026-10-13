"use client";

import { useMemo, useSyncExternalStore } from "react";
import { cleanMember } from "./member";
import { memberColors, teamKeys } from "./teamModel";
import { LiveEvent } from "./types";

const ME_KEY = "relay.me";
const CAFES_KEY = "relay.cafes";
const FOCUS_KEY = "relay.focus";

export interface KnownCafe {
  key: string;
  label: string;
}

type Names = Record<string, string>;

const listeners = new Set<() => void>();
let names: Names | null = null;
let cafes: KnownCafe[] | null = null;
let focus: string | null | undefined;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function keep(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const emit = () => listeners.forEach((l) => l());
const namesSnap = () => (names ??= load<Names>(ME_KEY, {}));
const cafesSnap = () => (cafes ??= load<KnownCafe[]>(CAFES_KEY, []));
const focusSnap = () => (focus === undefined ? (focus = load<string | null>(FOCUS_KEY, null)) : focus);
const NO_CAFES: KnownCafe[] = [];
const slot = (key: string) => key.slice(0, 12);

/** Your own name in the café behind `key`; null until you give one, which keeps a solo café solo. */
export function useMe(key: string | null): string | null {
  const all = useSyncExternalStore(subscribe, namesSnap, () => null);
  return key && all ? (all[slot(key)] ?? null) : null;
}

export function setMe(key: string, name: string | null) {
  const clean = cleanMember(name);
  const next = { ...namesSnap() };
  if (clean) next[slot(key)] = clean;
  else delete next[slot(key)];
  names = next;
  keep(ME_KEY, names);
  emit();
}

/** Cafés this browser has opened, so joining a team keeps a way back to your own. */
export function useCafes(): KnownCafe[] {
  return useSyncExternalStore(subscribe, cafesSnap, () => NO_CAFES);
}

/** Adds a café to the list; one already there keeps the name it got first. */
export function rememberCafe(key: string, label: string) {
  if (cafesSnap().some((c) => c.key === key)) return;
  cafes = [...cafesSnap(), { key, label: label.slice(0, 40) }];
  keep(CAFES_KEY, cafes);
  emit();
}

/** A café that moved to a new key keeps its place and name in the list. */
export function swapCafe(from: string, to: string) {
  if (!cafesSnap().some((c) => c.key === from)) return;
  cafes = cafesSnap().map((c) => (c.key === from ? { ...c, key: to } : c));
  keep(CAFES_KEY, cafes);
  emit();
}

/** Which teammate the dashboard looks at: a name, or null for the whole team. */
export function useFocus(): string | null {
  return useSyncExternalStore(subscribe, focusSnap, () => null);
}

export function setFocus(name: string | null) {
  focus = name;
  keep(FOCUS_KEY, name);
  emit();
}

export interface TeamView {
  /** more than one Claude owner in the room, so the page groups chats by teammate */
  on: boolean;
  members: string[];
  colors: string[];
  colorOf: Record<string, string>;
  /** the teammate in focus, or null for the whole team */
  focus: string | null;
  all: boolean;
  me: string | null;
}

/** Splits a room by teammate once more than one Claude owner has shown up; a solo café stays as it was. */
export function useTeamView(events: LiveEvent[], key: string | null): TeamView {
  const sig = useMemo(() => JSON.stringify(teamKeys(events)), [events]);
  const members = useMemo(() => JSON.parse(sig) as string[], [sig]);
  const colors = useMemo(() => memberColors(members), [members]);
  const colorOf = useMemo(() => Object.fromEntries(members.map((m, i) => [m, colors[i]])), [members, colors]);
  const me = useMe(key);
  const stored = useFocus();
  const on = members.length > 1;
  const focus = on && stored != null && members.includes(stored) ? stored : null;
  return { on, members, colors, colorOf, focus, all: on && focus == null, me };
}
