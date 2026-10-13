import { LiveEvent } from "./types";

export type AttentionKind = "ask" | "done";

/** The ball is in the user's court: Claude is waiting on a permission or an answer, or has finished its turn. */
export interface Attention {
  kind: AttentionKind;
  text: string;
  seq: number;
  at: number;
  /** the subagent that asked; absent for the main Claude */
  agent?: string;
}

const MOVES_ON = new Set(["tool", "dispatch", "fail", "sub_start"]);

export function nextAttention(prev: Attention | null, e: LiveEvent): Attention | null {
  switch (e.kind) {
    case "notify":
      // Claude Code's idle reminder a minute after a finished turn says nothing new.
      if (prev?.kind === "done" && e.need === "input") return prev;
      return { kind: "ask", text: e.text ?? "чекає на тебе", seq: e.seq, at: e.at, agent: e.agent };
    case "stop":
      return { kind: "done", text: "відповів, твоя черга", seq: e.seq, at: e.at };
    case "prompt":
    case "session_end":
      return null;
    default:
      return prev && MOVES_ON.has(e.kind) && e.agent === prev.agent ? null : prev;
  }
}
