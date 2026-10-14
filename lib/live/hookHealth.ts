import { useSyncExternalStore } from "react";
import { HOOK_VERSION } from "./hookConfig.mjs";
import { LiveEvent } from "./types";

const CHECK_SESSION = "relay-check";
const HIDE_KEY = "relay.staleHidden";

/**
 * This person's newest prompt or answer came from hooks older than the current relay.sh: no limits, fewer names.
 * Only their own events count: a teammate's old hooks are not news to them, and until the page knows who they are,
 * only unnamed events, the ones a single person's setup sends, do.
 */
export function staleHooks(events: LiveEvent[], me: string | null): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if ((e.kind !== "prompt" && e.kind !== "stop") || e.agent || e.session === CHECK_SESSION) continue;
    if (e.member && e.member !== me) continue;
    return e.via !== "http" && (e.hv ?? 0) < HOOK_VERSION;
  }
  return false;
}

export interface HooksSeen {
  last: number | null;
  checked: boolean;
  http: boolean;
}

/** What this person's own hooks have sent: the newest real event, whether the connect check came, and how. */
export function hooksSeen(events: LiveEvent[], me: string | null): HooksSeen {
  let checked = false;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.member && e.member !== me) continue;
    if (e.session === CHECK_SESSION) checked = true;
    else return { last: e.at, checked, http: e.via === "http" };
  }
  return { last: null, checked, http: false };
}

const listeners = new Set<() => void>();
let hidden: boolean | null = null;

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === String(HOOK_VERSION);
  } catch {
    return false;
  }
}

/** The viewer closed the old-hooks notice for this hook version. */
export function useStaleHidden(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (hidden ??= readHidden()),
    () => true,
  );
}

export function hideStale() {
  hidden = true;
  try {
    localStorage.setItem(HIDE_KEY, String(HOOK_VERSION));
  } catch {}
  listeners.forEach((l) => l());
}
