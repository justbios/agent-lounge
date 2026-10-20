"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Stint } from "@/lib/cafe/model";
import { Ui, tr } from "@/lib/i18n";
import { Run, stepTodo } from "./liveModel";
import { LiveEvent } from "./types";

/*
 * Time left comes from the work in front of an agent where it can: a design check of 20 screens takes four times one
 * of 5. The work is its task list (TodoWrite, or TaskCreate and TaskUpdate), the speed the time per step, measured on
 * this job once a step is done and taken from the type's earlier jobs before that. An agent that keeps no list gets a
 * rougher guess: how long the type's jobs usually take, less the time it has already spent.
 */

const STORE = "relay.runs";
/** finished jobs remembered per subagent type, newest first */
const PER_TYPE = 30;
const MAX_TYPES = 60;
/** how many steps' worth of weight the earlier jobs' pace keeps against this job's own */
const PRIOR_STEPS = 2;
/** a job already longer than usual is given this share of its time so far again */
const OVERRUN = 0.25;
/** the paces' key for every type's jobs together, for a type never seen finish */
export const ALL = "*";

export interface PastRun {
  /** the subagent instance, so a job seen twice counts once */
  id: string;
  type: string;
  /** the whole job, from its first event to SubagentStop */
  ms: number;
  at: number;
  /** steps of its task list it ticked off on the way, its pace ms / steps; 0 when it kept no list */
  steps: number;
}

/** Every subagent job in the feed that came back, with the steps of its task list it ticked off. */
export function finishedRuns(events: LiveEvent[]): PastRun[] {
  const jobs = new Map<string, Run>();
  const out: PastRun[] = [];
  for (const e of events) {
    if (!e.agent || !e.agentType) continue;
    let run = jobs.get(e.agent);
    if (!run) jobs.set(e.agent, (run = { start: e.at, type: e.agentType }));
    if (e.todo || e.todoStep) stepTodo(run, e, e.at);
    if (e.kind !== "sub_stop") continue;
    const steps = run.todo ? Math.max(run.todo.done - (run.base ?? 0), 0) : 0;
    if (e.at > run.start) out.push({ id: e.agent, type: e.agentType, ms: e.at - run.start, at: e.at, steps });
  }
  return out;
}

type Row = [id: string, ms: number, at: number, steps: number];
type Book = Record<string, Row[]>;

const isRow = (r: unknown): r is Row =>
  Array.isArray(r) &&
  typeof r[0] === "string" &&
  typeof r[1] === "number" &&
  r[1] > 0 &&
  typeof r[2] === "number" &&
  typeof r[3] === "number" &&
  r[3] >= 0;

let book: Book | null = null;
let raw: string | null = null;
const listeners = new Set<() => void>();

function read(): Book {
  try {
    const now = localStorage.getItem(STORE);
    if (book && now === raw) return book;
    raw = now;
    const parsed = now ? (JSON.parse(now) as unknown) : null;
    const out: Book = {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [type, list] of Object.entries(parsed as Record<string, unknown>)) {
        const rows = Array.isArray(list) ? list.filter(isRow).slice(0, PER_TYPE) : [];
        if (rows.length) out[type] = rows;
      }
    }
    book = out;
  } catch {
    book ??= {};
  }
  return book;
}

/** Adds jobs to the newest-first list of their type; null when every one of them was already there. */
function withRuns(cur: Book, runs: PastRun[]): Book | null {
  const next: Book = { ...cur };
  let changed = false;
  for (const r of runs) {
    const rows = next[r.type] ?? [];
    if (rows.some((x) => x[0] === r.id)) continue;
    next[r.type] = [...rows, [r.id, r.ms, r.at, r.steps] as Row].sort((a, b) => b[2] - a[2]).slice(0, PER_TYPE);
    changed = true;
  }
  return changed ? next : null;
}

/** This browser remembers each type's pace, so it outlives the feed's day of events. */
function remember(runs: PastRun[]) {
  const next = runs.length ? withRuns(read(), runs) : null;
  if (!next) return;
  const types = Object.keys(next)
    .sort((a, b) => next[b][0][2] - next[a][0][2])
    .slice(0, MAX_TYPES);
  book = Object.fromEntries(types.map((t) => [t, next[t]]));
  try {
    raw = JSON.stringify(book);
    localStorage.setItem(STORE, raw);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORE) cb();
  };
  listeners.add(cb);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: Book = {};

