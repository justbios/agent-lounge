"use client";

import { useEffect, useSyncExternalStore } from "react";
import { LiveSession, hash } from "./liveModel";
import { LiveEvent } from "./types";
import { tokensOf } from "./usage";

/** Gone at least this long, and the café says what happened meanwhile. */
export const AWAY_MS = 20 * 60_000;
const BEAT_MS = 60_000;
const KEY = "relay.seen.";

export interface Away {
  since: number;
  prompts: number;
  answers: number;
  dispatches: number;
  tools: number;
  fails: number;
  tokens: number;
  /** the agents handed most work, most first */
  agents: [string, number][];
  /** questions per teammate, when more than one of them asked */
  people: [string, number][];
  /** chats whose turn it is now, waiting since the user left */
  waiting: LiveSession[];
  /** the feed begins after the user left, so this is only what it still holds */
  partial: boolean;
}

const top = (c: Map<string, number>, n: number) => [...c].sort((a, b) => b[1] - a[1]).slice(0, n);

/** What the café did between `since` and now, from the events it holds; `me` keeps a teammate's waiting chats out. */
export function awaySummary(events: LiveEvent[], sessions: LiveSession[], since: number, me: string | null): Away {
  const a: Away = {
    since,
    prompts: 0,
    answers: 0,
    dispatches: 0,
    tools: 0,
    fails: 0,
    tokens: 0,
    agents: [],
    people: [],
    waiting: [],
    partial: !!events.length && events[0].at > since,
  };
  const agents = new Map<string, number>();
  const people = new Map<string, number>();
  for (const e of events) {
    if (e.at <= since) continue;
    a.tokens += tokensOf(e.usage);
    if (e.kind === "prompt" && e.tool === "питання") {
      a.prompts += 1;
      if (e.member) people.set(e.member, (people.get(e.member) ?? 0) + 1);
    } else if (e.kind === "stop" && !e.err) a.answers += 1;
    else if (e.kind === "dispatch") {
      a.dispatches += 1;
      agents.set(e.target ?? "агент", (agents.get(e.target ?? "агент") ?? 0) + 1);
    } else if (e.kind === "tool") a.tools += 1;
    else if (e.kind === "fail") a.fails += 1;
  }
  a.agents = top(agents, 3);
  a.people = people.size > 1 ? top(people, 5) : [];
  a.waiting = sessions.filter((s) => !s.ended && s.attn && s.attn.at > since && (!me || !s.member || s.member === me));
  return a;
}

export const awayEmpty = (a: Away) => !a.prompts && !a.answers && !a.dispatches && !a.tools && !a.waiting.length;

const listeners = new Set<() => void>();
let since: number | null = null;
let room: string | null = null;

const notify = () => listeners.forEach((l) => l());

function read(id: string): number | null {
  try {
    const v = Number(localStorage.getItem(KEY + id));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function write(id: string) {
  try {
    localStorage.setItem(KEY + id, String(Date.now()));
  } catch {}
}

function arrive(id: string) {
  const last = read(id);
  if (last && Date.now() - last >= AWAY_MS) {
    since = last;
    notify();
  }
  write(id);
}

export function dismissAway() {
  since = null;
  notify();
}

/**
 * When this browser last had the café on screen, kept per café; on coming back after {@link AWAY_MS} or more it
 * hands out the moment the user left. Another tab left open on the same café counts as being there.
 */
export function useAway(id: string | null): number | null {
  useEffect(() => {
    if (!id) return;
    const key = hash(id).toString(36);
    if (room !== key) {
      room = key;
      since = null;
      notify();
    }
    arrive(key);
    const beat = setInterval(() => document.visibilityState === "visible" && write(key), BEAT_MS);
    const seen = () => (document.visibilityState === "visible" ? arrive(key) : write(key));
    const leave = () => write(key);
    document.addEventListener("visibilitychange", seen);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(beat);
      document.removeEventListener("visibilitychange", seen);
      window.removeEventListener("pagehide", leave);
      write(key);
    };
  }, [id]);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => since,
    () => null,
  );
}
