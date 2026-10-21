import { cafeLayout } from "@/lib/cafe/layout";
import { CafeModel, Note, Stint, TripRequest, scheduleTrips } from "@/lib/cafe/model";
import type { Ui } from "@/lib/i18n";
import { AgentDef, PotLevel } from "@/lib/types";
import { Attention, nextAttention, stopText } from "./attention";
import { sessionLabel } from "./label";
import { Checkin, LiveEvent } from "./types";
import { fillOf, tokensOf } from "./usage";

export const CLAUDE_COLOR = "#ff9a62";
export const PALETTE = ["#38bdf8", "#34d399", "#a78bfa", "#fbbf24", "#f472b6", "#a3e635", "#f87171", "#2dd4bf", "#e879f9", "#facc15", "#60a5fa", "#fb7185"];
const DONE_HOLD_MS = 8000;
const MIN_WORK_MS = 1400;
const LIVE_PACE = 1.6;
/** what a compacted chat keeps until its next answer tells the real size: the summary and the system prompt */
const COMPACTED = 0.08;
/** a chat that went quiet mid-turn (Esc, Ctrl+C, a closed laptop) stops counting as work after this long */
export const QUIET_MS = 5 * 60 * 1000;

/** Ends every stint still open at `at`, marked as gone quiet rather than finished. */
export function hushStints(stints: Stint[][], at: (i: number) => number) {
  stints.forEach((s, i) => {
    const open = s[s.length - 1];
    if (open && !Number.isFinite(open.end)) Object.assign(open, { end: Math.max(at(i), open.start + 1), quiet: true });
  });
}

export interface LiveSession {
  id: string;
  /** the chat's name in Claude Code when the hook sent one, else the project folder */
  label: string;
  project: string;
  title?: string;
  cwd?: string;
  first: number;
  last: number;
  count: number;
  ended: boolean;
  /** the latest thing the user actually typed, to tell chats in the same folder apart */
  ask?: string;
  attn: Attention | null;
  /** team café: the teammate whose Claude this chat is */
  member?: string;
}

/** The palette colour a subagent type usually gets in the café, for places outside the scene such as the day card. */
/** The note a finished turn leaves: answered, or broke off on the limit or an error. */
export function stopNote(e: LiveEvent, key: string, ts: number, ui: Ui = "uk"): Note {
  if (!e.err) return { key, ts, text: ui === "en" ? "answered ✓" : "відповів ✓", say: { a: "answered" }, tone: "done" };
  return { key, ts, text: stopText(e.err, ui), say: e.say, tone: "error" };
}

export function agentColor(type: string): string {
  return PALETTE[hash(type) % PALETTE.length];
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function listSessions(events: LiveEvent[]): LiveSession[] {
  const map = new Map<string, LiveSession>();
  const worked = new Set<string>();
  for (const e of events) {
    if (e.kind === "roster") continue;
    if (e.kind !== "prompt" && e.kind !== "session_end") worked.add(e.session);
    const s = map.get(e.session);
    if (!s) {
      map.set(e.session, {
        id: e.session,
        label: "",
        project: sessionLabel(e.cwd),
        title: e.title,
        cwd: e.cwd,
        first: e.at,
        last: e.at,
        count: 1,
        ended: e.kind === "session_end",
        ask: e.kind === "prompt" && e.tool === "питання" ? e.text : undefined,
        attn: nextAttention(null, e),
        member: e.member,
      });
      continue;
    }
    s.attn = nextAttention(s.attn, e);
    s.last = e.at;
    s.count += 1;
    if (e.kind === "session_end") s.ended = true;
    if (!s.member && e.member) s.member = e.member;
    if (e.title) s.title = e.title;
    if (e.kind === "prompt" && e.tool === "питання") s.ask = e.text;
    if (!s.cwd && e.cwd) {
      s.cwd = e.cwd;
      s.project = sessionLabel(e.cwd);
    }
  }
  for (const s of map.values()) s.label = s.title ?? s.project;
  const list = [...map.values()].filter((s) => !(s.ended && !worked.has(s.id))).sort((a, b) => b.last - a.last);
  const seen = new Map<string, number>();
  for (const s of [...list].sort((a, b) => a.first - b.first)) {
    const k = `${s.member ?? ""}|${s.label}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) s.label = `${s.label} #${n}`;
  }
  return list;
}

/** The agent list a cloud hook sent with the session's latest prompt; null when none came (local mode reads the disk). */
export function sessionRoster(events: LiveEvent[], session: string): string[] | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.session === session && e.kind === "roster") return e.agents ?? [];
  }
  return null;
}

