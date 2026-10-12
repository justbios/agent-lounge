"use client";

import { useEffect, useRef } from "react";
import { AgentDef } from "@/lib/types";
import { MockRun, AgentTiming } from "@/lib/mockRun";
import { NodeState } from "@/lib/stage";
import { snakeLayout, Point } from "@/lib/layout";

const W = 384;

function roomLayout(n: number) {
  return snakeLayout(n, { width: W, stepX: 88, marginY: 78, rowStep: 72, bottomMargin: 66, maxCols: 4 });
}

// ---- sprite data (each char = a palette key, '.' = transparent) ----
const CHAR = [
  ".KCCCCK.",
  "KCCCCCCK",
  "KCSSSSCK",
  ".SSSSSS.",
  ".SEssES.",
  ".SssssS.",
  "KCCCCCCK",
  "CCCCCCCC",
  "SCCCCCCS",
  ".CCCCCC.",
  ".PP..PP.",
  ".BB..BB.",
];
const DRONE = [
  "...KKKKKK...",
  "..KDDDDDDK..",
  ".KDDDDDDDDK.",
  ".KDwwwwwwDK.",
  ".KDDDDDDDDK.",
  "..KDDDDDDK..",
  "...K.tt.K...",
  "....t..t....",
  ".....tt.....",
];
const BOX = [".CCCC.", "CccccC", "CcCCcC", "CcCCcC", "CccccC", ".CCCC."];

const ENV: Record<string, string> = { K: "#141420", S: "#e8b98f", s: "#c88e63", E: "#20202e", P: "#39405c", B: "#20222c" };
const DRONE_PAL: Record<string, string> = { K: "#141420", D: "#9aa6bd", w: "#8ef0ff", t: "#ffce6b" };

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

function prerender(sprite: string[], pal: Record<string, string>, overrides: Record<string, string> = {}): HTMLCanvasElement {
  const w = sprite[0].length;
  const h = sprite.length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  for (let yy = 0; yy < h; yy++) {
    const row = sprite[yy];
    for (let xx = 0; xx < row.length; xx++) {
      const ch = row[xx];
      if (ch === ".") continue;
      const col = overrides[ch] || pal[ch];
      if (!col) continue;
      x.fillStyle = col;
      x.fillRect(xx, yy, 1, 1);
    }
  }
  return c;
}

function buildBg(H: number, wpx: Point[]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#171c2b";
  x.fillRect(0, 0, W, H);
  for (let ty = 0; ty < H; ty += 24)
    for (let tx = 0; tx < W; tx += 24)
      if (((tx / 24) | 0) % 2 === ((ty / 24) | 0) % 2) {
        x.fillStyle = "#1b2233";
        x.fillRect(tx, ty, 24, 24);
      }
  x.fillStyle = "rgba(255,255,255,0.025)";
  for (let tx = 0; tx <= W; tx += 24) x.fillRect(tx, 0, 1, H);
  for (let ty = 0; ty <= H; ty += 24) x.fillRect(0, ty, W, 1);
  // courier lane (open serpentine through the stations)
  x.strokeStyle = "rgba(130,160,230,0.10)";
  x.lineWidth = 6;
  x.lineJoin = "round";
  x.beginPath();
  x.moveTo(wpx[0].x, wpx[0].y);
  for (let i = 1; i < wpx.length; i++) x.lineTo(wpx[i].x, wpx[i].y);
  x.stroke();
  // walls
  x.fillStyle = "#0f131e";
  x.fillRect(0, 0, W, 6);
  x.fillRect(0, 0, 6, H);
  x.fillRect(W - 6, 0, 6, H);
  x.fillRect(0, H - 6, W, 6);
  x.fillStyle = "#2b3346";
  x.fillRect(0, 6, W, 2);
  return c;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

interface GameState {
  tx: number;
  ty: number;
  states: NodeState[];
  active: number;
  progress: number;
}

function computeGame(clock: number, timings: AgentTiming[], wpx: Point[]): GameState {
  const n = timings.length;
  const states: NodeState[] = new Array(n).fill("idle");
  for (let i = 0; i < n; i++) if (clock >= timings[i].end) states[i] = "done";
  let tx = wpx[0].x;
  let ty = wpx[0].y;
  let active = -1;
  let progress = 0;
  for (let i = 0; i < n; i++) {
    const tm = timings[i];
    if (clock >= tm.start && clock < tm.end) {
      states[i] = "active";
      active = i;
      tx = wpx[i].x;
      ty = wpx[i].y;
      progress = (clock - tm.start) / (tm.end - tm.start);
      break;
    }
    if (tm.travelStart != null && tm.travelEnd != null && clock >= tm.travelStart && clock < tm.travelEnd) {
      const t = ease((clock - tm.travelStart) / (tm.travelEnd - tm.travelStart));
      tx = wpx[i].x + (wpx[i + 1].x - wpx[i].x) * t;
      ty = wpx[i].y + (wpx[i + 1].y - wpx[i].y) * t;
      states[i] = "done";
      states[i + 1] = "incoming";
      active = i + 1;
      break;
    }
  }
  if (clock >= timings[n - 1].end) {
    states[n - 1] = "done";
    tx = wpx[n - 1].x;
    ty = wpx[n - 1].y;
  }
  return { tx, ty, states, active, progress };
}

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, main: string, dark: string, state: NodeState) {
  ctx.fillStyle = "#3a4258";
  ctx.fillRect(x - 13, y + 3, 26, 5);
  ctx.fillStyle = "#2b3346";
  ctx.fillRect(x - 13, y + 8, 26, 2);
  ctx.fillStyle = "#20263a";
  ctx.fillRect(x - 12, y + 10, 3, 5);
  ctx.fillRect(x + 9, y + 10, 3, 5);
  ctx.fillStyle = "#161a26";
  ctx.fillRect(x - 7, y - 3, 14, 9);
  let sc = "#0d1017";
  if (state === "active") sc = main;
  else if (state === "incoming") sc = dark;
  else if (state === "done") sc = "#182034";
  ctx.fillStyle = sc;
  ctx.fillRect(x - 5, y - 1, 10, 6);
  if (state === "active") {
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(x - 5, y - 1, 10, 1);
  }
  ctx.fillStyle = "#161a26";
  ctx.fillRect(x - 1, y + 5, 2, 1);
}

