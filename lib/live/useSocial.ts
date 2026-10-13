"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { roomOf } from "./relayKey";
import { Guest, Reaction, addReaction, cleanReaction, guestsOf } from "./social";

const GAP_MS = 350;
const NONE: Guest[] = [];

export interface Social {
  guests: Guest[];
  reactions: Reaction[];
  react: (scene: string, agent: string, emoji: string) => void;
}

/**
 * Who else has this café open, and the reactions people toss at agents. Both ride a Realtime channel of their own
 * (presence and broadcast), apart from the hook events, and nothing is stored. A local Relay keeps reactions on screen.
 */
export function useSocial({
  key,
  room,
  name,
  viewer,
  enabled,
}: {
  key: string | null;
  room: string | null;
  name: string;
  viewer: boolean;
  enabled: boolean;
}): Social {
  const id = room ? `v:${room}` : key ? `k:${key}` : null;
  const [seen, setSeen] = useState<{ id: string | null; guests: Guest[] }>({ id: null, guests: [] });
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const channel = useRef<RealtimeChannel | null>(null);
  const sent = useRef(0);

  useEffect(() => {
    const sb = supabase;
    if (!enabled || !id || !sb) return;
    let live = true;
    let ch: RealtimeChannel | null = null;
    const self = crypto.randomUUID();
    (room ? Promise.resolve(room) : roomOf(key!)).then((r) => {
      if (!live) return;
      const c = sb.channel(`relay-social:${r}`, { config: { presence: { key: self }, broadcast: { self: false } } });
      ch = c;
      c.on("presence", { event: "sync" }, () => live && setSeen({ id, guests: guestsOf(c.presenceState(), self) }))
        .on("broadcast", { event: "react" }, ({ payload }) => {
          const now = Date.now();
          const x = cleanReaction(payload, now);
          if (x && live) setReactions((list) => addReaction(list, x, now));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") c.track({ name, viewer });
        });
      channel.current = c;
    });
    return () => {
      live = false;
      channel.current = null;
      if (ch) sb.removeChannel(ch);
    };
  }, [enabled, id, key, room, name, viewer]);

  const react = (scene: string, agent: string, emoji: string) => {
    const now = Date.now();
    if (now - sent.current < GAP_MS) return;
    sent.current = now;
    const r: Reaction = { id: crypto.randomUUID().slice(0, 13), scene, agent, emoji, from: name, at: now };
    setReactions((list) => addReaction(list, r, now));
    channel.current?.send({ type: "broadcast", event: "react", payload: { id: r.id, scene, agent, emoji, from: name } });
  };

  return { guests: enabled && seen.id === id ? seen.guests : NONE, reactions, react };
}
