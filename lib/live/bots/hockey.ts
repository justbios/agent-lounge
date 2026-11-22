import { AHEAD, BrainFor } from "../botLine";
import {
  Aim,
  GOAL_W,
  H,
  HockeyState,
  MALLET_R,
  MAX_MALLET,
  PUCK_R,
  Puck,
  STEP_MS,
  W,
  aimAt,
  glide,
  heatOf,
  keepIn,
} from "../hockey";
import type { Level } from "../solo";

interface Skill {
  /** steps late it sees the puck change its way */
  lag: number;
  /** how fast it moves its mallet, as a share of the fastest a mallet goes; and through the puck when it strikes */
  pace: number;
  power: number;
  /** how far off it stands when it blocks, units; and how much further for a puck that comes off a side wall */
  guard: number;
  wall: number;
  /** how often a quick shot catches it flat-footed: it then stands where it was going until the shot is past */
  fooled: number;
  /** a warm puck is harder to read: how much more often one catches it out, and how much further off it blocks, per heat */
  rattled: number;
  melt: number;
  /** how far off its shots go, as a turn of the shot in radians */
  spread: number;
  /** how often it plays the puck off a side wall */
  bank: number;
  /** it shoots at the side of the goal the other mallet is not on */
  picks: boolean;
  /** the fastest puck coming at its goal that it goes and strikes rather than blocks, units/ms */
  brave: number;
  /** the fastest puck going any way that it goes and strikes rather than waits for */
  calm: number;
}

const SKILL: Record<Level, Skill> = {
  easy: {
    lag: 30,
    pace: 0.32,
    power: 0.1,
    guard: 9,
    wall: 12,
    fooled: 0.5,
    rattled: 0.15,
    melt: 0.5,
    spread: 0.3,
    bank: 0,
    picks: false,
    brave: 0.03,
    calm: 0.08,
  },
  normal: {
    lag: 20,
    pace: 0.5,
    power: 0.25,
    guard: 5,
    wall: 7,
    fooled: 0.1,
    rattled: 0.1,
    melt: 0.3,
    spread: 0.12,
    bank: 0.2,
    picks: false,
    brave: 0.06,
    calm: 0.12,
  },
  hard: {
    lag: 12,
    pace: 0.8,
    power: 1,
    guard: 2,
    wall: 3,
    fooled: 0.05,
    rattled: 0.06,
    melt: 0.2,
    spread: 0.04,
    bank: 0.35,
    picks: true,
    brave: 0.1,
    calm: 0.17,
  },
};

/** the line it guards its goal from, in its own frame: its goal is at the bottom, y = H */
const GUARD_Y = H - 22;
/** how far behind the puck it lines up before a strike, and how far through the puck it then goes */
const BEHIND = PUCK_R + MALLET_R + 3;
const THROUGH = 12;
/** steps of the puck's way it reads ahead */
const READ = 90;
/** the ways it steps aside from a puck it must not touch */
const DODGES = [
  [12, 0],
  [-12, 0],
  [0, -10],
  [9, -7],
  [-9, -7],
];
/** a puck left in its half this many steps gets a plain shove */
const TOO_LONG = 450;

interface P {
  x: number;
  y: number;
}

const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The puck's way on from `p` with no mallet in it, step by step, as warm as it is; it ends early on a goal. */
function read(p: Puck, steps: number, heat: number): Puck[] {
  const way: Puck[] = [p];
  let q = p;
  for (let k = 0; k < steps; k++) {
    for (let sub = 0; sub < 2; sub++) {
      const g = glide(q, STEP_MS / 2, [], heat);
      q = g.p;
      if (g.goal) return way;
    }
    way.push(q);
  }
  return way;
}

/**
 * An agent at air hockey. It thinks with its goal at the bottom whichever end it plays. While the puck is the
 * other's it stands between the puck and its goal; a fast puck coming in it blocks; a slow one in its half it gets
 * behind and strikes at the far goal, straight or off a wall. Easy sees late, moves slowly and shoots softly and
 * wide; hard is quick, exact, and shoots where the other mallet is not.
 */
