import { type Hex, distance } from "./hex";
import { Dice } from "./rng";
import { alive, apply, canShoot, has, kindDef, options, other, shieldOf, speedOf, still } from "./rules";
import type { Battle, Command, Team, Unit } from "./types";

/**
 * The bot: it tries every command the active unit has on a copy of the battle, with dice of its own so it cannot see
 * how the real ones will fall, and scores what each leaves behind. Its own dice also pick among close scores, so it
 * does not play the same battle the same way twice, yet a battle with the same commands still replays the same.
 */

export type Level = "easy" | "normal" | "hard";

const WIN = 100000;
/** what the other side loses counts for this much more than what its own side loses: bots that trade, not stall */
const AGGRESSION = 1.25;

/** What a unit does to the other side in a turn, roughly. */
export function threat(u: Unit): number {
  const avg = (u.dmg[0] + u.dmg[1]) / 2;
  const k = kindDef(u);
  return avg * (1 + 0.05 * u.atk) * (u.range > 0 ? 1.15 : 1) * (k.skill ? 1.1 : 1) * (u.leader ? 1.2 : 1);
}

/** How good the battle is for `team`: its health and punch against the other side's, and what is about to land. */
export function evaluate(b: Battle, team: Team): number {
  if (b.winner === team) return WIN;
  if (b.winner === other(team)) return -WIN;
  let score = 0;
  for (const u of alive(b)) {
    const sign = u.team === team ? 1 : -AGGRESSION;
    const th = threat(u);
    let v = still(u) ? u.hp * 2 + 300 : (u.hp + shieldOf(u)) * (0.5 + th / 20) + th * 4;
    if (has(u, "marked")) v -= u.hp * 0.12;
    if (has(u, "stun")) v -= th * 1.2;
    if (has(u, "slow") || has(u, "root")) v -= 3;
    if (has(u, "silence") && u.cooldown === 0) v -= 4;
    if (has(u, "taunted")) v -= 2;
    if (has(u, "inspired")) v += th * 0.5;
    if (has(u, "hasted")) v += 2;
    if (kindDef(u).skill) v += u.cooldown === 0 ? 3 : -u.cooldown;
    score += sign * v;
  }
  score += (b.meter[team] - b.meter[other(team)]) * 0.25;
  for (const s of b.strikes) {
    const avg = (s.power[0] + s.power[1]) / 2;
    for (const u of alive(b))
      if (s.hexes.includes(u.hex) && (s.friendly || u.team !== s.team)) score += (u.team === team ? -1 : 1) * avg * 0.8;
  }
  return score;
}

/** Roughly how much the other side can put into a unit standing at `h` on its next go. */
function danger(b: Battle, u: Unit, h: Hex): number {
  let d = 0;
  for (const e of alive(b, other(u.team))) {
    if (still(e) || has(e, "stun")) continue;
    const avg = (e.dmg[0] + e.dmg[1]) / 2;
    const dist = distance(e.hex, h);
    if (e.range > 0 && canShoot(b, e)) d += avg * (dist > e.range ? 0.5 : 1);
    else if (dist <= speedOf(b, e) + 1) d += avg;
  }
  for (const s of b.strikes)
    if (s.hexes.includes(h) && (s.friendly || s.team !== u.team)) d += (s.power[0] + s.power[1]) * 1.5;
  return d;
}

/**
 * Where a unit stands after its turn: fighters want to be at the enemy and shooters within their range, next to
 * friends rather than alone, and never where the other side can finish them off.
 */
