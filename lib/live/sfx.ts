"use client";

import { useSyncExternalStore } from "react";

/*
 * The games' sounds: short chiptune bleeps made on the spot with Web Audio, no files to load. Each is a few square,
 * triangle or noise notes; the viewer can switch them all off, and the choice stays in this browser.
 */

const KEY = "relay.sfx";
/** the same sound played again sooner than this is dropped: a puck rattling in a corner stays one click */
const AGAIN_MS = 45;
const MASTER = 0.5;

interface Tone {
  /** start, s after the sound begins */
  at: number;
  dur: number;
  /** pitch, Hz; `to` slides it there by the end */
  f: number;
  to?: number;
  wave?: OscillatorType;
  vol?: number;
}

interface Noise {
  at: number;
  dur: number;
  /** a low-pass cut-off: low for a thud, high for a hiss */
  cut: number;
  vol?: number;
}

interface Spec {
  tones?: Tone[];
  noise?: Noise[];
}

const arp = (fs: number[], step: number, dur: number, wave: OscillatorType = "square", vol = 0.12): Tone[] =>
  fs.map((f, i) => ({ at: i * step, dur, f, wave, vol }));

const SOUNDS = {
  /** a piece set down on the board */
  move: {
    tones: [{ at: 0, dur: 0.05, f: 220, to: 140, wave: "triangle", vol: 0.35 }],
    noise: [{ at: 0, dur: 0.035, cut: 1800, vol: 0.25 }],
  },
  /** a piece picked up */
  select: { tones: [{ at: 0, dur: 0.04, f: 660, wave: "square", vol: 0.06 }] },
  /** a piece taken off the board */
  capture: {
    tones: [
      { at: 0, dur: 0.06, f: 300, to: 120, wave: "square", vol: 0.14 },
      { at: 0.05, dur: 0.08, f: 180, to: 70, wave: "triangle", vol: 0.3 },
    ],
    noise: [{ at: 0, dur: 0.09, cut: 2600, vol: 0.3 }],
  },
  /** check, or a man crowned */
  check: { tones: arp([880, 1175], 0.08, 0.09, "square", 0.1) },
  promote: { tones: arp([523, 659, 784, 1047], 0.06, 0.08, "square", 0.09) },
  /** a move the rules don't allow */
  illegal: { tones: [{ at: 0, dur: 0.12, f: 140, to: 110, wave: "square", vol: 0.08 }] },
  /** the other player moved: your turn */
  turn: { tones: arp([784, 988], 0.07, 0.08, "triangle", 0.18) },
  win: {
    tones: [...arp([523, 659, 784, 1047, 1319], 0.09, 0.1), { at: 0.45, dur: 0.35, f: 1568, wave: "square", vol: 0.1 }],
  },
  lose: {
    tones: [
      ...arp([494, 440, 392], 0.16, 0.15, "triangle", 0.2),
      { at: 0.48, dur: 0.4, f: 330, to: 262, wave: "triangle", vol: 0.2 },
    ],
  },
  draw: { tones: arp([523, 523, 659], 0.12, 0.1, "triangle", 0.18) },
  /** a paddle or a mallet meets the puck */
  hit: {
    tones: [{ at: 0, dur: 0.05, f: 520, to: 380, wave: "square", vol: 0.1 }],
    noise: [{ at: 0, dur: 0.02, cut: 4000, vol: 0.12 }],
  },
  /** the puck off a wall */
  wall: { tones: [{ at: 0, dur: 0.04, f: 300, to: 240, wave: "triangle", vol: 0.22 }] },
  /** you scored */
  goal: {
    tones: [...arp([392, 523, 659, 784], 0.07, 0.09), { at: 0.28, dur: 0.3, f: 1047, wave: "square", vol: 0.1 }],
    noise: [{ at: 0, dur: 0.25, cut: 6000, vol: 0.08 }],
  },
  /** they scored */
  conceded: {
    tones: [{ at: 0, dur: 0.3, f: 330, to: 165, wave: "square", vol: 0.1 }],
    noise: [{ at: 0, dur: 0.2, cut: 900, vol: 0.2 }],
  },
  /** your clock in its last ten seconds, once a second */
  tick: { tones: [{ at: 0, dur: 0.03, f: 1760, wave: "square", vol: 0.04 }] },
  /** a countdown beat, and the go after it */
  count: { tones: [{ at: 0, dur: 0.08, f: 660, wave: "square", vol: 0.08 }] },
  go: { tones: [{ at: 0, dur: 0.18, f: 1320, wave: "square", vol: 0.09 }] },
  /** a wire joined, in cables */
  link: { tones: arp([660, 990], 0.05, 0.06, "triangle", 0.2) },
  /** a cable told to turn: a soft tick under the finger */
  steer: { tones: [{ at: 0, dur: 0.03, f: 1200, to: 900, wave: "triangle", vol: 0.12 }] },
  /** the arena: a blade meets something */
  slash: {
    tones: [{ at: 0, dur: 0.07, f: 900, to: 260, wave: "sawtooth", vol: 0.07 }],
    noise: [{ at: 0, dur: 0.08, cut: 5200, vol: 0.22 }],
  },
  /** a bowstring, a cannon, a spore let go */
  shoot: {
    tones: [{ at: 0, dur: 0.09, f: 420, to: 900, wave: "triangle", vol: 0.16 }],
    noise: [{ at: 0, dur: 0.05, cut: 3000, vol: 0.12 }],
  },
  /** a spell cast */
  zap: { tones: arp([660, 880, 1320], 0.04, 0.07, "triangle", 0.14) },
  /** something blows up */
  boom: {
    tones: [{ at: 0, dur: 0.35, f: 140, to: 40, wave: "triangle", vol: 0.4 }],
    noise: [{ at: 0, dur: 0.45, cut: 900, vol: 0.45 }],
  },
  heal: { tones: arp([523, 784, 1047], 0.06, 0.12, "sine", 0.16) },
  /** a shield goes up, or soaks a blow */
  shield: { tones: [{ at: 0, dur: 0.18, f: 300, to: 520, wave: "sine", vol: 0.2 }] },
  /** a fighter falls */
  fall: {
    tones: [{ at: 0, dur: 0.3, f: 260, to: 70, wave: "square", vol: 0.08 }],
    noise: [{ at: 0.05, dur: 0.2, cut: 700, vol: 0.25 }],
  },
  /** a leader's ultimate */
  ult: {
    tones: [...arp([392, 523, 659, 784, 1047], 0.05, 0.1, "square", 0.08), { at: 0.25, dur: 0.5, f: 1568, to: 784, wave: "triangle", vol: 0.12 }],
    noise: [{ at: 0.2, dur: 0.4, cut: 7000, vol: 0.1 }],
  },
  crit: { tones: [{ at: 0, dur: 0.12, f: 1400, to: 300, wave: "square", vol: 0.1 }], noise: [{ at: 0, dur: 0.14, cut: 6000, vol: 0.3 }] },
  miss: { tones: [{ at: 0, dur: 0.12, f: 700, to: 1100, wave: "sine", vol: 0.1 }] },
  /** something called onto the field */
  summon: { tones: arp([330, 440, 554, 659], 0.05, 0.12, "triangle", 0.15) },
  /** a star earned at a battle's end */
  star: { tones: arp([1047, 1568], 0.05, 0.12, "triangle", 0.14) },
  /** a new round */
  gong: { tones: [{ at: 0, dur: 0.5, f: 196, wave: "triangle", vol: 0.25 }, { at: 0, dur: 0.4, f: 392, wave: "sine", vol: 0.12 }] },
} satisfies Record<string, Spec>;

