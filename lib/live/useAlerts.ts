"use client";

import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from "react";
import { Ui, tr, uiNow, useUi } from "@/lib/i18n";
import { Attention, attentionText, stopText } from "./attention";
import { chime, unlockChime } from "./chime";
import { LiveSession } from "./liveModel";

const PREFS_KEY = "relay.alerts";
/** A question nobody answered rings again after this long, and once more after twice as long. */
const NUDGE_MS = 3 * 60_000;
const NUDGES = 2;
const ACK_KEY = "relay.ack";
const baseTitle = (ui: Ui) =>
  tr(ui, "Agent Lounge — живий конвеєр агентів", "Agent Lounge — your Claude Code agents, live");

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

/**
 * A notification the open page shows itself, for what no push brings: through the service worker when push has one
 * (a phone's browser shows them no other way), else on its own; nothing without permission.
 */
export function pageNotify(title: string, body: string, tag: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { body, tag, icon: "/icon-192.png" };
  const own = () => {
    const n = new Notification(title, opts);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  };
  const sw = navigator.serviceWorker;
  if (!sw) return own();
  void sw
    .getRegistration("/")
    .then((reg) => (reg ? reg.showNotification(title, opts) : own()))
    .catch(() => {});
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
  const ui = useUi();
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
    document.title = count ? `(${count}) ${baseTitle(ui)}` : baseTitle(ui);
  }, [count, ui]);
  useEffect(() => () => void (document.title = baseTitle(uiNow())), []);

  const seen = useRef<Set<number> | null>(null);
  const mountedAt = useRef(0);
  useEffect(() => {
    if (!mountedAt.current) mountedAt.current = Date.now();
  }, []);

  const fire = useEffectEvent((s: LiveSession, a: Attention, looking: boolean) => {
    if (p.sound) chime(a.kind === "done" && a.err ? "err" : a.kind);
    if (!p.desktop || pushOn || looking || !("Notification" in window) || Notification.permission !== "granted") return;
    const u = uiNow();
    const title =
      a.kind === "ask"
        ? tr(u, "Claude чекає на тебе", "Claude is waiting for you")
        : a.err
          ? `Claude ${stopText(a.err, u)}`
          : tr(u, "Claude відповів", "Claude answered");
    const n = new Notification(title, {
      body: `${s.label} · ${attentionText(a, u)}`,
      tag: `relay-${s.id}`,
      icon: "/icon-192.png",
    });
    n.onclick = () => {
      window.focus();
      onOpen(s.id);
      n.close();
    };
  });

  // a question still waiting rings again, a couple of times, then leaves it to the yellow plate
  const nudged = useRef(new Map<number, number>());
  const nudge = useEffectEvent(() => {
    const t = Date.now();
    for (const s of sessions) {
      const a = s.attn;
      if (a?.kind !== "ask" || a.at < mountedAt.current) continue;
      const n = nudged.current.get(a.seq) ?? 0;
      if (n >= NUDGES || t - a.at < NUDGE_MS * (n + 1) || t - a.at > NUDGE_MS * (NUDGES + 1)) continue;
      nudged.current.set(a.seq, n + 1);
      chime("ask");
      return;
    }
  });
  useEffect(() => {
    if (!p.sound) return;
    const id = setInterval(nudge, 15_000);
    return () => clearInterval(id);
  }, [p.sound]);

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
