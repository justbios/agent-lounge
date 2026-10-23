import { COLS, type Hex, HEXES, ROWS, area, colOf, dirTo, distance, hexAt, neighbours, pathTo, reach, rowOf, step } from "./hex";
import { type KindDef, SUBAGENT, type SkillDef, kindOf, scaled } from "./content";
import { Dice, seedOf } from "./rng";
import { BAD, GOOD } from "./types";
import type { Battle, Beat, Command, Fighter, Goal, Status, StatusId, Strike, Team, Unit } from "./types";

/**
 * The rules of a battle, the same on every screen: `apply` takes a battle and one command for the unit whose turn it
 * is, and gives the battle after it with the beats that happened, in order, for the screen to play. Nothing here reads
 * the clock or Math.random, so a battle is decided by its id and its commands alone.
 */

/** After this many rounds the side with more of its health left wins. */
export const ROUND_CAP = 12;
/** the answers a reviewer or the monolith has each round: as good as unlimited */
const ALL = 99;
const CRIT_CHANCE = 0.1;
const CRIT = 1.5;
/** how much of every hit goes into the meters of the side that struck and the side struck */
const METER_RATE = 0.25;
export const METER_FULL = 100;
/** a defending unit takes this much of a hit */
const DEFEND = 0.7;
const MARKED = 1.3;
/** what neither moves nor fights: it never gets a turn */
const STILL = new Set(["prod"]);
/** what no push moves */
const HEAVY = new Set(["monolith", "deadlock", "prod"]);

/** The skills that strike someone, and how. */
const STRIKES: Record<string, Hit> = {
  refactor: { mult: 1.3, skill: true },
  requestChanges: { skill: true },
  findBug: { shot: true, mult: 0.8, skill: true },
  deepSearch: { mult: 1.4, skill: true },
};

