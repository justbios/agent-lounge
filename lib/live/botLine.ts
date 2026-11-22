import type { Line } from "./netplay";
import type { Rules } from "./rollback";
import { Level, Solo, dice, isBot } from "./solo";

/*
 * A real-time game against one of the café's agents. The games run on Netplay, which only needs a `Line` to the
 * other players; this is a made-up one with an agent at the far end. Nothing in Netplay or the rollback changes: the
 * agent's inputs arrive the way a person's would over a perfect line, a few steps ahead of time, so the game never
 * has to guess them and never rolls back.
 *
 * The line keeps a copy of the game of its own, stepped with the person's real inputs as they are sent. So what an
 * agent does depends only on the seed and on what the person did, step by step, never on how fast frames come.
 */

/**
 * What an agent does at one step of a real-time game. It is called once for every step, in order, with the game as
 * it stands before that step; it may keep whatever it likes between calls. It must not change the state it is given.
 */
export type Brain<S, I> = (s: S) => I;
/** Makes the agent for one seat of a game: its level, and numbers between 0 and 1 for whatever it leaves to chance. */
export type BrainFor<S, I> = (seat: number, level: Level, rnd: () => number) => Brain<S, I>;

/**
 * An agent sees the game this many steps before its input counts: its inputs are in hand before the screen needs
 * them, and it is a first slice of the reaction time every level has anyway.
 */
export const AHEAD = 6;
/** a screen back from a long pause is caught up at most this many steps per message */
const MOST = 600;
/** inputs in one message: Netplay takes no more than 128 */
const PER_MSG = 96;

export class BotLine<S, I> implements Line {
  readonly ready = true;
  readonly direct = true;
  readonly rtt = 0;
  /** the game after `t` steps, as this line plays it */
  private readonly s: S;
  private t = 0;
  /** each seat's input by step: the person's as sent, the agents' as decided */
  private readonly inputs: Map<number, I>[];
  /** the highest step the person's inputs are all in up to, and the highest of the agents' sent on */
  private got: number;
  private sent: number;
  /** inputs before this step are forgotten */
  private kept = 0;
  private closed = false;

  constructor(
    private readonly rules: Rules<S, I>,
    /** each seat's player id */
    private readonly ids: readonly string[],
    /** the seat this screen plays */
    private readonly me: number,
    /** each seat's agent; none for this screen's own seat */
    private readonly brains: readonly (Brain<S, I> | null)[],
    private readonly onMsg: (from: string, m: object) => void,
  ) {
    this.s = rules.start();
    this.inputs = ids.map(() => new Map());
    this.got = rules.delay - 1;
    this.sent = rules.delay - 1;
  }

  private inputAt(seat: number, t: number): I {
    return (t >= this.rules.delay && this.inputs[seat].get(t)) || this.rules.idle(seat);
  }

  /** Netplay's messages to the others: this seat's inputs are what the agents need. */
  send(d: object) {
    const m = d as { t?: unknown; n?: unknown; f?: unknown; d?: unknown };
    if (this.closed || m.t !== "in" || typeof m.n !== "number" || !Array.isArray(m.d)) return;
    const first = m.n - m.d.length + 1;
    m.d.forEach((v, k) => {
      const i = this.rules.dec(v);
      if (i !== null && first + k > this.got) this.inputs[this.me].set(first + k, i);
    });
    while (this.inputs[this.me].has(this.got + 1)) this.got += 1;
    // play on while the person's input for the next step is in; the agents decide AHEAD steps before they act
    for (let k = 0; k < MOST && this.t <= this.got; k++) {
      this.brains.forEach((brain, seat) => {
        if (brain) this.inputs[seat].set(this.t + AHEAD, brain(this.s));
      });
      this.rules.step(
        this.s,
        this.ids.map((_, seat) => this.inputAt(seat, this.t)),
      );
      this.t += 1;
    }
    const top = this.t + AHEAD - 1;
    const a = this.ids.map(() => this.got);
    const f = typeof m.f === "number" ? m.f : this.t;
    // the agents' new inputs, a message's worth at a time
    while (this.sent < top) {
      const from = Math.max(this.sent + 1, this.rules.delay);
      const to = Math.min(top, from + PER_MSG - 1);
      this.brains.forEach((brain, seat) => {
        if (!brain) return;
        const out: unknown[] = [];
        for (let t = from; t <= to; t++) out.push(this.rules.enc(this.inputAt(seat, t)));
        this.onMsg(this.ids[seat], { t: "in", n: to, f, a, d: out });
      });
      this.sent = to;
    }
    // nothing played and sent is needed again
    for (; this.kept < this.t; this.kept++) this.inputs.forEach((list) => list.delete(this.kept));
  }

  close() {
    this.closed = true;
  }
}

/** An agent for this screen's own seat, for the lab's attract mode: what it decides counts AHEAD steps on, as over the line. */
function delayed<S, I>(brain: Brain<S, I>, idle: I): Brain<S, I> {
  const queue: I[] = [];
  return (s) => {
    queue.push(brain(s));
    return queue.length > AHEAD ? queue.shift()! : idle;
  };
}

/**
 * The line for a solo match and, in the lab's attract mode, an agent for this screen's own seat as well: `auto` is
 * then called once for every step with the game before it, and gives this seat's input for that step. `ids` are the
 * seats' player ids; `seed` is the match's own, used unless the lab gave one.
 */
export function botTable<S, I>(
  ids: readonly string[],
  self: string,
  solo: Solo,
  seed: number,
  rules: Rules<S, I>,
  brainFor: BrainFor<S, I>,
  onMsg: (from: string, m: object) => void,
): { link: BotLine<S, I>; auto: Brain<S, I> | null } {
  const me = Math.max(0, ids.indexOf(self));
  const from = (solo.seed ?? seed) >>> 0;
  const make = (seat: number) => brainFor(seat, solo.level, dice((from ^ Math.imul(seat + 1, 0x9e3779b1)) >>> 0));
  const brains = ids.map((id, seat) => (seat !== me && (isBot(id) || solo.auto) ? make(seat) : null));
  const link = new BotLine(rules, ids, me, brains, onMsg);
  return { link, auto: solo.auto ? delayed(make(me), rules.idle(me)) : null };
}
