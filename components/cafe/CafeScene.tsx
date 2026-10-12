"use client";

import { CSSProperties, useEffect, useMemo, useRef } from "react";
import { MockRun } from "@/lib/mockRun";
import { cafeLayout } from "@/lib/cafe/layout";
import { Bubble, agentView, bubbleFor, buildTimeline } from "@/lib/cafe/timeline";
import { drawFrame } from "./frame";
import { lookFor } from "./people";
import { SIGN, buildRoom } from "./room";

const TYPE_MS_PER_CHAR = 22;

function CafeBubble({ b, name, color, style }: { b: Bubble; name: string; color: string; style: CSSProperties }) {
  const shown = Math.min(b.text.length, Math.floor(b.age / TYPE_MS_PER_CHAR) + 1);
  return (
    <div className={`cafe-bubble tone-${b.tone}`} style={{ ...style, "--c": color } as CSSProperties}>
      <div className="cb-hd">
        <span className="cb-who">{name}</span>
        {b.tool && <span className="cb-tool">{b.tool}</span>}
      </div>
      <div className="cb-txt">
        {b.text.slice(0, shown)}
        <span className="cb-rest">{b.text.slice(shown)}</span>
      </div>
    </div>
  );
}

export default function CafeScene({ run, clock }: { run: MockRun; clock: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef(clock);
  const lay = useMemo(() => cafeLayout(run.agents.length), [run.agents.length]);
  const tl = useMemo(() => buildTimeline(run, lay), [run, lay]);

  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const looks = run.agents.map((a, i) => lookFor(i, a.color));
    const room = buildRoom(lay, run.agents);
    let raf = 0;
    const loop = (now: number) => {
      drawFrame(ctx, { run, lay, tl, looks, room, clock: clockRef.current, t: now / 1000 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run, lay, tl]);

  const pos = (x: number, y: number): CSSProperties => ({
    left: `${(x / lay.width) * 100}%`,
    top: `${(y / lay.height) * 100}%`,
  });
  const bubbles = run.agents
    .map((_, i) => bubbleFor(run, tl, lay, i, agentView(run, tl, lay, i, clock), clock))
    .filter((b): b is Bubble => b != null);
  const talking = new Set(bubbles.filter((b) => b.seated).map((b) => b.agent));

  return (
    <div className="arcade cafe">
      <canvas
        ref={canvasRef}
        width={lay.width}
        height={lay.height}
        aria-label="Піксельне інтернет-кафе: агенти працюють за комп'ютерами й передають одне одному роботу"
      />
      <div className="cafe-overlay" aria-hidden>
        <div className="cafe-neon" style={pos(SIGN.x + SIGN.w / 2, SIGN.y + SIGN.h / 2)}>
          <span className="cafe-neon-main">RELAY</span>
          <span className="cafe-neon-sub">інтернет-кафе</span>
        </div>
        {run.agents.map((a, i) =>
          talking.has(i) ? null : (
            <span key={a.id} className="cafe-name" style={{ ...pos(lay.desks[i].x, lay.desks[i].top - 2), color: a.color }}>
              {a.name.toLowerCase()}
            </span>
          ),
        )}
        {bubbles.map((b) => (
          <CafeBubble
            key={b.key}
            b={b}
            name={run.agents[b.agent].name}
            color={run.agents[b.agent].color}
            style={pos(b.x, b.y)}
          />
        ))}
      </div>
    </div>
  );
}
