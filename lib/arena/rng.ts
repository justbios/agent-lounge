/**
 * The battle's dice. Both screens of a battle roll the same numbers from the same seed, so a battle is fully decided by
 * its seed and its commands: that is what lets two players and a replay agree to the hit point.
 */

/** A seed from any text, such as the battle's id. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32: the next number in [0, 1) and the state after it. */
export function roll(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Dice that keep their own state, for one command's worth of rolls. */
export class Dice {
  state: number;

  constructor(state: number) {
    this.state = state;
  }

  /** a number in [0, 1) */
  next(): number {
    const [v, s] = roll(this.state);
    this.state = s;
    return v;
  }

  /** a whole number from `lo` to `hi`, both included */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p: number): boolean {
    return p > 0 && this.next() < p;
  }
}