interface Seat {
  type: string;
  busy: boolean;
  parent: number;
}

interface Pending {
  from: number;
  type: string;
  label: string;
  ts: number;
  used: boolean;
}

/** The job a desk is on right now, for the time-left guess; scene ms like the stints. */
export interface Run {
  start: number;
  /** the subagent type; "main" for Claude's own desk */
  type: string;
  /** how far its task list has got, when it keeps one */
  todo?: { done: number; total: number };
  /** steps already done when this job first showed its list: the pace counts only the ones done since */
  base?: number;
  /** when the latest of those steps was done */
  stepAt?: number;
}

export interface LiveScene {
  model: CafeModel;
  origin: number;
  /** subagent instance id → desk index */
  seatOf: Record<string, number>;
  /** per desk: the job still open, null when it has none */
  runs?: (Run | null)[];
  /** subagent jobs that came back, oldest first; scene ms */
  finished?: { seat: number; start: number; end: number }[];
  /** when Claude's latest turn began, scene ms: the pipeline runs from there */
  turn?: number;
  /** what Claude last said about its whole job, `at` in scene ms */
  told?: Checkin;
}

/** One task-list change applied to a run's counts: TodoWrite sends the whole list, the Task tools one step. */
export function stepTodo(run: Run, e: LiveEvent, at: number) {
  const before = run.todo?.done ?? 0;
  if (e.todo) {
    run.base ??= e.todo.done;
    run.todo = { ...e.todo };
  } else {
    const t = run.todo ?? { done: 0, total: 0 };
    run.base ??= t.done;
    if (e.todoStep === "add") t.total += 1;
    else if (e.todoStep === "done") t.done += 1;
    else if (e.todoStep === "drop") t.total -= 1;
    t.total = Math.max(t.total, t.done);
    run.todo = t;
  }
  if (run.todo.done > before && run.todo.done > run.base) run.stepAt = at;
}

/** Claude's next turn: a task list it left unfinished carries over, the Task tools keep their steps between turns. */
function mainRun(start: number, left: Run | null): Run {
  const todo = left?.todo;
  if (!todo || todo.done >= todo.total) return { start, type: "main" };
  return { start, type: "main", todo: { ...todo }, base: todo.done };
}

