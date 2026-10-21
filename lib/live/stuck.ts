import { Ui, tr } from "@/lib/i18n";
import { Checkin, LiveEvent } from "./types";

/** Repeats that point to a loop rather than ordinary work: commands and searches, never reads or edits of one file. */
const LOOPY = new Set(["bash", "grep", "glob", "web"]);
/** how many of an agent's latest actions are looked at */
const WINDOW = 10;
/** the same action failing this many times is a loop */
const SAME_FAILS = 3;
/** the same command or search this many times is a loop even when it doesn't fail */
const SAME_RUNS = 5;
/** a loop stands while its latest repeat is this recent */
const FRESH_MS = 15 * 60 * 1000;
/** past Claude's own ⏱ estimate by half of it again, and at least this long */
const LATE_MIN_MS = 15 * 60 * 1000;
/** a chat silent this long has broken off, or been stopped with Esc, which sends no hook: no lateness to show */
const SILENT_MS = 20 * 60 * 1000;

export interface Stuck {
  /** the subagent's id, "" for the main Claude */
  agent: string;
  kind: "loop" | "late";
  /** loop: the latest of the repeated actions */
  e?: LiveEvent;
  /** loop: how many of the latest actions are this one, and how many of them failed */
  times?: number;
  failed?: number;
  /** late: ms past Claude's own estimate */
  over?: number;
  /** when it began to show, ms */
  at: number;
}

const keyOf = (e: LiveEvent) => `${e.tool}|${e.text}`;

/**
 * Agents of one chat that look stuck now: going round one command or one failure, or the whole job running well
 * past the time Claude itself gave in its last ⏱ check-in. Expects one chat's events in order.
 */
export function stuckNow(events: LiveEvent[], now: number): Stuck[] {
  const acts = new Map<string, { e: LiveEvent; failed: boolean }[]>();
  const ended = new Set<string>();
  let told: Checkin | undefined;
  let toldAt = 0;
  let stopAt = 0;
  for (const e of events) {
    const who = e.agent ?? "";
    if (e.kind === "prompt") acts.delete("");
    if (e.kind === "tool") {
      ended.delete(who);
      acts.set(who, [...(acts.get(who) ?? []), { e, failed: false }].slice(-WINDOW));
    }
    if (e.kind === "fail") {
      const a = acts.get(who)?.findLast((x) => !x.failed && x.e.tool === e.tool);
      if (a) a.failed = true;
    }
    if (e.kind === "sub_stop" || (e.kind === "stop" && !e.agent) || e.kind === "session_end") ended.add(who);
    if (e.kind === "stop" && !e.agent) stopAt = e.at;
    if (e.checkin && !e.agent) {
      told = e.checkin;
      toldAt = e.at;
    }
  }

  const out: Stuck[] = [];
  for (const [agent, list] of acts) {
    const last = list.at(-1);
    if (!last || ended.has(agent) || now - last.e.at > FRESH_MS) continue;
    const same = list.filter((x) => keyOf(x.e) === keyOf(last.e));
    const failed = same.filter((x) => x.failed).length;
    if (failed >= SAME_FAILS || (LOOPY.has(last.e.tool ?? "") && same.length >= SAME_RUNS)) {
      out.push({ agent, kind: "loop", e: last.e, times: same.length, failed, at: last.e.at });
    }
  }

  // a turn that ended after the estimate settled it; one still going, or subagents still at work, may run late
  const quiet = now - (events.at(-1)?.at ?? 0) > SILENT_MS;
  if (told && told.left > 0 && stopAt <= toldAt && !quiet) {
    const due = told.at + told.left;
    const over = now - due;
    if (over > Math.max(LATE_MIN_MS, told.left / 2)) out.push({ agent: "", kind: "late", over, at: due });
  }
  return out;
}

/** The same for every chat in the feed, by chat id; only chats with something stuck are in it. */
export function stuckBySession(events: LiveEvent[], now: number): Map<string, Stuck[]> {
  const by = new Map<string, LiveEvent[]>();
  for (const e of events) by.set(e.session, [...(by.get(e.session) ?? []), e]);
  const out = new Map<string, Stuck[]>();
  for (const [id, evs] of by) {
    const s = stuckNow(evs, now);
    if (s.length) out.set(id, s);
  }
  return out;
}

function mins(ms: number): number {
  return Math.max(1, Math.round(ms / 60000));
}

/** A few words for a plate or a board row; `what` is the repeated action in the viewer's words. */
export function stuckShort(s: Stuck, ui: Ui): string {
  if (s.kind === "late")
    return tr(ui, `довше за свою оцінку на ${mins(s.over!)} хв`, `${mins(s.over!)} min past its own estimate`);
  return tr(ui, `ходить по колу ×${s.times}`, `going in circles ×${s.times}`);
}

/** The whole story, for the agent card and the notification. */
export function stuckLong(s: Stuck, what: string, ui: Ui): string {
  if (s.kind === "late") {
    return tr(
      ui,
      `Робота йде вже на ${mins(s.over!)} хв довше, ніж Claude сам оцінив у своєму ⏱. Можливо, щось застрягло.`,
      `The job runs ${mins(s.over!)} min past what Claude itself gave in its ⏱. Something may be stuck.`,
    );
  }
  const failed = s.failed ? tr(ui, `, ${s.failed} з них з помилкою`, `, ${s.failed} of them failed`) : "";
  return tr(
    ui,
    `«${what}» знову й знову: ${s.times} з останніх дій${failed}. Схоже, ходить по колу.`,
    `“${what}” again and again: ${s.times} of its latest actions${failed}. Looks like it's going in circles.`,
  );
}