export default function PixelGame({ run, clock }: { run: MockRun; clock: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef(0);
  clockRef.current = clock;

  const agents: AgentDef[] = run.agents;
  const layout = roomLayout(agents.length);
  const H = layout.height;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const lay = roomLayout(agents.length);
    const wpx = lay.points;
    const darks = agents.map((a) => shade(a.color, 0.62));
    const chars = agents.map((a, i) => prerender(CHAR, ENV, { C: a.color, c: darks[i] }));
    const boxes = agents.map((a, i) => prerender(BOX, {}, { C: a.color, c: darks[i] }));
    const drone = prerender(DRONE, DRONE_PAL);
    const bg = buildBg(lay.height, wpx);
    let prevTx = wpx[0].x;
    let faceLeft = false;
    let raf = 0;

    const frame = (now: number) => {
      const clk = clockRef.current;
      const ph = now / 1000;
      ctx.imageSmoothingEnabled = false;
      ctx.textBaseline = "alphabetic";
      ctx.drawImage(bg, 0, 0);

      const g = computeGame(clk, run.timings, wpx);

      for (let i = 0; i < agents.length; i++) {
        const st = g.states[i];
        const p = wpx[i];
        const working = st === "active";
        const bob = working ? -Math.round(Math.abs(Math.sin(ph * 7)) * 2) : -Math.round(Math.sin(ph * 2 + i) * 0.5 + 0.5);
        ctx.drawImage(chars[i], p.x - 4, p.y - 10 + bob);
        drawDesk(ctx, p.x, p.y, agents[i].color, darks[i], st);

        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = st === "active" || st === "incoming" ? agents[i].color : st === "done" ? "#6bbf9a" : "#59627a";
        ctx.fillText(agents[i].name.toLowerCase(), p.x, p.y + 22);

        if (working) {
          ctx.fillStyle = "#0c0f17";
          ctx.fillRect(p.x - 7, p.y - 16, 14, 3);
          ctx.fillStyle = agents[i].color;
          ctx.fillRect(p.x - 7, p.y - 16, Math.round(14 * g.progress), 3);
          for (let d = 0; d < 3; d++) {
            ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(ph * 4 - d));
            ctx.fillRect(p.x - 3 + d * 3, p.y - 20, 2, 2);
          }
          ctx.globalAlpha = 1;
        }
      }

      // courier drone rides the packet position (pure function of the clock)
      const dxm = g.tx - prevTx;
      if (dxm < -0.3) faceLeft = true;
      else if (dxm > 0.3) faceLeft = false;
      prevTx = g.tx;
      const src = g.active >= 0 ? g.active : 0;
      const hb = Math.round(Math.sin(ph * 4) * 1.5);
      const px = Math.round(g.tx);
      const py = Math.round(g.ty);

      ctx.fillStyle = "rgba(0,0,0,0.30)";
      ctx.beginPath();
      ctx.ellipse(px, py + 9, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = agents[src].color;
      ctx.beginPath();
      ctx.arc(px, py + hb, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.drawImage(boxes[src], px - 3, py - 3 + hb);

      const dx = px - 6;
      const dy = py - 15 + hb;
      if (faceLeft) {
        ctx.save();
        ctx.translate(dx + 12, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(drone, 0, 0);
        ctx.restore();
      } else {
        ctx.drawImage(drone, dx, dy);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run, agents]);

  return (
    <div className="arcade">
      <canvas ref={canvasRef} width={W} height={H} aria-label="Піксельна сцена конвеєра агентів" />
    </div>
  );
}
