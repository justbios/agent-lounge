export const LIVE_PORT = 3737;

export const ROOM_KEY = /^[A-Za-z0-9_-]{20,128}$/;

export const HOOK_EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "StopFailure",
  "Notification",
  "SessionEnd",
];

export const HOOK_URL = `http://127.0.0.1:${LIVE_PORT}/api/claude-hook`;

export const ROSTER_MARK = "#relay-agents";
export const TITLE_MARK = "#relay-title";
export const USAGE_MARK = "#relay-usage";
export const LIMITS_MARK = "#relay-limits";
export const VERSION_MARK = "#relay-v";
/**
 * What relay.sh sends after {@link VERSION_MARK}; an older script sends nothing, and the page asks to reconnect. 8 can
 * keep «я не за комп'ютером» on for good (`away always`), passes a denial's own words to Claude, and says when you
 * answered a prompt, so «чекає на тебе» goes away at once.
 */
export const HOOK_VERSION = 8;
/** relay.sh 6 names the answer key it checks signatures with, so the café knows which paired secret to sign with. */
export const KID_MARK = "#relay-kid";
/** relay.sh 7 sends Claude's latest check-in line, `⏱ 95m · 6/10 · …`, and when it was written (lib/live/checkin.ts). */
export const CHECKIN_MARK = "#relay-eta";

/**
 * The room key travels in this header rather than in the address, which servers and proxies write to their logs.
 * The address still works for scripts older than 6.
 */
export const KEY_HEADER = "x-relay-key";

/**
 * What each hook adds after the event's JSON: the project's agents, the chat's name, tokens spent, the last usage
 * limits, Claude's latest check-in line.
 */
const FLAGS = {
  SessionStart: "roster title",
  UserPromptSubmit: "roster title limits",
  PreToolUse: "eta",
  Stop: "title usage limits eta",
  StopFailure: "title usage limits",
  SubagentStop: "title usage",
  SessionEnd: "title usage",
  Notification: "title waits",
  PermissionRequest: "ask",
};

/**
 * Where the connect phrase, the local installer and /agent-lounge:connect keep the hook script
 * (plugin/scripts/relay.sh).
 */
export const RELAY_SH = "$HOME/.config/relay/relay.sh";

/**
 * Fire-and-forget: async, silent, always exit 0 — a stopped Agent Lounge or a missing script never slows or blocks
 * Claude. The exceptions are the permission prompt and Claude's questions and plans, which Claude waits for, and only
 * while the café is told you are away.
 */
export function hookCommand(url, event, flags = FLAGS[event]) {
  return `sh "${RELAY_SH}" --url '${url}'${flags ? ` ${flags}` : ""} 2>/dev/null || true`;
}

/** An unanswered ask gives up after 600 s; Claude would cancel the hook at its timeout anyway. */
const ASK_TIMEOUT = 630;

/** The tools whose PreToolUse waits on the café as well: Claude's multiple-choice questions and its plan. */
const ASK_TOOLS = "AskUserQuestion|ExitPlanMode";

/** The tools whose result is a good moment for a check-in: a subagent sent off, or one back with its work. */
const CHECKIN_TOOLS = "Agent|Task";

function entry(url, event) {
  if (event === "PermissionRequest") return { type: "command", command: hookCommand(url, event), timeout: ASK_TIMEOUT };
  const timeout = FLAGS[event]?.includes("usage") ? 15 : 5;
  return { type: "command", command: hookCommand(url, event), async: true, timeout };
}

/**
 * The check-in (relay.sh checkin) is the one hook Claude waits for on every pipeline: it only reads a small file on
 * this machine, and now and then hands Claude a line of context asking how long its whole job still takes.
 */
function checkinEntry(url, event) {
  return { type: "command", command: hookCommand(url, event, "checkin"), timeout: 5 };
}

/**
 * After a tool, relay.sh answered posts only when Claude had asked about that tool (a Notification left a mark on this
 * machine), and then only the names, so the café learns you answered without getting every tool's output.
 */
function answeredEntry(url, event) {
  return { type: "command", command: hookCommand(url, event, "answered"), async: true, timeout: 5 };
}

