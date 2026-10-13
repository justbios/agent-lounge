"use client";

import { CSSProperties, MouseEvent, PointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CafeLayout, cafeLayout } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { Bubble, CafeTimeline, agentView, bubbleFor, buildTimeline } from "@/lib/cafe/timeline";
import { Point } from "@/lib/layout";
import { ItemId, LookPick, Placed, itemOf } from "@/lib/live/interior";
import { Guest } from "@/lib/live/social";
import { AgentCard, ScenePop } from "./AgentCard";
import { Cat } from "./cat";
import { clipFrame, clipWanted, sceneMounted } from "./clip";
import { DecorSet } from "./decor";
import { Ghost, drawFrame } from "./frame";
import { GuestSeat, seatGuests } from "./guests";
import { FixtureKind, HIT_HINT, Hit, hitTest } from "./hit";
import { lookFor, pickedLook } from "./people";
import { Standing, spotAt, standing, standingAt, toPlaced } from "./placement";
import { buildRoom, doorOf, fixtures } from "./room";
import { GuestTags, ReactionLayer, SeatReaction } from "./SceneSocial";
import { THEMES, Theme } from "./theme";
import { fmtTokens } from "../live/tokens";

const TYPE_MS_PER_CHAR = 22;

export interface SceneAlert {
  agent: number;
  kind: "ask" | "done";
  text: string;
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

function anchorAt(lay: CafeLayout, x: number, top: number, bottom: number): Anchor {
  const below = top < lay.height * 0.55;
  return { x: x / lay.width, y: (below ? bottom : top) / lay.height, below };
}

function fixtureAnchor(lay: CafeLayout, kind: FixtureKind, p: Point): Anchor {
  if (kind === "door") {
    const d = doorOf(lay);
    return anchorAt(lay, d.x + d.w / 2, d.y - 8, d.y);
  }
  if (kind === "vending") {
    const v = fixtures(lay.width).VENDING;
    return anchorAt(lay, v.x + v.w / 2, v.y, v.y + v.h);
  }
  return anchorAt(lay, p.x, 4, 36);
}

function agentAnchor(model: CafeModel, tl: CafeTimeline, lay: CafeLayout, i: number, clock: number): Anchor {
  const w = agentView(model, tl, lay, i, clock).walker;
  const x = w ? w.x : lay.desks[i].x;
  const top = w ? w.y - 26 : lay.desks[i].top - 4;
  const bottom = w ? w.y + 2 : lay.desks[i].top + 46;
  const below = top < lay.height * 0.5;
  return { x: x / lay.width, y: (below ? top : bottom) / lay.height, below, beside: x > lay.width / 2 ? "left" : "right" };
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

export default function CafeScene({
  model,
  clock,
  alert,
  decor,
  catName,
  theme = THEMES.cafe,
  rate = 0,
  guests,
  reactions,
  onReact,
  onPick,
  pops,
  furniture,
  looks,
  onLook,
  placing,
  onPlace,
  onFurniture,
}: {
  model: CafeModel;
  clock: number;
  alert?: SceneAlert;
  decor?: DecorSet;
  catName?: string | null;
  theme?: Theme;
  /** tokens a minute, shown on the LED strip under the sign */
  rate?: number;
  /** others who have this café open right now */
  guests?: Guest[];
  reactions?: SeatReaction[];
  /** shows reaction buttons in the agent card */
  onReact?: (agent: number, emoji: string) => void;
  /** a fixture was clicked, or null for a click on bare floor */
  onPick?: (pick: FixturePick | null) => void;
  /** popovers the page hangs over the scene, positioned by an {@link Anchor} */
  pops?: ReactNode;
  furniture?: Placed[];
  /** looks the café owner picked, by agent id */
  looks?: Record<string, LookPick>;
  /** lets the agent card change an agent's look */
  onLook?: (agent: string, pick: LookPick | null) => void;
  placing?: Placing | null;
  onPlace?: (p: Placed) => void;
  /** a piece of furniture was clicked */
  onFurniture?: (pid: string, anchor: Anchor) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef(clock);
  const alertRef = useRef(alert);
  const decorRef = useRef(decor);
  const catNameRef = useRef(catName);
  const seats = useMemo(() => seatGuests(guests ?? []), [guests]);
  const seatsRef = useRef<GuestSeat[]>(seats);
  const agents = model.agents;
  const lay = useMemo(() => cafeLayout(agents.length, model.seed), [agents.length, model.seed]);
  const cat = useMemo(() => new Cat(lay, model.seed), [lay, model.seed]);
  const tl = useMemo(() => buildTimeline(model), [model]);
  const stand = useMemo(() => standing(lay, furniture ?? []), [lay, furniture]);
  const shown = useMemo(() => (placing ? stand.filter((s) => s.pid !== placing.pid) : stand), [stand, placing]);
  const shownRef = useRef<Standing[]>(shown);
  const ghostRef = useRef<Ghost | null>(null);

  useEffect(() => {
    clockRef.current = clock;
    alertRef.current = alert;
    decorRef.current = decor;
    catNameRef.current = catName;
    seatsRef.current = seats;
    shownRef.current = shown;
    if (!placing) ghostRef.current = null;
  }, [clock, alert, decor, catName, seats, shown, placing]);

  useEffect(() => sceneMounted(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const faces = agents.map((a, i) => lookFor(a.look ?? i, a.color, pickedLook(looks?.[a.id])));
    const room = buildRoom(lay, agents, model.seed, theme);
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const clock = clockRef.current;
      const busy = agents.map((_, i) => i).filter((i) => agentView(model, tl, lay, i, clock).screen === "work");
      cat.step(last ? Math.min(100, now - last) : 0, now, busy);
      last = now;
      const t = now / 1000;
      drawFrame(ctx, {
        model,
        lay,
        tl,
        looks: faces,
        room,
        clock,
        t,
        cat,
        alert: alertRef.current,
        decor: decorRef.current,
        theme,
        guests: seatsRef.current,
        furniture: shownRef.current,
        ghost: ghostRef.current,
      });
      const p = cat.pos;
      const label = catRef.current;
      if (label) {
        label.style.left = `${(p.x / lay.width) * 100}%`;
        label.style.top = `${((p.y - 13) / lay.height) * 100}%`;
      }
      if (clipWanted()) {
        const name = catNameRef.current;
        const bubbles = agents
          .map((_, i) => bubbleFor(model, tl, lay, i, agentView(model, tl, lay, i, clock), clock))
          .filter((b): b is Bubble => b != null);
        clipFrame(canvas, {
          lay,
          agents,
          bubbles,
          alert: alertRef.current,
          cat: name ? { ...p, name } : undefined,
          watermark: `relay · ${location.host}`,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [model, agents, lay, tl, cat, theme, looks]);

  const pointAt = (e: MouseEvent | PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * lay.width, y: ((e.clientY - r.top) / r.height) * lay.height };
  };
  const hitAt = (p: Point): Hit | null => {
    const views = agents.map((_, i) => agentView(model, tl, lay, i, clockRef.current));
    return hitTest(lay, views, cat.pos, p);
  };
  const ghostAt = (p: Point): Ghost | null => {
    const it = placing && itemOf(placing.item);
    if (!it) return null;
    const s = spotAt(lay, it, p, shown);
    const base = { item: it.id, w: it.w, h: it.h };
    return s ? { ...base, ...s, ok: true } : { ...base, cx: p.x, bottom: p.y + it.h / 2, ok: false };
  };
  const hover = (e: PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    if (placing) {
      ghostRef.current = ghostAt(pointAt(e));
      el.style.cursor = ghostRef.current?.ok ? "copy" : "not-allowed";
      el.title = "";
      return;
    }
    const p = pointAt(e);
    const h = hitAt(p);
    if (!h && onFurniture && standingAt(shown, p)) {
      el.style.cursor = "pointer";
      el.title = "перемістити або прибрати";
      return;
    }
    el.style.cursor = h ? "pointer" : "";
    el.title = !h ? "" : h.kind === "agent" ? `${agents[h.agent].name}: ${HIT_HINT.agent}` : HIT_HINT[h.kind];
  };
  const click = (e: MouseEvent<HTMLCanvasElement>) => {
    const p = pointAt(e);
    if (placing) {
      const g = ghostAt(p);
      ghostRef.current = g;
      if (g?.ok) onPlace?.(toPlaced(lay, placing.pid, placing.item, g));
      return;
    }
    const h = hitAt(p);
    if (h?.kind === "agent") {
      const id = agents[h.agent].id;
      setSel(sel === id ? null : id);
      onPick?.(null);
      return;
    }
    setSel(null);
    const f = !h && onFurniture ? standingAt(shown, p) : null;
    if (f) {
      const it = itemOf(f.item)!;
      onFurniture!(f.pid, anchorAt(lay, f.cx, f.bottom - it.h, f.bottom));
      return;
    }
    if (h?.kind === "cat") {
      cat.pet(performance.now());
      onPick?.(null);
      return;
    }
    onPick?.(h ? { kind: h.kind, anchor: fixtureAnchor(lay, h.kind, p) } : null);
  };
  const selIdx = sel == null ? -1 : agents.findIndex((a) => a.id === sel);

  const { SIGN, METER } = fixtures(lay.width);
  const pos = (x: number, y: number): CSSProperties => ({
    left: `${(x / lay.width) * 100}%`,
    top: `${(y / lay.height) * 100}%`,
  });
  const bubbles = agents
    .map((_, i) => bubbleFor(model, tl, lay, i, agentView(model, tl, lay, i, clock), clock))
    .filter((b): b is Bubble => b != null);
  const talking = new Set(bubbles.filter((b) => b.seated).map((b) => b.agent));
  const reactAt = (i: number) => {
    const w = agentView(model, tl, lay, i, clock).walker;
    return w ? { x: w.x, y: w.y - 24 } : { x: lay.desks[i].x, y: lay.desks[i].top - 6 };
  };

  return (
    <div className="cafe-wrap" style={{ "--ar": lay.width / lay.height } as CSSProperties}>
      <div className="arcade cafe" style={{ "--k": 384 / lay.width } as CSSProperties}>
        <canvas
          ref={canvasRef}
          width={lay.width}
          height={lay.height}
          onClick={click}
          onPointerMove={hover}
          onPointerLeave={() => (ghostRef.current = null)}
          aria-label="Піксельне інтернет-кафе: агенти працюють за комп'ютерами й передають одне одному роботу. Клікни агента, кота, дошку, автомат, вікно чи двері."
        />
        <div className="cafe-overlay" aria-hidden>
          <div className="cafe-neon" style={pos(SIGN.x + SIGN.w / 2, SIGN.y + SIGN.h / 2)}>
            <span className="cafe-neon-main">RELAY</span>
            <span className="cafe-neon-sub">інтернет-кафе</span>
          </div>
          <span className={`cafe-meter ${rate > 0 ? "on" : ""}`} style={pos(METER.x + METER.w / 2, METER.y + METER.h / 2)}>
            {rate > 0 ? `${fmtTokens(rate)} ток/хв` : "0 ток/хв"}
          </span>
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
          <GuestTags seats={seats} pos={pos} />
          {reactions && <ReactionLayer list={reactions} anchor={reactAt} pos={pos} />}
          {catName && (
            <span ref={catRef} className="cafe-cat">
              {catName}
            </span>
          )}
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
      <div className="cafe-pops">
        {selIdx >= 0 && (
          <ScenePop
            anchor={agentAnchor(model, tl, lay, selIdx, clock)}
            color={agents[selIdx].color}
            label={agents[selIdx].name}
            onClose={() => setSel(null)}
          >
            <AgentCard
              model={model}
              view={agentView(model, tl, lay, selIdx, clock)}
              agent={selIdx}
              clock={clock}
              asking={alert?.kind === "ask" && alert.agent === selIdx ? alert.text : undefined}
              onReact={onReact && ((emoji) => onReact(selIdx, emoji))}
              look={looks?.[agents[selIdx].id]}
              onLook={onLook && ((pick) => onLook(agents[selIdx].id, pick))}
            />
          </ScenePop>
        )}
        {pops}
      </div>
    </div>
  );
}
