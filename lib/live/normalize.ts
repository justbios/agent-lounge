import { KID_MARK, LIMITS_MARK, ROSTER_MARK, TITLE_MARK, USAGE_MARK, VERSION_MARK } from "./hookConfig.mjs";
import { plainTool } from "./plain";
import { techLine } from "./tech";
import { ContextFill, LimitWindow, Limits, LiveEvent, LiveKind, Say, Usage } from "./types";

type Json = Record<string, unknown>;

const MAX_TEXT = 64;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function clip(s: string, max = MAX_TEXT): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function base(p: unknown): string | undefined {
  const s = str(p);
  return s && (s.split("/").filter(Boolean).pop() ?? s);
}

function host(u: unknown): string | undefined {
  try {
    return new URL(String(u)).host || undefined;
  } catch {
    return undefined;
  }
}

/** A line the café writes itself: kept as its parts, so each viewer reads it in their language, and in Ukrainian. */
function tech(a: string, o?: string): { text: string; tech: Say } {
  const t: Say = o ? { a, o: clip(o) } : { a };
  return { text: techLine(t, "uk") ?? a, tech: t };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

function mcp(name: string): { tool: string; text: string } {
  const [, server = "", ...rest] = name.split("__");
  const label = UUID.test(server) ? "mcp" : server.replace(/^Claude_/, "").toLowerCase().slice(0, 12);
  return { tool: label, text: rest.join(" ").replace(/[_-]+/g, " ") || name };
}

export function describeTool(name: string, input: Json): { tool: string; text: string; tech?: Say } {
  switch (name) {
    case "Read":
      return { tool: "read", ...tech("read", base(input.file_path)) };
    case "Write":
      return { tool: "write", ...tech("write", base(input.file_path)) };
    case "Edit":
    case "MultiEdit":
      return { tool: "edit", ...tech("edit", base(input.file_path)) };
    case "NotebookEdit":
      return { tool: "edit", ...tech("edit", base(input.notebook_path)) };
    case "Bash": {
      const d = str(input.description);
      return { tool: "bash", text: clip(d ?? `$ ${str(input.command) ?? ""}`) };
    }
    case "Grep":
      return { tool: "grep", ...tech("grep", str(input.pattern)) };
    case "Glob":
      return { tool: "glob", ...tech("glob", str(input.pattern)) };
    case "WebFetch":
      return { tool: "web", ...tech("web_read", host(input.url)) };
    case "WebSearch":
      return { tool: "web", ...tech("web_search", str(input.query)) };
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
      return { tool: "plan", ...tech("plan") };
    case "Skill":
      return { tool: "skill", ...tech("skill", str(input.skill)) };
    case "SendMessage":
      return { tool: "msg", ...tech("msg", str(input.to)) };
    case "ToolSearch":
      return { tool: "tools", ...tech("tools") };
    case "AskUserQuestion":
      return { tool: "ask", ...tech("ask") };
    case "Workflow":
      return { tool: "workflow", ...tech("workflow") };
    default:
      if (name.startsWith("mcp__")) return mcp(name);
      return { tool: name.toLowerCase().slice(0, 12), text: name };
  }
}

const MAX_STEPS = 500;

/** How far an agent's task list has got, for the café's time-left guess: counts only, never a step's words. */
export function planStep(name: string, input: Json): Pick<LiveEvent, "todo" | "todoStep"> {
  if (name === "TodoWrite" && Array.isArray(input.todos)) {
    const todos = input.todos.slice(0, MAX_STEPS) as unknown[];
    const done = todos.filter((t) => (t as Json | null)?.status === "completed").length;
    return { todo: { done, total: todos.length } };
  }
  if (name === "TaskCreate") return { todoStep: "add" };
  if (name === "TaskUpdate" && input.status === "completed") return { todoStep: "done" };
  if (name === "TaskUpdate" && input.status === "deleted") return { todoStep: "drop" };
  return {};
}

/** Claude Code also submits its own wrapped messages (a finished background task, …) as prompts. */
function promptEvent(prompt: string | undefined): { tool: string; text?: string } {
  const p = prompt ?? "";
  if (/^\s*<task-notification/.test(p)) {
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(p)?.[1];
    return { tool: "сповіщення", text: summary ? clip(summary, 56) : undefined };
  }
  if (/^\s*</.test(p)) {
    const plain = p.replace(/<[^>]+>/g, " ").trim();
    return { tool: "система", text: plain ? clip(plain, 56) : undefined };
  }
  return { tool: "питання", text: clip(`«${p || "…"}»`, 56) };
}

function notice(type: string | undefined, message: string | undefined): Partial<LiveEvent> | null {
  if (type === "auth_success") return null;
  const m = message ?? "";
  if (type === "permission_prompt" || /permission/i.test(m)) {
    const what = /permission to use (.+)$/i.exec(m)?.[1]?.trim();
    if (what === "AskUserQuestion") {
      return { tool: "ask", need: "permission", ...tech("wait_answer"), say: { a: "wait_you" } };
    }
    if (what === "ExitPlanMode") {
      return { tool: "plan", need: "permission", ...tech("wait_plan"), say: { a: "wait_you" } };
    }
    const tool = what ? describeTool(what, {}).tool : undefined;
    return { tool: "дозвіл", need: "permission", ...tech(tool ? "perm_on" : "perm", tool), say: { a: "wait_perm" } };
  }
  const waits: Partial<LiveEvent> = { tool: "увага", need: "input", ...tech("wait_you"), say: { a: "wait_you" } };
  if (type === "idle_prompt" || !m || /waiting|idle|input/i.test(m)) return waits;
  return { ...waits, message: clip(m) };
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
        const task = str(input.description);
        return ev("dispatch", { tool: "agent", target, text: task && clip(task, 40) });
      }
      return ev("tool", {
        ...describeTool(toolName, input),
        say: plainTool(toolName, input),
        ...planStep(toolName, input),
      });
    case "PostToolUseFailure":
      return ev("fail", { tool: describeTool(toolName, input).tool, ...tech("fail", toolName), say: { a: "fail" } });
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

const MARKS = [ROSTER_MARK, TITLE_MARK, USAGE_MARK, LIMITS_MARK, VERSION_MARK, KID_MARK];
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

const MAX_WINDOW = 2_000_000;

function readCtx(sec: string | null): ContextFill | undefined {
  const j = firstJson(sec);
  const used = count(j?.ctx);
  if (!j || used <= 0 || used > MAX_WINDOW) return undefined;
  const size = count(j.win);
  return size >= 50_000 && size <= MAX_WINDOW ? { used, size } : { used };
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
  /** the hook's JSON exactly as the script sent it, before any marker: what a signed answer is bound to */
  text: string;
  agents: string[] | null;
  title?: string;
  usage?: Usage;
  ctx?: ContextFill;
  limits?: Limits;
  version?: number;
  /** which answer key the computer holds (relay.sh 6), so the café knows which paired secret signs */
  kid?: string;
}

function readKid(sec: string | null): string | undefined {
  const k = sec?.trim();
  return k && /^[0-9a-f]{16}$/.test(k) ? k : undefined;
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
  const json = cut < 0 ? text : text.slice(0, cut);
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const extra = {
    title: readTitle(section(text, TITLE_MARK)) ?? cleanTitle((raw as Json).session_title),
    usage: readUsage(section(text, USAGE_MARK)),
    ctx: readCtx(section(text, USAGE_MARK)),
    limits: readLimits(section(text, LIMITS_MARK)),
    version: readVersion(section(text, VERSION_MARK)),
    kid: readKid(section(text, KID_MARK)),
  };
  const list = section(text, ROSTER_MARK);
  if (list == null) return { raw: raw as Json, text: json, agents: null, ...extra };
  const agents = list
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".md") && !l.startsWith(".") && !/^readme\.md$/i.test(l))
    .map((l) => l.slice(0, -3))
    .filter((n) => /^[\w.-]{1,64}$/.test(n))
    .slice(0, MAX_ROSTER)
    .sort();
  return { raw: raw as Json, text: json, agents, ...extra };
}

const SPENDS: ReadonlySet<LiveKind> = new Set(["stop", "sub_stop", "session_end"]);

/** Stamps what rode along with the hook onto its event: the chat's name, tokens on the kinds that report them, limits. */
export function withExtras(ev: LiveEvent, body: HookBody, member: string | null): LiveEvent {
  return {
    ...ev,
    ...(member ? { member } : {}),
    ...(body.title ? { title: body.title } : {}),
    ...(body.usage && SPENDS.has(ev.kind) ? { usage: body.usage } : {}),
    ...(body.ctx && (ev.kind === "stop" || ev.kind === "sub_stop") ? { ctx: body.ctx } : {}),
    ...(body.limits && ev.kind !== "roster" ? { limits: body.limits } : {}),
    ...(body.version ? { hv: body.version } : {}),
  };
}

export function rosterEvent(raw: Json, agents: string[], seq: number, at: number): LiveEvent | null {
  const session = str(raw.session_id);
  if (!session || str(raw.agent_id)) return null;
  const compact = raw.source === "compact" ? { compact: true } : {};
  return { seq, at, session, cwd: str(raw.cwd), kind: "roster", agents, ...compact };
}
