import { SfxSpec, arp, sfxPlay } from "../sfx";

/*
 * The games hall's own sounds: a tick as the pointer or the arrows cross the machines, a blip for a machine picked, a
 * coin for a game started. All of them short and quieter than a piece set down on a board, since a hall is walked
 * through far more often than a move is made.
 */

/** one machine after another: each a step up a five-note scale, so a sweep along the wall plays a little run */
const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

const TICK: SfxSpec = { tones: [{ at: 0, dur: 0.028, f: 740, wave: "square", vol: 0.03 }] };
const PICK: SfxSpec = { tones: arp([587, 880], 0.045, 0.06, "triangle", 0.13) };
const SET: SfxSpec = { tones: [{ at: 0, dur: 0.04, f: 660, to: 700, wave: "triangle", vol: 0.1 }] };
/** a coin through the slot, and the machine waking */
const START: SfxSpec = {
  tones: [
    { at: 0, dur: 0.05, f: 988, wave: "square", vol: 0.06 },
    { at: 0.055, dur: 0.16, f: 1319, wave: "square", vol: 0.06 },
    { at: 0.055, dur: 0.16, f: 659, wave: "triangle", vol: 0.12 },
  ],
  noise: [{ at: 0, dur: 0.02, cut: 5000, vol: 0.06 }],
};
/** an invite on its way to a guest */
const CALL: SfxSpec = { tones: arp([659, 784, 988], 0.06, 0.08, "triangle", 0.12) };
const BACK: SfxSpec = { tones: [{ at: 0, dur: 0.07, f: 520, to: 392, wave: "triangle", vol: 0.1 }] };
/** a cartridge pushed home */
const CART: SfxSpec = {
  tones: [{ at: 0.03, dur: 0.05, f: 196, to: 147, wave: "triangle", vol: 0.2 }],
  noise: [
    { at: 0, dur: 0.03, cut: 2600, vol: 0.1 },
    { at: 0.03, dur: 0.03, cut: 1200, vol: 0.14 },
  ],
};

/** the same tick again sooner than this is dropped: a pointer dragged over the wall does not rattle */
const TICK_GAP_MS = 70;
let lastTick = 0;

/** The pointer or the arrows landed on machine number `i`. */
export function hallTick(i = 0) {
  const now = performance.now();
  if (now - lastTick < TICK_GAP_MS) return;
  lastTick = now;
  const oct = Math.floor(i / SCALE.length) % 2 ? 2 : 1;
  sfxPlay("hall.tick", TICK, { pitch: SCALE[i % SCALE.length] * oct });
}

/** A machine picked, or a cabinet in a corner opened. */
export const hallPick = () => sfxPlay("hall.pick", PICK);
/** A switch flipped: the level, the clock, a guest marked. */
export const hallSet = (step = 0) => sfxPlay("hall.set", SET, { pitch: 1 + step * 0.12 });
/** A game against an agent starts. */
export const hallStart = () => sfxPlay("hall.start", START);
/** An invite goes out to a guest. */
export const hallCall = () => sfxPlay("hall.call", CALL);
/** An invite taken back. */
export const hallBack = () => sfxPlay("hall.back", BACK);
/** A cartridge goes into the console. */
export const hallCart = () => sfxPlay("hall.cart", CART);
