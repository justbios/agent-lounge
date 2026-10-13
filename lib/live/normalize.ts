import { LIMITS_MARK, ROSTER_MARK, TITLE_MARK, USAGE_MARK, VERSION_MARK } from "./hookConfig.mjs";
import { plainTool } from "./plain";
import { LimitWindow, Limits, LiveEvent, LiveKind, Usage } from "./types";

type Json = Record<string, unknown>;

const MAX_TEXT = 64;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function clip(s: string, max = MAX_TEXT): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function base(p: unknown): string {
  const s = str(p);
  if (!s) return "файл";
  return s.split("/").filter(Boolean).pop() ?? s;
}

function host(u: unknown): string {
  try {
    return new URL(String(u)).host;
  } catch {
    return "сторінку";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

function mcp(name: string): { tool: string; text: string } {
  const [, server = "", ...rest] = name.split("__");
  const label = UUID.test(server) ? "mcp" : server.replace(/^Claude_/, "").toLowerCase().slice(0, 12);
  return { tool: label, text: rest.join(" ").replace(/[_-]+/g, " ") || name };
}

export function describeTool(name: string, input: Json): { tool: string; text: string } {
  switch (name) {
    case "Read":
      return { tool: "read", text: `читає ${base(input.file_path)}` };
    case "Write":
      return { tool: "write", text: `пише ${base(input.file_path)}` };
    case "Edit":
    case "MultiEdit":
      return { tool: "edit", text: `редагує ${base(input.file_path)}` };
    case "NotebookEdit":
      return { tool: "edit", text: `редагує ${base(input.notebook_path)}` };
    case "Bash": {
      const d = str(input.description);
      return { tool: "bash", text: clip(d ?? `$ ${str(input.command) ?? ""}`) };
    }
    case "Grep":
      return { tool: "grep", text: clip(`шукає «${str(input.pattern) ?? ""}»`) };
    case "Glob":
      return { tool: "glob", text: clip(`шукає файли ${str(input.pattern) ?? ""}`) };
    case "WebFetch":
      return { tool: "web", text: `читає ${host(input.url)}` };
    case "WebSearch":
      return { tool: "web", text: clip(`шукає в мережі «${str(input.query) ?? ""}»`) };
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
      return { tool: "plan", text: "оновлює план" };
    case "Skill":
      return { tool: "skill", text: clip(`бере скіл ${str(input.skill) ?? ""}`) };
    case "SendMessage":
      return { tool: "msg", text: clip(`пише ${str(input.to) ?? "агенту"}`) };
    case "ToolSearch":
      return { tool: "tools", text: "дістає інструменти" };
    case "AskUserQuestion":
      return { tool: "ask", text: "питає тебе" };
    case "Workflow":
      return { tool: "workflow", text: "запускає воркфлоу" };
    default:
      if (name.startsWith("mcp__")) return mcp(name);
      return { tool: name.toLowerCase().slice(0, 12), text: name };
  }
}

/** Claude Code also submits its own wrapped messages (a finished background task, …) as prompts. */
function promptEvent(prompt: string | undefined): { tool: string; text: string } {
  const p = prompt ?? "";
  if (/^\s*<task-notification/.test(p)) {
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(p)?.[1];
    return { tool: "сповіщення", text: clip(summary ?? "фонова задача завершилась", 56) };
  }
  if (/^\s*</.test(p)) {
    const plain = p.replace(/<[^>]+>/g, " ").trim();
    return { tool: "система", text: clip(plain || "службове повідомлення", 56) };
  }
  return { tool: "питання", text: clip(`«${p || "…"}»`, 56) };
}

function notice(type: string | undefined, message: string | undefined): Partial<LiveEvent> | null {
  if (type === "auth_success") return null;
  const m = message ?? "";
  if (type === "permission_prompt" || /permission/i.test(m)) {
    const what = /permission to use (.+)$/i.exec(m)?.[1];
    const tool = what ? describeTool(what.trim(), {}).tool : undefined;
    const text = tool ? `чекає на дозвіл: ${tool}` : "чекає на дозвіл";
    return { tool: "дозвіл", need: "permission", text, say: { a: "wait_perm" } };
  }
  if (type === "idle_prompt" || !m || /waiting|idle|input/i.test(m)) {
    return { tool: "увага", need: "input", text: "чекає на тебе", say: { a: "wait_you" } };
  }
  return { tool: "увага", need: "input", text: clip(m) };
}

/** Maps a raw Claude Code hook payload to a café event, or null when it should not show. */
export function normalizeHook(raw: Json, seq: number, at: number): LiveEvent | null {
  const session = str(raw.session_id);
  const hook = str(raw.hook_event_name);
  if (!session || !hook) return null;

  const agent = str(raw.agent_id);
  const agentType = str(raw.agent_type);
  if (agent && !agentType) return null;

  const ev = (kind: LiveKind, extra: Partial<LiveEvent> = {}): LiveEvent => ({
    seq,
    at,
    session,
    cwd: str(raw.cwd),
    kind,
    ...(agent ? { agent, agentType } : {}),
    ...extra,
  });

  const input = (raw.tool_input ?? {}) as Json;
  const toolName = str(raw.tool_name) ?? "";

  switch (hook) {
    case "UserPromptSubmit":
      return ev("prompt", promptEvent(str(raw.prompt)));
    case "PreToolUse":
      if (toolName === "Agent" || toolName === "Task") {
        const target = str(input.subagent_type) ?? "general-purpose";
        return ev("dispatch", { tool: "agent", target, text: clip(str(input.description) ?? "нове завдання", 40) });
      }
      return ev("tool", { ...describeTool(toolName, input), say: plainTool(toolName, input) });
    case "PostToolUseFailure":
      return ev("fail", {
        tool: describeTool(toolName, input).tool,
        text: clip(`помилка: ${toolName}`),
        say: { a: "fail" },
      });
    case "SubagentStart":
      return agent ? ev("sub_start") : null;
    case "SubagentStop":
      return agent ? ev("sub_stop") : null;
    case "Stop":
      return agent ? null : ev("stop");
    case "StopFailure": {
      const err = str(raw.error) ?? "unknown";
      if (agent) return null;
      return ev("stop", { err, say: { a: err === "rate_limit" ? "limit_hit" : "broke_off" } });
    }
    case "Notification": {
      const n = notice(str(raw.notification_type), str(raw.message));
      return n ? ev("notify", n) : null;
    }
    case "SessionEnd":
      return ev("session_end");
    default:
      return null;
  }
}

const MAX_ROSTER = 60;

const MARKS = [ROSTER_MARK, TITLE_MARK, USAGE_MARK, LIMITS_MARK, VERSION_MARK];
const MAX_TOKENS = 1e11;

/** The text after a marker line, up to the next marker; null when the hook sent no such section. */
function section(text: string, mark: string): string | null {
  const at = text.indexOf(`\n${mark}\n`);
  if (at < 0) return null;
  const rest = text.slice(at + mark.length + 2);
  const ends = MARKS.map((m) => `\n${rest}`.indexOf(`\n${m}\n`)).filter((i) => i >= 0);
  return ends.length ? rest.slice(0, Math.max(0, Math.min(...ends) - 1)) : rest;
}

/** A chat's name as Claude Code keeps it, trimmed to something a tab can show. */
export function cleanTitle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.normalize("NFC").replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  return t ? clip(t, 80) : undefined;
}

function readTitle(sec: string | null): string | undefined {
  const m = sec ? /"customTitle":("(?:[^"\\]|\\.)*")/.exec(sec) : null;
  if (!m) return undefined;
  try {
    return cleanTitle(JSON.parse(m[1]));
  } catch {
    return undefined;
  }
}

