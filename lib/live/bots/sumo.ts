import { AHEAD, BrainFor } from "../botLine";
import type { Level } from "../solo";
import { ACC, BODY_R, C, DASH, MAX_SPEED, Push, STEP_MS, SumoState, pushAt } from "../sumo";

interface Skill {
  /** steps late it sees what the others do, and how much quicker or slower than that it is from one round to the next */
  lag: number;
  sway: number;
  /** how far off its aim wanders, units */
  wobble: number;
  /** how much ice it keeps between itself and the water when it reckons whether it can still stop */
  edge: number;
  /** how often it dashes back when it is sliding out */
  saves: number;
  /** how much of the slide after a dash that misses it reckons with before it dashes: 0 not at all, 1 all of it */
  care: number;
  /** how often it steps out of the way of a rush */
  dodge: number;
  /** from how far it dashes at another wrestler */
  reach: number;
  /** how readily it dashes once it is lined up within reach: the chance at each step */
  quick: number;
  /** it also dashes the moment a push decides the round or the other cannot answer it */
  waits: boolean;
}

const SKILL: Record<Level, Skill> = {
  easy: { lag: 30, sway: 0.25, wobble: 9, edge: 0, saves: 0.3, care: 0, dodge: 0, reach: 34, quick: 0.12, waits: false },
  normal: { lag: 25, sway: 0.5, wobble: 4, edge: 4, saves: 0.8, care: 0.6, dodge: 0.35, reach: 28, quick: 0.04, waits: false },
  hard: { lag: 14, sway: 0.35, wobble: 1, edge: 6, saves: 1, care: 0.9, dodge: 0.85, reach: 26, quick: 0.06, waits: true },
};

const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
/** how far something slides before the ice lets it stop */
const slide = (v: number) => (v > 0 ? (v * v) / (2 * ACC) : 0);

interface Seen {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * An agent at sumo. It gets on the inner side of the other wrestler and pushes them out along the shortest way to
 * the water, brakes when its own slide would carry it off, and dashes either to finish a push or to save itself.
 * Easy sees late, aims loosely and dashes without minding where a miss leaves it; hard keeps its dash until the push
 * decides the round, and steps aside from a rush.
 */
export const sumoBot: BrainFor<SumoState, Push> = (seat, level, rnd) => {
  const skill = SKILL[level];
  /** where the others were, step by step, to see them late */
  const past: Seen[][] = [];
  const lead = AHEAD * STEP_MS;
  let round = -1;
  /** how late it sees this round */
  let lag = skill.lag;
  let wake = 0;
  let pressed = false;
  let wx = 0;
  let wy = 0;
  /** whether it saves itself this time it slides out, and steps aside from this rush; settled once each time */
  let sliding = false;
  let saves = false;
  let rushed = false;
  let dodges = false;

  return (s) => {
    past.push(s.body.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })));
    while (past.length > lag + 1) past.shift();
    const b = s.body[seat];
    const out = (x: number, y: number, dash: boolean) => {
      // a dash takes a fresh press
      const go = dash && !pressed;
      pressed = go;
      return pushAt(x, y, go);
    };
    if (s.round !== round) {
      round = s.round;
      // nobody is as sharp in every round: some it sees sooner, some later
      lag = Math.max(1, Math.round(skill.lag * (1 + skill.sway * (rnd() * 2 - 1))));
      wake = s.go + lag * (0.5 + rnd());
      sliding = rushed = false;
    }
    if (s.won !== null || s.fell[seat] || s.n < wake) return out(b.x, b.y, false);
    if (s.n % 24 === 0) {
      wx = (rnd() * 2 - 1) * skill.wobble;
      wy = (rnd() * 2 - 1) * skill.wobble;
    }

    // itself, where it will be by the time what it decides now counts
    const mx = b.x + b.vx * lead;
    const my = b.y + b.vy * lead;
    const v = len(b.vx, b.vy);
    const rx = mx - C;
    const ry = my - C;
    const d = len(rx, ry);
    const ready = s.cool[seat] <= s.n + AHEAD;

    // first of all it stays on the ice: can it still stop before the edge?
    const outward = d > 0.01 ? (b.vx * rx + b.vy * ry) / d : 0;
    const room = s.r - d;
    if (slide(outward) + skill.edge > room || room < 3) {
      if (!sliding) {
        sliding = true;
        saves = rnd() < skill.saves;
      }
      // against its own slide, and in towards the middle
      const ax = (v > 0.01 ? (-b.vx / v) * 0.7 : 0) + (d > 0.01 ? (-rx / d) * 0.5 : 0);
      const ay = (v > 0.01 ? (-b.vy / v) * 0.7 : 0) + (d > 0.01 ? (-ry / d) * 0.5 : 0);
      const a = len(ax, ay) || 1;
      const lost = slide(outward) > room - 1;
      return out(mx + (ax / a) * 40, my + (ay / a) * 40, saves && ready && lost);
    }
    sliding = false;

    // the nearest wrestler still standing, as it was a moment ago and carried on from there
    const old = past[0];
    let foe = -1;
    let near = Infinity;
    for (let k = 0; k < s.body.length; k++) {
      if (k === seat || s.fell[k]) continue;
      const dist = len(old[k].x - b.x, old[k].y - b.y);
      if (dist < near) {
        near = dist;
        foe = k;
      }
    }
    if (foe < 0) return out(C, C, false);
    const o = old[foe];
    const late = (past.length - 1) * STEP_MS + lead;
    const fx = o.x + o.vx * late;
    const fy = o.y + o.vy * late;
    const fv = len(o.vx, o.vy);
    const tx = fx - mx;
    const ty = fy - my;
    const td = len(tx, ty) || 1;
    const ux = tx / td;
    const uy = ty / td;

    // a rush coming straight at it: step aside, to the side with more ice
    const rush = fv > 0.15 && td < 36 && (o.vx * -ux + o.vy * -uy) / fv > 0.93;
    if (rush && !rushed) dodges = rnd() < skill.dodge;
    rushed = rush;
    if (rush && dodges) {
      const side = -uy * rx + ux * ry > 0 ? -1 : 1;
      return out(mx - uy * side * 30, my + ux * side * 30, false);
    }

    // which way the other goes out soonest, and whether it stands on their inner side
    const ox = fx - C;
    const oy = fy - C;
    const od = len(ox, oy);
    const inner = od < 8 ? 1 : (ux * ox + uy * oy) / od;
    if (inner < 0.5) {
      // round to the inner side first
      const k = 2 * BODY_R + 6;
      return out(fx - (ox / od) * k + wx, fy - (oy / od) * k + wy, false);
    }

    // a dash now: where a miss leaves it, and whether the push decides the round
    const along = Math.min(MAX_SPEED, Math.max(0, b.vx * ux + b.vy * uy) + DASH);
    const miss = slide(along) * skill.care;
    const safe = len(mx + ux * miss - C, my + uy * miss - C) < s.r - 2;
    const answer = s.cool[foe] <= s.n + AHEAD ? DASH : 0;
    const push = slide(Math.max(0, 0.95 * along - answer));
    const decides = len(fx + ux * push - C, fy + uy * push - C) > s.r + 1;
    const lined = v < 0.03 || (b.vx * ux + b.vy * uy) / v > 0.9;
    let dash = false;
    if (ready && lined && safe && td < skill.reach && inner > 0.6) {
      dash = (skill.waits && (decides || (!answer && td < 18))) || rnd() < skill.quick;
    }
    return out(fx + ux * 24 + wx, fy + uy * 24 + wy, dash);
  };
};
