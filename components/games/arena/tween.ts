/*
 * A small animation clock for the arena: steps that run every frame until they say they are done, each with a
 * promise for whoever waits on it. The scene's render loop ticks it; speeding the battle up only speeds the clock.
 */

export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;
export const easeOut: Ease = (t) => 1 - (1 - t) ** 3;
export const easeIn: Ease = (t) => t ** 3;
export const easeInOut: Ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const backOut: Ease = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

interface Job {
  /** seconds since it started; returns true when done */
  step: (age: number, dt: number) => boolean;
  age: number;
  done: () => void;
}

export class Clock {
  private jobs: Job[] = [];
  /** how much faster than real time the battle plays */
  speed = 1;
  /** a short freeze on a heavy hit: everything waits, the camera may still shake */
  private hold = 0;
  /** a stretch of slow motion after a killing blow: how slow, and how much of it is left, in real seconds */
  private warp = 1;
  private warpLeft = 0;

  /** How fast things move right now: the battle's speed, slowed for a moment after a kill, all but still in a freeze. */
  get rate() {
    if (this.hold > 0) return 0.06;
    return this.speed * (this.warpLeft > 0 ? this.warp : 1);
  }

  tick(dt: number) {
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    let d = dt * this.speed;
    if (this.warpLeft > 0) {
      this.warpLeft -= dt;
      // it eases back to full speed over its last eighth of a second
      d *= this.warp + (1 - this.warp) * Math.max(0, 1 - this.warpLeft / 0.12);
    }
    for (const j of [...this.jobs]) {
      j.age += d;
      if (j.step(j.age, d)) {
        this.jobs = this.jobs.filter((x) => x !== j);
        j.done();
      }
    }
  }

  /** Runs `step` every frame until it returns true. */
  run(step: (age: number, dt: number) => boolean): Promise<void> {
    return new Promise((done) => this.jobs.push({ step, age: 0, done }));
  }

  /** Calls `f` with the eased progress 0–1 over `secs`. */
  tween(secs: number, f: (k: number) => void, ease: Ease = easeInOut): Promise<void> {
    return this.run((age) => {
      const t = Math.min(1, age / secs);
      f(ease(t));
      return t >= 1;
    });
  }

  wait(secs: number): Promise<void> {
    return this.run((age) => age >= secs);
  }

  freeze(secs: number) {
    this.hold = Math.max(this.hold, secs);
  }

  /** Plays everything at `factor` of its speed for `secs` real seconds: the moment after a killing blow. */
  slow(factor: number, secs: number) {
    this.warp = factor;
    this.warpLeft = Math.max(this.warpLeft, secs);
  }

  /** Ends everything at once, as if each had run to its end. */
  flush() {
    this.hold = 0;
    this.warpLeft = 0;
    const jobs = this.jobs;
    this.jobs = [];
    for (const j of jobs) {
      j.step(1e9, 0);
      j.done();
    }
  }

  get busy() {
    return this.jobs.length > 0;
  }
}
