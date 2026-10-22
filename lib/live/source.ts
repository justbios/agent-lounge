import { AgentSrc } from "./types";

/** Each agent's own name, which its main chat takes in the café instead of Claude's. */
export const SOURCES: Record<AgentSrc, string> = {
  codex: "Codex",
  copilot: "Copilot",
  gemini: "Gemini",
  opencode: "OpenCode",
  cursor: "Cursor",
};

export function readSrc(v: unknown): AgentSrc | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return Object.hasOwn(SOURCES, s) ? (s as AgentSrc) : undefined;
}

/** Their main agent's shirt and face in the café, apart from Claude's orange and look 2. */
export const SOURCE_LOOKS: Record<AgentSrc, { color: string; look: number }> = {
  codex: { color: "#3fbf8f", look: 5 },
  copilot: { color: "#a77bf3", look: 7 },
  gemini: { color: "#5b9cf5", look: 4 },
  opencode: { color: "#d8d2c4", look: 9 },
  cursor: { color: "#7fd3e6", look: 6 },
};

/** Who a chat's main agent is: Claude unless another agent sent the chat. */
export const srcName = (src?: AgentSrc): string => (src ? SOURCES[src] : "Claude");