export type SfxName = keyof typeof SOUNDS;

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let on: boolean | null = null;
const last = new Map<SfxName, number>();
const listeners = new Set<() => void>();

function readOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

const snap = () => (on ??= readOn());

export function setSfxOn(next: boolean) {
  on = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

/** Whether the games' sounds are on in this browser. */
export function useSfxOn(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snap,
    () => true,
  );
}

/**
 * Wakes the sound up from inside a click or key press, the only place Safari lets it start. A sound asked for before
 * that is dropped rather than saved up.
 */
export function unlockSfx() {
  if (typeof window !== "undefined" && snap()) audio();
}

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 0.5);
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function envelope(ac: AudioContext, t: number, dur: number, vol: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol * MASTER, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(ac.destination);
  return g;
}

/** Plays one of the games' sounds, unless they are off or audio is still locked: then it is dropped, not queued. */
export function sfx(name: SfxName) {
  if (typeof window === "undefined" || !snap()) return;
  const now = performance.now();
  if (now - (last.get(name) ?? -Infinity) < AGAIN_MS) return;
  last.set(name, now);
  const ac = audio();
  if (!ac || ac.state !== "running") return;
  const spec: Spec = SOUNDS[name];
  const t0 = ac.currentTime + 0.005;
  for (const n of spec.tones ?? []) {
    const t = t0 + n.at;
    const osc = ac.createOscillator();
    osc.type = n.wave ?? "square";
    osc.frequency.setValueAtTime(n.f, t);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t + n.dur);
    osc.connect(envelope(ac, t, n.dur, n.vol ?? 0.12));
    osc.start(t);
    osc.stop(t + n.dur + 0.02);
  }
  for (const n of spec.noise ?? []) {
    const t = t0 + n.at;
    const src = ac.createBufferSource();
    src.buffer = noise(ac);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = n.cut;
    src.connect(lp).connect(envelope(ac, t, n.dur, n.vol ?? 0.2));
    src.start(t);
    src.stop(t + n.dur + 0.02);
  }
}