export interface Setup {
  id: string;
  teams: [Fighter[], Fighter[]];
  goal?: Goal;
  /** obstacles; left out, a few are scattered from the id, the same on both halves */
  rocks?: Hex[];
  /** where each side stands, fighter by fighter; left out, a side lines up along its edge */
  places?: [Hex[]?, Hex[]?];
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export const other = (t: Team): Team => (t === 0 ? 1 : 0);

/** The hex across the field: the left side's places and rocks are the right side's, mirrored. */
export function mirror(h: Hex): Hex {
  const row = rowOf(h);
  return hexAt((row & 1 ? COLS - 2 : COLS - 1) - colOf(h), row);
}

/** Where a side of `n` lines up: down its edge, spread over the rows, a second line if it has to. */
function lineUp(n: number, team: Team): Hex[] {
  const out: Hex[] = [];
  for (let i = 0; i < n; i++) {
    const col = Math.floor(i / ROWS);
    const inCol = Math.min(n - col * ROWS, ROWS);
    const row = Math.min(ROWS - 1, Math.round((((i % ROWS) + 0.5) * ROWS) / inCol - 0.5));
    out.push(team === 0 ? hexAt(col, row) : mirror(hexAt(col, row)));
  }
  return out;
}

/** A few obstacles in the middle, mirrored so neither side has the better ground, never walling anyone off. */
export function scatter(id: string): Hex[] {
  const dice = new Dice(seedOf(`${id}:rocks`));
  const pairs = dice.int(2, 3);
  const rocks = new Set<Hex>();
  for (let tries = 0; rocks.size < pairs * 2 && tries < 60; tries++) {
    const h = hexAt(dice.int(2, Math.floor(COLS / 2) - 1), dice.int(0, ROWS - 1));
    const m = mirror(h);
    if (rocks.has(h) || h === m) continue;
    rocks.add(h);
    rocks.add(m);
    const { steps } = reach(hexAt(0, 0), HEXES, (x) => rocks.has(x));
    if (steps.size < HEXES - rocks.size) {
      rocks.delete(h);
      rocks.delete(m);
    }
  }
  return [...rocks].sort((a, b) => a - b);
}

function makeUnit(id: number, team: Team, f: Fighter, hex: Hex): Unit {
  const k = kindOf(f.kind) ?? SUBAGENT;
  const st = scaled(k, f.level);
  return {
    id,
    team,
    kind: k.id,
    name: f.name.slice(0, 24),
    body: f.body,
    color: f.color,
    level: f.level,
    hex,
    hp: st.hp,
    maxHp: st.hp,
    atk: st.atk,
    def: st.def,
    dmg: st.dmg,
    speed: k.speed,
    init: k.speed,
    range: k.range,
    flying: !!k.flying,
    retaliations: STILL.has(k.id) ? 0 : k.answersAll ? ALL : 1,
    cooldown: 0,
    statuses: [],
    waited: false,
    began: false,
    defending: false,
    dead: false,
    ...(f.leader && k.ult ? { leader: true } : {}),
  };
}

/** A new battle, its first round begun and the first unit to act chosen. */
export function startBattle(s: Setup): { battle: Battle; beats: Beat[] } {
  const rocks = s.rocks ?? scatter(s.id);
  const units: Unit[] = [];
  ([0, 1] as Team[]).forEach((team) => {
    const places = s.places?.[team] ?? lineUp(s.teams[team].length, team);
    s.teams[team].forEach((f, i) => units.push(makeUnit(units.length, team, f, places[i])));
  });
  const b: Battle = {
    id: s.id,
    seed: seedOf(s.id),
    round: 0,
    units,
    rocks: rocks.filter((h) => !units.some((u) => u.hex === h)),
    queue: [],
    later: [],
    active: null,
    meter: [0, 0],
    strikes: [],
    rollback: [false, false],
    goal: s.goal ?? { kind: "wipe" },
    phase: 0,
    winner: null,
  };
  const f = new Fight(b);
  f.advance();
  return { battle: f.done(), beats: f.beats };
}

/** The battle after the active unit carries out `cmd`, or null when the rules do not allow it. */
export function apply(b0: Battle, cmd: Command): { battle: Battle; beats: Beat[] } | null {
  if (b0.winner != null || b0.active == null) return null;
  const f = new Fight(clone(b0));
  return f.command(cmd) ? { battle: f.done(), beats: f.beats } : null;
}

export const has = (u: Unit, id: StatusId): boolean => u.statuses.some((s) => s.id === id);
export const statusOf = (u: Unit, id: StatusId): Status | undefined => u.statuses.find((s) => s.id === id);
export const kindDef = (u: Unit): KindDef => kindOf(u.kind) ?? SUBAGENT;
export const shieldOf = (u: Unit): number => statusOf(u, "shield")?.power ?? 0;

export const alive = (b: Battle, team?: Team): Unit[] =>
  b.units.filter((u) => !u.dead && (team == null || u.team === team));
export const unitAt = (b: Battle, h: Hex): Unit | undefined => b.units.find((u) => !u.dead && u.hex === h);
export const free = (b: Battle, h: Hex): boolean => !b.rocks.includes(h) && !unitAt(b, h);
export const still = (u: Unit): boolean => STILL.has(u.kind);

const twinned = (b: Battle, u: Unit): boolean =>
  u.kind === "raceCondition" && alive(b, u.team).some((t) => t.kind === "raceCondition" && t.id !== u.id);

/** How far a unit goes this turn: its speed with what twins, rage, a plan and slowness make of it. */
export function speedOf(b: Battle, u: Unit): number {
  if (still(u)) return 0;
  let v = u.speed;
  if (twinned(b, u)) v += 2;
  if (has(u, "enraged")) v += 1;
  if (has(u, "hasted")) v += 2;
  if (has(u, "slow")) v -= 2;
  return Math.max(1, v);
}

/** Who acts first: speed, and a strategist on the side puts everyone a step ahead. */
export const initOf = (b: Battle, u: Unit): number =>
  speedOf(b, u) + (alive(b, u.team).some((t) => t.kind === "planner") ? 1 : 0);

/** Allies standing next to their leader fight better. */
const aura = (b: Battle, u: Unit): number =>
  alive(b, u.team).some((t) => t.leader && t.id !== u.id && distance(t.hex, u.hex) === 1) ? 2 : 0;

const enemiesNear = (b: Battle, u: Unit): Unit[] =>
  alive(b, other(u.team)).filter((t) => distance(t.hex, u.hex) === 1);

/** Rooted, or caught next to a deadlock. */
export const stuck = (b: Battle, u: Unit): boolean =>
  has(u, "root") || enemiesNear(b, u).some((t) => t.kind === "deadlock");

/** A shooter shoots unless an enemy stands next to it. */
export const canShoot = (b: Battle, u: Unit): boolean => u.range > 0 && enemiesNear(b, u).length === 0;

/** The one enemy a taunted unit may hit, while that enemy stands. */
function taunter(b: Battle, u: Unit): number | null {
  const s = statusOf(u, "taunted");
  if (s?.by == null) return null;
  const t = b.units[s.by];
  return t && !t.dead ? t.id : null;
}

/** Where a skill can be aimed: each hex, with the hexes the unit may step to first (null when it stays put). */
export type Targets = Map<Hex, Hex[] | null>;

export interface SkillChoice {
  def: SkillDef;
  ready: boolean;
  /** why it is not ready */
  why?: "cooldown" | "silenced" | "meter" | "noTarget";
  targets: Targets;
}

export interface Options {
  unit: Unit;
  /** where it can walk or fly, with the way there */
  moves: Map<Hex, Hex[]>;
  /** enemies it can strike hand to hand, with the hexes it can strike from */
  melee: Map<number, Hex[]>;
  /** enemies it can shoot */
  shots: number[];
  skill: SkillChoice | null;
  ult: SkillChoice | null;
  canWait: boolean;
}

/** Everything the active unit may do right now. */
export function options(b: Battle): Options | null {
  if (b.winner != null || b.active == null) return null;
  const u = b.units[b.active];
  const rocks = new Set(b.rocks);
  const blocked = (h: Hex) => rocks.has(h) || b.units.some((x) => !x.dead && x.id !== u.id && x.hex === h);
  const moves = new Map<Hex, Hex[]>();
  const fixed = stuck(b, u);
  if (!fixed) {
    const r = reach(u.hex, speedOf(b, u), blocked, u.flying);
    for (const h of r.steps.keys()) if (h !== u.hex) moves.set(h, pathTo(r.parent, u.hex, h, u.flying));
  }
  const standOn = [u.hex, ...moves.keys()];
  const forced = taunter(b, u);
  const foes = alive(b, other(u.team)).filter((t) => forced == null || t.id === forced);

  const melee = new Map<number, Hex[]>();
  for (const t of foes) {
    const from = standOn.filter((h) => distance(h, t.hex) === 1);
    if (from.length) melee.set(t.id, from);
  }
  const shots = canShoot(b, u) ? foes.map((t) => t.id) : [];

  const k = kindDef(u);
  const silenced = has(u, "silence");
  const choice = (def: SkillDef, waiting: SkillChoice["why"] | null): SkillChoice => {
    const targets = aimAt(b, u, def, foes, melee, shots, fixed);
    const why = silenced ? "silenced" : (waiting ?? (targets.size ? undefined : "noTarget"));
    return { def, ready: !why, ...(why ? { why } : {}), targets };
  };
  const skill = k.skill ? choice(k.skill, u.cooldown > 0 ? "cooldown" : null) : null;
  const ult = k.ult && u.leader ? choice(k.ult, b.meter[u.team] < METER_FULL ? "meter" : null) : null;
  return { unit: u, moves, melee, shots, skill, ult, canWait: !u.waited };
}

function aimAt(
  b: Battle,
  u: Unit,
  def: SkillDef,
  foes: Unit[],
  melee: Map<number, Hex[]>,
  shots: number[],
  fixed: boolean,
): Targets {
  const targets: Targets = new Map();
  const reachOf = typeof def.reach === "number" ? def.reach : 1;
  if (def.aim === "self") targets.set(u.hex, null);
  else if (def.aim === "ally") {
    for (const t of alive(b, u.team))
      if (!still(t) && !(def.id === "plan" && t.id === u.id) && distance(u.hex, t.hex) <= reachOf) targets.set(t.hex, null);
  } else if (def.aim === "hex") {
    for (let h = 0; h < HEXES; h++) if (distance(u.hex, h) <= reachOf && !b.rocks.includes(h)) targets.set(h, null);
  } else if (def.reach === "melee") {
    for (const [id, from] of melee) targets.set(b.units[id].hex, from);
  } else if (def.id === "deepSearch") {
    for (const t of foes) {
      const from = neighbours(t.hex).filter(
        (h) => h === u.hex || (!fixed && free(b, h) && distance(u.hex, h) <= reachOf),
      );
      if (from.length) targets.set(t.hex, from);
    }
  } else if (def.id === "findBug") {
    for (const id of shots) targets.set(b.units[id].hex, null);
  } else {
    for (const t of foes) if (distance(u.hex, t.hex) <= reachOf) targets.set(t.hex, null);
  }
  return targets;
}

/** Is `cmd` one the active unit may give? */
function allowed(o: Options, cmd: Command): boolean {
  switch (cmd.t) {
    case "move":
      return o.moves.has(cmd.to);
    case "attack":
      return cmd.from == null ? o.shots.includes(cmd.target) : !!o.melee.get(cmd.target)?.includes(cmd.from);
    case "skill":
    case "ult": {
      const c = cmd.t === "skill" ? o.skill : o.ult;
      if (!c?.ready) return false;
      const at = cmd.at ?? o.unit.hex;
      const from = c.targets.get(at);
      if (from === undefined) return false;
      const stepTo = cmd.t === "skill" ? cmd.from : undefined;
      return from == null ? stepTo == null : stepTo != null && from.includes(stepTo);
    }
    case "wait":
      return o.canWait;
    case "defend":
    case "yield":
      return true;
  }
}

/** What a hit will do, before it is struck: the damage range, and how much comes back. */
export interface Estimate {
  target: number;
  min: number;
  max: number;
  /** it kills even at its least */
  kills: boolean;
  /** it may kill, at its most */
  mayKill: boolean;
  /** the answer, if the target lives to give one */
  back?: [number, number];
  /** the chance it misses outright */
  miss?: number;
}

/** The damage a hit or a striking skill would do, for the screen to show before it is chosen. */
export function estimate(b: Battle, cmd: Command): Estimate | null {
  if (b.active == null) return null;
  const f = new Fight(clone(b));
  const me = f.b.units[b.active];
  let target: Unit | undefined;
  let hit: Hit;
  if (cmd.t === "attack") {
    target = f.b.units[cmd.target];
    hit = { shot: cmd.from == null };
  } else if (cmd.t === "skill" && STRIKES[kindDef(me).skill?.id ?? ""]) {
    target = unitAt(f.b, cmd.at);
    hit = STRIKES[kindDef(me).skill!.id];
  } else if (cmd.t === "ult" && kindDef(me).ult?.id === "cloudTask" && cmd.at != null) {
    target = unitAt(f.b, cmd.at);
    hit = { power: f.power(me, [58, 75]), pierce: true, noCrit: true, blast: true };
  } else return null;
  if (!target || target.team === me.team) return null;
  if ((cmd.t === "attack" || cmd.t === "skill") && cmd.from != null) me.hex = cmd.from;
  const [lo, hi] = f.range(me, target, hit);
  const life = target.hp + (hit.pierce ? 0 : shieldOf(target));
  const out: Estimate = { target: target.id, min: lo, max: hi, kills: lo >= life, mayKill: hi >= life };
  const answers = cmd.t === "attack" && cmd.from != null && target.retaliations > 0 && !has(target, "stun");
  if (answers && !out.kills) out.back = f.range({ ...target, hp: Math.max(1, target.hp - hi) }, me, {});
  const miss =
    (me.kind === "flakyTest" && hit.shot ? 0.35 : 0) + (target.kind === "nullPointer" && !hit.blast ? 0.25 : 0);
  if (miss) out.miss = miss;
  return out;
}

interface Hit {
  mult?: number;
  shot?: boolean;
  /** a fixed damage range instead of the attacker's own */
  power?: [number, number];
  /** goes through defence and shields */
  pierce?: boolean;
  noCrit?: boolean;
  /** from above, not from a hand or a bow: nothing dodges it, and the striker's boosts do not count */
  blast?: boolean;
  /** the attack it lands with, for a blast whose caster may be gone */
  atk?: number;
  skill?: boolean;
}

/** One command's worth of battle: the state it changes, its dice, and the beats it records. */
class Fight {
  b: Battle;
  beats: Beat[] = [];
  private dice: Dice;

