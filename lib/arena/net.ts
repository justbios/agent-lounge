import { decide, type Level } from "./ai";
import { AGENT_KINDS, LEADER_KINDS, MAX_LEVEL, SQUAD_MAX, kindOf } from "./content";
import { HEXES, type Hex, hexAt } from "./hex";
import { type Setup, apply, startBattle } from "./rules";
import type { Battle, Command, Fighter } from "./types";

/*
 * The agents' battle between two people in the café: one squad against the other ("arena"), or both squads side by
 * side against the monolith ("raid"). Each brings its own squad; the battle is the same on both screens because the
 * rules are decided by the battle's id and the commands alone, and so is the bot. Only the people's commands travel:
 * each side replays the bot's turns (the monolith's, anything summoned) for itself.
 */

export type NetKind = "arena" | "raid";

/** who gives a unit its commands: the one who sent the invite, the one who took it, or the bot */
export type Seat = "x" | "o" | "bot";

/** how many of each squad go on a raid, the leader first */
export const RAID_SIZE = 3;
/** how the bot plays in a battle between people: the same on both screens, and at its best */
export const NET_LEVEL: Level = "hard";

/** The monolith and its court, a few levels above the two squads together. */
const RAID: [kind: string, up: number][] = [
  ["monolith", 2],
  ["spaghetti", 1],
  ["flakyTest", 1],
  ["nullPointer", 1],
];
const RAID_PLACES: Hex[] = [hexAt(8, 3), hexAt(10, 1), hexAt(10, 6), hexAt(9, 5)];

/**
 * The squad a person brings: all of it to a fight with another squad, its first few to a raid; each fighter just as
 * the other side will read it, so both screens set up the very same battle.
 */
export function squadFor(kind: NetKind, squad: Fighter[]): Fighter[] {
  const list = squad.map(fit).filter((f): f is Fighter => !!f);
  return kind === "raid" ? list.slice(0, RAID_SIZE) : list.slice(0, SQUAD_MAX);
}

const avgLevel = (list: Fighter[]) => Math.round(list.reduce((n, f) => n + f.level, 0) / Math.max(1, list.length));

/** A battle between two people: its kind, the battle itself, and how many on the left are the inviter's. */
export interface NetGame {
  kind: NetKind;
  setup: Setup;
  xs: number;
}

/** The battle the two squads fight, the same for both: `x` is whoever sent the invite. */
export function netGame(kind: NetKind, id: string, x: Fighter[], o: Fighter[]): NetGame {
  if (kind === "arena") return { kind, setup: { id, teams: [x, o] }, xs: x.length };
  const lv = avgLevel([...x, ...o]);
  const bugs = RAID.map(([k, up]): Fighter => {
    const def = kindOf(k)!;
    return { kind: k, name: def.name.en, body: def.body, color: "#9be36b", level: Math.max(1, Math.min(MAX_LEVEL, lv + up)) };
  });
  return { kind, setup: { id, teams: [[...x, ...o], bugs], places: [undefined, RAID_PLACES] }, xs: x.length };
}

/**
 * Who commands each unit: in a fight between squads each person their own side, in a raid each their own fighters;
 * the bot the monolith's side and whatever is summoned.
 */
export function seatOf(g: NetGame, b: Battle, id: number): Seat {
  const u = b.units[id];
  if (!u || u.summoned) return "bot";
  if (g.kind === "arena") return u.team === 0 ? "x" : "o";
  if (u.team === 1) return "bot";
  return id < g.xs ? "x" : "o";
}

/**
 * The battle as it stands after the people's commands so far, the bot playing its turns in between; it stops where
 * a person's command is still to come. `used` is how many of `moves` it took; null when one of them is refused.
 */
export function replay(g: NetGame, moves: Command[]): { battle: Battle; used: number } | null {
  let b = startBattle(g.setup).battle;
  let used = 0;
  for (let steps = 0; b.winner == null && b.active != null && steps < 2000; steps++) {
    const seat = seatOf(g, b, b.active);
    if (seat !== "bot" && used >= moves.length) break;
    const r = apply(b, seat === "bot" ? decide(b, NET_LEVEL) : moves[used++]);
    if (!r) return null;
    b = r.battle;
  }
  return { battle: b, used };
}

