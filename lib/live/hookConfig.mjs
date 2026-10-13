export const LIVE_PORT = 3737;

export const ROOM_KEY = /^[A-Za-z0-9_-]{20,128}$/;

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

/** Cloud mode also wants SessionStart, so a fresh chat shows its team before the first prompt. */
export const CLOUD_EVENTS = [...HOOK_EVENTS, "SessionStart"];
export const ROSTER_MARK = "#relay-agents";
const ROSTER_EVENTS = new Set(["SessionStart", "UserPromptSubmit"]);

/** In a team café each teammate's hooks carry their name, so the page can tell whose Claude is whose. */
export function cloudHookUrl(site, key, member) {
  return member ? `${site}/api/claude-hook?k=${key}&m=${encodeURIComponent(member)}` : `${site}/api/claude-hook?k=${key}`;
}

/** The roster rides along as file names after a marker line, so the hosted site can seat idle agents too. */
export function cloudHookCommand(url, withRoster = false) {
  if (!withRoster) return `curl -s -m 3 -o /dev/null -H 'content-type: application/json' --data-binary @- '${url}' || true`;
  return `{ cat; printf '\\n${ROSTER_MARK}\\n'; ls "$CLAUDE_PROJECT_DIR/.claude/agents" 2>/dev/null; } | curl -s -m 3 -o /dev/null -H 'content-type: text/plain' --data-binary @- '${url}' || true`;
}

export function cloudHookSettings(url) {
  const entry = (e) => [{ hooks: [{ type: "command", command: cloudHookCommand(url, ROSTER_EVENTS.has(e)), async: true, timeout: 5 }] }];
  return { hooks: Object.fromEntries(CLOUD_EVENTS.map((e) => [e, entry(e)])) };
}

/** The plugin route: the same hooks from a Claude Code plugin, with the café link kept in ~/.config/relay instead of settings.json. */
export function pluginSteps(market, link) {
  return `/plugin marketplace add ${market}\n/plugin install relay@relay\n/relay:connect ${link}`;
}
