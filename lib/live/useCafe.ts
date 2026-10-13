"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CafeSettings, Decor, Earned, Progress, decorOf, evaluate, localDay, progressFromHourly } from "./achievements";
import {
  BEANS_FROM,
  BeanWork,
  Interior,
  ItemId,
  LookPick,
  Placed,
  beansEarned,
  beansSpent,
  cleanInterior,
  itemOf,
} from "./interior";
import { HourRow, aggregateHourly } from "./recap";
import { LiveEvent } from "./types";

const REFRESH_MS = 60 * 1000;
const SETTINGS_KEY = "relay.cafe";
const SEEN_KEY = "relay.seenAch";
const NO_SETTINGS: CafeSettings = { cat_name: null, theme: null };

type Seen = Record<string, string[]>;

const listeners = new Set<() => void>();
let local: CafeSettings | null = null;
let seen: Seen | null = null;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
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
const localSnap = () => (local ??= load(SETTINGS_KEY, NO_SETTINGS));
const seenSnap = () => (seen ??= load<Seen>(SEEN_KEY, {}));

function setLocal(patch: Partial<CafeSettings>) {
  local = { ...localSnap(), ...patch };
  keep(SETTINGS_KEY, local);
  emit();
}

function markSeen(scope: string, ids: string[]) {
  const cur = seenSnap();
  seen = { ...cur, [scope]: [...new Set([...(cur[scope] ?? []), ...ids])] };
  keep(SEEN_KEY, seen);
  emit();
}

export interface CafeSource {
  cloud: boolean;
  key: string | null;
  room: string | null;
  events: LiveEvent[];
  viewing: boolean;
}

export interface CafeState {
  progress: Progress | null;
  earned: Earned[];
  decor: Set<Decor>;
  settings: CafeSettings;
  error: boolean;
  editable: boolean;
  save: (patch: Partial<CafeSettings>) => Promise<boolean>;
  /** achievements earned since this browser last looked, for the toast */
  fresh: Earned[];
  dismiss: () => void;
  interior: Interior;
  /** counted from {@link BEANS_FROM}: earned since, spent on what was bought since, and what is left */
  beans: { earned: number; spent: number; left: number };
  buy: (item: ItemId) => Promise<boolean>;
  /** puts a piece down, or moves the one with the same pid */
  place: (p: Placed) => Promise<boolean>;
  stow: (pid: string) => Promise<boolean>;
  setLook: (agent: string, pick: LookPick | null) => Promise<boolean>;
  /** the neon sign's own line, the second cat's name and the café's name */
  setNames: (patch: Pick<Interior, "sign" | "cat2Name" | "title">) => Promise<boolean>;
}

interface Remote {
  id: string;
  progress: Progress | null;
  work: BeanWork | null;
  error: boolean;
}

/** The local day the beans started over on: achievements reached after it pay beans. */
const FROM_DAY = localDay(Date.parse(BEANS_FROM));

function workSince(hours: HourRow[], since: string): BeanWork {
  const from = Date.parse(since);
  const w: BeanWork = { prompts: 0, tools: 0, dispatches: 0, answers: 0, minutes: 0 };
  for (const h of hours) {
    if (Date.parse(h.hour) < from) continue;
    w.prompts += h.prompts;
    w.tools += h.tools;
    w.dispatches += h.dispatches;
    w.answers += h.answers;
    w.minutes += Object.keys(h.mins).length;
  }
  return w;
}

/**
 * The days since the restart with at least one question. The restart day counts only when the work since the restart
 * holds more questions than the later days, as its earlier hours earn nothing.
 */
function daysAsked(p: Progress | null, w: BeanWork | null): number {
  if (!p || !w) return 0;
  const after = p.days.filter((d) => d.day > FROM_DAY && d.prompts > 0);
  const later = after.reduce((s, d) => s + d.prompts, 0);
  return after.length + (w.prompts > later ? 1 : 0);
}