function placement(b: Battle, id: number, cautious: boolean): number {
  const u = b.units[id];
  if (!u || u.dead) return 0;
  const goal = b.goal;
  const marks = alive(b, other(u.team)).filter((t) => !still(t));
  const keep = goal.kind === "protect" && u.team === 1 ? b.units[goal.unit] : undefined;
  const aims = keep && !keep.dead ? [keep] : marks;
  const near = aims.length ? Math.min(...aims.map((t) => distance(t.hex, u.hex))) : 0;
  let s = 0;
  if (u.range > 0) {
    s -= Math.max(0, near - u.range) * 1.5;
    if (!canShoot(b, u)) s -= 10;
  } else s -= (4 + b.round * 0.5) * Math.max(0, near - 1);
  const friends = alive(b, u.team).filter((t) => t.id !== u.id && !still(t));
  s += friends.filter((t) => distance(t.hex, u.hex) === 1).length * (u.kind === "guardian" || u.leader ? 3 : 1);
  // what the other side may put into it: a little for the hits, a lot if they would be enough to finish it
  const life = u.hp + shieldOf(u);
  const per = 0.5 + threat(u) / 20;
  const reach = danger(b, u, u.hex);
  const hits = reach * (cautious ? 0.5 : 0.4) * (u.defending ? 0.7 : 1) * (has(u, "marked") ? 1.3 : 1);
  // shooters keep out of reach; fighters are there to be reached, and a bot that will not close in only stalls
  s -= hits * per * (u.range > 0 ? 0.2 : cautious ? 0.12 : 0.06);
  if (hits >= life) s -= (threat(u) * 4 + life * per) * 0.6;
  // out in front alone is where a fight is lost
  if (reach > 0 && friends.length && !friends.some((t) => distance(t.hex, u.hex) <= 2)) s -= 6 + reach * 0.1;
  return s;
}

/** Every command worth weighing for the active unit, the ultimate aside. */
function candidates(b: Battle): Command[] {
  const o = options(b);
  if (!o) return [];
  const out: Command[] = [{ t: "defend" }];
  for (const to of o.moves.keys()) out.push({ t: "move", to });
  for (const [target, from] of o.melee) for (const h of from) out.push({ t: "attack", target, from: h });
  for (const target of o.shots) out.push({ t: "attack", target });
  if (o.skill?.ready)
    for (const [at, from] of o.skill.targets) {
      if (from) for (const h of from) out.push({ t: "skill", at, from: h });
      else out.push({ t: "skill", at });
    }
  return out;
}

/** What a skill is worth beyond what the battle right after it shows. */
function extra(b: Battle, cmd: Command): number {
  if (cmd.t !== "skill" || b.active == null) return 0;
  const u = b.units[b.active];
  const id = kindDef(u).skill?.id;
  const t = alive(b).find((x) => x.hex === cmd.at);
  if (id !== "plan" || !t) return 0;
  // an extra turn is worth a hit, if the ally has acted already and has someone to hit
  if (b.queue.includes(t.id) || b.later.includes(t.id)) return 2;
  const hits =
    t.range > 0
      ? canShoot(b, t)
      : alive(b, other(t.team)).some((e) => !still(e) && distance(e.hex, t.hex) <= speedOf(b, t) + 3);
  return hits ? threat(t) * 0.9 : 1;
}

/** The command the bot gives the active unit now. */
export function decide(b: Battle, level: Level = "normal"): Command {
  const o = options(b);
  if (!o) return { t: "defend" };
  const team = o.unit.team;
  const dice = new Dice((b.seed ^ 0x9e3779b9) >>> 0);
  const samples = level === "hard" ? 4 : level === "normal" ? 2 : 1;
  const salts = Array.from({ length: samples }, () => Math.floor(dice.next() * 2 ** 32));
  const score = (cmd: Command): number | null => {
    let sum = 0;
    for (const salt of salts) {
      const r = apply({ ...b, seed: (b.seed ^ salt) >>> 0 }, cmd);
      if (!r) return null;
      sum += evaluate(r.battle, team) + placement(r.battle, o.unit.id, level === "hard");
    }
    // standing still is the last resort, not a way to wait the other side out
    return sum / samples + extra(b, cmd) - (cmd.t === "defend" ? 3 : 0);
  };

  if (o.ult?.ready) {
    const now = evaluate(b, team);
    let best: { cmd: Command; v: number } | null = null;
    for (const at of o.ult.targets.keys()) {
      const cmd: Command = { t: "ult", at };
      const r = apply(b, cmd);
      const v = r ? evaluate(r.battle, team) - now : -Infinity;
      if (!best || v > best.v) best = { cmd, v };
    }
    if (best && best.v > 6) return best.cmd;
  }

  const scored: { cmd: Command; v: number }[] = [];
  for (const cmd of candidates(b)) {
    const v = score(cmd);
    if (v != null) scored.push({ cmd, v: v + (level === "hard" ? 0 : dice.next() * 1.5) });
  }
  if (!scored.length) return { t: "defend" };
  scored.sort((x, y) => y.v - x.v);
  if (level === "easy") {
    const r = dice.next();
    const pick = r < 0.55 ? 0 : r < 0.85 ? 1 : 2;
    return scored[Math.min(pick, scored.length - 1)].cmd;
  }
  return scored[0].cmd;
}
