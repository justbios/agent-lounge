import { LIVE_PORT } from "./types";

export const HOOK_EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "Notification",
  "SessionEnd",
] as const;

export const HOOK_URL = `http://127.0.0.1:${LIVE_PORT}/api/claude-hook`;

/** Fire-and-forget: async, silent, always exit 0 — a stopped Relay never slows or blocks Claude. */
export const HOOK_COMMAND = `curl -s -m 2 -o /dev/null -H 'content-type: application/json' --data-binary @- ${HOOK_URL} || true`;

export function hookSettings() {
  const entry = [{ hooks: [{ type: "command", command: HOOK_COMMAND, async: true, timeout: 5 }] }];
  return { hooks: Object.fromEntries(HOOK_EVENTS.map((e) => [e, entry])) };
}