  constructor(b: Battle) {
    this.b = b;
    this.dice = new Dice(b.seed);
  }

  done(): Battle {
    this.b.seed = this.dice.state;
    return this.b;
  }

  private beat(x: Beat) {
    this.beats.push(x);
  }

  command(cmd: Command): boolean {
    const o = options(this.b);
    if (!o || !allowed(o, cmd)) return false;
    const u = o.unit;
    const path = (h: Hex | undefined) => (h != null ? (o.moves.get(h) ?? []) : []);
    switch (cmd.t) {
      case "move":
        this.walk(u, cmd.to, path(cmd.to));
        break;
      case "attack":
        this.attack(u, this.b.units[cmd.target], cmd.from, path(cmd.from));
        break;
      case "skill":
        this.skill(u, kindDef(u).skill!, cmd.at, cmd.from, path(cmd.from));
        break;
      case "ult":
        this.ult(u, kindDef(u).ult!, cmd.at ?? u.hex);
        // an ultimate is called on top of the turn, not instead of it
        this.check();
        return true;
      case "wait":
        u.waited = true;
        this.b.later.push(u.id);
        this.b.later.sort((x, y) => initOf(this.b, this.b.units[x]) - initOf(this.b, this.b.units[y]) || x - y);
        this.beat({ e: "wait", unit: u.id });
        this.advance();
        return true;
      case "defend":
        u.defending = true;
        this.beat({ e: "defend", unit: u.id });
        break;
      case "yield":
        this.over(other(u.team));
        return true;
    }
    this.endTurn(u);
    return true;
  }