/** Lifetime progress, the decor it unlocks and the café's own settings: from Relay in the cloud, from memory and this browser locally. */
export function useCafe({ cloud, key, room, events, viewing }: CafeSource): CafeState {
  const id = viewing ? (room ? `v:${room}` : "") : key ? `k:${key}` : "";
  const [remote, setRemote] = useState<Remote | null>(null);
  const [saved, setSaved] = useState<{ id: string; room: CafeSettings } | null>(null);
  const localSettings = useSyncExternalStore(subscribe, localSnap, () => NO_SETTINGS);
  const seenAll = useSyncExternalStore(subscribe, seenSnap, () => null);

  useEffect(() => {
    const sb = supabase;
    if (!cloud || !id || !sb) return;
    let live = true;
    const load = async () => {
      const p_tz_min = -new Date().getTimezoneOffset();
      const [prog, work] = await Promise.all([
        viewing
          ? sb.rpc("relay_progress_room", { p_room: room, p_tz_min })
          : sb.rpc("relay_progress", { p_key: key, p_tz_min }),
        viewing
          ? sb.rpc("relay_beans_room", { p_room: room, p_since: BEANS_FROM })
          : sb.rpc("relay_beans", { p_key: key, p_since: BEANS_FROM }),
      ]);
      if (!live) return;
      const error = !!prog.error || !!work.error;
      setRemote({
        id,
        progress: error ? null : (prog.data as Progress),
        work: error ? null : (work.data as BeanWork),
        error,
      });
    };
    const refresh = () => document.visibilityState === "visible" && void load();
    void load();
    const t = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      live = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [cloud, id, key, room, viewing]);

  const local = useMemo(() => {
    if (cloud) return null;
    const hours = aggregateHourly(events);
    return { progress: progressFromHourly(hours, null), work: workSince(hours, BEANS_FROM) };
  }, [cloud, events]);
  const mine = remote?.id === id ? remote : null;
  const progress = cloud ? (mine?.progress ?? null) : (local?.progress ?? null);
  const work = cloud ? (mine?.work ?? null) : (local?.work ?? null);
  const error = cloud && !!mine?.error;
  const settings = cloud ? (saved?.id === id ? saved.room : (progress?.room ?? NO_SETTINGS)) : localSettings;
  const earned = useMemo(() => (progress ? evaluate(progress) : []), [progress]);
  const decor = useMemo(() => decorOf(earned), [earned]);

  const scope = viewing ? null : cloud ? (key ? `c:${key.slice(0, 8)}` : null) : "local";
  const known = scope && seenAll ? seenAll[scope] : undefined;
  const done = useMemo(() => earned.filter((e) => e.done), [earned]);

  useEffect(() => {
    if (scope && progress && seenAll && !seenAll[scope]) markSeen(scope, done.map((e) => e.def.id));
  }, [scope, progress, seenAll, done]);

  const fresh = useMemo(() => (known ? done.filter((e) => !known.includes(e.def.id)) : []), [known, done]);
  const dismiss = useCallback(() => {
    if (scope) markSeen(scope, fresh.map((e) => e.def.id));
  }, [scope, fresh]);

  const editable = !viewing && (!cloud || !!key);
  const save = useCallback(
    async (patch: Partial<CafeSettings>) => {
      if (!cloud) {
        setLocal(patch);
        return true;
      }
      if (!supabase || !key || viewing) return false;
      const { data, error } = await supabase.rpc("relay_room_set", { p_key: key, p_patch: patch });
      if (error) return false;
      setSaved({ id, room: data as CafeSettings });
      return true;
    },
    [cloud, key, viewing, id],
  );

  const interior = useMemo(() => cleanInterior(settings.interior), [settings.interior]);
  const reached = done.filter((e) => e.day && e.day > FROM_DAY).length;
  const earnedBeans = beansEarned(work, reached, daysAsked(progress, work));
  const spent = beansSpent(interior);
  const beans = { earned: earnedBeans, spent, left: earnedBeans - spent };
  const fit = (next: Interior) => save({ interior: next });
  const buy = async (item: ItemId) => {
    const it = itemOf(item);
    if (!it || !editable || beans.left < it.price || (it.place === "perk" && interior.owned.includes(item))) return false;
    return fit({ ...interior, owned: [...interior.owned, item], paid: [...(interior.paid ?? []), item] });
  };
  const place = (p: Placed) => {
    const rest = interior.placed.filter((q) => q.pid !== p.pid);
    return fit({ ...interior, placed: [...rest, p] });
  };
  const stow = (pid: string) => fit({ ...interior, placed: interior.placed.filter((q) => q.pid !== pid) });
  const setLook = (agent: string, pick: LookPick | null) => {
    const looks = { ...interior.looks };
    if (pick) looks[agent] = pick;
    else delete looks[agent];
    return fit({ ...interior, looks });
  };
  const setNames = (patch: Pick<Interior, "sign" | "cat2Name" | "title">) =>
    fit(cleanInterior({ ...interior, ...patch }));

  return {
    progress,
    earned,
    decor,
    settings,
    error,
    editable,
    save,
    fresh,
    dismiss,
    interior,
    beans,
    buy,
    place,
    stow,
    setLook,
    setNames,
  };
}
