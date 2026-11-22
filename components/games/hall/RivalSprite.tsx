"use client";

import { useEffect, useRef } from "react";
import { Look, drawPerson } from "../../cafe/people";

const W = 14;
const H = 24;
/** ms a foot stays down while an agent shifts from one to the other */
const STEP_MS = 170;
const STEPS = [1, 0, 2, 0];

const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One of the café's agents standing in the hall, as it looks at its desk. While `eager` it shifts from foot to foot,
 * ready to play; otherwise it stands still.
 */
export default function RivalSprite({ look, eager = false }: { look: Look; eager?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const draw = (step: number) => {
      ctx.clearRect(0, 0, W, H);
      drawPerson(ctx, W / 2, H - 2, look, { dir: "down", step, carrying: false });
    };
    draw(0);
    if (!eager || calm()) return;
    let n = 0;
    const timer = setInterval(() => draw(STEPS[++n % STEPS.length]), STEP_MS);
    return () => clearInterval(timer);
  }, [look, eager]);
  return <canvas ref={ref} className="agent-sprite" width={W} height={H} aria-hidden />;
}