function firstJson(sec: string | null): Json | null {
  const line = sec?.split("\n").find((l) => l.trim());
  if (!line || line.length > 600) return null;
  try {
    const v: unknown = JSON.parse(line);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}

function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v < MAX_TOKENS ? Math.round(v) : 0;
}

function readUsage(sec: string | null): Usage | undefined {
  const j = firstJson(sec);
  if (!j) return undefined;
  const u = { in: count(j.in), cw: count(j.cw), cr: count(j.cr), out: count(j.out) };
  return u.in + u.cw + u.cr + u.out > 0 ? u : undefined;
}

const EPOCH_MIN = 1.6e9;
const EPOCH_MAX = 4.2e9;

function limitWindow(v: unknown): LimitWindow | undefined {
  if (!v || typeof v !== "object") return undefined;
  const { pct, reset } = v as Json;
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 1000) return undefined;
  if (typeof reset !== "number" || reset < EPOCH_MIN || reset > EPOCH_MAX) return undefined;
  return { pct: Math.round(pct * 10) / 10, reset: Math.round(reset) };
}

function readLimits(sec: string | null): Limits | undefined {
  const j = firstJson(sec);
  if (!j || typeof j.at !== "number" || j.at < EPOCH_MIN || j.at > EPOCH_MAX) return undefined;
  const five = limitWindow(j.five);
  const week = limitWindow(j.week);
  if (!five && !week) return undefined;
  return { at: Math.round(j.at), ...(five ? { five } : {}), ...(week ? { week } : {}) };
}

