"use client";

let ctx: AudioContext | null = null;

/** Browsers keep audio locked until a click, so the first gesture on the page unlocks it. */
export function unlockChime() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {}
}

const SOUNDS = {
  /** Claude waits on you: a three-note doorbell, unlike anything else in the café */
  ask: { notes: [1319, 988, 1319], wave: "triangle", step: 0.15, peak: 0.16, ring: 0.24 },
  /** a finished answer: two notes up, softer */
  done: { notes: [784, 1047], wave: "square", step: 0.11, peak: 0.05, ring: 0.16 },
  /** a turn that broke off: two notes down */
  err: { notes: [523, 392], wave: "square", step: 0.14, peak: 0.06, ring: 0.2 },
} as const;

/** A short arcade sound for each way Claude hands you the ball. */
export function chime(kind: keyof typeof SOUNDS) {
  if (!ctx || ctx.state !== "running") return;
  const s = SOUNDS[kind];
  const t0 = ctx.currentTime + 0.01;
  s.notes.forEach((f, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = s.wave;
    osc.frequency.value = f;
    const t = t0 + i * s.step;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(s.peak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + s.ring);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t);
    osc.stop(t + s.ring + 0.02);
  });
}
