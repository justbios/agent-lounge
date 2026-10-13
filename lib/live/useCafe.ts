"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CafeSettings, Decor, Earned, Progress, decorOf, evaluate, progressFromHourly } from "./achievements";
import { Interior, ItemId, LookPick, Placed, beansEarned, beansSpent, cleanInterior, itemOf } from "./interior";
import { aggregateHourly } from "./recap";
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
  beans: { earned: number; spent: number; left: number };
  buy: (item: ItemId) => Promise<boolean>;
  /** puts a piece down, or moves the one with the same pid */
  place: (p: Placed) => Promise<boolean>;
  stow: (pid: string) => Promise<boolean>;
  setLook: (agent: string, pick: LookPick | null) => Promise<boolean>;
}

/** Lifetime progress, the decor it unlocks and the café's own settings: from Relay in the cloud, from memory and this browser locally. */
export function useCafe({ cloud, key, room, events, viewing }: CafeSource): CafeState {
  const id = viewing ? (room ? `v:${room}` : "") : key ? `k:${key}` : "";
  const [remote, setRemote] = useState<{ id: string; progress: Progress | null; error: boolean } | null>(null);
  const [saved, setSaved] = useState<{ id: string; room: CafeSettings } | null>(null);
  const localSettings = useSyncExternalStore(subscribe, localSnap, () => NO_SETTINGS);
  const seenAll = useSyncExternalStore(subscribe, seenSnap, () => null);

  useEffect(() => {
    const sb = supabase;
    if (!cloud || !id || !sb) return;
    let live = true;
    const load = async () => {
      const p_tz_min = -new Date().getTimezoneOffset();
      const { data, error } = viewing
        ? await sb.rpc("relay_progress_room", { p_room: room, p_tz_min })
        : await sb.rpc("relay_progress", { p_key: key, p_tz_min });
      if (live) setRemote({ id, progress: error ? null : (data as Progress), error: !!error });
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

  const localProgress = useMemo(() => (cloud ? null : progressFromHourly(aggregateHourly(events), null)), [cloud, events]);
  const progress = cloud ? (remote?.id === id ? remote.progress : null) : localProgress;
  const error = cloud && remote?.id === id ? remote.error : false;
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
  const earnedBeans = beansEarned(progress, done.length);
  const spent = beansSpent(interior);
  const beans = { earned: earnedBeans, spent, left: earnedBeans - spent };
  const fit = (next: Interior) => save({ interior: next });
  const buy = async (item: ItemId) => {
    const it = itemOf(item);
    if (!it || !editable || beans.left < it.price) return false;
    return fit({ ...interior, owned: [...interior.owned, item] });
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
  };
}
