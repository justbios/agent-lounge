"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { BUS_EVENTS, Bus } from "./bus";
import { useAccess } from "./access";
import {
  Disc,
  Guest,
  Reaction,
  addReaction,
  barOf,
  cleanDisc,
  cleanReaction,
  discOf,
  guestsOf,
  newerDisc,
} from "./social";
import { TrackId } from "./tracks";

const GAP_MS = 350;
const NONE: Guest[] = [];

const newId = () => crypto.randomUUID();
const newBus = () => new Bus();

type Heard = { id: string | null; disc: Disc | null };
const take = (id: string | null, d: Disc) => (cur: Heard) =>
  cur.id === id && !newerDisc(d, cur.disc) ? cur : { id, disc: d };

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
  /** the record on the café's jukebox, once someone has put one on */
  disc: Disc | null;
  /** puts a record on for everyone in the café */
  spin: (track: TrackId) => void;
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
  const access = useAccess(enabled && !room ? key : null);
  const topic = room ?? access?.topic ?? null;
  const [self] = useState(newId);
  const [bus] = useState(newBus);
  const [seen, setSeen] = useState<{ id: string | null; guests: Guest[] }>({ id: null, guests: [] });
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [link, setLink] = useState<{ id: string | null; room: string | null }>({ id: null, room: null });
  const [heard, setHeard] = useState<Heard>({ id: null, disc: null });
  const sent = useRef(0);
  const chan = useRef<RealtimeChannel | null>(null);
  const meta = useRef<Record<string, unknown>>({ name, viewer });

  useEffect(
    () =>
      bus.on("react", (p) => {
        const now = Date.now();
        const x = cleanReaction(p, now);
        if (x) setReactions((list) => addReaction(list, x, now));
      }),
    [bus],
  );

  useEffect(
    () =>
      bus.on("juke", (p) => {
        const d = cleanDisc(p, Date.now());
        if (d) setHeard(take(id, d));
      }),
    [bus, id],
  );

  useEffect(() => {
    const sb = supabase;
    if (!enabled || !id || !topic || !sb) return;
    let live = true;
    const c = sb.channel(`relay-social:${topic}`, { config: { presence: { key: self }, broadcast: { self: false } } });
    for (const ev of BUS_EVENTS) c.on("broadcast", { event: ev }, ({ payload }) => live && bus.emit(ev, payload));
    c.on("presence", { event: "sync" }, () => {
      if (!live) return;
      setSeen({ id, guests: guestsOf(c.presenceState(), self) });
      const d = discOf(c.presenceState(), Date.now());
      if (d) setHeard(take(id, d));
    }).subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      chan.current = c;
      void c.track(meta.current);
      bus.attach(c);
      setLink({ id, room: topic });
    });
    return () => {
      live = false;
      bus.attach(null);
      chan.current = null;
      sb.removeChannel(c);
    };
  }, [enabled, id, topic, self, bus]);

  const react = (scene: string, agent: string, emoji: string) => {
    const now = Date.now();
    if (now - sent.current < GAP_MS) return;
    sent.current = now;
    bus.send("react", { id: newId().slice(0, 13), scene, agent, emoji, from: name });
  };

  const on = enabled && !!id;
  const disc = heard.id === id ? heard.disc : null;
  const linked = on && link.id === id ? link.room : null;

  useEffect(() => {
    meta.current = disc ? { name, viewer, disc } : { name, viewer };
    if (linked) void chan.current?.track(meta.current);
  }, [linked, name, viewer, disc]);

  const spin = useCallback((track: TrackId) => bus.send("juke", { track, by: name, at: Date.now() }), [bus, name]);

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
    room: linked,
    disc,
    spin,
  };
}
