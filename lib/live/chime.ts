"use client";

let ctx: AudioContext | null = null;

/** Browsers keep audio locked until a click, so the first gesture on the page unlocks it. */
export function unlockChime() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {}
}

/** A short two-note arcade ding: higher for a question, lower and softer for a finished answer. */
export function chime(kind: "ask" | "done") {
  if (!ctx || ctx.state !== "running") return;
  const notes = kind === "ask" ? [988, 1319] : [784, 1047];
  const t0 = ctx.currentTime + 0.01;
  notes.forEach((f, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "square";
    osc.frequency.value = f;
    const t = t0 + i * 0.11;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(kind === "ask" ? 0.08 : 0.05, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  });
}
