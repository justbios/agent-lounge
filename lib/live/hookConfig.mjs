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
export const USAGE_MARK = "#relay-usage";
export const LIMITS_MARK = "#relay-limits";

/** What each hook adds after the event's JSON: the project's agents, the chat's name, tokens spent, the last usage limits. */
const FLAGS = {
  SessionStart: "roster title",
  UserPromptSubmit: "roster title limits",
  Stop: "title usage limits",
  SubagentStop: "title usage",
  SessionEnd: "title usage",
  Notification: "title",
};

/** Where the connect phrase, the local installer and /relay:connect keep the hook script (plugin/scripts/relay.sh). */
export const RELAY_SH = "$HOME/.config/relay/relay.sh";

/** Fire-and-forget: async, silent, always exit 0 — a stopped Relay or a missing script never slows or blocks Claude. */
export function hookCommand(url, event) {
  return `sh "${RELAY_SH}" --url '${url}'${FLAGS[event] ? ` ${FLAGS[event]}` : ""} 2>/dev/null || true`;
}

function entry(url, event) {
  const timeout = FLAGS[event]?.includes("usage") ? 15 : 5;
  return { type: "command", command: hookCommand(url, event), async: true, timeout };
}

export function hookEntry(event) {
  return entry(HOOK_URL, event);
}

/** Claude Code hands its status line the subscription's 5-hour and weekly windows; the script saves them for the hooks. */
export const STATUS_LINE = { type: "command", command: `sh "${RELAY_SH}" statusline` };

/** An existing status line keeps its own output; the limits are saved on the side. */
export function statusChain(old) {
  return `j=$(cat); printf '%s' "$j" | sh "${RELAY_SH}" limits; printf '%s' "$j" | ( ${old} )`;
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

/** The roster, the chat's name, tokens and limits ride along after marker lines, so the hosted site can seat idle agents and name chats. */
export function cloudHookSettings(url) {
  return { hooks: Object.fromEntries(CLOUD_EVENTS.map((e) => [e, [{ hooks: [entry(url, e)] }]])) };
}

/** The plugin route: the same hooks from a Claude Code plugin, with the café link kept in ~/.config/relay instead of settings.json. */
export function pluginSteps(market, link) {
  return `/plugin marketplace add ${market}\n/plugin install relay@relay\n/relay:connect ${link}`;
}
