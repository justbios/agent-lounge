"use client";

import { useEffect, useRef } from "react";
import { ART_H, Pen, SCENES, SceneId } from "./scenes";

/*
 * A machine's screen in the games hall. Every screen on the page shares one ticker: a picture nobody looks at idles
 * at a crawl and is redrawn a few times a second, the one under the pointer or the focus runs at full speed, and one
 * that is off screen, or on a page in the background, is not drawn at all. With less motion asked for they all hold
 * one still frame.
 */

/** how fast a picture's clock runs while nobody looks at it */
const REST = 0.2;
/** an idling picture is redrawn this often, s */
const REST_STEP = 1 / 14;
/** css pixels of card to one picture of about this many art pixels across: decides how big an art pixel is */
const AIM_W = 76;

interface Slot {
  scene: SceneId;
  pen: Pen | null;
  clock: number;
  speed: number;
  hot: boolean;
  seen: boolean;
  dirty: boolean;
  wait: number;
}

const slots = new Set<Slot>();
let raf = 0;
let last = 0;
let held = false;

let less: MediaQueryList | null = null;
/** less motion asked for: asked of the browser once, read every frame */
const calm = () => {
  if (!less && typeof matchMedia === "function") less = matchMedia("(prefers-reduced-motion: reduce)");
  return !!less?.matches;
};

function paint(s: Slot) {
  const p = s.pen;
  if (!p) return;
  p.ctx.setTransform(1, 0, 0, 1, 0, 0);
  p.ctx.globalAlpha = 1;
  SCENES[s.scene].draw(p, s.clock);
}

function frame(now: number) {
  raf = 0;
  // a frame's own time can be earlier than the moment it was asked for: the first one after a wake counts as no time
  const dt = last ? Math.max(0, Math.min(0.1, (now - last) / 1000)) : 0;
  last = now;
  const still = calm() || held;
  let busy = false;
  for (const s of slots) {
    if (!s.seen) continue;
    const aim = still ? 0 : s.hot ? 1 : REST;
    s.speed += (aim - s.speed) * Math.min(1, dt * 7);
    if (Math.abs(aim - s.speed) < 0.004) s.speed = aim;
    if (s.speed > 0) {
      s.clock = (s.clock + dt * s.speed) % (SCENES[s.scene].loop * 60);
      s.wait -= dt;
    }
    if (aim > 0 || s.speed > 0) busy = true;
    if (s.dirty || (s.speed > 0 && (s.wait <= 0 || s.speed > 0.4))) {
      paint(s);
      s.dirty = false;
      s.wait = REST_STEP;
    }
  }
  if (busy && !document.hidden) raf = requestAnimationFrame(frame);
}

function wake() {
  if (raf || typeof window === "undefined" || document.hidden) return;
  last = 0;
  raf = requestAnimationFrame(frame);
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", wake);

/** Stops every picture where it is, and lets them go again: a game being played wants the frames for itself. */
export function holdArt(on: boolean) {
  held = on;
  wake();
}

export default function GameArt({ scene, hot = false, label }: { scene: SceneId; hot?: boolean; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const slot = useRef<Slot | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const room = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !room || !ctx) return;
    const s: Slot = {
      scene,
      pen: null,
      clock: SCENES[scene].pose,
      speed: 0,
      hot: false,
      seen: true,
      dirty: true,
      wait: 0,
    };
    slot.current = s;
    slots.add(s);
    const fit = () => {
      const wide = room.clientWidth;
      if (!wide) return;
      // an art pixel is a whole number of css pixels, and the picture as many of them wide as the card has room for
      const size = Math.max(1, Math.round(wide / AIM_W));
      const w = Math.floor(wide / size);
      const k = size * (window.devicePixelRatio || 1);
      const W = Math.round(w * k);
      const H = Math.round(ART_H * k);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      canvas.style.width = `${w * size}px`;
      canvas.style.height = `${ART_H * size}px`;
      s.pen = { ctx, w, h: ART_H, k };
      s.dirty = true;
      wake();
    };
    fit();
    const sized = new ResizeObserver(fit);
    sized.observe(room);
    const shown = new IntersectionObserver(([e]) => {
      s.seen = e.isIntersecting;
      if (s.seen) {
        s.dirty = true;
        wake();
      }
    });
    shown.observe(canvas);
    return () => {
      sized.disconnect();
      shown.disconnect();
      slots.delete(s);
      slot.current = null;
    };
  }, [scene]);

  useEffect(() => {
    const s = slot.current;
    if (!s) return;
    s.hot = hot;
    wake();
  }, [hot]);

  return (
    <canvas
      ref={ref}
      className="gart"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