/** Every hook group Agent Lounge puts on one event, in the order they go into settings.json. */
function groupsFor(url, event, cloud) {
  if (event === "PostToolUse") {
    return [{ matcher: CHECKIN_TOOLS, hooks: [checkinEntry(url, event)] }, { hooks: [answeredEntry(url, event)] }];
  }
  const groups = [{ hooks: [entry(url, event)] }];
  if (event === "UserPromptSubmit") groups.push({ hooks: [checkinEntry(url, event)] });
  if (cloud && event === "PreToolUse") {
    const ask = { type: "command", command: hookCommand(url, event, "ask"), timeout: ASK_TIMEOUT };
    groups.push({ matcher: ASK_TOOLS, hooks: [ask] });
  }
  return groups;
}

/** The local café's hook groups for one event (scripts/install-hooks.mjs). */
export function localGroups(event) {
  return groupsFor(HOOK_URL, event, false);
}

/** Claude Code hands its status line the subscription's 5-hour and weekly windows; the script saves them for the hooks. */
export const STATUS_LINE = { type: "command", command: `sh "${RELAY_SH}" statusline` };

/** An existing status line keeps its own output; the limits are saved on the side. */
export function statusChain(old) {
  return `j=$(cat); printf '%s' "$j" | sh "${RELAY_SH}" limits; printf '%s' "$j" | ( ${old} )`;
}

/** Any hook that posts to an Agent Lounge, whatever port or flags an older install used. */
export function isRelayHook(h) {
  return typeof h?.command === "string" && h.command.includes("/api/claude-hook");
}

/** The local café's events: every one that posts, and PostToolUse for the check-in and for a prompt you answered. */
export const LOCAL_EVENTS = [...HOOK_EVENTS, "PostToolUse"];

export function hookSettings() {
  return { hooks: Object.fromEntries(LOCAL_EVENTS.map((e) => [e, localGroups(e)])) };
}

/**
 * Cloud mode also wants SessionStart, so a fresh chat shows its team before the first prompt, and PermissionRequest
 * with a waiting PreToolUse for questions and plans, so the café can answer Claude while you are away from the
 * computer.
 */
export const CLOUD_EVENTS = [...LOCAL_EVENTS, "SessionStart", "PermissionRequest"];

/** A café link's room key apart from the address, which then keeps only the teammate's name. */
export function splitKey(url) {
  const u = new URL(url);
  const key = u.searchParams.get("k");
  u.searchParams.delete("k");
  return { url: u.toString(), key };
}

/** In a team café each teammate's hooks carry their name, so the page can tell whose Claude is whose. */
export function cloudHookUrl(site, key, member) {
  return member ? `${site}/api/claude-hook?k=${key}&m=${encodeURIComponent(member)}` : `${site}/api/claude-hook?k=${key}`;
}

/** The roster, the chat's name, tokens and limits ride along after marker lines, so the hosted site can seat idle agents and name chats. */
export function cloudHookSettings(url) {
  return { hooks: Object.fromEntries(CLOUD_EVENTS.map((e) => [e, groupsFor(url, e, true)])) };
}

/**
 * Windows without Git Bash has no sh: Claude Code posts each event itself, so names, tokens and limits stay home. The
 * key goes in a header; the address keeps only the teammate's name.
 */
export function httpHookSettings(url) {
  const { url: bare, key } = splitKey(url);
  const u = new URL(bare);
  u.searchParams.set("via", "http");
  const hook = { type: "http", url: u.toString(), ...(key ? { headers: { [KEY_HEADER]: key } } : {}), timeout: 3 };
  return { hooks: Object.fromEntries(HOOK_EVENTS.map((e) => [e, [{ hooks: [hook] }]])) };
}

/** The plugin route: the same hooks from a Claude Code plugin, with the café link kept in ~/.config/relay instead of settings.json. */
export function pluginSteps(market, link) {
  return `/plugin marketplace add ${market}\n/plugin install agent-lounge@agent-lounge\n/agent-lounge:connect ${link}`;
}
