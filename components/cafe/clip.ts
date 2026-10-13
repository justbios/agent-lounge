"use client";

import { useSyncExternalStore } from "react";
import { OverlayInput, drawOverlay } from "./overlay2d";

const SCALE = 3;
const FPS = 30;

export interface Clip {
  blob: Blob;
  mime: string;
  ext: string;
}

interface Pending {
  seconds: number;
  resolve: (c: Clip) => void;
  reject: (e: Error) => void;
}

interface Job {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  recorder: MediaRecorder;
}

let scenes = 0;
let pending: Pending | null = null;
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

export function recordClip(seconds: number): Promise<Clip> {
  if (pending || job) return Promise.reject(new Error("already recording"));
  if (!clipSupported()) return Promise.reject(new Error("unsupported"));
  return new Promise((resolve, reject) => {
    pending = { seconds, resolve, reject };
  });
}

export function clipWanted(): boolean {
  return pending != null || job != null;
}

function start(source: HTMLCanvasElement, p: Pending): Job | null {
  const mime = pickMime()!;
  const canvas = document.createElement("canvas");
  canvas.width = source.width * SCALE;
  canvas.height = source.height * SCALE;
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
  return { canvas, ctx, recorder };
}

/** Called from the scene's frame loop while a clip is wanted: scales the pixel scene up and paints the overlay on top. */
export function clipFrame(source: HTMLCanvasElement, overlay: OverlayInput) {
  if (pending) {
    const p = pending;
    pending = null;
    job = start(source, p);
  }
  if (!job) return;
  const { ctx, canvas } = job;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  drawOverlay(ctx, overlay, SCALE);
}
