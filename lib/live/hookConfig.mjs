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
/** relay.sh 8 names the agent here when it isn't Claude Code: codex, copilot, gemini or opencode (lib/live/source.ts). */
export const AGENT_MARK = "#relay-agent";

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
  SubagentStop: "title usage limits",
  SessionEnd: "title usage",
  Notification: "title waits",
  PermissionRequest: "ask",
};

/**
 * Where the connect phrase, the local installer and /agent-lounge:connect keep the hook script
 * (plugin/scripts/relay.sh).
 */
export const RELAY_SH = "$HOME/.config/relay/relay.sh";

/** The connect phrases' shell line: saves relay.sh from the café and prints its checksum to compare. */
export function saveScript(site) {
  const file = RELAY_SH.replace("$HOME", "~");
  return `mkdir -p ~/.config/relay && curl -fsS ${site}/relay.sh -o ${file} && (shasum -a 256 ${file} || sha256sum ${file})`;
}

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

/**
 * Codex reads Claude-shaped hooks from ~/.codex/hooks.json. It has no Notification: its PermissionRequest comes only
 * when it really asks, so one hook says it waits, and while you are away another waits for the café's answer, which
 * Codex takes in Claude Code's words. SessionEnd can't be async there and gets 3 s at most.
 */
const CODEX_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "SessionEnd",
];

export function codexHookSettings(url) {
  const run = (flags, more) => ({ type: "command", command: hookCommand(url, null, flags), ...more });
  const groups = (e) => {
    if (e === "PermissionRequest") {
      return [
        { hooks: [run("codex waits", { async: true, timeout: 5 })] },
        { hooks: [run("ask codex", { timeout: ASK_TIMEOUT })] },
      ];
    }
    if (e === "SessionEnd") return [{ hooks: [run("codex", { timeout: 3 })] }];
    const flags = e === "PostToolUse" ? "answered codex" : "codex";
    return [{ hooks: [run(flags, { async: true, timeout: 5 })] }];
  };
  return { hooks: Object.fromEntries(CODEX_EVENTS.map((e) => [e, groups(e)])) };
}

/**
 * Copilot CLI takes Claude Code's hook names in a file of its own in ~/.copilot/hooks, and sends Claude-shaped JSON
 * for them. It waits on every hook, so relay.sh posts in the background; its permission hook runs on every check,
 * asked or not, so the café only shows that it waits and doesn't answer.
 */
const COPILOT_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "Notification",
  "SessionEnd",
];

export function copilotHookSettings(url) {
  const flags = { Notification: "copilot waits", PostToolUse: "answered copilot" };
  const hook = (e) => ({ type: "command", bash: hookCommand(url, e, flags[e] ?? "copilot"), timeoutSec: 5 });
  return { version: 1, hooks: Object.fromEntries(COPILOT_EVENTS.map((e) => [e, [hook(e)]])) };
}

/**
 * Gemini CLI's hooks go under "hooks" in ~/.gemini/settings.json, with timeouts in ms. It waits on each one and wants
 * JSON back, so relay.sh posts in the background and prints {}. It has no subagents, and a hook can't approve a tool
 * there, so the café shows Gemini without answering for it.
 */
const GEMINI_EVENTS = [
  "SessionStart",
  "BeforeAgent",
  "BeforeTool",
  "AfterTool",
  "AfterAgent",
  "Notification",
  "SessionEnd",
];

export function geminiHookSettings(url) {
  const flags = { Notification: "gemini waits", AfterTool: "answered gemini" };
  const hook = (e) => ({
    name: "agent-lounge",
    type: "command",
    command: `sh "${RELAY_SH}" --url '${url}' ${flags[e] ?? "gemini"} 2>/dev/null || echo '{}'`,
    timeout: 5000,
  });
  const group = (e) => (e.endsWith("Tool") ? { matcher: "*", hooks: [hook(e)] } : { hooks: [hook(e)] });
  return { hooks: Object.fromEntries(GEMINI_EVENTS.map((e) => [e, [group(e)]])) };
}

/**
 * OpenCode takes a plugin file in ~/.config/opencode/plugins instead of hooks. It posts Claude-shaped events itself:
 * a subagent is a child session, which it reports under its parent the way Claude Code does. Only names and counts
 * go out, as with the hooks: never a file's contents or a command's output.
 */
export function opencodePlugin(url) {
  const { url: bare, key } = splitKey(url);
  return `// Agent Lounge: shows this computer's OpenCode agents in the café. Made on the connect page.
const URL = ${JSON.stringify(bare)};
const HEADERS = { "content-type": "text/plain"${key ? `, ${JSON.stringify(KEY_HEADER)}: ${JSON.stringify(key)}` : ""} };
const TAIL = "\\n${AGENT_MARK}\\nopencode\\n${VERSION_MARK}\\n${HOOK_VERSION}\\n";
const KEEP = ["filePath", "path", "pattern", "command", "description", "url", "query", "subagent_type", "todos"];

export const AgentLounge = async ({ directory }) => {
  const subs = new Map();
  const sent = new Map();
  const post = (hook, id, more = {}) => {
    const sub = subs.get(id);
    const at = sub ? { session_id: sub.parent, agent_id: id, agent_type: sub.type } : { session_id: id };
    const body = JSON.stringify({ hook_event_name: hook, cwd: directory, ...at, ...more }) + TAIL;
    fetch(URL, { method: "POST", headers: HEADERS, body }).catch(() => {});
  };
  return {
    event: async ({ event }) => {
      const p = event.properties ?? {};
      const info = p.info ?? {};
      if (event.type === "session.created" && info.parentID) {
        const type = /\\(@([\\w.-]+) subagent\\)/.exec(info.title ?? "")?.[1] ?? sent.get(info.parentID) ?? "general";
        subs.set(info.id, { parent: info.parentID, type });
        post("SubagentStart", info.id);
      } else if (event.type === "session.idle") {
        post(subs.has(p.sessionID) ? "SubagentStop" : "Stop", p.sessionID);
      } else if (event.type === "permission.asked" || event.type === "permission.updated") {
        const what = p.permission ?? p.type ?? "a tool";
        post("Notification", p.sessionID, { notification_type: "permission_prompt", message: \`needs your permission to use \${what}\` });
      } else if (event.type === "permission.replied") {
        post("PostToolUse", p.sessionID);
      }
    },
    "chat.message": async (input, output) => {
      if (subs.has(input.sessionID)) return;
      const prompt = (output.parts ?? []).filter((x) => x.type === "text" && !x.synthetic).map((x) => x.text).join(" ");
      post("UserPromptSubmit", input.sessionID, { prompt });
    },
    "tool.execute.before": async (input, output) => {
      const args = output.args ?? {};
      if (input.tool === "task") sent.set(input.sessionID, args.subagent_type);
      const tool_input = Object.fromEntries(KEEP.filter((k) => k in args).map((k) => [k, args[k]]));
      post("PreToolUse", input.sessionID, { tool_name: input.tool, tool_input });
    },
  };
};
`;
}

/** The plugin route: the same hooks from a Claude Code plugin, with the café link kept in ~/.config/relay instead of settings.json. */
export function pluginSteps(market, link) {
  return `/plugin marketplace add ${market}\n/plugin install agent-lounge@agent-lounge\n/agent-lounge:connect ${link}`;
}