export interface HookBody {
  raw: Json;
  agents: string[] | null;
  title?: string;
  usage?: Usage;
  limits?: Limits;
  version?: number;
}

function readVersion(sec: string | null): number | undefined {
  const v = Number(sec?.trim());
  return Number.isInteger(v) && v > 0 && v < 1000 ? v : undefined;
}

/**
 * A hook body is the raw JSON, optionally followed by marker lines: the file names in .claude/agents, the chat's
 * name, the tokens spent since the last report and the usage limits the status line saw last.
 */
export function parseHookBody(text: string): HookBody | null {
  const cuts = MARKS.map((m) => text.indexOf(`\n${m}\n`)).filter((i) => i >= 0);
  const cut = cuts.length ? Math.min(...cuts) : -1;
  let raw: unknown;
  try {
    raw = JSON.parse(cut < 0 ? text : text.slice(0, cut));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const extra = {
    title: readTitle(section(text, TITLE_MARK)) ?? cleanTitle((raw as Json).session_title),
    usage: readUsage(section(text, USAGE_MARK)),
    limits: readLimits(section(text, LIMITS_MARK)),
    version: readVersion(section(text, VERSION_MARK)),
  };
  const list = section(text, ROSTER_MARK);
  if (list == null) return { raw: raw as Json, agents: null, ...extra };
  const agents = list
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".md") && !l.startsWith(".") && !/^readme\.md$/i.test(l))
    .map((l) => l.slice(0, -3))
    .filter((n) => /^[\w.-]{1,64}$/.test(n))
    .slice(0, MAX_ROSTER)
    .sort();
  return { raw: raw as Json, agents, ...extra };
}

const SPENDS: ReadonlySet<LiveKind> = new Set(["stop", "sub_stop", "session_end"]);

/** Stamps what rode along with the hook onto its event: the chat's name, tokens on the kinds that report them, limits. */
export function withExtras(ev: LiveEvent, body: HookBody, member: string | null): LiveEvent {
  return {
    ...ev,
    ...(member ? { member } : {}),
    ...(body.title ? { title: body.title } : {}),
    ...(body.usage && SPENDS.has(ev.kind) ? { usage: body.usage } : {}),
    ...(body.limits && ev.kind !== "roster" ? { limits: body.limits } : {}),
    ...(body.version ? { hv: body.version } : {}),
  };
}

export function rosterEvent(raw: Json, agents: string[], seq: number, at: number): LiveEvent | null {
  const session = str(raw.session_id);
  if (!session || str(raw.agent_id)) return null;
  return { seq, at, session, cwd: str(raw.cwd), kind: "roster", agents };
}
