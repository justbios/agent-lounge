"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef } from "react";

/*
 * How a piece moves on the chess and draughts boards. A piece is drawn inside the square it stands on, so a move is
 * played back from where it came: it lifts, travels, comes down and settles. Where it is and how high it is are two
 * animations on two properties (`translate`; `scale`, `transform` and the shadow), so the flight path and the arc
 * each keep their own easing. Nothing here knows the rules of either game.
 */

/** a piece let go from the hand settles in this long */
export const DROP_MS = 90;
/** a hopping piece rests this long on each square it lands on before the next hop */
export const DWELL_MS = 55;
/** a taken piece reels from the blow, then flies to the tray */
export const KNOCK_MS = 90;
export const FLY_MS = 380;
/** after it lands a piece squashes and springs back */
const SETTLE_MS = 130;

export const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where a square is drawn, in squares from the top left corner, for whoever looks at the board. */
export const spot = (sq: number, flip: boolean): [number, number] => {
  const c = sq % 8;
  const r = Math.floor(sq / 8);
  return flip ? [7 - c, 7 - r] : [c, r];
};

/** Squares between two squares, as a king walks. */
export const reach = (a: number, b: number) =>
  Math.max(Math.abs((a % 8) - (b % 8)), Math.abs(Math.floor(a / 8) - Math.floor(b / 8)));

/** The way from `a` to `b` on the screen, as a unit step: which way a blow from `a` throws what stands on `b`. */
export function heading(a: number, b: number, flip: boolean): [number, number] {
  const [ax, ay] = spot(a, flip);
  const [bx, by] = spot(b, flip);
  const d = Math.hypot(bx - ax, by - ay) || 1;
  return [(bx - ax) / d, (by - ay) / d];
}

export type Gait = "slide" | "hop";

export interface Trip {
  /** the squares the piece touched, from where it stood to where it stands now */
  path: number[];
  /** low over the board, or in an arc from square to square */
  gait: Gait;
  /** ms before it sets off */
  wait?: number;
  /** let go from the hand this far from the middle of its square, px: it only settles, it does not travel */
  drop?: { dx: number; dy: number } | null;
  /** which of the square's pieces travels, when it holds more than one for a moment */
  pick?: string;
}

/** How long one leg of a trip takes: further is longer, but never slow. */
export function legMs(a: number, b: number, gait: Gait): number {
  const d = reach(a, b);
  return gait === "hop" ? 170 + 45 * Math.min(d, 4) : Math.min(360, 150 + 42 * d);
}

/** When each leg of a trip lands, ms from the moment it is played. */
export function landings(trip: Trip): number[] {
  const wait = trip.wait ?? 0;
  if (trip.drop) return [wait + DROP_MS];
  const out: number[] = [];
  let at = wait;
  for (let i = 1; i < trip.path.length; i++) {
    at += legMs(trip.path[i - 1], trip.path[i], trip.gait);
    out.push(at);
    if (trip.gait === "hop") at += DWELL_MS;
  }
  return out;
}

const shadow = (size: number, lift: number) =>
  `drop-shadow(${Math.round(size * (0.035 + lift * 0.1))}px ${Math.round(size * (0.035 + lift * 0.2))}px 0 rgba(7, 5, 13, ${(0.38 - lift * 0.16).toFixed(2)}))`;

/**
 * Plays one trip on the piece that stands on its last square. Returns the animations, so the next move can finish
 * them at once.
 */