export const hockeyBot: BrainFor<HockeyState, Aim> = (seat, level, rnd) => {
  const skill = SKILL[level];
  const side = seat === 0 ? "x" : "o";
  /** the table as this seat sees it: for the top seat, turned over */
  const turn = (y: number) => (seat === 0 ? y : H - y);
  /** the puck step by step, to see it late */
  const past: (Puck | null)[] = [];
  /** where it means its mallet to be; the mallet itself follows a few steps behind */
  let hand: P = keepIn("x", W / 2, H - 14);
  /** this strike: the spot in the far goal it shoots at, the wall it plays off (-1 left, 1 right, 0 none), its error */
  let shot: { x: number; wall: number; off: number } | null = null;
  /** how far off it blocks this attack */
  let slip = 0;
  let coming = false;
  /** caught flat-footed by this shot, and where it was heading when the shot came */
  let frozen = false;
  let last: P = hand;
  /** steps the puck has stayed in its half, and steps left of a strike it has begun */
  let held = 0;
  let strike = 0;

  const move = (to: P, pace: number): Aim => {
    last = to;
    const dx = to.x - hand.x;
    const dy = to.y - hand.y;
    const d = len(dx, dy);
    const most = pace * MAX_MALLET * STEP_MS;
    const k = d > most ? most / d : 1;
    hand = keepIn("x", hand.x + dx * k, hand.y + dy * k);
    return aimAt(side, hand.x, turn(hand.y));
  };

  return (s) => {
    const now = s.puck && { x: s.puck.x, y: turn(s.puck.y), vx: s.puck.vx, vy: seat === 0 ? s.puck.vy : -s.puck.vy };
    past.push(now);
    if (past.length > skill.lag + 1) past.shift();
    const old = past[0];
    if (!old || !now) {
      shot = null;
      held = strike = 0;
      return move({ x: W / 2, y: H - 20 }, skill.pace * 0.6);
    }
    // what the other player does to the puck it sees late; in its own half only its own mallet touches the puck,
    // and that it knows at once
    const back = now.y > H / 2 && old.y > H / 2 ? Math.min(past.length - 1, 2) : past.length - 1;
    const from = past[past.length - 1 - back] ?? old;
    // where it takes the puck to be when its mallet gets there, and on from that
    const heat = heatOf(s);
    const way = read(from, back + AHEAD + READ, heat).slice(back + AHEAD);
    const p = way[0] ?? from;
    const foe = s.mal[1 - seat];
    const rest: P = { x: W / 2 + (p.x - W / 2) * 0.35, y: GUARD_Y };

    const inbound = p.vy > 0.02;
    if (inbound && !coming) {
      // a new shot at its goal: how well it reads this one
      const bounced = way.some((q, k) => k > 0 && q.vx * way[k - 1].vx < 0 && q.y < GUARD_Y);
      slip = (rnd() * 2 - 1) * (skill.guard + (bounced ? skill.wall : 0)) * (1 + heat * skill.melt);
      frozen = len(p.vx, p.vy) > 0.12 && rnd() < skill.fooled + heat * skill.rattled;
    }
    coming = inbound;
    if (frozen && inbound && p.y < hand.y) return move(last, skill.pace);

    if (p.y < H / 2 - 2) {
      // the other's puck: stand between it and the goal, or where it is about to come through
      shot = null;
      held = strike = 0;
      if (!inbound) return move(rest, skill.pace);
      const at = way.find((q) => q.y >= GUARD_Y - 6);
      return move(at ? { x: at.x + slip, y: GUARD_Y } : rest, skill.pace);
    }
    held += 1;
    const speed = len(p.vx, p.vy);
    const most = skill.pace * MAX_MALLET * STEP_MS;
    /** the mallet is between the puck and its own goal */
    const under = hand.y >= p.y + 2;
    /** how near the puck comes to a spot in the next moments */
    const clear = (c: P) => {
      let d = Infinity;
      for (let k = 0; k < Math.min(way.length, 14); k++) d = Math.min(d, len(way[k].x - c.x, way[k].y - c.y));
      return d;
    };
    /** A lively puck on the goal's side of the mallet: any touch now could send it in, so the mallet keeps clear. */
    const dodge = (): Aim => {
      let best = hand;
      let top = clear(hand);
      if (top < BEHIND + 4) {
        for (const [dx, dy] of DODGES) {
          const c = keepIn("x", hand.x + dx, hand.y + dy);
          const d = clear(c);
          if (d > top + 0.5) {
            top = d;
            best = c;
          }
        }
      }
      return move(best, skill.pace);
    };

    if (strike <= 0 && held < TOO_LONG) {
      if (p.vy > skill.brave) {
        if (!under) return dodge();
        // coming fast: get in its way, as early along it as the mallet can
        for (let k = 1; k < way.length; k++) {
          const q = way[k];
          const spot = keepIn("x", q.x + slip, q.y + 3);
          if (spot.y < q.y) continue;
          if (len(spot.x - hand.x, spot.y - hand.y) <= k * most) return move(spot, skill.pace);
        }
        // too quick to meet: the mouth of the goal
        const end = way[way.length - 1] ?? p;
        const x = clamp(end.x + slip, W / 2 - GOAL_W / 2, W / 2 + GOAL_W / 2);
        return move({ x, y: H - MALLET_R - 2 }, skill.pace);
      }
      if (speed > skill.calm) {
        if (!under) return dodge();
        // lively but not at the goal: stay under it until it settles
        return move({ x: W / 2 + (p.x - W / 2) * 0.6, y: clamp(p.y + 16, GUARD_Y, H - MALLET_R - 2) }, skill.pace);
      }
    }

    // a puck to strike: pick the shot once
    if (!shot) {
      const open = foe.x < W / 2 ? 1 : -1;
      const x = W / 2 + (skill.picks ? open * (GOAL_W / 2 - 3) : (rnd() * 2 - 1) * 11);
      const wall = rnd() < skill.bank ? (rnd() < 0.5 ? -1 : 1) : 0;
      shot = { x, wall, off: (rnd() * 2 - 1) * skill.spread };
    }
    const goal: P = {
      x: shot.wall < 0 ? 2 * PUCK_R - shot.x : shot.wall > 0 ? 2 * (W - PUCK_R) - shot.x : shot.x,
      y: 0,
    };
    const cos = Math.cos(shot.off);
    const sin = Math.sin(shot.off);
    /** which way to send the puck from where it is: at the goal, or, from right by its own goal, out to the side */
    const aim = (c: P): P => {
      if (c.y > H - 15) return { x: c.x < W / 2 ? -0.97 : 0.97, y: -0.24 };
      const dx = goal.x - c.x;
      const dy = goal.y - c.y;
      const d = len(dx, dy) || 1;
      return { x: (dx / d) * cos - (dy / d) * sin, y: (dx / d) * sin + (dy / d) * cos };
    };
    // the puck where the mallet can be behind it in time
    let q: P = p;
    let u = aim(p);
    for (let k = 1; k < Math.min(way.length, 40); k++) {
      const c = way[k];
      const v = aim(c);
      q = c;
      u = v;
      if (len(c.x - v.x * BEHIND - hand.x, c.y - v.y * BEHIND - hand.y) <= (k + 1) * most) break;
    }
    const rx = q.x - hand.x;
    const ry = q.y - hand.y;
    const along = rx * u.x + ry * u.y;
    const across = -rx * u.y + ry * u.x;

    if (held >= TOO_LONG) {
      // it has been fiddling too long: shove the puck from wherever the mallet is, but never down into its own goal
      if (held > TOO_LONG + 60) held = 0;
      const d = len(rx, ry) || 1;
      const down = ry / d > 0.3 && Math.abs(q.x - W / 2) < GOAL_W / 2 + PUCK_R;
      if (down) return move({ x: q.x + (rx >= 0 ? -1 : 1) * 16, y: q.y + 2 }, skill.pace);
      return move({ x: q.x + (rx / d) * THROUGH, y: q.y + (ry / d) * THROUGH }, skill.pace);
    }

    if (strike > 0 || (along > 0 && Math.abs(across) < 3.5 && along < BEHIND + 8)) {
      // lined up behind it: through the puck
      strike = strike > 0 ? strike - 1 : 10;
      return move({ x: q.x + u.x * THROUGH, y: q.y + u.y * THROUGH }, Math.min(skill.pace, skill.power));
    }
    if (along < 4 && Math.abs(across) < BEHIND) {
      // the puck is between the mallet and where it has to get to: round it, on the side the mallet is on already
      // unless the wall is too near there
      const k = BEHIND + 3;
      const spot = (turn: number): P => ({ x: q.x - u.y * turn * k - u.x * 2, y: q.y + u.x * turn * k - u.y * 2 });
      const fits = (c: P) => c.x > MALLET_R + 1 && c.x < W - MALLET_R - 1 && c.y < H - MALLET_R;
      const first = spot(across >= 0 ? -1 : 1);
      return move(fits(first) ? first : spot(across >= 0 ? 1 : -1), skill.pace);
    }
    return move({ x: q.x - u.x * BEHIND, y: q.y - u.y * BEHIND }, skill.pace);
  };
};
