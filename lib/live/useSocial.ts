"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { BUS_EVENTS, Bus } from "./bus";
import { roomOf } from "./relayKey";
import { Guest, Reaction, addReaction, barOf, cleanReaction, guestsOf } from "./social";

const GAP_MS = 350;
const NONE: Guest[] = [];

const newId = () => crypto.randomUUID();
const newBus = () => new Bus();

export interface Social {
  guests: Guest[];
  /** everyone at the bar, this tab included */
  bar: Guest[];
  reactions: Reaction[];
  react: (scene: string, agent: string, emoji: string) => void;
  /** reactions and games travel here */
  bus: Bus;
  /** this tab's presence key, so games can address one player */
  self: string;
  name: string;
  /** the room's channel name once it is live; a two-player game opens its own channel next to it */
  room: string | null;
}

/**
 * Who else has this café open, the reactions people toss at agents, and the games' moves. All of it rides a Realtime
 * channel of its own (presence and broadcast), apart from the hook events, and nothing is stored there.
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
  const [self] = useState(newId);
  const [bus] = useState(newBus);
  const [seen, setSeen] = useState<{ id: string | null; guests: Guest[] }>({ id: null, guests: [] });
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [link, setLink] = useState<{ id: string | null; room: string | null }>({ id: null, room: null });
  const sent = useRef(0);

  useEffect(
    () =>
      bus.on("react", (p) => {
        const now = Date.now();
        const x = cleanReaction(p, now);
        if (x) setReactions((list) => addReaction(list, x, now));
      }),
    [bus],
  );

  useEffect(() => {
    const sb = supabase;
    if (!enabled || !id || !sb) return;
    let live = true;
    let ch: RealtimeChannel | null = null;
    (room ? Promise.resolve(room) : roomOf(key!)).then((r) => {
      if (!live) return;
      const c = sb.channel(`relay-social:${r}`, { config: { presence: { key: self }, broadcast: { self: false } } });
      ch = c;
      for (const ev of BUS_EVENTS) c.on("broadcast", { event: ev }, ({ payload }) => live && bus.emit(ev, payload));
      c.on("presence", { event: "sync" }, () => live && setSeen({ id, guests: guestsOf(c.presenceState(), self) })).subscribe(
        (status) => {
          if (status !== "SUBSCRIBED") return;
          c.track({ name, viewer });
          bus.attach(c);
          setLink({ id, room: r });
        },
      );
    });
    return () => {
      live = false;
      bus.attach(null);
      if (ch) sb.removeChannel(ch);
    };
  }, [enabled, id, key, room, name, viewer, self, bus]);

  const react = (scene: string, agent: string, emoji: string) => {
    const now = Date.now();
    if (now - sent.current < GAP_MS) return;
    sent.current = now;
    bus.send("react", { id: newId().slice(0, 13), scene, agent, emoji, from: name });
  };

  const on = enabled && !!id;
  const guests = on && seen.id === id ? seen.guests : NONE;
  const bar = useMemo(() => (on ? barOf(guests, { id: self, name, viewer }) : NONE), [on, guests, self, name, viewer]);
  return {
    guests,
    bar,
    reactions,
    react,
    bus,
    self,
    name,
    room: on && link.id === id ? link.room : null,
  };
}