/** Turns one session's hook events into the café: desk 0 is the main Claude, every subagent type gets its own desk. */
export function buildLiveModel(events: LiveEvent[], session: string, roster: string[] = [], ui: Ui = "uk"): LiveScene {
  const en = ui === "en";
  const evs = events.filter((e) => e.session === session && (e.kind !== "roster" || e.compact));
  const origin = evs[0]?.at ?? Date.now();
  const seed = hash(session) % 100000;

  const agents: AgentDef[] = [{ id: "main", name: "Claude", role: en ? "main session" : "головна сесія", color: CLAUDE_COLOR, icon: "bot", look: 2 }];
  const seats: Seat[] = [{ type: "main", busy: true, parent: 0 }];
  const stints: Stint[][] = [[]];
  const notes: Note[][] = [[]];
  const spent: number[] = [0];
  const pots: PotLevel[][] = [[]];
  const runs: (Run | null)[] = [null];
  let lastRun: Run | null = null;
  let mainLast = -Infinity;
  let told: Checkin | undefined;
  const finished: { seat: number; start: number; end: number }[] = [];
  const bySubagent = new Map<string, number>();
  const pending: Pending[] = [];
  const dispatchReqs: TripRequest[] = [];
  const returns: { seat: number; ts: number; key: string; stint?: Stint }[] = [];

  const open = (i: number, t: number) => {
    const s = stints[i];
    if (!s.length || Number.isFinite(s[s.length - 1].end)) s.push({ start: t, end: Infinity });
  };
  const close = (i: number, t: number) => {
    const s = stints[i];
    if (s.length && !Number.isFinite(s[s.length - 1].end)) s[s.length - 1].end = Math.max(t, s[s.length - 1].start + 1);
  };
  const owner = new Map<Note, Stint>();
  const note = (i: number, n: Note) => {
    notes[i].push(n);
    const s = stints[i];
    if (i > 0 && s.length) owner.set(n, s[s.length - 1]);
  };

  const claim = (seat: number, t: number, key: string) => {
    const p = pending.find((x) => !x.used && x.type === seats[seat].type);
    if (!p) return;
    p.used = true;
    seats[seat].parent = p.from;
    dispatchReqs.push({ key: `${key}-go`, from: p.from, to: seat, ts: p.ts, label: `${p.label} → ${agents[seat].name}` });
    note(seat, { key: `${key}-task`, ts: t, text: p.label, tool: "завдання", tone: "work" });
  };

  const addSeat = (type: string): number => {
    const i = seats.length;
    const twins = seats.filter((s) => s.type === type).length;
    const h = hash(type);
    const used = new Set(agents.map((a) => a.color));
    const hue = Array.from({ length: PALETTE.length }, (_, k) => PALETTE[(h + k) % PALETTE.length]).find((c) => !used.has(c));
    seats.push({ type, busy: false, parent: 0 });
    agents.push({
      id: `seat-${i}`,
      name: twins ? `${type} ${twins + 1}` : type,
      role: en ? "subagent" : "субагент",
      color: hue ?? PALETTE[h % PALETTE.length],
      icon: "cpu",
      look: (h >>> 4) % 16,
    });
    stints.push([]);
    notes.push([]);
    spent.push(0);
    pots.push([]);
    runs.push(null);
    return i;
  };

  const seatFor = (id: string, type: string, t: number, key: string): number => {
    const known = bySubagent.get(id);
    if (known != null) return known;
    let i = seats.findIndex((s, k) => k > 0 && s.type === type && !s.busy);
    if (i < 0) i = addSeat(type);
    seats[i].busy = true;
    bySubagent.set(id, i);
    runs[i] = { start: t, type };
    open(i, t);
    claim(i, t, key);
    return i;
  };

  for (const type of roster) addSeat(type);

  for (const e of evs) {
    const t = e.at - origin;
    const key = `e${e.seq}`;
    const actor = e.agent ? seatFor(e.agent, e.agentType ?? "agent", t, key) : 0;
    spent[actor] += tokensOf(e.usage);
    if (e.ctx) pots[actor].push({ ts: t, fill: fillOf(e.ctx) });
    const working = e.kind === "tool" || e.kind === "fail" || e.kind === "dispatch";
    if (actor === 0 && working && !runs[0]) runs[0] = mainRun(t, lastRun);
    const run = runs[actor];
    if (run && (e.todo || e.todoStep)) stepTodo(run, e, t);
    if (actor === 0 && e.checkin && e.checkin.at - origin >= (told?.at ?? -Infinity)) {
      told = { ...e.checkin, at: e.checkin.at - origin };
    }

    switch (e.kind) {
      case "prompt":
        if (!runs[0] || t - mainLast > QUIET_MS) runs[0] = mainRun(t, runs[0] ?? lastRun);
        open(0, t);
        note(0, { key, ts: t, text: e.text ?? (en ? "new prompt" : "нове питання"), tool: e.tool, tone: "alert" });
        break;
      case "tool":
        open(actor, t);
        note(actor, { key, ts: t, text: e.text ?? (en ? "working" : "працює"), say: e.say, tech: e.tech, tool: e.tool, tone: "work" });
        break;
      case "fail":
        open(actor, t);
        note(actor, {
          key,
          ts: t,
          text: e.text ?? (en ? "error" : "помилка"),
          say: e.say ?? { a: "fail" },
          tech: e.tech,
          tool: e.tool,
          tone: "error",
        });
        break;
      case "notify":
        note(actor, {
          key,
          ts: t,
          text: e.text ?? (en ? "waiting for you" : "чекає на тебе"),
          say: e.say ?? { a: e.need === "permission" ? "wait_perm" : "wait_you" },
          tech: e.tech,
          tool: e.tool,
          tone: "alert",
        });
        break;
      case "dispatch": {
        open(actor, t);
        const type = e.target ?? "general-purpose";
        pending.push({ from: actor, type, label: e.text ?? (en ? "new task" : "нове завдання"), ts: t, used: false });
        const say = { a: "delegate", o: type };
        note(actor, { key, ts: t, text: en ? `hands off to ${type}` : `доручає ${type}`, say, tool: "agent", tone: "work" });
        break;
      }
      case "sub_start":
        seats[actor].busy = true;
        open(actor, t);
        pots[actor].push({ ts: t, fill: 0 });
        break;
      case "roster":
        pots[0].push({ ts: t, fill: COMPACTED });
        break;
      case "sub_stop": {
        open(actor, t);
        close(actor, t);
        seats[actor].busy = false;
        if (runs[actor]) finished.push({ seat: actor, start: runs[actor].start, end: t });
        runs[actor] = null;
        note(actor, { key, ts: t, text: en ? "done ✓" : "готово ✓", say: { a: "done" }, tone: "done" });
        const own = stints[actor];
        returns.push({ seat: actor, ts: t, key: `${key}-back`, stint: own[own.length - 1] });
        break;
      }
      case "stop":
        lastRun = runs[0];
        runs[0] = null;
        close(0, t);
        note(0, stopNote(e, key, t, ui));
        break;
      case "session_end":
        stints.forEach((_, i) => close(i, t));
        runs.fill(null);
        lastRun = null;
        told = undefined;
        break;
    }
    if (actor === 0) mainLast = t;
  }

  const hush = (evs[evs.length - 1]?.at ?? origin) - origin + QUIET_MS;
  hushStints(stints, () => hush);

  const lay = cafeLayout(agents.length, seed);
  const going = scheduleTrips(dispatchReqs, lay, LIVE_PACE);

  for (const tr of going) {
    const s = stints[tr.to].find((x) => x.end > tr.ts && x.start >= tr.ts - 1);
    if (!s) continue;
    if (s.start < tr.arrive) s.start = tr.arrive;
    if (s.end < s.start + MIN_WORK_MS) s.end = s.start + MIN_WORK_MS;
  }

  const backReqs: TripRequest[] = returns.map((r) => {
    const parent = seats[r.seat].parent;
    const ts = Math.max(r.ts, r.stint?.end ?? r.ts);
    const label = `${en ? "result" : "результат"} → ${agents[parent].name}`;
    return { key: r.key, from: r.seat, to: parent, ts, label, say: { a: "returns" } };
  });

  for (const [n, s] of owner) n.ts = n.tone === "done" ? Math.max(n.ts, s.end) : Math.max(n.ts, s.start);
  for (const ns of notes) ns.sort((a, b) => a.ts - b.ts);

  spent.forEach((n, i) => {
    if (n > 0) agents[i].tokens = n;
  });
  pots.forEach((p, i) => {
    if (p.length) agents[i].pot = p;
  });
  return {
    origin,
    seatOf: Object.fromEntries(bySubagent),
    runs,
    finished,
    turn: (runs[0] ?? lastRun)?.start,
    told,
    model: {
      agents,
      stints,
      notes,
      trips: scheduleTrips([...dispatchReqs, ...backReqs], lay, LIVE_PACE),
      doneHoldMs: DONE_HOLD_MS,
      seed,
    },
  };
}
