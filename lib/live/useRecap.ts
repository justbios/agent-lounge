"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { HourRow, aggregateHourly, startOfLocalDay } from "./recap";
import { LiveEvent } from "./types";

const REFRESH_MS = 60 * 1000;
const WEEK_DAYS = 7;

export interface RecapSource {
  cloud: boolean;
  key: string | null;
  room: string | null;
  events: LiveEvent[];
}

/** Hourly rows for the last week: from relay_recap in the cloud, counted from memory for a local Relay. */
export function useRecap(src: RecapSource, open: boolean): { rows: HourRow[] | null; error: boolean } {
  const { cloud, key, room, events } = src;
  const [state, setState] = useState<{ id: string; rows: HourRow[] | null; error: boolean } | null>(null);
  const id = room ? `v:${room}` : key ? `k:${key}` : "";
  const local = useMemo(() => (cloud || !open ? null : aggregateHourly(events)), [cloud, open, events]);

  useEffect(() => {
    const sb = supabase;
    if (!cloud || !open || !id || !sb) return;
    let live = true;
    const load = async () => {
      const since = new Date(startOfLocalDay(Date.now(), WEEK_DAYS + 1)).toISOString();
      const { data, error } = room
        ? await sb.rpc("relay_recap_room", { p_room: room, p_since: since })
        : await sb.rpc("relay_recap", { p_key: key, p_since: since });
      if (live) setState({ id, rows: error ? null : ((data as HourRow[]) ?? []), error: !!error });
    };
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [cloud, open, id, key, room]);

  if (!cloud) return { rows: local, error: false };
  return state?.id === id ? { rows: state.rows, error: state.error } : { rows: null, error: false };
}
