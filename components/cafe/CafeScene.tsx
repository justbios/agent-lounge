"use client";

import { CSSProperties, useEffect, useMemo, useRef } from "react";
import { cafeLayout } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { Bubble, agentView, bubbleFor, buildTimeline } from "@/lib/cafe/timeline";
import { Cat } from "./cat";
import { drawFrame } from "./frame";
import { lookFor } from "./people";
import { buildRoom, fixtures } from "./room";

const TYPE_MS_PER_CHAR = 22;

export interface SceneAlert {
  agent: number;
  kind: "ask" | "done";
  text: string;
}

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

export default function CafeScene({ model, clock, alert }: { model: CafeModel; clock: number; alert?: SceneAlert }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef(clock);
  const alertRef = useRef(alert);
  const agents = model.agents;
  const lay = useMemo(() => cafeLayout(agents.length, model.seed), [agents.length, model.seed]);
  const cat = useMemo(() => new Cat(lay, model.seed), [lay, model.seed]);
  const tl = useMemo(() => buildTimeline(model), [model]);

  useEffect(() => {
    clockRef.current = clock;
    alertRef.current = alert;
  }, [clock, alert]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const looks = agents.map((a, i) => lookFor(a.look ?? i, a.color));
    const room = buildRoom(lay, agents, model.seed);
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const clock = clockRef.current;
      const busy = agents.map((_, i) => i).filter((i) => agentView(model, tl, lay, i, clock).screen === "work");
      cat.step(last ? Math.min(100, now - last) : 0, now, busy);
      last = now;
      drawFrame(ctx, { model, lay, tl, looks, room, clock, t: now / 1000, cat, alert: alertRef.current });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [model, agents, lay, tl, cat]);

  const { SIGN } = fixtures(lay.width);
  const pos = (x: number, y: number): CSSProperties => ({
    left: `${(x / lay.width) * 100}%`,
    top: `${(y / lay.height) * 100}%`,
  });
  const bubbles = agents
    .map((_, i) => bubbleFor(model, tl, lay, i, agentView(model, tl, lay, i, clock), clock))
    .filter((b): b is Bubble => b != null);
  const talking = new Set(bubbles.filter((b) => b.seated).map((b) => b.agent));

  return (
    <div className="arcade cafe" style={{ "--k": 384 / lay.width } as CSSProperties}>
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
        {agents.map((a, i) => {
          if (talking.has(i)) return null;
          const ask = alert?.kind === "ask" && alert.agent === i;
          return (
            <span
              key={a.id}
              className={`cafe-name ${ask ? "ask" : ""}`}
              style={{ ...pos(lay.desks[i].x, lay.desks[i].top - 2), color: a.color }}
            >
              {a.name.toLowerCase()}
              {ask && <b> · {alert.text}</b>}
            </span>
          );
        })}
        {bubbles.map((b) => (
          <CafeBubble
            key={b.key}
            b={b}
            name={agents[b.agent].name}
            color={agents[b.agent].color}
            style={pos(b.x, b.y)}
          />
        ))}
      </div>
    </div>
  );
}
