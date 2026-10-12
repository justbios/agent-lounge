export const LIVE_PORT = 3737;

export const HOOK_EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "Notification",
  "SessionEnd",
];

export const HOOK_URL = `http://127.0.0.1:${LIVE_PORT}/api/claude-hook`;

/** Fire-and-forget: async, silent, always exit 0 — a stopped Relay never slows or blocks Claude. */
export const HOOK_COMMAND = `curl -s -m 2 -o /dev/null -H 'content-type: application/json' --data-binary @- ${HOOK_URL} || true`;

export const HOOK_ENTRY = { type: "command", command: HOOK_COMMAND, async: true, timeout: 5 };

/** Any hook that posts to a Relay, whatever port or flags an older install used. */
export function isRelayHook(h) {
  return typeof h?.command === "string" && h.command.includes("/api/claude-hook");
}

export function hookSettings() {
  return { hooks: Object.fromEntries(HOOK_EVENTS.map((e) => [e, [{ hooks: [HOOK_ENTRY] }]])) };
}
