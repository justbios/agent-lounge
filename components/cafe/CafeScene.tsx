"use client";

import { CSSProperties, MouseEvent, PointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cafeLayout } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { Bubble, agentView, bubbleFor, buildTimeline } from "@/lib/cafe/timeline";
import { Point } from "@/lib/layout";
import { BRAND, EMPTY_INTERIOR, Interior, ItemId, LookPick, Placed, itemOf, owns, titleFit } from "@/lib/live/interior";
import { Guest } from "@/lib/live/social";
import { AgentCard, ScenePop } from "./AgentCard";
import { Cat, DOG } from "./cat";
import { clipFrame, clipWanted, sceneMounted } from "./clip";
import { themeAt, usePhase } from "./daylight";
import { DecorSet } from "./decor";
import { Ghost, drawFrame } from "./frame";
import { CAT2 } from "./furniture";
import { GuestSeat, barOverflow, seatGuests } from "./guests";
import { HIT_HINT, Hit, hitTest } from "./hit";
import { lookFor, pickedLook } from "./people";
import { Standing, spotAt, standing, standingAt, toPlaced } from "./placement";
import { buildRoom, doorOf, fixtures } from "./room";
import { Anchor, CafeBubble, FixturePick, Placing, SceneAlert, agentAnchor, anchorAt, fixtureAnchor, onCat } from "./sceneParts";
import { BeanSack, ChatTag, GuestTags, JukeTag, ReactionLayer, SeatReaction } from "./SceneSocial";
import { THEMES, Theme } from "./theme";
import { fmtTokens } from "../live/tokens";

export type { Anchor, FixturePick, Placing, SceneAlert } from "./sceneParts";

const NO_DECOR: DecorSet = new Set();
const SIGN_TEXT = "інтернет-кафе";
const MACHINES: ItemId[] = ["jukebox", "arcade"];
const JUKE_HINT = ["музичний автомат: вибрати мелодію", "клацни, щоб вибрати мелодію, або перетягни"];
const ARCADE_HINT = ["ігровий автомат: пограти", "клацни, щоб пограти, або перетягни"];
const DOG_HINT = "погладити песика";
const sceneLabel = (pet: string) =>
  "Піксельне інтернет-кафе: агенти працюють за комп'ютерами й передають одне одному роботу. " +
  `Клікни агента, ${pet}, дошку, автомат, вікно чи двері.`;