  private walk(u: Unit, to: Hex, path: Hex[]) {
    if (to === u.hex) return;
    u.hex = to;
    this.beat({ e: "move", unit: u.id, path, fly: u.flying });
  }

  private attack(u: Unit, t: Unit, from: Hex | undefined, path: Hex[]) {
    if (from == null) {
      this.beat({ e: "hit", unit: u.id, target: t.id, shot: true });
      const near = alive(this.b, t.team).filter((x) => x.id !== t.id && distance(x.hex, t.hex) === 1);
      this.hurt(u, t, { shot: true });
      if (u.kind === "devops") for (const n of near) this.hurt(u, n, { shot: true, mult: 0.3, noCrit: true });
    } else {
      this.walk(u, from, path);
      this.beat({ e: "hit", unit: u.id, target: t.id, shot: false });
      this.hurt(u, t, {});
      this.tangle(u, t);
      this.answer(t, u);
    }
    this.spend(u);
  }

  /** The target strikes back, if it still stands and has an answer left this round. */
  private answer(t: Unit, u: Unit) {
    if (t.dead || u.dead || has(t, "stun") || t.retaliations <= 0 || distance(t.hex, u.hex) !== 1) return;
    if (t.retaliations < ALL) t.retaliations -= 1;
    this.beat({ e: "hit", unit: t.id, target: u.id, shot: false, answer: true });
    this.hurt(t, u, {});
    this.tangle(t, u);
    this.spend(t);
  }

