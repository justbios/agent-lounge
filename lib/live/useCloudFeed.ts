"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { refreshAccess, useAccess } from "./access";
import { thinFeed } from "./thin";
import { LiveEvent } from "./types";
import { FeedStatus, LiveFeed } from "./useLiveFeed";

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
  const access = useAccess(enabled && !viewRoom ? key : null);
  const topic = viewRoom ?? access?.topic ?? null;

  useEffect(() => {
    const sb = supabase;
    if (!enabled || !id || !topic || !sb) return;
    let live = true;
    let byseq = new Map<number, LiveEvent>();

    const merge = (list: LiveEvent[]) => {
      for (const e of list) if (e && typeof e.seq === "number") byseq.set(e.seq, e);
      const all = [...byseq.values()].sort((a, b) => a.seq - b.seq);
      const events = thinFeed(all);
      if (events.length < all.length) byseq = new Map(events.map((e) => [e.seq, e]));
      if (live) setState({ id, status: "open", events });
    };
    const mark = (status: FeedStatus) => live && setState((s) => ({ ...s, id, status }));
    const snapshot = () =>
      viewRoom ? sb.rpc("relay_snapshot_room", { p_room: viewRoom }) : sb.rpc("relay_snapshot", { p_key: key });

    const channel = sb
      .channel(`relay:${topic}`)
      .on("broadcast", { event: "ev" }, ({ payload }) => merge([payload as LiveEvent]))
      .on("broadcast", { event: "rekey" }, () => (viewRoom ? mark("offline") : refreshAccess(key!)))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data, error } = await snapshot();
          if (error) mark("offline");
          else merge((data as { events: LiveEvent[] }).events ?? []);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          mark("connecting");
        }
      });

    return () => {
      live = false;
      sb.removeChannel(channel);
    };
  }, [id, key, viewRoom, enabled, topic]);

  if (!enabled || !id || !supabase || access?.lost) return { status: "offline", events: [] };
  return state.id === id ? { status: state.status, events: state.events } : { status: "connecting", events: [] };
}
