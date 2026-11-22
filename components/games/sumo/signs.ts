"use client";

import { calm, clamp } from "./pixels";

/*
 * The words over the floe. They are text, so they are elements of the page laid over the canvas rather than pixels
 * on it: a plate that drops from the top edge for the round's number, a word where somebody went in, a tag when the
 * ice starts to go.
 */

/** The plate at the top: `main` on it, `tag` under that in amber or nothing. It drops in, stays `ms` and goes back up. */
export function plate(el: HTMLElement | null, main: string, tag: string | null, ms: number) {
  if (!el) return;
  const b = el.querySelector("b");
  const i = el.querySelector("i");
  if (b) b.textContent = main;
  if (i) {
    i.textContent = tag ?? "";
    i.hidden = !tag;
  }
  for (const a of el.getAnimations()) a.cancel();
  const up = "translate(-50%, -180%)";
  const down = "translate(-50%, 0)";
  el.animate(
    calm()
      ? [{ opacity: 0, transform: down }, { opacity: 1, transform: down, offset: 0.12 }, { opacity: 1, transform: down, offset: 0.85 }, { opacity: 0, transform: down }]
      : [
          { opacity: 1, transform: up },
          { opacity: 1, transform: "translate(-50%, 5px)", offset: 0.13 },
          { opacity: 1, transform: down, offset: 0.19 },
          { opacity: 1, transform: down, offset: 0.86 },
          { opacity: 1, transform: up },
        ],
    { duration: ms, easing: "steps(26, end)" },
  );
}

/** A word that jumps up where something happened, at the shares (x, y) of the stage, a little over the spot. */
export function shout(el: HTMLElement | null, text: string, x: number, y: number, big: boolean) {
  if (!el) return;
  el.textContent = text;
  el.style.left = `${clamp(x, 0.2, 0.8) * 100}%`;
  el.style.top = `${clamp(y - 0.1, 0.12, 0.9) * 100}%`;
  el.classList.toggle("big", big);
  for (const a of el.getAnimations()) a.cancel();
  const at = "translate(-50%, -50%)";
  el.animate(
    calm()
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: `${at} translateY(14px) scale(0.4)` },
          { opacity: 1, transform: `${at} translateY(-4px) scale(1.25)`, offset: 0.16 },
          { opacity: 1, transform: `${at} translateY(0) scale(1)`, offset: 0.28 },
          { opacity: 1, transform: `${at} translateY(-6px) scale(1)`, offset: 0.76 },
          { opacity: 0, transform: `${at} translateY(-14px) scale(1)` },
        ],
    { duration: big ? 1350 : 950, easing: "ease-out" },
  );
}

/** A tag at the bottom edge that blinks in, stays `ms` and goes. */
export function tag(el: HTMLElement | null, text: string, ms: number) {
  if (!el) return;
  el.textContent = text;
  for (const a of el.getAnimations()) a.cancel();
  el.animate(
    [
      { opacity: 0 },
      { opacity: 1, offset: 0.04 },
      { opacity: 0, offset: 0.09 },
      { opacity: 1, offset: 0.14 },
      { opacity: 1, offset: 0.9 },
      { opacity: 0 },
    ],
    { duration: ms, easing: "steps(20, end)" },
  );
}
