"use client";

import { useSyncExternalStore } from "react";
import { OverlayInput, drawOverlay, drawTall } from "./overlay2d";

const SCALE = 3;
const FPS = 30;
/** 9:16, for TikTok, Reels and Shorts */
const TALL_W = 1080;
const TALL_H = 1920;

/** "wide" is the scene itself at 3×; "tall" puts it in a 9:16 frame with a line above and the address below. */
export type ClipShape = "wide" | "tall";

export interface Clip {
  blob: Blob;
  mime: string;
  ext: string;
}

interface Pending {
  seconds: number;
  shape: ClipShape;
  resolve: (c: Clip) => void;
  reject: (e: Error) => void;
}

interface Job {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  recorder: MediaRecorder;
  shape: ClipShape;
}

let scenes = 0;
let pending: Pending | null = null;
let stills: ((c: HTMLCanvasElement) => void)[] = [];
let job: Job | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const options = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function clipSupported(): boolean {
  return typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype && pickMime() != null;
}

/** CafeScene registers itself, so the share menu knows whether there is a café on screen to record. */
export function sceneMounted(): () => void {
  scenes += 1;
  emit();
  return () => {
    scenes -= 1;
    emit();
  };
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSceneOnScreen(): boolean {
  return useSyncExternalStore(subscribe, () => scenes > 0, () => false);
}

export function recordClip(seconds: number, shape: ClipShape = "wide"): Promise<Clip> {
  if (pending || job) return Promise.reject(new Error("already recording"));
  if (!clipSupported()) return Promise.reject(new Error("unsupported"));
  return new Promise((resolve, reject) => {
    pending = { seconds, shape, resolve, reject };
  });
}

/** The next composed frame — pixel scene plus sign, names and bubbles — for a share card. */
export function captureStill(): Promise<HTMLCanvasElement> {
  if (!scenes) return Promise.reject(new Error("no scene"));
  return new Promise((resolve) => stills.push(resolve));
}

export function clipWanted(): boolean {
  return pending != null || job != null || stills.length > 0;
}

function compose(
  source: HTMLCanvasElement,
  overlay: OverlayInput,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  shape: ClipShape = "wide",
) {
  if (shape === "tall") return drawTall(ctx, source, overlay, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  drawOverlay(ctx, overlay, SCALE);
}

function start(source: HTMLCanvasElement, p: Pending): Job | null {
  const mime = pickMime()!;
  const canvas = document.createElement("canvas");
  canvas.width = p.shape === "tall" ? TALL_W : source.width * SCALE;
  canvas.height = p.shape === "tall" ? TALL_H : source.height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    p.reject(new Error("no canvas"));
    return null;
  }
  ctx.imageSmoothingEnabled = false;
  const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    job = null;
    const type = mime.split(";")[0];
    p.resolve({ blob: new Blob(chunks, { type }), mime: type, ext: type === "video/mp4" ? "mp4" : "webm" });
  };
  recorder.onerror = () => {
    job = null;
    p.reject(new Error("recorder failed"));
  };
  recorder.start(500);
  setTimeout(() => recorder.state !== "inactive" && recorder.stop(), p.seconds * 1000);
  return { canvas, ctx, recorder, shape: p.shape };
}

/** Called from the scene's frame loop while a clip is wanted: scales the pixel scene up and paints the overlay on top. */
export function clipFrame(source: HTMLCanvasElement, overlay: OverlayInput) {
  if (pending) {
    const p = pending;
    pending = null;
    job = start(source, p);
  }
  if (stills.length) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width * SCALE;
    canvas.height = source.height * SCALE;
    const ctx = canvas.getContext("2d");
    if (ctx) compose(source, { ...overlay, watermark: "" }, canvas, ctx);
    const waiting = stills;
    stills = [];
    waiting.forEach((r) => r(canvas));
  }
  if (job) compose(source, overlay, job.canvas, job.ctx, job.shape);
}
