"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAccess } from "./access";
import { CafeSettings, Earned, Progress, progressFromHourly } from "./achievements";
import { CafeState, NO_SETTINGS, RoomKind, cafeRoom } from "./cafeRoom";
import { BEANS_FROM, BeanWork } from "./interior";
import { HourRow, aggregateHourly } from "./recap";
import { LiveEvent } from "./types";
import { useMemberRooms } from "./useMemberRooms";

export type { CafeState } from "./cafeRoom";

const REFRESH_MS = 60 * 1000;
const SETTINGS_KEY = "relay.cafe";
const SEEN_KEY = "relay.seenAch";
const NO_PROGRESS: Progress = { days: [], agents: 0, tools: 0, projects: 0, chats: 0, room: null };
const NO_WORK: BeanWork = { prompts: 0, tools: 0, dispatches: 0, answers: 0, minutes: 0 };

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

export interface CafeRooms {
  /** the café itself: its only room off personal keys, the shared lobby on them */
  common: CafeState;
  /** on personal keys every teammate's chats sit in a room of their own */
  personal: boolean;
  /** your own room on personal keys */
  mine: CafeState | null;
  /** the room a teammate's chats sit in; the café itself off personal keys, or for a chat with no name */
  roomOf: (member: string | null) => CafeState;
  /** achievements earned since this browser last looked, for the toast: your own on personal keys */
  fresh: Earned[];
  dismiss: () => void;
}

interface Remote {
  id: string;
  at: number;
  progress: Progress | null;
  work: BeanWork | null;
  error: boolean;
}

function workSince(hours: HourRow[], since: string): BeanWork {
  const from = Date.parse(since);
  const w: BeanWork = { ...NO_WORK };
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
 * Lifetime progress, the decor it unlocks and the café's own settings: from Relay in the cloud, from memory and this
 * browser locally. On personal keys each teammate also has a room of their own, and the café itself is the lobby.
 */
export function useCafe({ cloud, key, room, events, viewing }: CafeSource): CafeRooms {
  const id = viewing ? (room ? `v:${room}` : "") : key ? `k:${key}` : "";
  const [remote, setRemote] = useState<Remote | null>(null);
  const [saved, setSaved] = useState<{ id: string; at: number; room: CafeSettings } | null>(null);
  const localSettings = useSyncExternalStore(subscribe, localSnap, () => NO_SETTINGS);
  const seenAll = useSyncExternalStore(subscribe, seenSnap, () => null);
  const access = useAccess(cloud && !viewing ? key : null);
  const me = access?.locked ? access.name : null;
  const team = useMemberRooms({ on: cloud && (viewing || !!me), key, room, viewing });

  useEffect(() => {
    const sb = supabase;
    if (!cloud || !id || !sb) return;
    let live = true;
    const load = async () => {
      const at = Date.now();
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
        at,
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

  const localData = useMemo(() => {
    if (cloud) return null;
    const hours = aggregateHourly(events);
    return { progress: progressFromHourly(hours, null), work: workSince(hours, BEANS_FROM) };
  }, [cloud, events]);

  const save = useCallback(
    async (patch: Partial<CafeSettings>) => {
      if (!cloud) {
        setLocal(patch);
        return true;
      }
      if (!supabase || !key || viewing) return false;
      const at = Date.now();
      const { data, error } = await supabase.rpc("relay_room_set", { p_key: key, p_patch: patch });
      if (error) return false;
      setSaved({ id, at, room: data as CafeSettings });
      return true;
    },
    [cloud, key, viewing, id],
  );

  const personal = cloud && team.locked && (viewing || !!me);
  const mineRemote = remote?.id === id ? remote : null;
  const progress = cloud ? (mineRemote?.progress ?? null) : (localData?.progress ?? null);
  const work = cloud ? (mineRemote?.work ?? null) : (localData?.work ?? null);
  const error = cloud && !!mineRemote?.error;
  const fresher = saved?.id === id && (!mineRemote || saved.at > mineRemote.at);
  const settings = cloud ? (fresher ? saved!.room : (progress?.room ?? NO_SETTINGS)) : localSettings;
  const editable = !viewing && (!cloud || !!key);

  const common = useMemo(
    () =>
      cafeRoom({
        kind: personal ? "lobby" : "cafe",
        whose: null,
        progress,
        work,
        settings,
        error,
        editable,
        save,
      }),
    [personal, progress, work, settings, error, editable, save],
  );

  const members = team.members;
  const mySaved = team.saved;
  const memberSave = team.save;
  const teamError = team.error;
  const rooms = useMemo(() => {
    const m = new Map<string, CafeState>();
    if (!personal) return m;
    const names = new Set([...Object.keys(members ?? {}), ...(me ? [me] : [])]);
    for (const name of names) {
      const data = members?.[name];
      const own = name === me;
      const kind: RoomKind = own ? "mine" : "theirs";
      m.set(
        name,
        cafeRoom({
          kind,
          whose: name,
          progress: members ? (data?.progress ?? NO_PROGRESS) : null,
          work: members ? (data?.work ?? NO_WORK) : null,
          settings: (own ? mySaved : null) ?? data?.progress.room ?? NO_SETTINGS,
          error: teamError,
          editable: own && !viewing,
          cafeTitle: common.interior.title,
          save: own && !viewing ? memberSave : async () => false,
        }),
      );
    }
    return m;
  }, [personal, members, me, mySaved, memberSave, teamError, viewing, common.interior.title]);

  const mine = me ? (rooms.get(me) ?? null) : null;
  const roomOf = useCallback(
    (member: string | null) => (personal && member ? (rooms.get(member) ?? common) : common),
    [personal, rooms, common],
  );

  const watched = personal ? mine : common;
  const slot = key ? `${personal ? "p" : "c"}:${key.slice(0, 8)}` : null;
  const scope = viewing || !watched ? null : !cloud ? "local" : slot;
  const known = scope && seenAll ? seenAll[scope] : undefined;
  const done = useMemo(() => watched?.earned.filter((e) => e.done) ?? [], [watched]);

  useEffect(() => {
    if (scope && watched?.progress && seenAll && !seenAll[scope]) markSeen(scope, done.map((e) => e.def.id));
  }, [scope, watched, seenAll, done]);

  const fresh = useMemo(() => (known ? done.filter((e) => !known.includes(e.def.id)) : []), [known, done]);
  const dismiss = useCallback(() => {
    if (scope) markSeen(scope, fresh.map((e) => e.def.id));
  }, [scope, fresh]);

  return { common, personal, mine, roomOf, fresh, dismiss };
}