interface Drag {
  s: Standing;
  x: number;
  y: number;
  on: boolean;
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
  chatUnread = 0,
  reactions,
  onReact,
  onPick,
  pops,
  interior = EMPTY_INTERIOR,
  name,
  onLook,
  placing,
  onPlacing,
  onPlace,
  onFurniture,
  onMachine,
  playing,
  beans,
}: {
  model: CafeModel;
  clock: number;
  alert?: SceneAlert;
  decor?: DecorSet;
  catName?: string | null;
  theme?: Theme;
  /** tokens a minute, shown on the LED strip under the sign */
  rate?: number;
  /** everyone who has this café open right now, this tab included */
  guests?: Guest[];
  /** messages in the café's chat this tab has not read yet */
  chatUnread?: number;
  reactions?: SeatReaction[];
  /** shows reaction buttons in the agent card */
  onReact?: (agent: number, emoji: string) => void;
  /** a fixture was clicked, or null for a click on bare floor */
  onPick?: (pick: FixturePick | null) => void;
  /** popovers the page hangs over the scene, positioned by an {@link Anchor} */
  pops?: ReactNode;
  /** what the owner bought and put down, the looks they picked, the sign and the second cat */
  interior?: Interior;
  /** the big line of the sign, when it is not the room's own name */
  name?: string;
  /** lets the agent card change an agent's look */
  onLook?: (agent: string, pick: LookPick | null) => void;
  placing?: Placing | null;
  /** picks a standing piece up by dragging it, or drops it back with null */
  onPlacing?: (p: Placing | null) => void;
  onPlace?: (p: Placed) => void;
  /** a piece of furniture was clicked */
  onFurniture?: (piece: { pid: string; item: ItemId }, anchor: Anchor) => void;
  /** a jukebox or an arcade was clicked: anyone may use it, only the owner moves it */
  onMachine?: (piece: { pid: string; item: ItemId }, anchor: Anchor) => void;
  /** the record this page plays, shown over the jukebox */
  playing?: string | null;
  /** coffee beans left, a sack over the counter that opens the shop */
  beans?: number | null;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLSpanElement>(null);
  const cat2Ref = useRef<HTMLSpanElement>(null);
  const clockRef = useRef(clock);
  const alertRef = useRef(alert);
  const decorRef = useRef(decor);
  const looks = interior.looks;
  const sign = owns(interior, "neon") ? interior.sign : undefined;
  const hasCat2 = owns(interior, "cat2");
  const cat2Name = hasCat2 ? interior.cat2Name : undefined;
  const title = name ?? interior.title ?? BRAND;
  const namesRef = useRef({ cat: catName, cat2: cat2Name, sign, title });
  const seats = useMemo(() => seatGuests(guests ?? []), [guests]);
  const seatsRef = useRef<GuestSeat[]>(seats);
  const agents = model.agents;
  const lay = useMemo(() => cafeLayout(agents.length, model.seed), [agents.length, model.seed]);
  const dog = interior.pet === "dog";
  const cat = useMemo(
    () => (dog ? new Cat(lay, model.seed, DOG, "dog") : new Cat(lay, model.seed)),
    [dog, lay, model.seed],
  );
  const cat2 = useMemo(() => (hasCat2 ? new Cat(lay, model.seed + 101, CAT2) : null), [hasCat2, lay, model.seed]);
  const tl = useMemo(() => buildTimeline(model), [model]);
  const phase = usePhase();
  const th = useMemo(() => themeAt(theme, phase), [theme, phase]);
  const views = agents.map((_, i) => agentView(model, tl, lay, i, clock));
  const closed = phase === "night" && alert?.kind !== "ask" && !views.some((v) => v.screen === "work" || v.walker);
  const closedRef = useRef(closed);
  const stand = useMemo(() => standing(lay, interior.placed, decor ?? NO_DECOR), [lay, interior.placed, decor]);
  const shown = useMemo(() => (placing ? stand.filter((s) => s.pid !== placing.pid) : stand), [stand, placing]);
  const shownRef = useRef<Standing[]>(shown);
  const ghostRef = useRef<Ghost | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const droppedRef = useRef(false);

  useEffect(() => {
    clockRef.current = clock;
    alertRef.current = alert;
    decorRef.current = decor;
    namesRef.current = { cat: catName, cat2: cat2Name, sign, title };
    closedRef.current = closed;
    seatsRef.current = seats;
    shownRef.current = shown;
  }, [clock, alert, decor, catName, cat2Name, sign, title, seats, shown, closed]);

  useEffect(() => {
    if (placing) return;
    ghostRef.current = null;
    if (dragRef.current?.on) dragRef.current = null;
  }, [placing]);

  useEffect(() => sceneMounted(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const faces = agents.map((a, i) => lookFor(a.look ?? i, a.color, pickedLook(looks[a.id])));
    const props = agents.map((a) => looks[a.id]?.prop);
    const named = agents.map((a) => ({ ...a, name: looks[a.id]?.name ?? a.name }));
    const room = buildRoom(lay, agents, model.seed, th, props);
    const pin = (el: HTMLElement | null, p: Point) => {
      if (!el) return;
      el.style.left = `${(p.x / lay.width) * 100}%`;
      el.style.top = `${((p.y - 13) / lay.height) * 100}%`;
    };
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const clock = clockRef.current;
      const busy = agents.map((_, i) => i).filter((i) => agentView(model, tl, lay, i, clock).screen === "work");
      const dt = last ? Math.min(100, now - last) : 0;
      const beds = shownRef.current.filter((s) => s.item === "catbed").map((s) => ({ x: s.cx, y: s.bottom }));
      const freeOf = (other: Cat | null) => beds.filter((b) => b.x !== other?.bed?.x || b.y !== other.bed.y);
      cat.step(dt, now, busy, freeOf(cat2));
      cat2?.step(dt, now, busy, freeOf(cat));
      last = now;
      drawFrame(ctx, {
        model,
        lay,
        tl,
        looks: faces,
        room,
        clock,
        t: now / 1000,
        cat,
        cat2,
        alert: alertRef.current,
        decor: decorRef.current,
        theme: th,
        guests: seatsRef.current,
        furniture: shownRef.current,
        ghost: ghostRef.current,
        closed: closedRef.current,
      });
      pin(catRef.current, cat.pos);
      if (cat2) pin(cat2Ref.current, cat2.pos);
      if (clipWanted()) {
        const n = namesRef.current;
        const bubbles = agents
          .map((_, i) => bubbleFor(model, tl, lay, i, agentView(model, tl, lay, i, clock), clock))
          .filter((b): b is Bubble => b != null);
        const cats = [
          ...(n.cat ? [{ ...cat.pos, name: n.cat }] : []),
          ...(cat2 && n.cat2 ? [{ ...cat2.pos, name: n.cat2 }] : []),
        ];
        const watermark = `relay · ${location.host}`;
        const alert = alertRef.current;
        clipFrame(canvas, { lay, agents: named, bubbles, alert, cats, sign: n.sign, title: n.title, watermark });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [model, agents, lay, tl, cat, cat2, th, looks]);

  const nameOf = (i: number) => looks[agents[i].id]?.name ?? agents[i].name;
  const pointAt = (e: MouseEvent | PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * lay.width, y: ((e.clientY - r.top) / r.height) * lay.height };
  };
  const hitAt = (p: Point): Hit | null => {
    const at = agents.map((_, i) => agentView(model, tl, lay, i, clockRef.current));
    return hitTest(lay, at, cat.pos, p, beans != null);
  };
  const ghostAt = (pl: Placing, p: Point): Ghost | null => {
    const it = itemOf(pl.item);
    if (!it) return null;
    const s = spotAt(lay, it, p, stand.filter((q) => q.pid !== pl.pid));
    const base = { item: it.id, w: it.w, h: it.h };
    return s ? { ...base, ...s, ok: true } : { ...base, cx: p.x, bottom: p.y + it.h / 2, ok: false };
  };
  const pieceAt = (p: Point) => (onFurniture && !hitAt(p) ? standingAt(shown, p) : null);
  const machineAt = (p: Point) => {
    const s = onMachine && !hitAt(p) ? standingAt(shown, p) : null;
    return s && MACHINES.includes(s.item) ? s : null;
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    droppedRef.current = false;
    if (placing || !onPlacing || e.button !== 0) return;
    const s = pieceAt(pointAt(e));
    dragRef.current = s ? { s, x: e.clientX, y: e.clientY, on: false } : null;
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    const d = dragRef.current;
    if (d && !d.on && e.buttons & 1 && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3) {
      d.on = true;
      el.setPointerCapture(e.pointerId);
      onPlacing?.({ item: d.s.item, pid: d.s.pid });
    }
    const pl = placing ?? (d?.on ? d.s : null);
    const p = pointAt(e);
    if (pl) {
      ghostRef.current = ghostAt(pl, p);
      el.style.cursor = ghostRef.current?.ok ? (d?.on ? "grabbing" : "copy") : "not-allowed";
      el.title = "";
      return;
    }
    const h = hitAt(p);
    const m = machineAt(p);
    if (m) {
      el.style.cursor = "pointer";
      el.title = m.item === "arcade" ? ARCADE_HINT[onPlacing ? 1 : 0] : JUKE_HINT[onPlacing ? 1 : 0];
      return;
    }
    if (!h && pieceAt(p)) {
      el.style.cursor = onPlacing ? "grab" : "pointer";
      el.title = "перетягни або клацни, щоб перемістити чи прибрати";
      return;
    }
    const c2 = !h && cat2 && onCat(cat2.pos, p);
    el.style.cursor = h || c2 ? "pointer" : "";
    const hint = !h ? "" : h.kind === "agent" ? `${nameOf(h.agent)}: ${HIT_HINT.agent}` : HIT_HINT[h.kind];
    el.title = c2 ? HIT_HINT.cat : h?.kind === "cat" && dog ? DOG_HINT : hint;
  };
  const up = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.on) return;
    droppedRef.current = true;
    const g = ghostAt(d.s, pointAt(e));
    ghostRef.current = null;
    if (g?.ok) onPlace?.(toPlaced(lay, d.s.pid, d.s.item, g));
    else onPlacing?.(null);
  };
  const cancel = () => {
    if (dragRef.current?.on) onPlacing?.(null);
    dragRef.current = null;
  };
  const click = (e: MouseEvent<HTMLCanvasElement>) => {
    if (droppedRef.current) {
      droppedRef.current = false;
      return;
    }
    const p = pointAt(e);
    if (placing) {
      const g = ghostAt(placing, p);
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
    const m = machineAt(p);
    if (m) {
      onMachine!({ pid: m.pid, item: m.item }, anchorAt(lay, m.cx, m.bottom - m.h, m.bottom));
      return;
    }
    const f = pieceAt(p);
    if (f) {
      onFurniture!({ pid: f.pid, item: f.item }, anchorAt(lay, f.cx, f.bottom - f.h, f.bottom));
      return;
    }
    if (h?.kind === "cat" || (!h && cat2 && onCat(cat2.pos, p))) {
      (h ? cat : cat2!).pet(performance.now());
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
    .map((_, i) => bubbleFor(model, tl, lay, i, views[i], clock))
    .filter((b): b is Bubble => b != null);
  const door = doorOf(lay);
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
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onPointerLeave={() => {
            if (!dragRef.current?.on) ghostRef.current = null;
          }}
          aria-label={sceneLabel(dog ? "песика" : "кота")}
        />
        <div className="cafe-overlay" aria-hidden>
          <div className={`cafe-neon ${closed ? "off" : ""}`} style={pos(SIGN.x + SIGN.w / 2, SIGN.y + SIGN.h / 2)}>
            <span className="cafe-neon-main" style={{ "--fit": titleFit(title) } as CSSProperties}>
              {title}
            </span>
            <span className="cafe-neon-sub">{closed ? "зачинено до ранку" : (sign ?? SIGN_TEXT)}</span>
          </div>
          {closed && (
            <span className="cafe-closed" style={pos(door.x + door.w / 2, door.y - 3)}>
              зачинено
            </span>
          )}
          <span className={`cafe-meter ${rate > 0 ? "on" : ""}`} style={pos(METER.x + METER.w / 2, METER.y + METER.h / 2)}>
            {rate > 0 ? `${fmtTokens(rate)} ток/хв` : "0 ток/хв"}
          </span>
          {agents.map((a, i) => {
            if (talking.has(i)) return null;
            const ask = alert?.kind === "ask" && alert.agent === i;
            const nick = looks[a.id]?.name;
            return (
              <span
                key={a.id}
                className={`cafe-name ${ask ? "ask" : ""} ${nick ? "plate" : ""}`}
                style={{ ...pos(lay.desks[i].x, lay.desks[i].top - 2), color: a.color }}
              >
                {nick ?? a.name.toLowerCase()}
                {ask && <b> · {alert.text}</b>}
              </span>
            );
          })}
          <GuestTags seats={seats} more={barOverflow(guests ?? [])} pos={pos} />
          <ChatTag unread={chatUnread} pos={pos} />
          <BeanSack beans={beans} pos={pos} />
          <JukeTag playing={playing} at={shown.find((s) => s.item === "jukebox")} pos={pos} />
          {reactions && <ReactionLayer list={reactions} anchor={reactAt} pos={pos} />}
          {catName && (
            <span ref={catRef} className="cafe-cat">
              {catName}
            </span>
          )}
          {cat2Name && (
            <span ref={cat2Ref} className="cafe-cat">
              {cat2Name}
            </span>
          )}
          {bubbles.map((b) => (
            <CafeBubble key={b.key} b={b} name={nameOf(b.agent)} color={agents[b.agent].color} style={pos(b.x, b.y)} />
          ))}
        </div>
      </div>
      <div className="cafe-pops">
        {selIdx >= 0 && (
          <ScenePop
            anchor={agentAnchor(model, tl, lay, selIdx, clock)}
            color={agents[selIdx].color}
            label={nameOf(selIdx)}
            onClose={() => setSel(null)}
          >
            <AgentCard
              model={model}
              view={agentView(model, tl, lay, selIdx, clock)}
              agent={selIdx}
              clock={clock}
              asking={alert?.kind === "ask" && alert.agent === selIdx ? alert.text : undefined}
              onReact={onReact && ((emoji) => onReact(selIdx, emoji))}
              look={looks[agents[selIdx].id]}
              onLook={onLook && ((pick) => onLook(agents[selIdx].id, pick))}
            />
          </ScenePop>
        )}
        {pops}
      </div>
    </div>
  );
}
