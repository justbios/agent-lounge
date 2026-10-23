import type { Hex } from "./hex";

/** 0 starts on the left (whoever invited, or the player against the bugs), 1 on the right. */
export type Team = 0 | 1;

export type StatusId =
  | "marked"
  | "stun"
  | "slow"
  | "silence"
  | "root"
  | "taunted"
  | "inspired"
  | "shield"
  | "hasted"
  | "enraged";

/** Statuses that hurt; a hotfix washes these off. */
export const BAD: readonly StatusId[] = ["marked", "stun", "slow", "silence", "root", "taunted"];
/** Statuses that help; a refactor strips these. */
export const GOOD: readonly StatusId[] = ["inspired", "shield", "hasted", "enraged"];

export interface Status {
  id: StatusId;
  /** how many of its bearer's turns it still lasts */
  turns: number;
  /** how strong it is where that varies: a shield's points */
  power?: number;
  /** the unit that put it on, for a taunt */
  by?: number;
}

/** Who fights: a class of agent, a bug, or something summoned. Its numbers are in content.ts. */
export interface Unit {
  id: number;
  team: Team;
  kind: string;
  /** the agent's name in the café, or the bug's */
  name: string;
  /** which body the renderer dresses it in */
  body: string;
  /** the agent's colour in the café, for its banner and its spells */
  color: string;
  level: number;
  hex: Hex;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  dmg: [number, number];
  speed: number;
  /** who acts first in a round; ties go by team, alternating */
  init: number;
  /** 0 fights hand to hand; more shoots, at full damage up to this far and half beyond */
  range: number;
  flying: boolean;
  /** answers to melee hits left this round; a reviewer answers every one */
  retaliations: number;
  /** turns until its skill is ready again; 0 is ready */
  cooldown: number;
  statuses: Status[];
  waited: boolean;
  /** its turn this round has started: a unit that waited does not burn, cool down or wake twice */
  began: boolean;
  defending: boolean;
  dead: boolean;
  /** leads its side: the chat's main agent, whose ultimate charges with the fight */
  leader?: boolean;
  /** summoned in the fight, not brought to it */
  summoned?: boolean;
}

/** A blast on the way: shown on the field from when it is called in until it lands, at the next round's start. */
export interface Strike {
  by: number;
  team: Team;
  /** the skill that called it in */
  skill: string;
  hexes: Hex[];
  power: [number, number];
  /** the caster's attack when it was called in, so it still lands if the caster falls first */
  atk: number;
  /** it hits everyone under it, the caster's own side too */
  friendly: boolean;
}

export type Goal =
  | { kind: "wipe" }
  /** hold out this many rounds; losing every unit still loses */
  | { kind: "survive"; rounds: number }
  /** keep this unit alive this many rounds, or until the other side is gone */
  | { kind: "protect"; unit: number; rounds: number };

/** A fighter as a squad brings it, before the battle places it. */
export interface Fighter {
  kind: string;
  name: string;
  body: string;
  color: string;
  level: number;
  leader?: boolean;
}

export interface Battle {
  id: string;
  /** the dice's state now */
  seed: number;
  round: number;
  units: Unit[];
  rocks: Hex[];
  /** units still to act this round, first first */
  queue: number[];
  /** units that waited, to act after everyone else this round */
  later: number[];
  /** the unit whose turn it is */
  active: number | null;
  /** each side's ultimate meter, 0–100 */
  meter: [number, number];
  strikes: Strike[];
  /** each side's once-a-battle rollback, spent or not */
  rollback: [boolean, boolean];
  goal: Goal;
  /** the bugs' boss and its phase, in the scenario that has one */
  phase: number;
  winner: Team | "draw" | null;
}

/** What a player or the bot tells the active unit to do. */
export type Command =
  | { t: "move"; to: Hex }
  /** a hit: hand to hand from `from` (where it stands to strike), or a shot when `from` is left out */
  | { t: "attack"; target: number; from?: Hex }
  /** the unit's skill at a hex: a unit's hex for those aimed at someone; `from` for skills that walk up first */
  | { t: "skill"; at: Hex; from?: Hex }
  | { t: "ult"; at?: Hex }
  | { t: "wait" }
  | { t: "defend" }
  | { t: "yield" };

/** What happened, in order, for the screen to play back. */
export type Beat =
  | { e: "round"; round: number }
  | { e: "turn"; unit: number }
  | { e: "move"; unit: number; path: Hex[]; fly: boolean }
  | { e: "blink"; unit: number; to: Hex }
  | { e: "hit"; unit: number; target: number; shot: boolean; skill?: string; answer?: boolean }
  | { e: "cast"; unit: number; skill: string; at: Hex | null; hexes?: Hex[] }
  | { e: "damage"; unit: number; amount: number; crit?: boolean; miss?: boolean; soaked?: number; from?: number }
  | { e: "heal"; unit: number; amount: number }
  | { e: "status"; unit: number; status: StatusId; on: boolean }
  | { e: "push"; unit: number; path: Hex[]; bump: boolean }
  | { e: "die"; unit: number }
  | { e: "saved"; unit: number }
  | { e: "spawn"; unit: number }
  | { e: "grow"; unit: number }
  | { e: "strike"; strike: Strike }
  | { e: "blast"; strike: Strike }
  | { e: "wait"; unit: number }
  | { e: "defend"; unit: number }
  | { e: "stunned"; unit: number }
  | { e: "meter"; team: Team; value: number }
  | { e: "phase"; unit: number; phase: number }
  | { e: "over"; winner: Team | "draw" };