const COLOR = /^#([0-9a-f]{3}){1,2}$/i;
const BODY = /^[a-zA-Z][a-zA-Z0-9-]{0,23}$/;
const FIGHTERS = new Set([...AGENT_KINDS, ...LEADER_KINDS].map((k) => k.id));
const LEADERS = new Set(LEADER_KINDS.map((k) => k.id));

function cleanFighter(v: unknown): Fighter | null {
  const f = v as Record<string, unknown> | null;
  const kind = typeof f?.kind === "string" && FIGHTERS.has(f.kind) ? f.kind : null;
  const name = typeof f?.name === "string" ? f.name.trim().slice(0, 24) : "";
  const body = typeof f?.body === "string" && BODY.test(f.body) ? f.body : null;
  const color = typeof f?.color === "string" && COLOR.test(f.color) ? f.color : null;
  const level = f?.level;
  if (!kind || !name || !body || !color || !Number.isInteger(level)) return null;
  return {
    kind,
    name,
    body,
    color,
    level: Math.max(1, Math.min(MAX_LEVEL, level as number)),
    ...(f?.leader === true && LEADERS.has(kind) ? { leader: true } : {}),
  };
}

/** One of this side's fighters as the other side will read it: an odd colour or body gives way to its class's own. */
function fit(f: Fighter): Fighter | null {
  const k = FIGHTERS.has(f.kind) ? kindOf(f.kind) : undefined;
  if (!k) return null;
  return cleanFighter({
    ...f,
    name: f.name.trim() || k.name.en,
    body: BODY.test(f.body) ? f.body : k.body,
    color: COLOR.test(f.color) ? f.color : "#7aa2ff",
    level: Math.round(f.level) || 1,
  });
}

/** A squad as another café sent it: real classes, sane numbers, one leader at most, no more than a squad. */
export function cleanSquad(v: unknown): Fighter[] | null {
  if (!Array.isArray(v) || !v.length || v.length > SQUAD_MAX) return null;
  const out = v.map(cleanFighter);
  if (out.some((f) => !f)) return null;
  const list = out as Fighter[];
  return list.filter((f) => f.leader).length > 1 ? null : list;
}

const hexOk = (v: unknown): v is Hex => Number.isInteger(v) && (v as number) >= 0 && (v as number) < HEXES;

export function cleanCommand(v: unknown): Command | null {
  const c = v as Record<string, unknown> | null;
  switch (c?.t) {
    case "move":
      return hexOk(c.to) ? { t: "move", to: c.to } : null;
    case "attack":
      if (!Number.isInteger(c.target) || (c.target as number) < 0 || (c.target as number) > 200) return null;
      if (c.from !== undefined && !hexOk(c.from)) return null;
      return { t: "attack", target: c.target as number, ...(c.from !== undefined ? { from: c.from as Hex } : {}) };
    case "skill":
      if (!hexOk(c.at) || (c.from !== undefined && !hexOk(c.from))) return null;
      return { t: "skill", at: c.at, ...(c.from !== undefined ? { from: c.from as Hex } : {}) };
    case "ult":
      if (c.at !== undefined && !hexOk(c.at)) return null;
      return { t: "ult", ...(c.at !== undefined ? { at: c.at as Hex } : {}) };
    case "wait":
    case "defend":
    case "yield":
      return { t: c.t };
  }
  return null;
}

/** the longest battle there can be, in people's commands */
const MAX_MOVES = 600;

export interface NetMsg {
  game: string;
  by: string;
  /** the sender's squad, as it fights */
  squad: Fighter[];
  /** the sender has the other side's squad */
  has: boolean;
  /** every person's command so far, both sides', in order */
  moves: Command[];
}

export function cleanNet(p: unknown): NetMsg | null {
  const m = p as Record<string, unknown> | null;
  const game = typeof m?.game === "string" && m.game.length <= 64 ? m.game : null;
  const by = typeof m?.by === "string" && m.by.length <= 64 ? m.by : null;
  const squad = cleanSquad(m?.squad);
  if (!game || !by || !squad || !Array.isArray(m?.moves) || m.moves.length > MAX_MOVES) return null;
  const moves = m.moves.map(cleanCommand);
  if (moves.some((c) => !c)) return null;
  return { game, by, squad, has: m.has === true, moves: moves as Command[] };
}
