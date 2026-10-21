"use client";

import { useEffect, useRef } from "react";
import { Look, drawPerson } from "./people";

const W = 14;
const H = 24;

/** One agent standing and facing you, at the café's pixel size; CSS scales it up. */
export default function AgentSprite({ look, label }: { look: Look; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    drawPerson(ctx, W / 2, H - 2, look, { dir: "down", step: 0, carrying: false });
  }, [look]);
  return <canvas ref={ref} className="agent-sprite" width={W} height={H} role="img" aria-label={label} />;
}