export interface Pace {
  /** the median time one step of the type's task lists took; absent when none of its jobs kept a list */
  stepMs?: number;
  /** the median length of its whole jobs, for an agent that keeps no list */
  jobMs: number;
  /** how many jobs it rests on */
  n: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function pacesOf(stored: Book, seen: PastRun[]): Map<string, Pace> {
  const book = withRuns(stored, seen) ?? stored;
  const out = new Map<string, Pace>();
  const every: number[] = [];
  for (const [type, rows] of Object.entries(book)) {
    const listed = rows.filter((r) => r[3] >= 1);
    const stepMs = listed.length ? median(listed.map((r) => r[1] / r[3])) : undefined;
    out.set(type, { stepMs, jobMs: median(rows.map((r) => r[1])), n: rows.length });
    every.push(...rows.map((r) => r[1]));
  }
  if (every.length) out.set(ALL, { jobMs: median(every), n: every.length });
  return out;
}

/** How long each subagent type's steps and whole jobs take: from today's feed and what this browser saw before. */
export function usePaces(events: LiveEvent[]): Map<string, Pace> {
  const seen = useMemo(() => finishedRuns(events), [events]);
  useEffect(() => remember(seen), [seen]);
  const stored = useSyncExternalStore(subscribe, read, () => EMPTY);
  return useMemo(() => pacesOf(stored, seen), [stored, seen]);
}

export interface Eta {
  /** best guess of the time left, ms; null when nothing honest can be said */
  left: number | null;
  /** every step on its list is done: it's wrapping up */
  wrap?: boolean;
  /** Claude waits on an agent with no guess: the real time is likely longer */
  more?: boolean;
  todo?: { done: number; total: number };
  /** the time per step behind the guess */
  stepMs?: number;
  /** that pace is the type's earlier jobs' alone: none of this job's steps is done yet */
  earlier?: boolean;
  /** no pace per step: the guess is how long jobs usually take, the type's own or, never seen finish, every type's */
  usual?: { jobMs: number; anyType?: boolean; over?: boolean };
  /** Claude: the desk whose job sets its time */
  waitsOn?: number;
}

/**
 * One job's time left: the steps still open on its list times the time a step takes. The pace is measured up to the
 * latest step done, so the guess counts down between steps instead of growing, and a step that runs long only leaves
 * the time the steps after it need. While few steps are done the type's earlier pace still weighs in. With no pace
 * per step, how long the type's jobs take, or `every` type's, gives a rougher guess; Claude's own turn never gets one.
 */
export function guessLeft(run: Run, pace: Pace | undefined, clock: number, every?: Pace): Eta | null {
  const todo = run.todo && run.todo.total > 0 ? run.todo : undefined;
  if (todo && todo.done >= todo.total) return { left: 0, wrap: true, todo };
  if (todo) {
    const rest = todo.total - todo.done;
    const moved = todo.done - (run.base ?? 0);
    const own = moved >= 1 && run.stepAt != null ? (run.stepAt - run.start) / moved : null;
    const prior = pace?.stepMs;
    const stepMs =
      own != null && prior != null ? (own * moved + prior * PRIOR_STEPS) / (moved + PRIOR_STEPS) : (own ?? prior);
    if (stepMs != null) {
      const from = own != null ? run.stepAt! : run.start;
      const left = Math.max(from + stepMs * rest - clock, stepMs * (rest - 1), 0);
      return { left, todo, stepMs, earlier: own == null };
    }
  }
  const jobMs = pace?.jobMs ?? every?.jobMs;
  if (jobMs == null) return todo ? { left: null, todo } : null;
  const spent = clock - run.start;
  const left = Math.max(jobMs - spent, spent * OVERRUN);
  return { left, todo, usual: { jobMs, anyType: !pace, over: spent > jobMs } };
}

/** A desk is still on its job until its last stint ends; walking to the desk counts. */
function onJob(s: Stint[] | undefined, clock: number): boolean {
  const last = s?.[s.length - 1];
  return !!last && last.end > clock;
}

/**
 * Time left per desk. A subagent's comes from its own list, or from how long such jobs take; Claude's is the longest
 * of the agents it waits on, or of its own list when that runs longer. Agents sent off in the background count too,
 * after Claude has answered.
 */
export function guessAll(
  runs: (Run | null)[],
  stints: Stint[][],
  paces: Map<string, Pace>,
  clock: number,
): (Eta | null)[] {
  const busy = runs.map((r, i) => !!r && onJob(stints[i], clock));
  const out = runs.map((r, i): Eta | null =>
    i > 0 && r && busy[i] ? (guessLeft(r, paces.get(r.type), clock, paces.get(ALL)) ?? { left: null }) : null,
  );
  let wait: (Eta & { left: number }) | null = null;
  let unknown = false;
  for (let i = 1; i < out.length; i++) {
    const e = out[i];
    if (!e) continue;
    if (e.left == null) unknown = true;
    else if (!wait || e.left > wait.left) wait = { ...e, left: e.left, waitsOn: i };
  }
  const main = runs[0] && busy[0] ? guessLeft(runs[0], undefined, clock) : null;
  if (wait && (main?.left == null || wait.left >= main.left)) {
    out[0] = { left: wait.left, wrap: wait.wrap, more: unknown, waitsOn: wait.waitsOn, todo: main?.todo };
  } else if (main) {
    out[0] = { ...main, more: unknown };
  } else if (unknown) {
    out[0] = { left: null, more: true };
  }
  return out;
}

const MIN = 60_000;

/** "12 min", "2 h 10 min"; above an hour the minutes go in fives. */
export function fmtSpan(ms: number, ui: Ui): string {
  if (ms < MIN) return tr(ui, "< 1 хв", "< 1 min");
  let m = Math.round(ms / MIN);
  if (m >= 60) m = Math.round(m / 5) * 5;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (!h) return tr(ui, `${m} хв`, `${m} min`);
  if (!mm) return tr(ui, `${h} год`, `${h} h`);
  return tr(ui, `${h} год ${mm} хв`, `${h} h ${mm} min`);
}

/** The short form over an agent's head: "≈ 12 min", "≥ 15 min", "wrapping up", or the steps "steps 0/20". */
export function etaText(e: Eta, ui: Ui): string {
  if (e.wrap) return tr(ui, "майже", "wrapping up");
  const steps = e.todo && `${e.todo.done}/${e.todo.total}`;
  if (e.left == null) return steps ? tr(ui, `кроки ${steps}`, `steps ${steps}`) : "";
  if (e.left < MIN) return e.more ? `≥ ${fmtSpan(MIN, ui)}` : fmtSpan(e.left, ui);
  return `${e.more ? "≥" : "≈"} ${fmtSpan(e.left, ui)}`;
}

/** What a guess with no pace per step rests on: "its jobs take ~40 min", "longer than usual (~40 min)". */
export function usualText(e: Eta, ui: Ui): string | null {
  if (!e.usual) return null;
  const job = fmtSpan(e.usual.jobMs, ui);
  if (e.usual.over) return tr(ui, `довше, ніж зазвичай (~${job})`, `longer than usual (~${job})`);
  if (e.usual.anyType) return tr(ui, `роботи агентів тривають ~${job}`, `agents' jobs take ~${job}`);
  return tr(ui, `такі роботи тривають ~${job}`, `its jobs take ~${job}`);
}

/** The agent card's line: the guess and what it rests on, "≈ 1 h 40 min · steps 3/20 · ~5 min a step". */
export function etaDetail(e: Eta, ui: Ui, nameOf: (i: number) => string): string {
  const steps = e.todo && `${e.todo.done}/${e.todo.total}`;
  if (e.left == null) {
    const wait = tr(ui, "час буде з першим зробленим", "a time comes with the first one done");
    if (steps) return `${tr(ui, `кроки ${steps}`, `steps ${steps}`)} · ${wait}`;
    return e.more
      ? tr(ui, "невідомо: не для всіх агентів уже є оцінка", "unknown: some agents have no estimate yet")
      : tr(ui, "невідомо: ще жодна робота агентів не закінчилась", "unknown: no agent's job has finished yet");
  }
  const parts = [etaText(e, ui)];
  if (steps) parts.push(tr(ui, `кроки ${steps}`, `steps ${steps}`));
  if (e.stepMs != null && !e.wrap) {
    const per = fmtSpan(e.stepMs, ui);
    const now = tr(ui, `~${per} на крок`, `~${per} a step`);
    parts.push(e.earlier ? tr(ui, `~${per} на крок, як раніше`, `~${per} a step, as before`) : now);
  }
  const usual = usualText(e, ui);
  if (usual) parts.push(usual);
  if (e.waitsOn != null) parts.push(tr(ui, `чекає на ${nameOf(e.waitsOn)}`, `waiting on ${nameOf(e.waitsOn)}`));
  if (e.more) parts.push(tr(ui, "не для всіх агентів уже є оцінка", "some agents have no estimate yet"));
  return parts.join(" · ");
}
