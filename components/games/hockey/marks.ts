"use client";

import { H, W } from "@/lib/live/hockey";
import type { Ctx } from "../fx";

/** the scratches are kept this many pixels a unit: coarse, like everything else here */
const PX = 2;
/** old scratches lose a little this often */
const FADE_MS = 900;

/**
 * What the ice remembers of a match: the lines the puck and the mallets cut into it, kept on a small canvas of their
 * own and laid over the rink faintly. They gather where the play is and are wiped off between goals.
 */
export class Marks {
  private readonly canvas: HTMLCanvasElement;
  private readonly g: Ctx;
  private fadedAt = 0;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W * PX;
    this.canvas.height = H * PX;
    this.g = this.canvas.getContext("2d")!;
    this.g.lineCap = "round";
  }

  /** A cut from one place to the next, `wide` units across. */
  line(x0: number, y0: number, x1: number, y1: number, a: number, wide: number) {
    const g = this.g;
    g.strokeStyle = `rgba(214,236,255,${a})`;
    g.lineWidth = wide * PX;
    g.beginPath();
    g.moveTo(x0 * PX, y0 * PX);
    g.lineTo(x1 * PX, y1 * PX);
    g.stroke();
  }

  /** A nick where something struck: one chip out of the ice. */
  nick(x: number, y: number, a: number) {
    const g = this.g;
    g.fillStyle = `rgba(232,246,255,${a * 0.7})`;
    g.fillRect(Math.round(x * PX) - 1, Math.round(y * PX) - 1, 2, 2);
  }

  /** Old scratches wear off a little, so the ice never whites out. */
  wear(now: number) {
    if (now - this.fadedAt < FADE_MS) return;
    this.fadedAt = now;
    const g = this.g;
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "rgba(0,0,0,0.07)";
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.globalCompositeOperation = "source-over";
  }

  /** Wipes the ice clean between two heights. */
  wipe(y0: number, y1: number) {
    const top = Math.max(0, Math.floor(Math.min(y0, y1) * PX));
    const end = Math.min(this.canvas.height, Math.ceil(Math.max(y0, y1) * PX));
    if (end > top) this.g.clearRect(0, top, this.canvas.width, end - top);
  }

  clear() {
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(ctx: Ctx, a: number) {
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = a;
    ctx.drawImage(this.canvas, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = smooth;
  }
}
