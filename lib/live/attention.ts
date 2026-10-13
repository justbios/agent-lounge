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
  /** a finished turn that broke off: "rate_limit", "overloaded", … */
  err?: string;
}

const MOVES_ON = new Set(["tool", "dispatch", "fail", "sub_start"]);

/** A turn that broke off, in words: the subscription limit or any other error. */
export const stopText = (err: string) => (err === "rate_limit" ? "вперся в ліміт підписки" : "зупинився через помилку");

export function nextAttention(prev: Attention | null, e: LiveEvent): Attention | null {
  switch (e.kind) {
    case "notify":
      // Claude Code's idle reminder a minute after a finished turn says nothing new.
      if (prev?.kind === "done" && e.need === "input") return prev;
      return { kind: "ask", text: e.text ?? "чекає на тебе", seq: e.seq, at: e.at, agent: e.agent };
    case "stop":
      if (e.err) return { kind: "done", text: stopText(e.err), seq: e.seq, at: e.at, err: e.err };
      return { kind: "done", text: "відповів, твоя черга", seq: e.seq, at: e.at };
    case "prompt":
    case "session_end":
      return null;
    default:
      return prev && MOVES_ON.has(e.kind) && e.agent === prev.agent ? null : prev;
  }
}
