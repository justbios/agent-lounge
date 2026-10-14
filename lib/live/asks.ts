import { describeTool } from "./normalize";

/** How long an ask waits in the café before the terminal asks instead; the same 10 minutes as relay_asks. */
export const ASK_MS = 10 * 60_000;

export interface Ask {
  id: string;
  session: string;
  /** the chat's name, or its folder */
  label: string;
  tool: string;
  /** exactly what Claude wants to do: the whole command, the file, the address */
  detail: string;
  at: number;
}

function clip(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function rel(p: unknown, cwd?: string): string {
  const s = typeof p === "string" ? p : "";
  return cwd && s.startsWith(`${cwd}/`) ? s.slice(cwd.length + 1) : s;
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
      return { tool, detail: clip(`$ ${s("command")}`, 500) };
    case "Write":
      return { tool, detail: `пише ${rel(input.file_path, cwd)}` };
    case "Edit":
    case "MultiEdit":
      return { tool, detail: `редагує ${rel(input.file_path, cwd)}` };
    case "NotebookEdit":
      return { tool, detail: `редагує ${rel(input.notebook_path, cwd)}` };
    case "WebFetch":
      return { tool, detail: `відкриває ${s("url")}` };
    default: {
      const args = JSON.stringify(input);
      return { tool, detail: clip(args && args !== "{}" ? `${text} ${args}` : text, 500) };
    }
  }
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
