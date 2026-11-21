import { CSSProperties } from "react";
import { CafeLayout } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { Bubble, CafeTimeline, agentView } from "@/lib/cafe/timeline";
import { Point } from "@/lib/layout";
import { ItemId } from "@/lib/live/interior";
import { chip, line, useSpeech } from "@/lib/live/speech";
import { FixtureKind } from "./hit";
import { doorOf, fixtures } from "./room";

const TYPE_MS_PER_CHAR = 22;

export interface SceneAlert {
  agent: number;
  kind: "ask" | "done";
  text: string;
}

/** An agent that looks stuck: a few words for its name plate, the whole story for its card. */
export interface SceneWarn {
  kind: "loop" | "late";
  short: string;
  long: string;
}

/** Where a popover hangs, as fractions of the scene: below or above that point, or beside it on one side. */
export interface Anchor {
  x: number;
  y: number;
  below: boolean;
  beside?: "left" | "right";
}

export interface FixturePick {
  kind: FixtureKind;
  anchor: Anchor;
}

/** A piece of furniture going down: a new one from the shop, or one already standing that is being moved. */
export interface Placing {
  item: ItemId;
  pid: string;
}

export function anchorAt(lay: CafeLayout, x: number, top: number, bottom: number): Anchor {
  const below = top < lay.height * 0.55;
  return { x: x / lay.width, y: (below ? bottom : top) / lay.height, below };
}

export function fixtureAnchor(lay: CafeLayout, kind: FixtureKind, p: Point): Anchor {
  if (kind === "door") {
    const d = doorOf(lay);
    return anchorAt(lay, d.x + d.w / 2, d.y - 8, d.y);
  }
  if (kind === "vending") {
    const v = fixtures(lay.width).VENDING;
    return anchorAt(lay, v.x + v.w / 2, v.y, v.y + v.h);
  }
  if (kind === "bar") return anchorAt(lay, 24, 63, 126);
  return anchorAt(lay, p.x, 4, 36);
}

export function agentAnchor(model: CafeModel, tl: CafeTimeline, lay: CafeLayout, i: number, clock: number): Anchor {
  const w = agentView(model, tl, lay, i, clock).walker;
  const x = w ? w.x : lay.desks[i].x;
  const top = w ? w.y - 26 : lay.desks[i].top - 4;
  const bottom = w ? w.y + 2 : lay.desks[i].top + 46;
  const below = top < lay.height * 0.5;
  return { x: x / lay.width, y: (below ? top : bottom) / lay.height, below, beside: x > lay.width / 2 ? "left" : "right" };
}

/** True when `p` falls on the cat sitting or walking at `c`. */
export const onCat = (c: Point, p: Point) => p.x >= c.x - 9 && p.x < c.x + 9 && p.y >= c.y - 13 && p.y < c.y + 2;

export function CafeBubble({
  b,
  name,
  color,
  style,
  warn,
}: {
  b: Bubble;
  name: string;
  color: string;
  style: CSSProperties;
  warn?: SceneWarn;
}) {
  const sp = useSpeech();
  const text = line(b, sp);
  const tool = chip(b.tool, sp);
  const shown = Math.min(text.length, Math.floor(b.age / TYPE_MS_PER_CHAR) + 1);
  return (
    <div
      className={`cafe-bubble tone-${b.tone} ${warn ? "warn" : ""}`}
      style={{ ...style, "--c": color } as CSSProperties}
    >
      <div className="cb-hd">
        <span className="cb-who">{name}</span>
        {warn ? <span className="cb-warn">! {warn.short}</span> : tool && <span className="cb-tool">{tool}</span>}
      </div>
      <div className="cb-txt">
        {text.slice(0, shown)}
        <span className="cb-rest">{text.slice(shown)}</span>
      </div>
    </div>
  );
}
