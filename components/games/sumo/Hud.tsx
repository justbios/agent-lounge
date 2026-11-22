"use client";

import { CSSProperties, Fragment } from "react";

/** a sumo win is marked with a star: seven pixels square */
const STAR = ["...K...", "...K...", "KKKKKKK", ".KKKKK.", "..KKK..", ".KK.KK.", ".K...K."];

function Pip({ on, next }: { on: boolean; next: boolean }) {
  return (
    <svg className={`sumo-pip${on ? " on" : ""}${next ? " next" : ""}`} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
      {STAR.flatMap((row, j) =>
        [...row].flatMap((c, i) => (c === "K" ? [<rect key={`${i}-${j}`} x={i} y={j} width={1} height={1} />] : [])),
      )}
    </svg>
  );
}

export interface HudSeat {
  name: string;
  color: string;
  score: number;
  me: boolean;
}

/**
 * The scoreboard over the floe: each wrestler's name in their colour and a star for every round they took, out of
 * the `winAt` that take the match. The one a single round away from it has their next star blinking.
 */
export function SumoHud({ seats, winAt, to }: { seats: HudSeat[]; winAt: number; to: string }) {
  return (
    <div className={`sumo-hud${seats.length > 2 ? " three" : ""}`}>
      {seats.map((s, k) => (
        <Fragment key={k}>
          {k === 1 && <span className="sumo-to">{to}</span>}
          <span
            className={`sumo-p${s.me ? "" : " them"}${s.score === winAt - 1 ? " point" : ""}`}
            style={{ "--c": s.color } as CSSProperties}
            role="group"
            aria-label={`${s.name}: ${s.score}`}
          >
            <i aria-hidden />
            <span className="sumo-name">{s.name}</span>
            <span className="sumo-pips">
              {Array.from({ length: winAt }, (_, i) => (
                <Pip key={`${i}-${i < s.score}`} on={i < s.score} next={i === s.score} />
              ))}
            </span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
