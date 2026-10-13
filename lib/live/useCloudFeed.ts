"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { roomOf } from "./relayKey";
import { LiveEvent } from "./types";
import { FeedStatus, LiveFeed } from "./useLiveFeed";

const MAX_EVENTS = 6000;

interface State {
  id: string | null;
  status: FeedStatus;
  events: LiveEvent[];
}

/** Where a cloud feed reads from: the owner's key, or a room hash from a read-only view link. */
export interface CloudSource {
  key: string | null;
  room: string | null;
}

/** The hosted café: a snapshot of the room, then every new event over Supabase Realtime. */
export function useCloudFeed(src: CloudSource, enabled: boolean): LiveFeed {
  const [state, setState] = useState<State>({ id: null, status: "connecting", events: [] });
  const { key, room: viewRoom } = src;
  const id = viewRoom ? `v:${viewRoom}` : key ? `k:${key}` : null;

  useEffect(() => {
    const sb = supabase;
    if (!enabled || !id || !sb) return;
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
      if (live) setState({ id, status: "open", events });
    };
    const mark = (status: FeedStatus) => live && setState((s) => ({ ...s, id, status }));
    const snapshot = () =>
      viewRoom ? sb.rpc("relay_snapshot_room", { p_room: viewRoom }) : sb.rpc("relay_snapshot", { p_key: key });

    (viewRoom ? Promise.resolve(viewRoom) : roomOf(key!)).then((room) => {
      if (!live) return;
      channel = sb
        .channel(`relay:${room}`)
        .on("broadcast", { event: "ev" }, ({ payload }) => merge([payload as LiveEvent]))
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            const { data, error } = await snapshot();
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
  }, [id, key, viewRoom, enabled]);

  if (!enabled || !id || !supabase) return { status: "offline", events: [] };
  return state.id === id ? { status: state.status, events: state.events } : { status: "connecting", events: [] };
}
