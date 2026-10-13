"use client";

import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from "react";
import { Attention, stopText } from "./attention";
import { chime, unlockChime } from "./chime";
import { LiveSession } from "./liveModel";

const PREFS_KEY = "relay.alerts";
const ACK_KEY = "relay.ack";
const BASE_TITLE = "Relay — живий конвеєр агентів";

export interface AlertPrefs {
  sound: boolean;
  desktop: boolean;
}

type Acks = Record<string, number>;

const DEFAULT_PREFS: AlertPrefs = { sound: false, desktop: false };
const listeners = new Set<() => void>();
let prefs: AlertPrefs | null = null;
let acks: Acks | null = null;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}

function keep(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const emit = () => listeners.forEach((l) => l());
const prefsSnap = () => (prefs ??= load(PREFS_KEY, DEFAULT_PREFS));
const acksSnap = () => (acks ??= load<Acks>(ACK_KEY, {}));

export function setAlertPrefs(next: Partial<AlertPrefs>) {
  prefs = { ...prefsSnap(), ...next };
  keep(PREFS_KEY, prefs);
  emit();
}

function ack(session: string, seq: number) {
  const cur = acksSnap();
  if (cur[session] === seq) return;
  acks = { ...cur, [session]: seq };
  keep(ACK_KEY, acks);
  emit();
}

export function useAlertPrefs(): AlertPrefs {
  return useSyncExternalStore(subscribe, prefsSnap, () => DEFAULT_PREFS);
}

function subscribeVisible(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

function useVisible(): boolean {
  return useSyncExternalStore(subscribeVisible, () => document.visibilityState === "visible", () => true);
}

/** A question always waits on you; a finished answer only until you have looked at that chat. */
export function needsYou(s: LiveSession, acked: Acks): boolean {
  if (!s.attn) return false;
  return s.attn.kind === "ask" || s.attn.seq > (acked[s.id] ?? -1);
}

/** Tab badges, the (N) in the page title, the chime and desktop notifications for chats that wait on the user. */
export function useAlerts(
  sessions: LiveSession[],
  current: string | null,
  pushOn: boolean,
  onOpen: (session: string) => void,
): Set<string> {
  const p = useAlertPrefs();
  const acked = useSyncExternalStore(subscribe, acksSnap, () => ({}) as Acks);
  const visible = useVisible();
  const cur = sessions.find((s) => s.id === current);
  const curSeq = cur?.attn?.seq;

  useEffect(() => {
    if (visible && current && curSeq != null) ack(current, curSeq);
  }, [visible, current, curSeq]);

  useEffect(() => {
    if (!p.sound) return;
    window.addEventListener("pointerdown", unlockChime);
    window.addEventListener("keydown", unlockChime);
    return () => {
      window.removeEventListener("pointerdown", unlockChime);
      window.removeEventListener("keydown", unlockChime);
    };
  }, [p.sound]);

  const waiting = new Set(sessions.filter((s) => needsYou(s, acked)).map((s) => s.id));
  const count = waiting.size;

  useEffect(() => {
    document.title = count ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
  }, [count]);
  useEffect(() => () => void (document.title = BASE_TITLE), []);

  const seen = useRef<Set<number> | null>(null);
  const mountedAt = useRef(0);
  useEffect(() => {
    if (!mountedAt.current) mountedAt.current = Date.now();
  }, []);

  const fire = useEffectEvent((s: LiveSession, a: Attention, looking: boolean) => {
    if (p.sound) chime(a.kind);
    if (!p.desktop || pushOn || looking || !("Notification" in window) || Notification.permission !== "granted") return;
    const title = a.kind === "ask" ? "Claude чекає на тебе" : a.err ? `Claude ${stopText(a.err)}` : "Claude відповів";
    const n = new Notification(title, {
      body: `${s.label} · ${a.text}`,
      tag: `relay-${s.id}`,
      icon: "/icon-192.png",
    });
    n.onclick = () => {
      window.focus();
      onOpen(s.id);
      n.close();
    };
  });

  useEffect(() => {
    if (!sessions.length || !mountedAt.current) return;
    const fresh = !seen.current;
    seen.current ??= new Set();
    for (const s of sessions) {
      const a = s.attn;
      if (!a || seen.current.has(a.seq)) continue;
      seen.current.add(a.seq);
      if (fresh && a.at < mountedAt.current) continue;
      const looking = visible && s.id === current;
      if (looking && a.kind === "done") continue;
      fire(s, a, looking);
    }
  }, [sessions, current, visible]);

  return waiting;
}
