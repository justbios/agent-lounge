"use client";

import { useEffect, useRef, useState } from "react";
import { Ui, tr, useUi } from "@/lib/i18n";
import { localDay } from "./achievements";
import { BEAN_RULES } from "./interior";
import { LiveEvent } from "./types";

export const GAIN_MS = 2600;
const HOUR = 3600_000;

export interface Gain {
  id: number;
  n: number;
  why: string;
}

const asked = (e: LiveEvent) => e.kind === "prompt" && e.tool === "питання";

/**
 * What the events that came in since the last look earn, by the rules the beans are counted with, grouped by reason.
 * `carry` keeps the tokens short of the next bean between calls.
 */
export function gainsOf(all: LiveEvent[], fresh: LiveEvent[], carry: { out: number }, ui: Ui): [string, number][] {
  const r = BEAN_RULES;
  const sum = new Map<string, number>();
  const add = (why: string, n: number) => sum.set(why, (sum.get(why) ?? 0) + n);
  for (const e of fresh) {
    if (e.kind === "dispatch") {
      add(tr(ui, "доручення агенту", "handoff to an agent"), r.dispatch);
      const hour = Math.floor(e.at / HOUR);
      const crew = new Set<string>();
      for (const x of all) {
        if (x.seq >= e.seq) break;
        if (x.kind === "dispatch" && Math.floor(x.at / HOUR) === hour) crew.add(x.target ?? "agent");
      }
      const joins = !crew.has(e.target ?? "agent") && crew.size + 1 === r.crowd;
      if (joins) add(tr(ui, `${r.crowd} агенти за годину`, `${r.crowd} agents in an hour`), r.crowdedHour);
    }
    if (asked(e)) {
      const day = localDay(e.at);
      const first = !all.some((x) => x.seq < e.seq && asked(x) && localDay(x.at) === day);
      if (first) add(tr(ui, "перше питання дня", "first question of the day"), r.firstOfDay);
    }
    if (e.usage?.out) {
      carry.out += e.usage.out;
      const n = Math.floor(carry.out / r.outPerBean);
      if (n > 0) {
        carry.out -= n * r.outPerBean;
        const k = (n * r.outPerBean) / 1000;
        add(tr(ui, `${k} тис. токенів`, `${k}k tokens`), n);
      }
    }
  }
  return [...sum];
}

/**
 * Floats what each new event earns over the bean sack, so a café learns what pays. What the feed held when it first
 * came in earns nothing here, only what arrives while it is watched; `member` narrows it to one teammate's own room.
 */
export function useBeanGains(events: LiveEvent[], member: string | null, on: boolean): Gain[] {
  const ui = useUi();
  const [list, setList] = useState<Gain[]>([]);
  const last = useRef<number | null>(null);
  const carry = useRef({ out: 0 });
  const next = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const top = events.at(-1)?.seq ?? 0;
    const from = last.current;
    last.current = Math.max(from ?? 0, top);
    if (!from || !on || top <= from) return;
    const own = member == null ? events : events.filter((e) => e.member === member);
    const fresh = own.filter((e) => e.seq > from);
    const got = gainsOf(own, fresh, carry.current, ui).map(([why, n]) => ({ id: (next.current += 1), n, why }));
    if (!got.length) return;
    const ids = new Set(got.map((g) => g.id));
    timers.current = [
      ...timers.current.slice(-8),
      setTimeout(() => setList((l) => [...l, ...got].slice(-4)), 0),
      setTimeout(() => setList((l) => l.filter((g) => !ids.has(g.id))), GAIN_MS),
    ];
  }, [events, member, on, ui]);

  return on ? list : [];
}