  /** Spaghetti holds whoever it hits. */
  private tangle(by: Unit, t: Unit) {
    if (by.kind === "spaghetti" && !t.dead) this.status(t, "root", 1);
  }

  /** An inspired unit's boost is gone once it has struck. */
  private spend(u: Unit) {
    if (has(u, "inspired")) this.unstatus(u, "inspired");
  }

  /** A skill's own damage, grown with its caster's level as the caster's hits grow. */
  power(u: Unit, base: [number, number]): [number, number] {
    const up = 1 + 0.05 * Math.max(0, u.level - 1);
    return [Math.round(base[0] * up), Math.round(base[1] * up)];
  }

  private skill(u: Unit, def: SkillDef, at: Hex, from: Hex | undefined, path: Hex[]) {
    const t = unitAt(this.b, at);
    const cast = (hexes?: Hex[]) => this.beat({ e: "cast", unit: u.id, skill: def.id, at, ...(hexes ? { hexes } : {}) });
    u.cooldown = def.cooldown;
    const strike = STRIKES[def.id];
    if (strike && t) {
      if (def.id === "deepSearch") {
        if (from != null && from !== u.hex) {
          u.hex = from;
          this.beat({ e: "blink", unit: u.id, to: from });
        }
      } else if (from != null) this.walk(u, from, path);
      cast();
      this.beat({ e: "hit", unit: u.id, target: t.id, shot: !!strike.shot, skill: def.id });
      this.hurt(u, t, strike);
      this.spend(u);
      if (t.dead) return;
      if (def.id === "refactor") for (const s of [...t.statuses]) if (GOOD.includes(s.id)) this.unstatus(t, s.id);
      if (def.id === "findBug") this.status(t, "marked", 2);
      if (def.id === "requestChanges") {
        this.shove(t, dirTo(u.hex, t.hex), 2);
        if (!t.dead) this.status(t, "silence", 1);
      }
      return;
    }
    switch (def.id) {
      case "fridayDeploy":
      case "quake": {
        const quake = def.id === "quake";
        const hexes = (quake ? area(u.hex, 2).filter((h) => h !== u.hex) : area(at, 1)).filter((h) => !this.b.rocks.includes(h));
        const s: Strike = {
          by: u.id,
          team: u.team,
          skill: def.id,
          hexes,
          power: this.power(u, quake ? [18, 26] : [26, 36]),
          atk: u.atk,
          friendly: !quake,
        };
        this.b.strikes.push(s);
        cast(hexes);
        this.beat({ e: "strike", strike: s });
        return;
      }
      case "firewall": {
        const near = area(u.hex, 1);
        cast(near);
        const shield = 35 + 4 * Math.max(0, u.level - 1);
        for (const a of alive(this.b, u.team).filter((x) => near.includes(x.hex))) this.status(a, "shield", 2, shield);
        for (const e of alive(this.b, other(u.team)).filter((x) => near.includes(x.hex)))
          this.status(e, "taunted", 1, undefined, u.id);
        return;
      }
      case "plan": {
        cast();
        this.status(t!, "hasted", 1);
        t!.cooldown = Math.max(0, t!.cooldown - 1);
        // it acts next: an extra turn for one that has acted this round, its turn brought forward for one that has not
        this.b.queue = this.b.queue.filter((id) => id !== t!.id);
        this.b.later = this.b.later.filter((id) => id !== t!.id);
        this.b.queue.unshift(t!.id);
        return;
      }
      case "hotfix":
        cast();
        this.heal(t!, Math.round(t!.maxHp * 0.35));
        for (const s of [...t!.statuses]) if (BAD.includes(s.id)) this.unstatus(t!, s.id);
        return;
      case "ultrathink":
        cast();
        this.status(t!, "inspired", 1);
        if (t!.id !== u.id) t!.cooldown = Math.max(0, t!.cooldown - 1);
        return;
    }
  }

