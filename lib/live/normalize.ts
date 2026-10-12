import { ROSTER_MARK } from "./hookConfig.mjs";
import { LiveEvent, LiveKind } from "./types";

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

function notice(message: string | undefined): string {
  if (!message) return "чекає на тебе";
  if (/permission/i.test(message)) return "чекає на дозвіл";
  if (/waiting|idle|input/i.test(message)) return "чекає на тебе";
  return clip(message);
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
      return ev("tool", describeTool(toolName, input));
    case "PostToolUseFailure":
      return ev("fail", { tool: describeTool(toolName, input).tool, text: clip(`помилка: ${toolName}`) });
    case "SubagentStart":
      return agent ? ev("sub_start") : null;
    case "SubagentStop":
      return agent ? ev("sub_stop") : null;
    case "Stop":
      return agent ? null : ev("stop");
    case "Notification":
      return ev("notify", { tool: "увага", text: notice(str(raw.message)) });
    case "SessionEnd":
      return ev("session_end");
    default:
      return null;
  }
}

const MAX_ROSTER = 60;

/** A hook body is the raw JSON, optionally followed by a marker line and the file names in .claude/agents. */
export function parseHookBody(text: string): { raw: Json; agents: string[] | null } | null {
  const cut = text.indexOf(`\n${ROSTER_MARK}\n`);
  let raw: unknown;
  try {
    raw = JSON.parse(cut < 0 ? text : text.slice(0, cut));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  if (cut < 0) return { raw: raw as Json, agents: null };
  const agents = text
    .slice(cut + ROSTER_MARK.length + 2)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".md") && !l.startsWith(".") && !/^readme\.md$/i.test(l))
    .map((l) => l.slice(0, -3))
    .filter((n) => /^[\w.-]{1,64}$/.test(n))
    .slice(0, MAX_ROSTER)
    .sort();
  return { raw: raw as Json, agents };
}

export function rosterEvent(raw: Json, agents: string[], seq: number, at: number): LiveEvent | null {
  const session = str(raw.session_id);
  if (!session || str(raw.agent_id)) return null;
  return { seq, at, session, cwd: str(raw.cwd), kind: "roster", agents };
}
