import type { Ui } from "@/lib/i18n";
import { techLine } from "./tech";
import { LiveEvent, Say } from "./types";

export type AttentionKind = "ask" | "done";

/** The ball is in the user's court: Claude is waiting on a permission or an answer, or has finished its turn. */
export interface Attention {
  kind: AttentionKind;
  /** what it waits on, in Ukrainian as the server wrote it; {@link attentionText} reads {@link tech} instead */
  text: string;
  /** the same in parts, so each viewer reads it in their own language */
  tech?: Say;
  seq: number;
  at: number;
  /** the subagent that asked; absent for the main Claude */
  agent?: string;
  /** a finished turn that broke off: "rate_limit", "overloaded", … */
  err?: string;
}

const MOVES_ON = new Set(["tool", "dispatch", "fail", "sub_start", "answered"]);

/** A turn that broke off, in words: the subscription limit or any other error. Server code calls it too. */
export function stopText(err: string, ui: Ui = "uk"): string {
  if (err === "rate_limit") return ui === "en" ? "hit the subscription limit" : "вперся в ліміт підписки";
  return ui === "en" ? "stopped on an error" : "зупинився через помилку";
}

/** What Claude waits on, in the viewer's language. */
export function attentionText(a: Attention, ui: Ui): string {
  if (a.kind === "ask") {
    const said = a.tech && techLine(a.tech, ui);
    return said || a.text || (ui === "en" ? "waiting for you" : "чекає на тебе");
  }
  if (a.err) return stopText(a.err, ui);
  return ui === "en" ? "answered, your turn" : "відповів, твоя черга";
}

export function nextAttention(prev: Attention | null, e: LiveEvent): Attention | null {
  switch (e.kind) {
    case "notify":
      // Claude Code's idle reminder a minute after a finished turn says nothing new.
      if (prev?.kind === "done" && e.need === "input") return prev;
      return { kind: "ask", text: e.text ?? "", tech: e.tech, seq: e.seq, at: e.at, agent: e.agent };
    case "stop":
      if (e.err) return { kind: "done", text: "", seq: e.seq, at: e.at, err: e.err };
      return { kind: "done", text: "", seq: e.seq, at: e.at };
    case "prompt":
    case "session_end":
      return null;
    default:
      return prev && MOVES_ON.has(e.kind) && e.agent === prev.agent ? null : prev;
  }
}
