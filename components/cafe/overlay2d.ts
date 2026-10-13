import { CafeLayout } from "@/lib/cafe/layout";
import { Bubble } from "@/lib/cafe/timeline";
import { AgentDef } from "@/lib/types";
import { fixtures } from "./room";

export interface OverlayInput {
  lay: CafeLayout;
  agents: AgentDef[];
  bubbles: Bubble[];
  alert?: { agent: number; kind: "ask" | "done"; text: string };
  watermark: string;
}

const TYPE_MS_PER_CHAR = 22;
const INK = "#1b1626";
const TONE_BG: Record<string, string> = {
  done: "#e4f8ea",
  handoff: "#fff0c9",
  error: "#ffe0e0",
  alert: "#ffd9b8",
};

let family = "";
function font(px: number, weight = 400): string {
  family ||= getComputedStyle(document.documentElement).getPropertyValue("--font-pixel").trim() || "monospace";
  return `${weight} ${px}px ${family}, monospace`;
}

function spacing(ctx: CanvasRenderingContext2D, em: number, px: number) {
  if ("letterSpacing" in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${em * px}px`;
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function neon(ctx: CanvasRenderingContext2D, o: OverlayInput, s: number, k: number) {
  const { SIGN } = fixtures(o.lay.width);
  const cx = (SIGN.x + SIGN.w / 2) * s;
  const cy = (SIGN.y + SIGN.h / 2) * s;
  const main = 3.4 * k * s * (o.lay.width / 100);
  const sub = 1.4 * k * s * (o.lay.width / 100);
  const gap = 0.4 * k * s * (o.lay.width / 100);
  const top = cy - (main + gap + sub) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const glowText = (text: string, y: number, size: number, weight: number, fill: string, glows: [string, number][]) => {
    ctx.font = font(size, weight);
    spacing(ctx, weight > 400 ? 0.14 : 0.08, size);
    for (const [c, b] of glows) {
      ctx.shadowColor = c;
      ctx.shadowBlur = b * (s / 2);
      ctx.fillStyle = fill;
      ctx.fillText(text, cx, y);
    }
    ctx.shadowBlur = 0;
  };
  glowText("RELAY", top, main, 700, "#e3fcff", [["#1aa7d8", 26], ["#5ce1ff", 14], ["#5ce1ff", 6], ["#ffffff", 2]]);
  glowText("інтернет-кафе", top + main + gap, sub, 400, "#ffe0f0", [["#ff4fa3", 14], ["#ff4fa3", 6], ["#ffffff", 2]]);
  spacing(ctx, 0, 1);
}

function names(ctx: CanvasRenderingContext2D, o: OverlayInput, s: number, W: number, talking: Set<number>) {
  const size = Math.round(W * 0.013);
  ctx.font = font(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineJoin = "round";
  o.agents.forEach((a, i) => {
    if (talking.has(i)) return;
    const d = o.lay.desks[i];
    const x = d.x * s;
    const y = (d.top - 2) * s;
    if (o.alert?.kind === "ask" && o.alert.agent === i) {
      const text = fit(ctx, `${a.name.toLowerCase()} · ${o.alert.text}`, W * 0.26);
      const w = ctx.measureText(text).width + size * 0.9;
      const h = size * 1.5;
      ctx.fillStyle = "#ffd25a";
      ctx.fillRect(x - w / 2, y - h, w, h);
      ctx.fillStyle = "#1d1708";
      ctx.fillText(text, x, y - size * 0.25);
      return;
    }
    const text = fit(ctx, a.name.toLowerCase(), W * 0.17 * (384 / o.lay.width));
    ctx.strokeStyle = "#07050d";
    ctx.lineWidth = Math.max(2, size / 5);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = a.color;
    ctx.fillText(text, x, y);
  });
}

function bubble(ctx: CanvasRenderingContext2D, b: Bubble, a: AgentDef, s: number, W: number) {
  const em = Math.round(W * 0.0132);
  const border = Math.max(2, Math.round(W / 480));
  const bg = TONE_BG[b.tone] ?? "#f7f2e6";
  const shown = b.text.slice(0, Math.min(b.text.length, Math.floor(b.age / TYPE_MS_PER_CHAR) + 1));

  ctx.font = font(em);
  const lines = wrap(ctx, b.text, W * 0.19 - em * 1.2);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const hd = em * 0.8;
  ctx.font = font(hd);
  const who = a.name.toLowerCase();
  const tool = b.tool?.toLowerCase();
  const hdW = hd * 1.05 + ctx.measureText(who).width + (tool ? hd * 0.45 + ctx.measureText(tool).width + hd * 0.7 : 0);
  const w = Math.max(textW, hdW) + em * 1.2;
  const h = em * 0.85 + hd * 1.18 + lines.length * em * 1.2;
  const x = b.x * s - w / 2;
  const y = b.y * s - em * 1.1 - h;

  ctx.fillStyle = "rgba(7,5,13,0.55)";
  ctx.fillRect(x - border, y - border + 3 * (s / 2), w + border * 2, h + border * 2);
  ctx.fillStyle = INK;
  ctx.fillRect(x - border, y - border, w + border * 2, h + border * 2);
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  const tail = (size: number, below: number, dx: number) => {
    const tx = b.x * s - size / 2 + dx;
    const ty = y + h + below - size;
    ctx.fillStyle = INK;
    ctx.fillRect(tx - border, ty - border, size + border * 2, size + border * 2);
    ctx.fillStyle = bg;
    ctx.fillRect(tx, ty, size, size);
  };
  tail(em * 0.55, em * 0.75, 0);
  tail(em * 0.32, em * 1.2, em * 0.2);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let cx = x + em * 0.6;
  const hy = y + em * 0.4;
  ctx.fillStyle = a.color;
  ctx.fillRect(cx, hy + hd * 0.15, hd * 0.6, hd * 0.6);
  cx += hd * 1.05;
  ctx.font = font(hd);
  ctx.fillStyle = "#4a4258";
  ctx.fillText(who, cx, hy);
  if (tool) {
    cx += ctx.measureText(who).width + hd * 0.45;
    const tw = ctx.measureText(tool).width + hd * 0.7;
    ctx.fillStyle = INK;
    ctx.fillRect(cx, hy - hd * 0.05, tw, hd * 1.15);
    ctx.fillStyle = a.color;
    ctx.fillText(tool, cx + hd * 0.35, hy);
  }

  ctx.font = font(em);
  ctx.fillStyle = INK;
  let left = shown.length;
  lines.forEach((line, i) => {
    const part = line.slice(0, Math.max(0, left));
    left -= line.length + 1;
    ctx.fillText(part, x + em * 0.6, y + em * 0.4 + hd * 1.18 + i * em * 1.2);
  });
}

function watermark(ctx: CanvasRenderingContext2D, text: string, W: number, H: number) {
  const size = Math.round(W * 0.012);
  ctx.font = font(size);
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const w = ctx.measureText(text).width + size;
  ctx.fillStyle = "rgba(7,5,13,0.7)";
  ctx.fillRect(W - w - size * 0.6, H - size * 2.1, w, size * 1.6);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(text, W - size * 1.1, H - size * 0.75);
}

/** Paints the DOM overlay (sign, names, speech bubbles) onto a scaled copy of the scene, for recorded clips. */
export function drawOverlay(ctx: CanvasRenderingContext2D, o: OverlayInput, s: number) {
  const W = o.lay.width * s;
  const H = o.lay.height * s;
  const k = 384 / o.lay.width;
  const talking = new Set(o.bubbles.filter((b) => b.seated).map((b) => b.agent));
  neon(ctx, o, s, k);
  names(ctx, o, s, W, talking);
  for (const b of o.bubbles) bubble(ctx, b, o.agents[b.agent], s, W);
  watermark(ctx, o.watermark, W, H);
}
