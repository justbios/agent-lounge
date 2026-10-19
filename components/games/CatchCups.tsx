"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { enPlural, useTr } from "@/lib/i18n";
import { Ctx, LINE, px } from "../cafe/pixel";
import { plural } from "../live/format";
import FullscreenButton from "./FullscreenButton";

const W = 160;
const H = 112;
const ROUND_MS = 30_000;
const TRAY_W = 20;
const TRAY_Y = 100;

interface Cup {
  x: number;
  y: number;
  vy: number;
  gold: boolean;
}

function drawRoom(ctx: Ctx) {
  px(ctx, 0, 0, W, H, "#1b1524");
  for (let y = 6; y < 90; y += 8) {
    px(ctx, 0, y, W, 1, "#241c30");
    for (let x = (y / 8) % 2 ? 0 : 10; x < W; x += 20) px(ctx, x, y - 7, 1, 7, "#241c30");
  }
  px(ctx, 0, 90, W, 1, LINE);
  px(ctx, 0, 91, W, H - 91, "#3a2a22");
  for (let x = 0; x < W; x += 16) px(ctx, x, 91, 1, H - 91, "#33251e");
}

function drawCup(ctx: Ctx, c: Cup, t: number) {
  const x = Math.round(c.x) - 3;
  const y = Math.round(c.y) - 5;
  const body = c.gold ? "#ffd25a" : "#ece4d6";
  px(ctx, x - 1, y - 1, 8, 7, LINE);
  px(ctx, x, y, 6, 5, body);
  px(ctx, x, y, 6, 1, c.gold ? "#fff1b8" : "#ffffff");
  px(ctx, x + 1, y + 1, 4, 1, "#6b3f22");
  px(ctx, x + 6, y + 1, 2, 3, LINE);
  px(ctx, x + 6, y + 2, 1, 1, body);
  if (c.gold && Math.floor(t / 120) % 2) px(ctx, x - 2, y - 2, 1, 1, "#fff6c8");
}

function drawTray(ctx: Ctx, x: number) {
  const L = Math.round(x - TRAY_W / 2);
  px(ctx, L - 1, TRAY_Y - 1, TRAY_W + 2, 4, LINE);
  px(ctx, L, TRAY_Y, TRAY_W, 2, "#b98a5e");
  px(ctx, L, TRAY_Y, TRAY_W, 1, "#d9a978");
  px(ctx, L + TRAY_W / 2 - 2, TRAY_Y + 3, 4, 9, "#e0ac7e");
}

/** «Лови чашки»: thirty seconds of the barista throwing cups; the tray follows the pointer or the arrow keys. */
export default function CatchCups({ best, onFinish }: { best: number; onFinish: (score: number) => void }) {
  const t = useTr();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const [last, setLast] = useState(0);
  const finish = useEffectEvent(onFinish);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawRoom(ctx);
    drawTray(ctx, W / 2);
    if (phase !== "play") return;

    let tray = W / 2;
    let score = 0;
    let raf = 0;
    let prev = 0;
    let spawn = 0;
    const start = performance.now();
    const cups: Cup[] = [];
    const keys = new Set<string>();
    const point = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tray = ((e.clientX - r.left) / r.width) * W;
    };
    const down = (e: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "a", "d"].includes(e.key)) return;
      keys.add(e.key);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key);
    canvas.addEventListener("pointermove", point);
    canvas.addEventListener("pointerdown", point);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    const loop = () => {
      const t = performance.now();
      const dt = prev ? Math.min(50, t - prev) : 16;
      prev = t;
      const left = ROUND_MS - (t - start);
      if (left <= 0) {
        setLast(score);
        setPhase("over");
        finish(score);
        return;
      }
      const dir = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
      tray = Math.max(TRAY_W / 2, Math.min(W - TRAY_W / 2, tray + dir * dt * 0.15));
      const pace = 1 + (t - start) / ROUND_MS;
      spawn -= dt;
      if (spawn <= 0) {
        cups.push({ x: 6 + Math.random() * (W - 12), y: -6, vy: (0.03 + Math.random() * 0.025) * pace, gold: Math.random() < 0.08 });
        spawn = (700 + Math.random() * 500) / pace;
      }
      for (let i = cups.length - 1; i >= 0; i--) {
        const c = cups[i];
        c.y += c.vy * dt;
        if (c.y >= TRAY_Y - 1 && c.y <= TRAY_Y + 5 && Math.abs(c.x - tray) <= TRAY_W / 2 + 2) {
          score += c.gold ? 3 : 1;
          cups.splice(i, 1);
        } else if (c.y > H + 8) cups.splice(i, 1);
      }
      drawRoom(ctx);
      cups.forEach((c) => drawCup(ctx, c, t));
      drawTray(ctx, tray);
      if (scoreRef.current) scoreRef.current.textContent = String(score);
      if (timeRef.current) timeRef.current.textContent = String(Math.ceil(left / 1000));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", point);
      canvas.removeEventListener("pointerdown", point);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [phase]);

  return (
    <div className="cups" ref={boxRef}>
      <div className="cups-hud">
        <span>
          {t("чашок", "cups")} <b ref={scoreRef}>{phase === "over" ? last : 0}</b>
        </span>
        <span>
          {phase === "play" ? (
            <>
              {t("ще ", "")}
              <b ref={timeRef}>30</b>
              {t(" с", "s left")}
            </>
          ) : (
            t(`рекорд ${Math.max(best, last)}`, `best ${Math.max(best, last)}`)
          )}
        </span>
        <FullscreenButton target={boxRef} />
      </div>
      <div className="cups-stage">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label={t(
            "Лови чашки: веди тацю мишкою, пальцем або стрілками",
            "Catch the Cups: move the tray with the mouse, a finger or the arrows",
          )}
        />
        {phase !== "play" && (
          <button className="btn cups-go" onClick={() => setPhase("play")}>
            {phase === "over"
              ? t(
                  `${last} ${plural(last, "чашка", "чашки", "чашок")} · ще раз`,
                  `${last} ${enPlural(last, "cup", "cups")} · again`,
                )
              : t("почати · 30 с", "start · 30s")}
          </button>
        )}
      </div>
    </div>
  );
}