  private ult(u: Unit, def: SkillDef, at: Hex) {
    this.b.meter[u.team] = 0;
    this.beat({ e: "meter", team: u.team, value: 0 });
    this.beat({ e: "cast", unit: u.id, skill: def.id, at });
    switch (def.id) {
      case "subagents":
        for (const h of this.freeNear(u.hex, 2))
          this.spawn({ kind: "subagent", name: "Subagent", body: "minion", color: u.color, level: u.level }, u.team, h);
        return;
      case "cloudTask": {
        const t = unitAt(this.b, at)!;
        this.beat({ e: "hit", unit: u.id, target: t.id, shot: true, skill: def.id });
        this.hurt(u, t, { power: this.power(u, [58, 75]), pierce: true, noCrit: true, blast: true });
        if (!t.dead) this.status(t, "stun", 1);
        return;
      }
      case "millionTokens":
        for (const t of alive(this.b, other(u.team))) {
          this.status(t, "marked", 2);
          this.status(t, "silence", 1);
        }
        return;
      case "autopilot":
        for (const t of alive(this.b, u.team).filter((x) => !still(x))) {
          this.heal(t, Math.round(t.maxHp * 0.15));
          this.status(t, "inspired", 1);
        }
        return;
      case "tabTab":
        for (const t of alive(this.b, u.team)) t.cooldown = 0;
        return;
      case "fork": {
        const [h] = this.freeNear(u.hex, 1);
        if (h == null) return;
        const copy = this.spawn({ kind: u.kind, name: u.name, body: u.body, color: u.color, level: u.level }, u.team, h);
        copy.hp = Math.max(1, Math.round(u.maxHp / 2));
        return;
      }
    }
  }

  /** Pushed `n` hexes along `dir`; whatever stops it, it hits, and that hurts. */
  private shove(t: Unit, dir: number, n: number) {
    if (dir < 0) return;
    const path: Hex[] = [];
    let at = t.hex;
    let bump = HEAVY.has(t.kind);
    for (let i = 0; i < n && !bump; i++) {
      const next = step(at, dir);
      if (next == null || !free(this.b, next)) bump = true;
      else {
        path.push(next);
        at = next;
      }
    }
    t.hex = at;
    this.beat({ e: "push", unit: t.id, path, bump });
    if (bump) this.hurt(null, t, { power: [8, 12], pierce: true, noCrit: true, blast: true });
  }

  /** The `n` free hexes nearest to `h`. */
  private freeNear(h: Hex, n: number): Hex[] {
    const all: Hex[] = [];
    for (let x = 0; x < HEXES; x++) if (free(this.b, x)) all.push(x);
    return all.sort((a, c) => distance(h, a) - distance(h, c) || a - c).slice(0, n);
  }

  /** Someone new on the field. It acts from the next round on, or this one if the round has not been lined up yet. */
  spawn(f: Fighter, team: Team, h: Hex): Unit {
    const u = makeUnit(this.b.units.length, team, f, h);
    u.summoned = true;
    this.b.units.push(u);
    this.beat({ e: "spawn", unit: u.id });
    return u;
  }

  /**
   * Puts a status on, or renews it. It lasts `turns` of its bearer's turns; put on during the bearer's own turn, that
   * turn does not count, so a root from a retaliation still holds the attacker on its next turn.
   */
  status(t: Unit, id: StatusId, turns: number, power?: number, by?: number) {
    const n = turns + (t.id === this.b.active ? 1 : 0);
    const old = statusOf(t, id);
    if (old) {
      old.turns = Math.max(n, old.turns);
      if (power != null) old.power = Math.max(power, old.power ?? 0);
      if (by != null) old.by = by;
      return;
    }
    t.statuses.push({ id, turns: n, ...(power != null ? { power } : {}), ...(by != null ? { by } : {}) });
    this.beat({ e: "status", unit: t.id, status: id, on: true });
  }

  unstatus(t: Unit, id: StatusId) {
    if (!has(t, id)) return;
    t.statuses = t.statuses.filter((s) => s.id !== id);
    this.beat({ e: "status", unit: t.id, status: id, on: false });
  }

  heal(t: Unit, n: number) {
    const v = Math.min(n, t.maxHp - t.hp);
    if (v <= 0) return;
    t.hp += v;
    this.beat({ e: "heal", unit: t.id, amount: v });
  }

  /** Everything that scales a hit from `by` on `t` but the dice. */
  private factor(by: Unit | null, t: Unit, o: Hit): number {
    const b = this.b;
    let f = o.mult ?? 1;
    if (!o.pierce) {
      const atk = by && !o.blast ? by.atk + aura(b, by) : (o.atk ?? by?.atk ?? 0);
      const d = atk - (t.def + aura(b, t));
      f *= d >= 0 ? 1 + 0.05 * Math.min(d, 60) : Math.max(0.3, 1 - 0.025 * -d);
    }
    if (by && !o.blast) {
      if (has(by, "inspired")) f *= 1.5;
      if (has(by, "enraged")) f *= 1.4;
      if (twinned(b, by)) f *= 1.2;
      if (by.kind === "coder" && alive(b, by.team).some((x) => x.id !== by.id && distance(x.hex, t.hex) === 1)) f *= 1.15;
      if (by.kind === "tester" && has(t, "marked")) f *= 1.25;
      if (by.kind === "scout" && t.hp >= t.maxHp) f *= 1.4;
      if (o.shot && distance(by.hex, t.hex) > by.range) f *= 0.5;
      if (!o.shot && !o.skill && by.range > 0) f *= 0.5;
    }
    if (has(t, "marked")) f *= MARKED;
    if (t.defending) f *= DEFEND;
    if (alive(b, t.team).some((x) => x.kind === "guardian" && x.id !== t.id && distance(x.hex, t.hex) === 1)) f *= 0.8;
    return f;
  }

