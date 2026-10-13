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

export const ROSTER_MARK = "#relay-agents";
export const TITLE_MARK = "#relay-title";
const ROSTER_EVENTS = new Set(["SessionStart", "UserPromptSubmit"]);
/** Events that also carry the chat's name, so a renamed chat shows its new name by the next prompt or answer. */
const TITLE_EVENTS = new Set(["SessionStart", "UserPromptSubmit", "Stop", "Notification"]);

/** Claude Code re-writes the chat's name into its transcript every turn; the last megabyte always holds the latest. */
const TITLE_SH = String.raw`tail -c 1048576 "$(printf '%s' "$j" | grep -oE '"transcript_path":"[^"]*"' | head -n 1 | cut -d'"' -f4)" 2>/dev/null | grep -oE '"customTitle":"([^"\\]|\\.)*"' | tail -n 1`;

/** Fire-and-forget: async, silent, always exit 0 — a stopped Relay never slows or blocks Claude. */
export function hookCommand(url, event, seconds = 3) {
  const roster = ROSTER_EVENTS.has(event);
  const title = TITLE_EVENTS.has(event);
  const curl = (type) => `curl -s -m ${seconds} -o /dev/null -H 'content-type: ${type}' --data-binary @- '${url}' || true`;
  if (!roster && !title) return curl("application/json");
  const parts = [`printf '%s' "$j"`];
  if (roster) parts.push(`printf '\\n${ROSTER_MARK}\\n'`, `ls "$CLAUDE_PROJECT_DIR/.claude/agents" 2>/dev/null`);
  if (title) parts.push(`printf '\\n${TITLE_MARK}\\n'`, TITLE_SH);
  return `j=$(cat); { ${parts.join("; ")}; } | ${curl("text/plain")}`;
}

export const HOOK_COMMAND = hookCommand(HOOK_URL, "PreToolUse", 2);

export function hookEntry(event) {
  return { type: "command", command: hookCommand(HOOK_URL, event, 2), async: true, timeout: 5 };
}

/** Any hook that posts to a Relay, whatever port or flags an older install used. */
export function isRelayHook(h) {
  return typeof h?.command === "string" && h.command.includes("/api/claude-hook");
}

export function hookSettings() {
  return { hooks: Object.fromEntries(HOOK_EVENTS.map((e) => [e, [{ hooks: [hookEntry(e)] }]])) };
}

/** Cloud mode also wants SessionStart, so a fresh chat shows its team before the first prompt. */
export const CLOUD_EVENTS = [...HOOK_EVENTS, "SessionStart"];

/** In a team café each teammate's hooks carry their name, so the page can tell whose Claude is whose. */
export function cloudHookUrl(site, key, member) {
  return member ? `${site}/api/claude-hook?k=${key}&m=${encodeURIComponent(member)}` : `${site}/api/claude-hook?k=${key}`;
}

/** The roster and the chat's name ride along after marker lines, so the hosted site can seat idle agents and name chats. */
export function cloudHookSettings(url) {
  const entry = (e) => [{ hooks: [{ type: "command", command: hookCommand(url, e), async: true, timeout: 5 }] }];
  return { hooks: Object.fromEntries(CLOUD_EVENTS.map((e) => [e, entry(e)])) };
}

/** The plugin route: the same hooks from a Claude Code plugin, with the café link kept in ~/.config/relay instead of settings.json. */
export function pluginSteps(market, link) {
  return `/plugin marketplace add ${market}\n/plugin install relay@relay\n/relay:connect ${link}`;
}
