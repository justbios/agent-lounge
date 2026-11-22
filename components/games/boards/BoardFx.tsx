"use client";

import { Ref, useEffect, useImperativeHandle, useRef } from "react";

/** how far past the squares the canvas reaches, px: chips fly over the frame too */
const PAD = 28;

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** pull down, px/s² */
  g: number;
  /** ms lived, and to live */
  age: number;
  life: number;
  size: number;
  color: string;
  /** ms before it shows */
  wait: number;
}

export interface BoardFxHandle {
  /** a puff of dust where a piece comes down; `weight` 1 for a pawn, up to 2 for a king */
  dust: (sq: number, weight?: number) => void;
  /** chips off a piece that was hit, thrown the way the blow went */
  chips: (sq: number, colors: readonly string[], dir: readonly [number, number], power?: number) => void;
  /** a ring of sparks flying out and up: a promotion, a crowning */
  burst: (sq: number, colors: readonly string[], n?: number) => void;
  /** sparks rising off a square, for a long quiet glow */
  glint: (sq: number, colors: readonly string[], n?: number) => void;
}

const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Square pixel particles over a board: dust, chips, sparks. It draws only while something is in the air, never
 * catches the pointer, and stays empty for someone who asked for less motion. Squares are a8 = 0, as the boards
 * count them; `flip` turns them for the side that sits at the top.
 */
export default function BoardFx({ ref, flip }: { ref: Ref<BoardFxHandle>; flip: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bits = useRef<Bit[]>([]);
  const frame = useRef(0);
  const last = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useImperativeHandle(ref, () => {
    const centre = (sq: number): [number, number, number] => {
      const el = canvas.current!;
      const cell = (el.clientWidth - PAD * 2) / 8;
      const c = sq % 8;
      const r = Math.floor(sq / 8);
      return [PAD + ((flip ? 7 - c : c) + 0.5) * cell, PAD + ((flip ? 7 - r : r) + 0.5) * cell, cell];
    };
    const draw = (at: number) => {
      const el = canvas.current;
      const g = el?.getContext("2d");
      if (!el || !g) return;
      const dt = Math.min(40, at - last.current);
      last.current = at;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(el.clientWidth * dpr);
      if (el.width !== w) el.width = el.height = w;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, el.clientWidth, el.clientHeight);
      const alive: Bit[] = [];
      for (const b of bits.current) {
        if (b.wait > 0) {
          b.wait -= dt;
          alive.push(b);
          continue;
        }
        b.age += dt;
        if (b.age >= b.life) continue;
        b.vy += (b.g * dt) / 1000;
        b.x += (b.vx * dt) / 1000;
        b.y += (b.vy * dt) / 1000;
        // the last third blinks out, as pixels do
        if (b.age > b.life * 0.66 && Math.floor(b.age / 40) % 2) {
          alive.push(b);
          continue;
        }
        const x = Math.round(b.x - b.size / 2);
        const y = Math.round(b.y - b.size / 2);
        g.fillStyle = "rgba(7, 5, 13, 0.55)";
        g.fillRect(x + 1, y + 1, b.size, b.size);
        g.fillStyle = b.color;
        g.fillRect(x, y, b.size, b.size);
        alive.push(b);
      }
      bits.current = alive;
      if (alive.length) frame.current = requestAnimationFrame(draw);
      else frame.current = 0;
    };
    const add = (more: Bit[]) => {
      if (!canvas.current || calm()) return;
      bits.current.push(...more);
      if (!frame.current) {
        last.current = performance.now();
        frame.current = requestAnimationFrame(draw);
      }
    };
    const pick = (colors: readonly string[], i: number) => colors[i % colors.length];
    return {
      dust(sq, weight = 1) {
        if (!canvas.current) return;
        const [x, y, cell] = centre(sq);
        const n = Math.round(4 + weight * 2);
        add(
          Array.from({ length: n }, (_, i) => {
            const side = i % 2 ? 1 : -1;
            return {
              x: x + side * cell * (0.12 + Math.random() * 0.14),
              y: y + cell * 0.34,
              vx: side * (26 + Math.random() * 34) * weight,
              vy: -(8 + Math.random() * 16),
              g: 30,
              age: 0,
              life: 200 + Math.random() * 140,
              size: Math.random() < 0.4 ? 3 : 2,
              color: i % 3 ? "rgba(255, 240, 210, 0.85)" : "rgba(120, 84, 52, 0.9)",
              wait: 0,
            };
          }),
        );
      },
      chips(sq, colors, dir, power = 1) {
        if (!canvas.current) return;
        const [x, y, cell] = centre(sq);
        const n = Math.round(9 + power * 5);
        const speed = cell * (3.2 + power * 1.4);
        add(
          Array.from({ length: n }, (_, i) => {
            const spread = (Math.random() - 0.5) * 2.2;
            const a = Math.atan2(dir[1], dir[0]) + spread;
            const v = speed * (0.35 + Math.random() * 0.65);
            return {
              x: x + (Math.random() - 0.5) * cell * 0.3,
              y: y + (Math.random() - 0.5) * cell * 0.3,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v - cell * 2.2,
              g: cell * 16,
              age: 0,
              life: 260 + Math.random() * 220,
              size: i % 4 === 0 ? 4 : 3,
              color: i % 3 === 0 ? "#fff3c4" : pick(colors, i),
              wait: 0,
            };
          }),
        );
      },
      burst(sq, colors, n = 18) {
        if (!canvas.current) return;
        const [x, y, cell] = centre(sq);
        add(
          Array.from({ length: n }, (_, i) => {
            const a = (i / n) * Math.PI * 2 + 0.2;
            const v = cell * (2.6 + (i % 3) * 0.9);
            return {
              x,
              y: y - cell * 0.1,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v - cell * 1.4,
              g: cell * 9,
              age: 0,
              life: 420 + (i % 4) * 90,
              size: i % 3 === 0 ? 4 : 3,
              color: pick(colors, i),
              wait: 0,
            };
          }),
        );
      },
      glint(sq, colors, n = 8) {
        if (!canvas.current) return;
        const [x, y, cell] = centre(sq);
        add(
          Array.from({ length: n }, (_, i) => ({
            x: x + (Math.random() - 0.5) * cell * 0.8,
            y: y + (Math.random() - 0.2) * cell * 0.5,
            vx: (Math.random() - 0.5) * 10,
            vy: -cell * (0.5 + Math.random() * 0.6),
            g: 0,
            age: 0,
            life: 500 + Math.random() * 300,
            size: i % 3 === 0 ? 3 : 2,
            color: pick(colors, i),
            wait: i * 70,
          })),
        );
      },
    };
  }, [flip]);

  return <canvas ref={canvas} className="board-fx" aria-hidden />;
}
