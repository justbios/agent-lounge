"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CafeSettings, Progress } from "./achievements";
import { BEANS_FROM } from "./interior";

const REFRESH_MS = 60 * 1000;

/** A teammate's room as Relay keeps it: their progress, with the room's settings inside, and work since the restart. */
export interface MemberData {
  progress: Progress;
  /** raw from Relay; {@link beanWork} reads it */
  work: unknown;
}

interface Reply {
  locked: boolean;
  members: Record<string, MemberData>;
}

interface Loaded extends Reply {
  id: string;
  /** when the request went out, so a room saved after it is not overwritten by older data */
  at: number;
  error: boolean;
}

export interface MemberRooms {
  /** the café is on personal keys; false until Relay says so */
  locked: boolean;
  /** every teammate Relay knows of; null while it is being asked */
  members: Record<string, MemberData> | null;
  error: boolean;
  /** your own room's settings as you last saved them, until Relay is asked again */
  saved: CafeSettings | null;
  /** writes your own room; only a personal key has one */
  save: (patch: Partial<CafeSettings>) => Promise<boolean>;
}

/** Every teammate's room in a café on personal keys, asked from Relay every minute while the page is visible. */
export function useMemberRooms({
  on,
  key,
  room,
  viewing,
}: {
  on: boolean;
  key: string | null;
  room: string | null;
  viewing: boolean;
}): MemberRooms {
  const id = !on ? "" : viewing ? (room ? `v:${room}` : "") : key ? `k:${key}` : "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [saved, setSaved] = useState<{ id: string; at: number; room: CafeSettings } | null>(null);

  useEffect(() => {
    const sb = supabase;
    if (!id || !sb) return;
    let live = true;
    const load = async () => {
      const at = Date.now();
      const p_tz_min = -new Date().getTimezoneOffset();
      const { data, error } = viewing
        ? await sb.rpc("relay_members_room", { p_room: room, p_tz_min, p_since: BEANS_FROM })
        : await sb.rpc("relay_members", { p_key: key, p_tz_min, p_since: BEANS_FROM });
      if (!live) return;
      const r = (error ? null : data) as Reply | null;
      setLoaded({ id, at, error: !!error, locked: !!r?.locked, members: r?.members ?? {} });
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
  }, [id, key, room, viewing]);

  const save = useCallback(
    async (patch: Partial<CafeSettings>) => {
      if (!supabase || !key || viewing || !id) return false;
      const at = Date.now();
      const { data, error } = await supabase.rpc("relay_member_set", { p_key: key, p_patch: patch });
      if (error) return false;
      setSaved({ id, at, room: data as CafeSettings });
      return true;
    },
    [id, key, viewing],
  );

  const mine = loaded?.id === id ? loaded : null;
  const fresh = saved?.id === id && (!mine || saved.at > mine.at) ? saved.room : null;
  return {
    locked: !!mine?.locked,
    members: mine && !mine.error ? mine.members : null,
    error: !!mine?.error,
    saved: fresh,
    save,
  };
}
