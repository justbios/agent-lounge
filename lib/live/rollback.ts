/**
 * The rules of a real-time game that every screen plays from the same start with the same inputs, step by step, and
 * so always reaches the same state. Everything in `step` must come out bit for bit the same in every browser: only
 * + - * / and Math.sqrt on numbers, never Math.random, Math.hypot or the trigonometry.
 */
export interface Rules<S, I> {
  /** ms one step stands for */
  readonly ms: number;
  /** steps a player's own input waits before it counts, so it can reach the others first; 0 feels quickest */
  readonly delay: number;
  start(): S;
  /** the state one step on, given each seat's input; changes `s` in place */
  step(s: S, inputs: readonly I[]): void;
  copy(s: S): S;
  /** a seat's input before it has sent any */
  idle(seat: number): I;
  same(a: I, b: I): boolean;
  /** what a seat is taken to do while its own input is on the way, given its latest one */
  guess(last: I): I;
  /** an input as plain JSON, and back from what another screen sent, or null if it isn't one */
  enc(i: I): unknown;
  dec(v: unknown): I | null;
  /** a number that changes with anything that matters, to catch screens that drifted apart */
  sum(s: S): number;
  /** the state as plain JSON, and back, for a screen that drifted apart to take over */
  pack(s: S): unknown;
  unpack(v: unknown): S | null;
}

/** FNV-1a over the exact bits of some numbers. */
export function hashNums(nums: readonly number[]): number {
  const f = new Float64Array(nums);
  const u = new Uint32Array(f.buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 0x01000193);
  return h >>> 0;
}

/** keep this many settled steps of inputs, for a screen that drifted apart and plays them again */
const KEEP_MS = 4000;
/** at most this many of one's own inputs in one message */
const MAX_SEND = 64;
/** the settled game is summed every this many steps */
const SUM_EVERY = 64;

/**
 * Rollback, as fighting games play over the internet: a step runs as soon as it is due, with each other seat's input
 * guessed from its latest one; when the real input arrives and differs, the game goes back to that step and plays
 * forward again, quicker than a frame. One's own moves never wait for the line, and the other players' land a round
 * trip's half late, as they would anyway. A step is settled once every seat's input for it is in.
 */
export class Rollback<S, I> {
  /** steps played so far; `state` is the game after them */
  frame = 0;
  state: S;
  /** the steps every seat's input is in for; the game after them is sure never to change */
  settled = 0;
  /** where the last `advance` went back to and played again from, or -1 */
  rewound = -1;
  /** told the game as it was guessed and as it really is at the same step, after going back, to smooth the jump */
  onRewind: ((was: S, now: S) => void) | null = null;
  private readonly inputs: Map<number, I>[];
  /** the highest step each seat's inputs are all in up to */
  private readonly have: number[];
  /** each seat's latest input in, and its step */
  private readonly latest: { t: number; i: I }[];
  /** the game after t steps, from `settled` on */
  private readonly snaps = new Map<number, S>();
  /** the inputs each unsettled step was played with */
  private readonly used = new Map<number, I[]>();
  /** each other seat has all this seat's inputs up to here */
  private readonly acked: number[];
  /** the first step played with a guess that turned out wrong */
  private dirty = Infinity;
  /** sums of the settled game every SUM_EVERY steps, the latest few */
  private readonly sums = new Map<number, number>();

  constructor(
    readonly rules: Rules<S, I>,
    readonly seats: number,
    readonly me: number,
  ) {
    this.state = rules.start();
    this.snaps.set(0, rules.copy(this.state));
    this.inputs = Array.from({ length: seats }, () => new Map());
    this.have = Array.from({ length: seats }, () => rules.delay - 1);
    this.latest = Array.from({ length: seats }, (_, s) => ({ t: -1, i: rules.idle(s) }));
    this.acked = Array.from({ length: seats }, () => rules.delay - 1);
  }

  /** the game after the settled steps */
  get sure(): S {
    return this.snaps.get(this.settled)!;
  }

  /** how many steps are being played on guesses */
  get unsure(): number {
    return this.frame - this.settled;
  }

  private inputAt(seat: number, t: number): I {
    if (t < this.rules.delay) return this.rules.idle(seat);
    const i = this.inputs[seat].get(t);
    if (i !== undefined) return i;
    const l = this.latest[seat];
    return l.t < 0 ? this.rules.idle(seat) : this.rules.guess(l.i);
  }

  private play(t: number) {
    const ins = Array.from({ length: this.seats }, (_, s) => this.inputAt(s, t));
    this.used.set(t, ins);
    this.rules.step(this.state, ins);
    this.snaps.set(t + 1, this.rules.copy(this.state));
  }