  /** The least and most a hit can do, crits and misses aside. */
  range(by: Unit | null, t: Unit, o: Hit): [number, number] {
    const [lo, hi] = o.power ?? by?.dmg ?? [1, 1];
    const f = this.factor(by, t, o);
    return [Math.max(1, Math.round(lo * f)), Math.max(1, Math.round(hi * f))];
  }

  hurt(by: Unit | null, t: Unit, o: Hit) {
    if (t.dead) return;
    const flaky = by?.kind === "flakyTest" && o.shot && this.dice.chance(0.35);
    const dodge = t.kind === "nullPointer" && !o.blast && this.dice.chance(0.25);
    if (flaky || dodge) {
      this.beat({ e: "damage", unit: t.id, amount: 0, miss: true, ...(by ? { from: by.id } : {}) });
      return;
    }
    const [lo, hi] = o.power ?? by?.dmg ?? [1, 1];
    let amount = this.dice.int(lo, hi) * this.factor(by, t, o);
    const crit = !o.noCrit && !!by && this.dice.chance(CRIT_CHANCE);
    if (crit) amount *= CRIT;
    const total = Math.max(1, Math.round(amount));
    let left = total;
    let soaked = 0;
    const shield = statusOf(t, "shield");
    if (shield && !o.pierce) {
      soaked = Math.min(shield.power ?? 0, left);
      left -= soaked;
      shield.power = (shield.power ?? 0) - soaked;
      if (!shield.power) this.unstatus(t, "shield");
    }
    t.hp -= left;
    this.beat({
      e: "damage",
      unit: t.id,
      amount: left,
      ...(crit ? { crit } : {}),
      ...(soaked ? { soaked } : {}),
      ...(by ? { from: by.id } : {}),
    });
    if (by && by.team !== t.team) this.charge(by.team, total * METER_RATE);
    this.charge(t.team, total * METER_RATE);
    if (t.hp <= 0) this.fall(t);
  }

  private charge(team: Team, v: number) {
    if (!alive(this.b, team).some((u) => u.leader)) return;
    const was = this.b.meter[team];
    const now = Math.min(METER_FULL, Math.round(was + v));
    if (now === was) return;
    this.b.meter[team] = now;
    this.beat({ e: "meter", team, value: now });
  }

  private fall(t: Unit) {
    const b = this.b;
    if (!b.rollback[t.team] && alive(b, t.team).some((x) => x.kind === "debugger")) {
      b.rollback[t.team] = true;
      t.hp = 1;
      this.beat({ e: "saved", unit: t.id });
      return;
    }
    t.dead = true;
    t.hp = 0;
    t.statuses = [];
    b.queue = b.queue.filter((id) => id !== t.id);
    b.later = b.later.filter((id) => id !== t.id);
    this.beat({ e: "die", unit: t.id });
    if (t.kind === "memoryLeak" && t.maxHp >= 80)
      for (const h of this.freeNear(t.hex, 2))
        this.spawn({ kind: "leaklet", name: "Leaklet", body: "slimeSmall", color: t.color, level: t.level }, t.team, h);
  }

  over(w: Team | "draw") {
    if (this.b.winner != null) return;
    this.b.winner = w;
    this.b.active = null;
    this.b.queue = [];
    this.b.later = [];
    this.beat({ e: "over", winner: w });
  }

  /** Ends the battle if a side is gone, or what it had to keep has fallen. */
  check() {
    const b = this.b;
    if (b.winner != null) return;
    const fighting = (t: Team) => alive(b, t).filter((u) => !still(u)).length;
    const a = fighting(0);
    const z = fighting(1);
    if (b.goal.kind === "protect" && b.units[b.goal.unit]?.dead) return this.over(1);
    if (!a && !z) return this.over("draw");
    if (!a) return this.over(1);
    if (!z) return this.over(0);
  }

  /** Statuses wear off by their bearer's turns; boosts that wait for a hit do not. */
  private wear(u: Unit) {
    for (const s of [...u.statuses]) {
      if (s.id === "enraged" || s.id === "inspired") continue;
      s.turns -= 1;
      if (s.turns <= 0) this.unstatus(u, s.id);
    }
  }

  /** After a unit has acted: its statuses wear, a flaky test hops, and the next unit is up. */
  private endTurn(u: Unit) {
    if (!u.dead) {
      this.wear(u);
      if (u.kind === "flakyTest") {
        const spots: Hex[] = [];
        for (let h = 0; h < HEXES; h++) if (h !== u.hex && free(this.b, h) && distance(h, u.hex) <= 3) spots.push(h);
        if (spots.length) {
          u.hex = spots[this.dice.int(0, spots.length - 1)];
          this.beat({ e: "blink", unit: u.id, to: u.hex });
        }
      }
    }
    this.check();
    this.advance();
  }

