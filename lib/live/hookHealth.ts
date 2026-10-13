import { HOOK_VERSION } from "./hookConfig.mjs";
import { LiveEvent } from "./types";

const CHECK_SESSION = "relay-check";

/** This person's newest prompt or answer came from hooks older than the current relay.sh: no limits, fewer names. */
export function staleHooks(events: LiveEvent[], me: string | null): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if ((e.kind !== "prompt" && e.kind !== "stop") || e.agent || e.session === CHECK_SESSION) continue;
    if (me && e.member && e.member !== me) continue;
    return (e.hv ?? 0) < HOOK_VERSION;
  }
  return false;
}