  /** One step on, with this seat's input for the step `delay` ahead; first goes back if a guess turned out wrong. */
  advance(input: I) {
    const own = this.frame + this.rules.delay;
    if (!this.inputs[this.me].has(own)) this.take(this.me, own, input);
    this.sync();
    this.play(this.frame);
    this.frame += 1;
    this.settle();
  }

  /** Goes back and plays again from the first step a guess was wrong for, then settles what can be; no step on. */
  sync() {
    this.rewound = -1;
    if (this.dirty < this.frame) {
      const was = this.state;
      this.rewound = this.dirty;
      this.state = this.rules.copy(this.snaps.get(this.dirty)!);
      for (let t = this.dirty; t < this.frame; t++) this.play(t);
      this.onRewind?.(was, this.state);
    }
    this.dirty = Infinity;
    this.settle();
  }

  private take(seat: number, t: number, i: I) {
    this.inputs[seat].set(t, i);
    if (t > this.latest[seat].t) this.latest[seat] = { t, i };
    while (this.inputs[seat].has(this.have[seat] + 1)) this.have[seat] += 1;
  }

  /** Another seat's input for step t; marks the game for going back if that step was played on a different guess. */
  receive(seat: number, t: number, i: I) {
    if (seat === this.me || t < this.rules.delay || t < this.settled || this.inputs[seat].has(t)) return;
    if (t > this.frame + 4 * MAX_SEND) return;
    this.take(seat, t, i);
    const u = this.used.get(t);
    if (u && !this.rules.same(u[seat], i)) this.dirty = Math.min(this.dirty, t);
  }

  /** Moves `settled` up to the last step every seat's input is in for; called only once no step waits to be replayed. */
  private settle() {
    const top = Math.min(this.frame, ...this.have.map((h) => h + 1));
    if (top <= this.settled) return;
    for (let t = this.settled + 1; t <= top; t++) {
      if (t % SUM_EVERY === 0) this.sums.set(t, this.rules.sum(this.snaps.get(t)!));
    }
    for (let t = this.settled; t < top; t++) {
      this.snaps.delete(t);
      this.used.delete(t);
    }
    this.settled = top;
    for (const t of this.sums.keys()) if (this.sums.size > 16) this.sums.delete(t);
    const old = top - Math.ceil(KEEP_MS / this.rules.ms);
    const sent = Math.min(...this.acked.filter((_, s) => s !== this.me));
    this.inputs.forEach((m, seat) => {
      for (const t of m.keys()) if (t < old && (seat !== this.me || t <= sent)) m.delete(t);
    });
  }

  /** This seat's inputs another screen hasn't confirmed yet, oldest first, and the step of the last one. */
  outgoing(): { n: number; d: unknown[] } | null {
    const from = Math.min(...this.acked.filter((_, s) => s !== this.me)) + 1;
    const mine = this.inputs[this.me];
    const d: unknown[] = [];
    let t = Math.max(from, this.rules.delay);
    for (; d.length < MAX_SEND && mine.has(t); t++) d.push(this.rules.enc(mine.get(t)!));
    return d.length ? { n: t - 1, d } : null;
  }

  /** what this screen has of each seat's inputs, to tell the others */
  get haves(): number[] {
    return this.have.slice();
  }

  /** Another seat says it has all of this seat's inputs up to step `n`. */
  ack(seat: number, n: number) {
    if (seat !== this.me && n > this.acked[seat]) this.acked[seat] = Math.min(n, this.frame + this.rules.delay);
  }

  /** the latest settled step with a sum, and the sum */
  get lastSum(): { n: number; h: number } | null {
    let out: { n: number; h: number } | null = null;
    for (const [n, h] of this.sums) if (!out || n > out.n) out = { n, h };
    return out;
  }

  /** whether another screen's sum for settled step n matches this one's, or null while this screen can't tell */
  matches(n: number, h: number): boolean | null {
    const mine = this.sums.get(n);
    return mine === undefined ? null : mine === h;
  }

  /**
   * Takes over another screen's settled game at step t and plays this screen's steps since again on top of it, for
   * when the two drifted apart.
   */
  adopt(t: number, s: S) {
    if (t > this.frame || t < this.settled - Math.ceil(KEEP_MS / this.rules.ms) + MAX_SEND) return;
    this.snaps.clear();
    this.used.clear();
    this.sums.clear();
    this.snaps.set(t, this.rules.copy(s));
    this.state = this.rules.copy(s);
    for (let k = t; k < this.frame; k++) this.play(k);
    this.settled = t;
    this.dirty = Infinity;
    this.settle();
  }
}