  /** Picks the next unit to act, starting new rounds as needed, until one can or the battle is over. */
  advance() {
    const b = this.b;
    b.active = null;
    for (let guard = 0; guard < 400; guard++) {
      this.check();
      if (b.winner != null) return;
      const id = b.queue.length ? b.queue.shift() : b.later.shift();
      if (id == null) {
        this.newRound();
        continue;
      }
      const u = b.units[id];
      if (!u || u.dead) continue;
      b.active = u.id;
      if (!u.began) {
        u.began = true;
        u.cooldown = Math.max(0, u.cooldown - 1);
        u.defending = false;
        if (has(u, "stun")) {
          this.unstatus(u, "stun");
          this.beat({ e: "stunned", unit: u.id });
          this.wear(u);
          b.active = null;
          continue;
        }
      }
      this.beat({ e: "turn", unit: u.id });
      return;
    }
    // nobody can act at all: call it by what is left standing
    this.over(this.byHealth());
  }

  /** The side with more of its health left; summons do not count. */
  private byHealth(): Team | "draw" {
    const share = (t: Team) => {
      const us = this.b.units.filter((u) => u.team === t && !u.summoned && !still(u));
      const max = us.reduce((s, u) => s + u.maxHp, 0) || 1;
      return us.reduce((s, u) => s + Math.max(0, u.hp), 0) / max;
    };
    const a = share(0);
    const z = share(1);
    return Math.abs(a - z) < 1e-9 ? "draw" : a > z ? 0 : 1;
  }

  private newRound() {
    const b = this.b;
    b.round += 1;
    this.beat({ e: "round", round: b.round });
    const held = b.goal.kind === "survive" || b.goal.kind === "protect" ? b.goal.rounds : Infinity;
    if (b.round > held) return this.over(0);
    if (b.round > ROUND_CAP) return this.over(this.byHealth());
    const strikes = b.strikes;
    b.strikes = [];
    for (const s of strikes) {
      this.beat({ e: "blast", strike: s });
      const by = b.units[s.by];
      for (const u of alive(b).filter((x) => s.hexes.includes(x.hex) && (s.friendly || x.team !== s.team)))
        this.hurt(by && !by.dead ? by : null, u, { power: s.power, atk: s.atk, noCrit: true, blast: true });
    }
    this.check();
    if (b.winner != null) return;
    for (const u of alive(b)) {
      u.retaliations = still(u) ? 0 : kindDef(u).answersAll ? ALL : 1;
      u.waited = false;
      u.began = false;
      if (u.kind === "memoryLeak" && b.round > 1) {
        u.maxHp += 10;
        u.hp += 10;
        u.dmg = [u.dmg[0] + 2, u.dmg[1] + 2];
        this.beat({ e: "grow", unit: u.id });
      }
    }
    this.boss();
    b.queue = roundOrder(b, b.round);
    b.later = [];
  }

  /** The monolith's phases: it calls spaghetti below 60% and rages below 30%. */
  private boss() {
    const b = this.b;
    const boss = alive(b).find((u) => u.kind === "monolith");
    if (!boss) return;
    const share = boss.hp / boss.maxHp;
    if (share < 0.3 && b.phase < 2) {
      b.phase = 2;
      this.beat({ e: "phase", unit: boss.id, phase: 2 });
      this.status(boss, "enraged", 99);
    } else if (share < 0.6 && b.phase < 1) {
      b.phase = 1;
      this.beat({ e: "phase", unit: boss.id, phase: 1 });
    }
    const tangles = alive(b, boss.team).filter((u) => u.kind === "spaghetti").length;
    if (b.phase >= 1 && b.round % 2 === 0 && tangles < 2) {
      const [h] = this.freeNear(boss.hex, 1);
      if (h != null)
        this.spawn(
          { kind: "spaghetti", name: "Spaghetti Code", body: "tentacle", color: boss.color, level: boss.level },
          boss.team,
          h,
        );
    }
  }
}

/** Who acts in round `round`, first first, as the battle stands: by initiative, ties to the side whose round it is. */
export function roundOrder(b: Battle, round: number): number[] {
  const first: Team = round % 2 === 1 ? 0 : 1;
  return alive(b)
    .filter((u) => !still(u))
    .sort((x, y) => initOf(b, y) - initOf(b, x) || Number(y.team === first) - Number(x.team === first) || x.id - y.id)
    .map((u) => u.id);
}

/** The side whose unit acts now, as the café's turn games name sides. */
export const sideNow = (b: Battle): "x" | "o" => (b.active != null && b.units[b.active].team === 1 ? "o" : "x");
