import { Note, Stint } from "@/lib/cafe/model";
import { AgentDef } from "@/lib/types";
import { Attention } from "./attention";
import { LiveScene, LiveSession, PALETTE, hash } from "./liveModel";
import { LiveEvent } from "./types";
import { tokensOf } from "./usage";

const DONE_HOLD_MS = 8000;
/** a chat that went quiet mid-turn (closed laptop, killed terminal) stops counting as work after this long */
const IDLE_MS = 5 * 60 * 1000;
const TEAM_SEED = 2718;
export const NO_NAME = "без імені";

/** Everyone whose Claude sent something, in order of first appearance; "" is a Claude whose hook carries no name. */
export function teamKeys(events: LiveEvent[]): string[] {
  const seen = new Set<string>();
  for (const e of events) if (e.kind !== "roster") seen.add(e.member ?? "");
  return [...seen];
}

export const memberOf = (s: { member?: string }) => s.member ?? "";
export const memberName = (m: string) => m || NO_NAME;

/** One colour per teammate, unique while the palette lasts, the same everywhere the team shows up. */
export function memberColors(members: string[]): string[] {
  const used = new Set<string>();
  return members.map((m) => {
    const h = hash(m || "?");
    const color = PALETTE.map((_, k) => PALETTE[(h + k) % PALETTE.length]).find((c) => !used.has(c)) ?? PALETTE[h % PALETTE.length];
    used.add(color);
    return color;
  });
}

/** The whole team in one room: a desk per teammate, busy while any of their chats is mid-turn. */
export function buildTeamModel(events: LiveEvent[], members: string[]): LiveScene {
  const index = new Map(members.map((m, i) => [m, i]));
  const evs = events.filter((e) => e.kind !== "roster");
  const origin = evs[0]?.at ?? Date.now();
  const colors = memberColors(members);
  const agents: AgentDef[] = members.map((m, i) => ({
    id: `member-${i}`,
    name: memberName(m),
    role: "учасник команди",
    color: colors[i],
    icon: "bot",
    look: (hash(m || "?") >>> 4) % 16,
  }));
  const stints: Stint[][] = members.map(() => []);
  const notes: Note[][] = members.map(() => []);
  const busy: Set<string>[] = members.map(() => new Set());
  const last: number[] = members.map(() => 0);
  const spent: number[] = members.map(() => 0);

  const open = (i: number, t: number) => {
    const s = stints[i];
    if (!s.length || Number.isFinite(s[s.length - 1].end)) s.push({ start: t, end: Infinity });
  };
  const close = (i: number, t: number) => {
    const s = stints[i];
    if (s.length && !Number.isFinite(s[s.length - 1].end)) s[s.length - 1].end = Math.max(t, s[s.length - 1].start + 1);
  };
  const leave = (i: number, session: string, t: number) => {
    busy[i].delete(session);
    if (!busy[i].size) close(i, t);
  };

  for (const e of evs) {
    const i = index.get(e.member ?? "");
    if (i == null) continue;
    const t = e.at - origin;
    last[i] = t;
    spent[i] += tokensOf(e.usage);
    const key = `e${e.seq}`;
    const who = e.agent ? `${e.agentType ?? "агент"}: ` : "";
    switch (e.kind) {
      case "prompt":
        busy[i].add(e.session);
        open(i, t);
        notes[i].push({ key, ts: t, text: e.text ?? "нове питання", tool: e.tool, tone: "alert" });
        break;
      case "tool":
      case "fail": {
        busy[i].add(e.session);
        open(i, t);
        const tone = e.kind === "fail" ? "error" : "work";
        notes[i].push({ key, ts: t, text: `${who}${e.text ?? "працює"}`, say: e.say, pre: who, tool: e.tool, tone });
        break;
      }
      case "dispatch": {
        busy[i].add(e.session);
        open(i, t);
        const say = { a: "delegate", o: e.target ?? "агенту" };
        notes[i].push({ key, ts: t, text: `доручає ${say.o}`, say, tool: "agent", tone: "work" });
        break;
      }
      case "notify":
        notes[i].push({ key, ts: t, text: e.text ?? "чекає", say: e.say, tool: e.tool, tone: "alert" });
        break;
      case "stop":
        if (e.agent) break;
        leave(i, e.session, t);
        notes[i].push({ key, ts: t, text: "відповів ✓", say: { a: "answered" }, tone: "done" });
        break;
      case "session_end":
        leave(i, e.session, t);
        break;
    }
  }

  members.forEach((_, i) => close(i, last[i] + IDLE_MS));
  spent.forEach((n, i) => {
    if (n > 0) agents[i].tokens = n;
  });
  return { origin, seatOf: {}, model: { agents, stints, notes, trips: [], doneHoldMs: DONE_HOLD_MS, seed: TEAM_SEED } };
}

/** The teammate whose Claude most recently asked for something, or else most recently finished a turn. */
export function teamAlert(sessions: LiveSession[], members: string[]): { seat: number; attn: Attention } | null {
  let best: { seat: number; attn: Attention } | null = null;
  for (const s of sessions) {
    const a = s.attn;
    const seat = members.indexOf(memberOf(s));
    if (!a || seat < 0) continue;
    const better = !best || (a.kind === "ask" && best.attn.kind !== "ask") || (a.kind === best.attn.kind && a.at > best.attn.at);
    if (better) best = { seat, attn: a };
  }
  return best;
}
