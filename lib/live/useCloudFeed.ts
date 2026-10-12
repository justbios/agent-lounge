"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { roomOf } from "./relayKey";
import { LiveEvent } from "./types";
import { FeedStatus, LiveFeed } from "./useLiveFeed";

const MAX_EVENTS = 6000;

interface State {
  key: string | null;
  status: FeedStatus;
  events: LiveEvent[];
}

/** The hosted café: a snapshot of the room from relay_snapshot, then every new event over Supabase Realtime. */
export function useCloudFeed(key: string | null, enabled: boolean): LiveFeed {
  const [state, setState] = useState<State>({ key: null, status: "connecting", events: [] });

  useEffect(() => {
    const sb = supabase;
    if (!enabled || !key || !sb) return;
    let live = true;
    let channel: RealtimeChannel | null = null;
    let byseq = new Map<number, LiveEvent>();

    const merge = (list: LiveEvent[]) => {
      for (const e of list) if (e && typeof e.seq === "number") byseq.set(e.seq, e);
      let events = [...byseq.values()].sort((a, b) => a.seq - b.seq);
      if (events.length > MAX_EVENTS) {
        events = events.slice(-MAX_EVENTS);
        byseq = new Map(events.map((e) => [e.seq, e]));
      }
      if (live) setState({ key, status: "open", events });
    };
    const mark = (status: FeedStatus) => live && setState((s) => ({ ...s, key, status }));

    roomOf(key).then((room) => {
      if (!live) return;
      channel = sb
        .channel(`relay:${room}`)
        .on("broadcast", { event: "ev" }, ({ payload }) => merge([payload as LiveEvent]))
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            const { data, error } = await sb.rpc("relay_snapshot", { p_key: key });
            if (error) mark("offline");
            else merge((data as { events: LiveEvent[] }).events ?? []);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            mark("connecting");
          }
        });
    });

    return () => {
      live = false;
      if (channel) sb.removeChannel(channel);
    };
  }, [key, enabled]);

  if (!enabled || !key || !supabase) return { status: "offline", events: [] };
  return state.key === key ? { status: state.status, events: state.events } : { status: "connecting", events: [] };
}
