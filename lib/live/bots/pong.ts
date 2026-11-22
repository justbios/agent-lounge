import type { BrainFor } from "../botLine";
import { Ball, FACE, H, PAD_H, PongState, R, STEP_MS, bounce, clampPad, padAt } from "../pong";
import type { Level } from "../solo";

interface Skill {
  /** steps before it takes in that the ball has turned its way */
  react: number;
  /** how fast it moves its paddle, units/ms; the rules put no limit on a paddle, so this one is its own */
  speed: number;
  /** how far off it reads the ball once the ball is at its paddle, and how much further while it is across the table */
  near: number;
  far: number;
  /** how often it badly misreads a ball */
  lapse: number;
  /** how much worse it reads a ball for every wall the ball comes off, and a ball at its fastest */
  wall: number;
  rush: number;
  /** how far from the middle of its paddle it dares to take the ball, 0 to 1: that is what gives a return its angle */
  edge: number;
  /** it takes the ball on the side of the paddle that sends it furthest from the other paddle */
  plans: boolean;
}

const SKILL: Record<Level, Skill> = {
  easy: { react: 40, speed: 0.05, near: 13, far: 18, lapse: 0.1, wall: 0.5, rush: 0.5, edge: 0, plans: false },
  normal: { react: 22, speed: 0.08, near: 8.5, far: 10, lapse: 0.13, wall: 0.3, rush: 0.9, edge: 0.4, plans: false },
  hard: { react: 11, speed: 0.105, near: 4, far: 5, lapse: 0.06, wall: 0.1, rush: 1.5, edge: 0.62, plans: true },
};

/** how fast a serve flies and the fastest a ball gets, units/ms: the rules' own numbers */
const SLOW = 0.075;
const FAST = 0.17;
/** a paddle takes the ball this far from its middle at most */
const HALF = PAD_H / 2 + R;
const SPAN = H - 2 * R;

/** Where a ball crosses a seat's paddle line, and how many walls it comes off on the way there. */
function meet(b: Ball, seat: number): { y: number; walls: number } {
  const x = seat === 0 ? FACE.x + R : FACE.o - R;
  const ms = b.vx === 0 ? 0 : Math.max(0, (x - b.x) / b.vx);
  const far = b.y - R + b.vy * ms;
  const fold = ((far % (2 * SPAN)) + 2 * SPAN) % (2 * SPAN);
  return { y: R + (fold > SPAN ? 2 * SPAN - fold : fold), walls: Math.abs(Math.floor(far / SPAN)) };
}

/**
 * An agent at ping-pong. It works out where the ball will cross its line the way a person does: late, a little off,
 * better as the ball gets near, and its paddle only moves so fast. Easy misses plain balls now and then and cannot
 * keep up once a rally gets quick; hard is rarely wrong and places its returns away from the other paddle.
 */
export const pongBot: BrainFor<PongState, number> = (seat, level, rnd) => {
  const skill = SKILL[level];
  /** the ball heads this way when it is coming to this paddle */
  const mine = seat === 0 ? -1 : 1;
  const line = seat === 0 ? FACE.x : FACE.o;
  let at = H / 2;
  /** the way the ball really heads (0 with no ball in play), the step it turned, and the way the agent has taken in */
  let real = 0;
  let since = 0;
  let wait = 0;
  let seen = 0;
  /** this ball's misreading, -1 to 1 and more on a lapse, and where on the paddle it means to take it */
  let slip = 0;
  let off = 0;

  const place = (s: PongState, ball: Ball): number => {
    if (!skill.plans) return (rnd() * 2 - 1) * skill.edge;
    const here = meet(ball, seat).y;
    const foe = s.pads[1 - seat];
    let best = 0;
    let top = -1;
    for (const k of [-1, -0.5, 0, 0.5, 1]) {
      const o = k * skill.edge;
      const out = bounce({ ...ball, y: here }, clampPad(here - o * HALF));
      const d = Math.abs(meet(out, 1 - seat).y - foe) + rnd() * 6;
      if (d > top) {
        top = d;
        best = o;
      }
    }
    return best;
  };

  return (s) => {
    const ball = s.dead ? null : s.ball;
    const way = ball ? (ball.vx < 0 ? -1 : 1) : 0;
    if (way !== real) {
      real = way;
      since = s.n;
      wait = skill.react * (0.75 + rnd() * 0.5);
    }
    if (seen !== real && s.n - since >= wait) {
      seen = real;
      if (ball && seen === mine) {
        slip = (rnd() * 2 - 1) * (rnd() < skill.lapse ? 2.6 : 1);
        off = place(s, ball);
      }
    }
    // between balls, and until it has seen one coming, it goes back to the middle
    let want = H / 2;
    if (ball && way === mine && seen === mine) {
      const m = meet(ball, seat);
      const frac = Math.min(1, Math.abs(ball.x - line) / (FACE.o - FACE.x));
      const quick = (Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) - SLOW) / (FAST - SLOW);
      const hurry = 1 + skill.rush * Math.max(0, Math.min(1, quick));
      const err = slip * (skill.near + skill.far * frac) * (1 + skill.wall * m.walls) * hurry;
      want = m.y + err - off * HALF;
    }
    const most = skill.speed * STEP_MS;
    const d = clampPad(want) - at;
    if (Math.abs(d) > 0.3) at += Math.max(-most, Math.min(most, d));
    return padAt(at);
  };
};
