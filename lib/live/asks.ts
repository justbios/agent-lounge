import { describeTool } from "./normalize";

/** How long an ask waits in the café before the terminal asks instead; the same 10 minutes as relay_asks. */
export const ASK_MS = 10 * 60_000;

export interface AskOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  question: string;
  header?: string;
  options: AskOption[];
  multiSelect?: boolean;
}

/** A question or a plan, kept whole: the café shows it, and Claude gets its own input back with the answer. */
export type AskBody =
  | { tool: "AskUserQuestion"; input: { questions: AskQuestion[] } }
  | { tool: "ExitPlanMode"; input: { plan?: string; planFilePath?: string } };

/** The tools whose questions wait in the café through PreToolUse, apart from permission prompts. */
export const ASK_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);

/** What a body may weigh: the same limit as relay_ask_open's. */
export const ASK_BODY_MAX = 100_000;

/**
 * How long a permission's detail may be: the whole command or the tool's whole input, never cut, so what you allow
 * from the café is all of it. Anything longer is asked in the terminal.
 */
export const ASK_DETAIL_MAX = 4000;

export interface Ask {
  id: string;
  session: string;
  /** the chat's name, or its folder */
  label: string;
  tool: string;
  /** exactly what Claude wants to do: the whole command, the file, the address */
  detail: string;
  at: number;
  /** the question with its options, or the plan; none for a permission prompt */
  body?: AskBody | null;
  /** the computer's answer key, which a paired browser signs with; none from a script older than 6 */
  kid?: string;
  /** the hook's JSON as the computer sent it: the signature covers it, and what the café shows is read from it */
  raw?: string;
  /** Claude's input from raw, which a question's answers or an approved plan passes back */
  input?: Record<string, unknown>;
  /** what a file write or edit puts in, from raw, to read before allowing it */
  change?: string;
}

function clip(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function rel(p: unknown, cwd?: string): string {
  const s = typeof p === "string" ? p : "";
  return cwd && s.startsWith(`${cwd}/`) ? s.slice(cwd.length + 1) : s;
}

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function isQuestion(q: unknown): q is AskQuestion {
  const o = q as AskQuestion | null;
  return (
    !!o &&
    isText(o.question) &&
    Array.isArray(o.options) &&
    o.options.length > 0 &&
    o.options.every((x) => !!x && isText(x.label))
  );
}

/** Claude's own input for a question or a plan, when it has the shape the café can show and answer. */
export function askBody(name: string, input: Record<string, unknown>): AskBody | null {
  if (name === "AskUserQuestion") {
    const qs = input.questions;
    if (!Array.isArray(qs) || !qs.length || !qs.every(isQuestion)) return null;
    if (new Set(qs.map((q) => q.question)).size !== qs.length) return null;
    return { tool: name, input: input as { questions: AskQuestion[] } };
  }
  if (name === "ExitPlanMode" && isText(input.plan)) {
    return { tool: name, input: input as { plan?: string; planFilePath?: string } };
  }
  return null;
}

/** What a permission prompt is about, in enough detail to say yes or no to it from the café. */
export function askDetail(
  name: string,
  input: Record<string, unknown>,
  cwd?: string,
): { tool: string; detail: string } {
  const { tool, text } = describeTool(name, input);
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  switch (name) {
    case "Bash":
      return { tool, detail: `$ ${s("command").trim()}` };
    case "Write":
      return { tool, detail: `пише ${rel(input.file_path, cwd)}` };
    case "Edit":
    case "MultiEdit":
      return { tool, detail: `редагує ${rel(input.file_path, cwd)}` };
    case "NotebookEdit":
      return { tool, detail: `редагує ${rel(input.notebook_path, cwd)}` };
    case "WebFetch":
      return { tool, detail: `відкриває ${s("url")}` };
    case "AskUserQuestion": {
      const q = Array.isArray(input.questions) ? (input.questions[0] as { question?: unknown }) : null;
      return { tool, detail: clip(`питає: ${typeof q?.question === "string" ? q.question : ""}`, 500) };
    }
    case "ExitPlanMode": {
      const head = s("plan").split("\n").find((l) => l.trim()) ?? "";
      return { tool, detail: clip(`план: ${head.replace(/^#+\s*/, "")}`, 200) };
    }
    default: {
      const args = JSON.stringify(input);
      return { tool, detail: args && args !== "{}" ? `${text} ${args}` : text };
    }
  }
}

/**
 * What a paired browser shows and signs: read from the hook's own JSON as the computer sent it, not from what the
 * server filed beside it, so a server that changed the command or the plan only gets an answer the computer refuses.
 */
export function askFromRaw(
  raw: string,
): { tool: string; detail: string; body: AskBody | null; input: Record<string, unknown>; name: string } | null {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  const name = typeof o.tool_name === "string" ? o.tool_name : "";
  if (!name) return null;
  const ti = o.tool_input;
  const input = ti && typeof ti === "object" && !Array.isArray(ti) ? (ti as Record<string, unknown>) : {};
  const body = ASK_TOOLS.has(name) ? askBody(name, input) : null;
  if (ASK_TOOLS.has(name) && !body) return null;
  return { ...askDetail(name, input, typeof o.cwd === "string" ? o.cwd : undefined), body, input, name };
}

/** What a write or an edit changes, whole: the new file, or each replaced text and what replaces it. */
export function askChange(name: string, input: Record<string, unknown>): string | undefined {
  const s = (o: Record<string, unknown>, k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const edit = (o: Record<string, unknown>) => `− ${s(o, "old_string")}\n+ ${s(o, "new_string")}`;
  switch (name) {
    case "Write":
      return s(input, "content");
    case "Edit":
      return edit(input);
    case "MultiEdit":
      return Array.isArray(input.edits)
        ? input.edits.map((e) => (e && typeof e === "object" ? edit(e as Record<string, unknown>) : "")).join("\n\n")
        : undefined;
    case "NotebookEdit":
      return s(input, "new_source");
    default:
      return undefined;
  }
}

/** A question's answers the way Claude Code reads them and relay_ask_reply checks them: labels in option order. */
export function answerText(questions: AskQuestion[], picked: Record<string, string[]>): Record<string, string> {
  return Object.fromEntries(
    questions.map((q) => [
      q.question,
      q.options
        .map((o) => o.label)
        .filter((l) => picked[q.question]?.includes(l))
        .join(", "),
    ]),
  );
}

/** Asks the terminal answered meanwhile: their chat went on to a new answer or question after asking. */
export function settledAsks(asks: Ask[], events: { session: string; at: number; kind: string; agent?: string }[]) {
  const done = new Set<string>();
  for (const a of asks) {
    for (let i = events.length - 1; i >= 0 && events[i].at > a.at; i--) {
      const e = events[i];
      if (e.session === a.session && !e.agent && (e.kind === "stop" || e.kind === "prompt")) {
        done.add(a.id);
        break;
      }
    }
  }
  return done;
}
