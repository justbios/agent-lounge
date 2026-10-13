import { sessionLabel } from "./label";
import { LiveEvent } from "./types";
import { tokensOf } from "./usage";

type Counts = Record<string, number>;

/** One hour of a room, the same shape relay_recap returns and aggregateHourly builds for a local Relay. */
export interface HourRow {
  hour: string;
  prompts: number;
  tools: number;
  dispatches: number;
  fails: number;
  answers: number;
  asks: number;
  sessions: Counts;
  agents: Counts;
  tools_by: Counts;
  projects: Counts;
  mins: Counts;
  tok_in?: number;
  tok_cw?: number;
  tok_cr?: number;
  tok_out?: number;
  tok_agents?: Counts;
  tok_chats?: Counts;
  tok_members?: Counts;
}

export interface TokenSum {
  in: number;
  cw: number;
  cr: number;
  out: number;
  total: number;
  agents: [string, number][];
  chats: [string, number][];
  members: [string, number][];
}

export interface Summary {
  prompts: number;
  tools: number;
  dispatches: number;
  fails: number;
  answers: number;
  asks: number;
  chats: number;
  minutes: number;
  agents: [string, number][];
  tools_by: [string, number][];
  projects: [string, number][];
  firstHour: number | null;
  lastHour: number | null;
  tokens: TokenSum;
}

const HOUR = 3600 * 1000;

function add(a: Counts, b: Counts) {
  for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v;
}

function top(c: Counts, n: number): [string, number][] {
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/** The local Relay keeps no database, so its hours are counted from the events in memory with the same rules as the SQL trigger. */
export function aggregateHourly(events: LiveEvent[]): HourRow[] {
  const rows = new Map<number, HourRow>();
  for (const e of events) {
    if (e.kind === "roster") continue;
    const h = Math.floor(e.at / HOUR) * HOUR;
    let r = rows.get(h);
    if (!r) {
      r = { hour: new Date(h).toISOString(), prompts: 0, tools: 0, dispatches: 0, fails: 0, answers: 0, asks: 0, sessions: {}, agents: {}, tools_by: {}, projects: {}, mins: {} };
      rows.set(h, r);
    }
    const spent = tokensOf(e.usage);
    if (e.usage && spent > 0) {
      r.tok_in = (r.tok_in ?? 0) + e.usage.in;
      r.tok_cw = (r.tok_cw ?? 0) + e.usage.cw;
      r.tok_cr = (r.tok_cr ?? 0) + e.usage.cr;
      r.tok_out = (r.tok_out ?? 0) + e.usage.out;
      add((r.tok_agents ??= {}), { [e.agent ? (e.agentType ?? "агент") : "Claude"]: spent });
      add((r.tok_chats ??= {}), { [e.title ?? sessionLabel(e.cwd)]: spent });
      if (e.member) add((r.tok_members ??= {}), { [e.member]: spent });
    }
    r.sessions[e.session] = 1;
    r.mins[String(new Date(e.at).getUTCMinutes())] = 1;
    if (e.kind === "prompt" && e.tool === "питання") {
      r.prompts += 1;
      if (e.cwd) add(r.projects, { [sessionLabel(e.cwd)]: 1 });
    }
    if (e.kind === "tool") {
      r.tools += 1;
      add(r.tools_by, { [e.tool ?? "?"]: 1 });
    }
    if (e.kind === "dispatch") {
      r.dispatches += 1;
      add(r.agents, { [e.target ?? "agent"]: 1 });
    }
    if (e.kind === "fail") r.fails += 1;
    if (e.kind === "stop") r.answers += 1;
    if (e.kind === "notify") r.asks += 1;
  }
  return [...rows.values()].sort((a, b) => a.hour.localeCompare(b.hour));
}

export function startOfLocalDay(t: number, daysBack = 0): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return d.getTime();
}

export function summarize(rows: HourRow[], from: number, to = Infinity): Summary {
  const tokens: TokenSum = { in: 0, cw: 0, cr: 0, out: 0, total: 0, agents: [], chats: [], members: [] };
  const s: Summary = { prompts: 0, tools: 0, dispatches: 0, fails: 0, answers: 0, asks: 0, chats: 0, minutes: 0, agents: [], tools_by: [], projects: [], firstHour: null, lastHour: null, tokens };
  const byAgent: Counts = {};
  const byChat: Counts = {};
  const byMember: Counts = {};
  const sessions: Counts = {};
  const agents: Counts = {};
  const tools: Counts = {};
  const projects: Counts = {};
  for (const r of rows) {
    const h = Date.parse(r.hour);
    if (h < from || h >= to) continue;
    s.prompts += r.prompts;
    s.tools += r.tools;
    s.dispatches += r.dispatches;
    s.fails += r.fails;
    s.answers += r.answers;
    s.asks += r.asks;
    s.minutes += Object.keys(r.mins).length;
    add(sessions, r.sessions);
    add(agents, r.agents);
    add(tools, r.tools_by);
    add(projects, r.projects);
    tokens.in += r.tok_in ?? 0;
    tokens.cw += r.tok_cw ?? 0;
    tokens.cr += r.tok_cr ?? 0;
    tokens.out += r.tok_out ?? 0;
    add(byAgent, r.tok_agents ?? {});
    add(byChat, r.tok_chats ?? {});
    add(byMember, r.tok_members ?? {});
    s.firstHour ??= h;
    s.lastHour = h;
  }
  s.chats = Object.keys(sessions).length;
  s.agents = top(agents, 5);
  s.tools_by = top(tools, 6);
  s.projects = top(projects, 4);
  tokens.total = tokens.in + tokens.cw + tokens.cr + tokens.out;
  tokens.agents = top(byAgent, 6);
  tokens.chats = top(byChat, 6);
  tokens.members = top(byMember, 8);
  return s;
}

/** Actions (tool calls and handoffs) for each of the last `days` local days, oldest first. */
export function dailyActions(rows: HourRow[], now: number, days = 7): { day: number; actions: number; prompts: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const day = startOfLocalDay(now, days - 1 - i);
    const s = summarize(rows, day, startOfLocalDay(now, days - 2 - i));
    return { day, actions: s.tools + s.dispatches, prompts: s.prompts };
  });
}

/** Consecutive local days, ending today or yesterday, on which the user asked Claude something. */
export function streak(rows: HourRow[], now: number): number {
  let n = 0;
  for (let back = 0; back < 35; back++) {
    const day = startOfLocalDay(now, back);
    const asked = summarize(rows, day, startOfLocalDay(now, back - 1)).prompts > 0;
    if (asked) n += 1;
    else if (back > 0 || n > 0) break;
  }
  return n;
}