export function travel(grid: HTMLElement, trip: Trip, flip: boolean): Animation[] {
  const to = trip.path.at(-1)!;
  const cell = grid.querySelector<HTMLElement>(`[data-sq="${to}"]`);
  const piece = cell?.querySelector<SVGElement>(trip.pick ?? ":scope > .piece, :scope > .man");
  if (!cell || !piece || trip.path.length < 2) return [];
  const size = cell.offsetWidth;
  const wait = trip.wait ?? 0;
  const [tx, ty] = spot(to, flip);
  const at = (sq: number) => {
    const [x, y] = spot(sq, flip);
    return `${(x - tx) * size}px ${(y - ty) * size}px`;
  };
  const lands = landings(trip).map((ms) => ms - wait);
  const total = lands.at(-1)! + SETTLE_MS;
  const where: Keyframe[] = [];
  const high: Keyframe[] = [];
  const ground = { scale: "1 1", transform: "translateY(0)", filter: shadow(size, 0) };

  if (trip.drop) {
    where.push(
      { translate: `${trip.drop.dx}px ${trip.drop.dy}px`, offset: 0, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
      { translate: "0px 0px", offset: DROP_MS / total },
      { translate: "0px 0px", offset: 1 },
    );
    high.push({ scale: "1.16 1.16", transform: `translateY(${-size * 0.08}px)`, filter: shadow(size, 0.6), offset: 0, easing: "ease-in" });
  } else {
    let t = 0;
    for (let i = 1; i < trip.path.length; i++) {
      const a = trip.path[i - 1];
      const b = trip.path[i];
      const land = lands[i - 1];
      const d = reach(a, b);
      if (trip.gait === "hop") {
        const arc = size * Math.min(1.1, 0.38 + 0.22 * d);
        where.push({ translate: at(a), offset: t / total, easing: "cubic-bezier(0.3, 0.2, 0.6, 0.9)" });
        high.push(
          { ...ground, offset: t / total, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" },
          {
            scale: "1.2 1.2",
            transform: `translateY(${-arc}px)`,
            filter: shadow(size, 1),
            offset: (t + (land - t) * 0.5) / total,
            easing: "cubic-bezier(0.6, 0, 0.8, 0.3)",
          },
        );
        t = land;
        if (i < trip.path.length - 1) {
          // a short rest on the square between two hops, squashed by the landing
          where.push({ translate: at(b), offset: t / total });
          high.push({ scale: "1.08 0.9", transform: "translateY(0)", filter: shadow(size, 0), offset: t / total });
          t += DWELL_MS;
        }
      } else {
        const lift = size * 0.1;
        where.push({ translate: at(a), offset: t / total, easing: "cubic-bezier(0.3, 0.05, 0.2, 1)" });
        high.push(
          { ...ground, offset: t / total, easing: "ease-out" },
          { scale: "1.13 1.13", transform: `translateY(${-lift}px)`, filter: shadow(size, 0.6), offset: (t + (land - t) * 0.24) / total },
          {
            scale: "1.13 1.13",
            transform: `translateY(${-lift}px)`,
            filter: shadow(size, 0.6),
            offset: (t + (land - t) * 0.7) / total,
            easing: "ease-in",
          },
        );
        t = land;
      }
    }
    where.push({ translate: "0px 0px", offset: lands.at(-1)! / total }, { translate: "0px 0px", offset: 1 });
  }
  const down = lands.at(-1)!;
  high.push(
    { ...ground, offset: down / total, easing: "ease-out" },
    { scale: "1.08 0.9", transform: "translateY(0)", filter: shadow(size, 0), offset: (down + SETTLE_MS * 0.35) / total, easing: "ease-in-out" },
    { ...ground, offset: 1 },
  );

  piece.style.zIndex = "4";
  const options: KeyframeAnimationOptions = { duration: total, delay: wait, fill: "backwards" };
  const a = piece.animate(where, options);
  const b = piece.animate(high, options);
  a.onfinish = a.oncancel = () => piece.style.removeProperty("z-index");
  return [a, b];
}

/**
 * Knocks a taken piece off its square and into a tray: it reels the way the blow went, then spins across in an arc
 * and shrinks to the size of the piece waiting there. `fly` is the wrapper that stands on the square, its one child
 * the piece; `tray` is where it lands, or nothing, and then it is thrown clear of the board.
 */
export function knockOff(fly: HTMLElement, tray: Element | null, dir: readonly [number, number], wait: number): Animation[] {
  const piece = fly.firstElementChild as HTMLElement | SVGElement | null;
  if (!piece) return [];
  const from = fly.getBoundingClientRect();
  const size = from.width;
  let dx = dir[0] * size * 2;
  let dy = dir[1] * size * 2 - size;
  let k = 0.4;
  if (tray) {
    const to = tray.getBoundingClientRect();
    dx = to.left + to.width / 2 - (from.left + from.width / 2);
    dy = to.top + to.height / 2 - (from.top + from.height / 2);
    k = Math.min(1, to.width / Math.max(1, piece.getBoundingClientRect().width));
  }
  const total = KNOCK_MS + FLY_MS;
  const hit = KNOCK_MS / total;
  const spin = (dir[0] < 0 ? -1 : 1) * 540;
  const arc = Math.min(size * 1.2, Math.abs(dy) * 0.25 + size * 0.5) * (dy > 0 ? 1 : 0.5);
  const options: KeyframeAnimationOptions = { duration: total, delay: wait, fill: "both" };
  const a = fly.animate(
    [
      { translate: "0px 0px", offset: 0, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
      { translate: `${dir[0] * size * 0.3}px ${dir[1] * size * 0.3}px`, offset: hit, easing: "cubic-bezier(0.45, 0, 0.75, 0.75)" },
      { translate: `${dx}px ${dy}px`, offset: 1 },
    ],
    options,
  );
  // the arc is the wrapper's too, on another property, so it rises and falls on its own curve
  const c = fly.animate(
    [
      { transform: "translateY(0)", offset: 0 },
      { transform: "translateY(0)", offset: hit, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" },
      { transform: `translateY(${-arc}px)`, offset: hit + (1 - hit) * 0.45, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)" },
      { transform: "translateY(0)", offset: 1 },
    ],
    options,
  );
  const b = piece.animate(
    [
      { rotate: "0deg", scale: "1", filter: "brightness(1)", opacity: 1, offset: 0 },
      { rotate: "0deg", scale: "1.14", filter: "brightness(3.2)", opacity: 1, offset: 0.03 },
      { rotate: `${spin * 0.08}deg`, scale: "1.1", filter: "brightness(1.5)", opacity: 1, offset: hit },
      { rotate: `${spin * 0.55}deg`, scale: `${(1 + k) / 2}`, filter: "brightness(1)", opacity: 1, offset: hit + (1 - hit) * 0.5 },
      { rotate: `${spin}deg`, scale: `${k}`, filter: "brightness(1)", opacity: 1, offset: 0.97 },
      { rotate: `${spin}deg`, scale: `${k}`, filter: "brightness(1)", opacity: 0, offset: 1 },
    ],
    options,
  );
  return [a, b, c];
}

/**
 * Sends a taken piece on its way by itself. The board draws it (`poof`) only as a pattern, on the square it stood on;
 * a copy is put on the `layer` over the board and that one is knocked off, so it finishes its flight to the tray even
 * if the next move is made while it is still in the air.
 */
export function flyOff(layer: HTMLElement | null, poof: HTMLElement, tray: Element | null, dir: readonly [number, number], wait: number) {
  if (!layer || calm()) return;
  const from = poof.getBoundingClientRect();
  const base = layer.getBoundingClientRect();
  const copy = poof.cloneNode(true) as HTMLElement;
  copy.style.left = `${from.left - base.left}px`;
  copy.style.top = `${from.top - base.top}px`;
  copy.style.width = `${from.width}px`;
  copy.style.height = `${from.height}px`;
  layer.appendChild(copy);
  const flight = knockOff(copy, tray, dir, wait);
  const gone = () => copy.remove();
  if (flight.length) flight[0].onfinish = flight[0].oncancel = gone;
  else gone();
}

/** A short jolt of the whole board when something lands hard: `power` 1 for a pawn taken, 3 for a mate. */
export function shake(el: HTMLElement | null | undefined, power: number, wait = 0): Animation | null {
  if (!el || calm()) return null;
  const p = Math.min(4, 1 + power);
  return el.animate(
    [
      { translate: "0px 0px" },
      { translate: `${p}px ${-p}px` },
      { translate: `${-p}px ${Math.ceil(p / 2)}px` },
      { translate: `${Math.ceil(p / 2)}px ${Math.ceil(p / 2)}px` },
      { translate: "0px 0px" },
    ],
    { duration: 110 + power * 30, delay: wait, easing: "steps(4, end)" },
  );
}

export interface Later {
  /** runs `fn` in `ms`, unless the board closes or a newer move clears it first */
  (fn: () => void, ms: number): void;
  /** drops everything still waiting */
  clear: () => void;
}

/** Timers that belong to a board: what a move puts off (its landing sound, its dust) dies with the board. */
export function useLater(): Later {
  const timers = useRef(new Set<number>());
  const later = useMemo(() => {
    const run = ((fn: () => void, ms: number) => {
      if (ms <= 0) return fn();
      const id = window.setTimeout(() => {
        timers.current.delete(id);
        fn();
      }, ms);
      timers.current.add(id);
    }) as Later;
    run.clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
    return run;
  }, []);
  useEffect(() => later.clear, [later]);
  return later;
}

/**
 * Calls `stage` before the screen is painted each time `step` changes while the board is open, with the step it had
 * before: the place to start a move's motion, so the piece is never seen standing still on its new square first.
 * The step the board opened with stays quiet.
 */
export function useStage<S>(step: S, stage: (was: S) => void) {
  const seen = useRef(step);
  const run = useEffectEvent(stage);
  useLayoutEffect(() => {
    const was = seen.current;
    if (Object.is(was, step)) return;
    seen.current = step;
    run(was);
  }, [step]);
}

/** A taken piece arrives in its tray: unseen until `wait`, when the one that flew over lands, then it pops in. */
export function trayPop(el: Element | null | undefined, wait: number): Animation | null {
  if (!el || calm()) return null;
  return el.animate(
    [
      { opacity: 0, scale: "0.4" },
      { opacity: 1, scale: "1.5", offset: 0.4 },
      { opacity: 1, scale: "1" },
    ],
    { duration: 200, delay: wait, fill: "backwards", easing: "steps(4, end)" },
  );
}

/** A rack with nothing on it yet but what is on its way stays unseen until that lands at `wait`. */
export function rackOpen(rack: Element | null | undefined, wait: number): Animation | null {
  if (!rack || calm() || rack.querySelector(".took:not(.new)")) return null;
  return rack.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, delay: wait, fill: "backwards", easing: "steps(2, end)" });
}

/** A piece shakes its head: this one does not move. */
export function headShake(el: Element | null | undefined): Animation | null {
  if (!el || calm()) return null;
  return el.animate(
    [{ translate: "0px 0px" }, { translate: "-3px 0px" }, { translate: "3px 0px" }, { translate: "-2px 0px" }, { translate: "0px 0px" }],
    { duration: 220, easing: "steps(4, end)" },
  );
}
