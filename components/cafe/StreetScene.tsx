"use client";

import { CSSProperties, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { PROJECT_URL } from "@/lib/brand";
import { cafeLayout } from "@/lib/cafe/layout";
import { bubbleFor, buildTimeline } from "@/lib/cafe/timeline";
import { Two, Ui, tr, useUi } from "@/lib/i18n";
import { Point } from "@/lib/layout";
import { BRAND, EMPTY_INTERIOR, agentName, lookOf, owns, titleFit } from "@/lib/live/interior";
import { useHalloween } from "@/lib/live/season";
import { noteVisitor, visitAt, visitorText } from "@/lib/live/visitors";
import { fmtTokens } from "../live/tokens";
import { AgentCard, ScenePop } from "./AgentCard";
import type { CafeSceneProps } from "./CafeScene";
import { BLACK_CAT, Cat, DOG } from "./cat";
import { clipFrame, clipWanted, sceneMounted } from "./clip";
import { themeAt, usePhase } from "./daylight";
import { CAT2 } from "./furniture";
import { GuestSeat, barOverflow, seatGuests } from "./guests";
import { HIT_HINT, Hit, SACK } from "./hit";
import { lookFor, pickedLook } from "./people";
import { standing } from "./placement";
import { Anchor, CafeBubble, anchorAt, onCat } from "./sceneParts";
import { BeanGains, ReactionLayer } from "./SceneSocial";
import { HALLOWEEN, THEMES } from "./theme";
import { GOLD_COAT } from "./visitor";
import { StreetArt, buildStreet } from "./street/facade";
import { drawStreet } from "./street/frame";
import { SEAT_W, StreetLayout, streetLayout } from "./street/geom";
import { StreetPiece, pieceAt, streetPieces } from "./street/place";
import { STATE } from "./street/px";
import { SeatState } from "./street/seat";
import { SeatView, StreetPet, behindGlass, counterSeats, seatViews, streetVisitor } from "./street/walk";
import type { DecorSet } from "./decor";

const NO_DECOR: DecorSet = new Set();
/** Below this width the names leave the picture for a row of cards under it. */
const NARROW_PX = 560;

const STATE_TEXT: Record<SeatState | "walk", Two> = {
  work: { uk: "працює", en: "working" },
  incoming: { uk: "приймає роботу", en: "taking work" },
  ask: { uk: "питає тебе", en: "asking you" },
  done: { uk: "готово", en: "done" },
  idle: { uk: "спить", en: "asleep" },
  walk: { uk: "несе роботу", en: "passing work on" },
};
const KNOCKS: Two = { uk: "стукає у вітрину · питає тебе", en: "knocks on the window · asking you" };
const LEGEND_LABEL: Two = { uk: "агенти за вітриною", en: "agents behind the window" };
const MACHINES = ["jukebox", "arcade"];
const JUKE_HINT: Two = { uk: "музичний автомат: вибрати мелодію", en: "jukebox: pick a tune" };
const ARCADE_HINT: Two = { uk: "ігровий автомат: пограти", en: "arcade machine: play" };
const PIECE_HINT: Two = { uk: "річ із крамниці: перемістити чи прибрати", en: "a piece from the shop: move or put it away" };
const DOG_HINT: Two = { uk: "погладити песика", en: "pet the dog" };
const STREET_HINT: Record<"board" | "beans" | "bar" | "door" | "window", Two> = {
  board: { uk: "дошка на тротуарі: підсумок дня", en: "the pavement board: the day's recap" },
  beans: HIT_HINT.beans,
  bar: { uk: "стійка за дверима: груповий чат", en: "the counter behind the door: group chat" },
  door: HIT_HINT.door,
  window: { uk: "небо над кафе: змінити вид", en: "the sky over the café: change the view" },
};

const sceneLabel = (ui: Ui) =>
  ui === "en"
    ? "Pixel café seen from the street at night: the agents sit behind the shop windows at their computers. " +
      "Click an agent, the cat, the door, the counter or the pavement board."
    : "Піксельне кафе з вулиці вночі: агенти сидять за вітринами біля своїх комп'ютерів. " +
      "Клікни агента, кота, двері, стійку чи дошку на тротуарі.";

function stateOf(sv: SeatView): SeatState | "walk" {
  return sv.walker ? "walk" : sv.state;
}

const colorOf = (s: SeatState | "walk") => (s === "walk" || s === "incoming" ? STATE.work : STATE[s]);

/** The café from the street: the agents behind the shop windows, the counter through the door, rain on the pavement. */
export default function StreetScene({
  model,
  clock,
  alert,
  warns,
  etas,
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
  dress,
  onFurniture,
  onMachine,
  playing,
  beans,
  gains,
  asleep,
  visitors = false,
}: CafeSceneProps) {
  const ui = useUi();
  const [sel, setSel] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLSpanElement>(null);
  const cat2Ref = useRef<HTMLSpanElement>(null);
  const clockRef = useRef(clock);
  const alertRef = useRef(alert);
  const agents = model.agents;
  const looks = interior.looks;
  const worn = dress?.worn;
  const hall = useMemo(() => cafeLayout(agents.length, model.seed), [agents.length, model.seed]);
  const lay = useMemo(() => streetLayout(agents.length), [agents.length]);
  const tl = useMemo(() => buildTimeline(model), [model]);
  const phase = usePhase();
  const halloween = useHalloween().on;
  const th = useMemo(() => themeAt(halloween ? HALLOWEEN : theme, phase), [theme, phase, halloween]);
  const dog = interior.pet === "dog";
  const hasCat2 = owns(interior, "cat2");
  const cat2Name = hasCat2 ? interior.cat2Name : undefined;
  const title = name ?? interior.title ?? BRAND;
  const brand = title.trim().toUpperCase() === BRAND;
  const sign = owns(interior, "neon") ? interior.sign : undefined;
  const seats = useMemo(() => seatGuests(guests ?? [], ui), [guests, ui]);
  const views = seatViews(model, tl, hall, lay, clock, alert);
  const working = views.some((v) => v.view.screen === "work" || v.walker);
  const closed = !!asleep && phase === "night" && alert?.kind !== "ask" && !working;
  const closedRef = useRef(closed);
  const visitorsRef = useRef(visitors);
  const counter = useMemo(() => counterSeats(lay), [lay]);
  const atCounter: GuestSeat[] = useMemo(
    () => seats.slice(0, counter.length).map((s, k) => ({ ...s, x: counter[k].x, y: counter[k].y })),
    [seats, counter],
  );
  const counterRef = useRef(atCounter);
  const stand = useMemo(() => standing(hall, interior.placed ?? [], decor ?? NO_DECOR), [hall, interior.placed, decor]);
  const pieces = useMemo(() => streetPieces(lay, stand), [lay, stand]);
  const piecesRef = useRef<StreetPiece[]>(pieces);
  const cropRef = useRef(!!decor?.has("crown"));

  const pets = useMemo(() => {
    const ground = lay.wins.filter((w) => w.floor === 0);
    const last = ground[ground.length - 1];
    const first = ground[0];
    const home = (w: typeof last, right: boolean): Point => ({ x: right ? w.x + w.w - 12 : w.x + 12, y: w.y + w.h + 1 });
    const doorStep = { x: lay.door.x - 6, y: lay.walk + 3 };
    const cat = dog
      ? new Cat(lay, model.seed, DOG, "dog")
      : new Cat(lay, model.seed, halloween ? BLACK_CAT : undefined);
    const out = [new StreetPet(cat, lay, dog ? doorStep : home(last, true), model.seed, dog)];
    if (hasCat2) out.push(new StreetPet(new Cat(lay, model.seed + 101, CAT2), lay, home(first, ground.length === 1), model.seed + 101));
    return out;
  }, [lay, model.seed, dog, halloween, hasCat2]);
  const goldCat = useMemo(() => new Cat(lay, 777, GOLD_COAT), [lay]);

  useEffect(() => {
    clockRef.current = clock;
    alertRef.current = alert;
    closedRef.current = closed;
    visitorsRef.current = visitors;
    counterRef.current = atCounter;
    piecesRef.current = pieces;
    cropRef.current = !!decor?.has("crown");
  }, [clock, alert, closed, visitors, atCounter, pieces, decor]);

  useEffect(() => sceneMounted(), []);

  // the visitor's name tag is looked up every few seconds, as in the room
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!visitors || closed) return;
    const first = setTimeout(() => setAt(Date.now()), 0);
    const id = setInterval(() => setAt(Date.now()), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [visitors, closed]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < NARROW_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const faces = agents.map((a, i) => ({
      ...lookFor(a.look ?? i, a.color, pickedLook(lookOf(looks, a), a.look ?? i)),
      costume: worn?.[i] ?? null,
    }));
    const named = agents.map((a) => ({ ...a, name: agentName(a, lookOf(looks, a)) }));
    const arts = new Map<boolean, StreetArt>();
    const artFor = (open: boolean) => {
      let a = arts.get(open);
      if (!a) {
        a = buildStreet(lay, th, open, brand);
        arts.set(open, a);
      }
      return a;
    };
    const pin = (el: HTMLElement | null, p: Point) => {
      if (!el) return;
      el.style.left = `${(p.x / lay.width) * 100}%`;
      el.style.top = `${((p.y - 11) / lay.height) * 100}%`;
    };
    let raf = 0;
    const loop = (now: number) => {
      const clock = clockRef.current;
      const open = !closedRef.current;
      const art = artFor(open);
      for (const p of pets) p.step(now);
      const wall = Date.now();
      const visit = visitorsRef.current && open ? visitAt(wall) : null;
      const free = counterRef.current.length < counter.length ? counter[counterRef.current.length] : null;
      drawStreet(ctx, {
        lay,
        art,
        model,
        seats: seatViews(model, tl, hall, lay, clock, alertRef.current),
        looks: faces,
        clock,
        t: now / 1000,
        theme: th,
        guests: counterRef.current,
        pieces: piecesRef.current,
        open,
        visitor: visit ? streetVisitor(lay, visit, free, wall) : null,
        visitorCat: goldCat,
        pets,
        crown: cropRef.current,
      });
      pin(catRef.current, pets[0].pos);
      if (pets[1]) pin(cat2Ref.current, pets[1].pos);
      if (clipWanted()) {
        const tagged = { ...lay, desks: lay.seats.map((s) => ({ x: s.px + 20, top: s.y0 + 12, row: 0, face: "front" as const, pod: 0, side: 0 as const })) };
        clipFrame(canvas, {
          lay: tagged,
          agents: named,
          bubbles: [],
          alert: alertRef.current,
          cats: [],
          title,
          watermark: `agent lounge · ${PROJECT_URL}`,
          noSign: true,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [model, agents, lay, hall, tl, th, looks, worn, brand, pets, goldCat, counter, title]);

  const nameOf = (i: number) => agentName(agents[i], lookOf(looks, agents[i]));
  const W = lay.width;
  const H = lay.height;
  const pos = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
  const pointAt = (e: MouseEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const hitAt = (p: Point): Hit | { kind: "piece"; piece: StreetPiece } | null => {
    const vs = seatViews(model, tl, hall, lay, clockRef.current, alertRef.current);
    for (let i = vs.length - 1; i >= 0; i--) {
      const w = vs[i].walker;
      if (w && behindGlass(lay, w.x, w.y) && p.x >= w.x - 7 && p.x < w.x + 7 && p.y >= w.y - 22 && p.y < w.y + 2)
        return { kind: "agent", agent: i };
    }
    if (pets.some((q) => onCat(q.pos, p))) return { kind: "cat" };
    const piece = pieceAt(pieces, p);
    if (piece) return { kind: "piece", piece };
    for (let i = 0; i < lay.seats.length; i++) {
      const s = lay.seats[i];
      if (p.x >= s.px && p.x < s.px + SEAT_W && p.y >= s.y0 && p.y < s.y0 + 53) return { kind: "agent", agent: i };
    }
    const g = lay.glass;
    if (p.x >= g.x && p.x < g.x + g.w && p.y >= g.y && p.y < g.y + g.h) return { kind: "bar" };
    const d = lay.door;
    if (p.x >= d.x && p.x < d.x + d.w && p.y >= d.y - 6 && p.y < d.y + d.h + 2) return { kind: "door" };
    const f = lay.aframe;
    if (p.x >= f.x - 2 && p.x < f.x + 17 && p.y >= f.y - 2 && p.y < f.y + 18) return { kind: "board" };
    if (beans != null && p.x >= beanAt.x - 11 && p.x < beanAt.x + 11 && p.y >= beanAt.y - 9 && p.y < beanAt.y + 1)
      return { kind: "beans" };
    if (p.y < 26) return { kind: "window" };
    return null;
  };

  const move = (e: MouseEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    const h = hitAt(pointAt(e));
    el.style.cursor = h ? "pointer" : "";
    if (!h) return void (el.title = "");
    if (h.kind === "agent") el.title = `${nameOf(h.agent)}: ${HIT_HINT.agent[ui]}`;
    else if (h.kind === "cat") el.title = dog ? DOG_HINT[ui] : HIT_HINT.cat[ui];
    else if (h.kind === "piece") {
      const m = MACHINES.includes(h.piece.s.item);
      el.title = m ? (h.piece.s.item === "arcade" ? ARCADE_HINT : JUKE_HINT)[ui] : onFurniture ? PIECE_HINT[ui] : "";
      if (!m && !onFurniture) el.style.cursor = "";
    } else if (h.kind in STREET_HINT) el.title = STREET_HINT[h.kind as keyof typeof STREET_HINT][ui];
  };

  const click = (e: MouseEvent<HTMLCanvasElement>) => {
    const p = pointAt(e);
    const h = hitAt(p);
    if (h?.kind === "agent") {
      const id = agents[h.agent].id;
      setSel(sel === id ? null : id);
      onPick?.(null);
      return;
    }
    setSel(null);
    if (h?.kind === "cat") {
      const pet = pets.find((q) => onCat(q.pos, p));
      pet?.pet(e.timeStamp);
      onPick?.(null);
      return;
    }
    if (h?.kind === "piece") {
      const q = h.piece;
      const anchor = anchorAt(lay, q.cx, q.bottom - q.s.h, q.bottom);
      if (MACHINES.includes(q.s.item) && onMachine) onMachine({ pid: q.s.pid, item: q.s.item }, anchor);
      else if (onFurniture) onFurniture({ pid: q.s.pid, item: q.s.item }, anchor);
      return;
    }
    if (!h) return onPick?.(null);
    const fix: Record<string, [number, number, number]> = {
      bar: [lay.glass.x + 12, lay.glass.y, lay.glass.y + lay.glass.h],
      door: [lay.door.x + 16, lay.door.y + 34, lay.door.y + lay.door.h],
      board: [lay.aframe.x + 7, lay.aframe.y, lay.aframe.y + 17],
      beans: [beanAt.x, beanAt.y - 9, beanAt.y],
      window: [p.x, 4, 26],
    };
    const [x, top, bottom] = fix[h.kind] ?? [p.x, p.y, p.y];
    onPick?.({ kind: h.kind as "bar", anchor: anchorAt(lay, x, top, bottom) });
  };

  const selIdx = sel == null ? -1 : agents.findIndex((a) => a.id === sel);
  const seatAnchor = (i: number): Anchor => {
    const s = lay.seats[i];
    const w = views[i]?.walker;
    const x = w ? w.x : s.px + 20;
    const top = w ? w.y - 24 : s.y0 + 2;
    const bottom = w ? w.y + 2 : s.y0 + 52;
    const below = top < H * 0.5;
    return { x: x / W, y: (below ? top : bottom) / H, below, beside: x > W / 2 ? "left" : "right" };
  };
  const asking = alert?.kind === "ask" && alert.agent < agents.length ? alert.agent : -1;
  const beanAt = { x: lay.door.x + lay.door.w + 12, y: lay.walk - 7 };
  const walkerBubbles = agents
    .map((_, i) => {
      const w = views[i]?.walker;
      if (!w || !behindGlass(lay, w.x, w.y)) return null;
      const b = bubbleFor(model, tl, hall, i, views[i].view, clock);
      return b && !b.seated ? { ...b, x: w.x, y: w.y - 20 } : null;
    })
    .filter((b) => b != null);
  const sk = 320 / W;
  const visit = visitors && !closed && at ? visitAt(at) : null;
  const visitSat = visit ? streetVisitor(lay, visit, counter[atCounter.length] ?? null, at) : null;
  const sat = visitSat && !visitSat.walking ? visitSat : null;
  const jukebox = pieces.find((q) => q.s.item === "jukebox");

  useEffect(() => {
    if (sat && document.visibilityState === "visible") noteVisitor(sat.kind, at);
  }, [sat, at]);

  const tagFor = (i: number) => {
    const sv = views[i];
    const st = stateOf(sv);
    const warn = st === "ask" ? undefined : warns?.get(i);
    return { st, warn, color: colorOf(st) };
  };

  return (
    <div className="cafe-wrap street-wrap" ref={wrapRef} style={{ "--ar": W / H } as CSSProperties}>
      <div className="arcade cafe street" style={{ "--k": 384 / W, "--sk": sk } as CSSProperties}>
        <canvas ref={canvasRef} width={W} height={H} onClick={click} onMouseMove={move} aria-label={sceneLabel(ui)} />
        <div className="cafe-overlay street-overlay" aria-hidden>
          {!brand && (
            <span
              className={`street-neon ${closed ? "off" : ""}`}
              style={{ ...pos(lay.sign.x + lay.sign.w / 2, lay.sign.y + lay.sign.h / 2), "--fit": titleFit(title) } as CSSProperties}
            >
              {title}
            </span>
          )}
          {sign && !narrow && (
            <span className="street-sub" style={pos(lay.sign.x + lay.sign.w / 2, lay.sign.y - 2)}>
              {sign}
            </span>
          )}
          {closed && (
            <span className="cafe-closed" style={pos(lay.door.x + lay.door.w / 2, lay.door.y - 3)}>
              {tr(ui, "зачинено", "closed")}
            </span>
          )}
          {agents.map((a, i) => {
            const s = lay.seats[i];
            if (!s) return null;
            const { st, warn, color } = tagFor(i);
            const style = { ...pos(s.px + SEAT_W / 2, s.y0 + 7), "--c": color, maxWidth: `${((SEAT_W - 3) / W) * 100}%` } as CSSProperties;
            if (narrow)
              return (
                <span key={a.id} className={`street-badge ${warn ? "warn" : ""}`} style={style}>
                  {i + 1}
                </span>
              );
            return (
              <span key={a.id} className={`street-tag st-${st} ${warn ? "warn" : ""}`} style={style}>
                <b>{nameOf(i)}</b>
                <i>{warn ? `! ${warn.short}` : `${STATE_TEXT[st][ui]}${st === "done" ? " ✓" : ""}`}</i>
              </span>
            );
          })}
          {!narrow &&
            atCounter.map((s) => (
            <span key={s.id} className={`cafe-guest ${s.me ? "me" : ""}`} style={pos(s.x + (s.x < lay.glass.x + 12 ? -3 : 3), lay.door.y - 1)}>
              {s.tag}
            </span>
          ))}
          {barOverflow(guests ?? []) + Math.max(0, seats.length - atCounter.length) > 0 && (
            <span className="cafe-guest" style={pos(lay.door.x + lay.door.w + 5, lay.door.y + 8)}>
              +{barOverflow(guests ?? []) + seats.length - atCounter.length}
            </span>
          )}
          {sat && (
            <span className="cafe-guest visitor" style={pos(sat.seat.x, sat.kind === "goldcat" ? sat.seat.y - 10 : lay.door.y - 1)}>
              {visitorText(sat.kind, ui).icon} {visitorText(sat.kind, ui).name.toLowerCase()}
            </span>
          )}
          {chatUnread > 0 && (
            <span className="cafe-chat" style={pos(lay.glass.x + lay.glass.w / 2, lay.glass.y - 1)}>
              💬 {chatUnread}
            </span>
          )}
          {beans != null && (
            <span className="cafe-beans" style={pos(beanAt.x, beanAt.y)}>
              ☕ {Math.max(0, beans).toLocaleString("uk-UA")}
            </span>
          )}
          {beans != null && (
            <BeanGains list={gains} pos={(x, y) => pos(beanAt.x + (x - SACK.x), beanAt.y + (y - SACK.y))} />
          )}
          {playing && jukebox && (
            <span className="cafe-juke" style={pos(jukebox.cx, jukebox.bottom - jukebox.s.h - 1)}>
              ♪ {playing}
            </span>
          )}
          {reactions && (
            <ReactionLayer
              list={reactions}
              anchor={(i) => {
                const s = lay.seats[i];
                return s ? { x: s.px + 20, y: s.y0 + 4 } : { x: W / 2, y: H / 2 };
              }}
              pos={pos}
            />
          )}
          {walkerBubbles.map((b) => (
            <CafeBubble key={b.key} b={b} name={nameOf(b.agent)} color={agents[b.agent].color} style={pos(b.x, b.y)} />
          ))}
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
          <span className={`street-meter ${rate > 0 ? "on" : ""}`} style={pos(W - 6, H - 3)}>
            {`${rate > 0 ? fmtTokens(rate, ui) : "0"} ${tr(ui, "ток/хв", "tok/min")}`}
          </span>
        </div>
        {asking >= 0 && !narrow && lay.seats[asking] && (
          <div className="street-ui">
            <button
              className="street-ask"
              style={askStyle(lay, asking)}
              onClick={() => setSel(agents[asking].id)}
              title={tr(ui, "відкрити картку агента", "open the agent's card")}
            >
              <b>
                {nameOf(asking)} {KNOCKS[ui]}
              </b>
              <span>{alert?.text}</span>
            </button>
          </div>
        )}
      </div>
      {narrow && (
        <div className="street-legend" aria-label={LEGEND_LABEL[ui]}>
          <div className="street-cards">
            {agents.map((a, i) => {
              const { st, warn, color } = tagFor(i);
              return (
                <button
                  key={a.id}
                  className={`street-card ${warn ? "warn" : ""}`}
                  style={{ "--c": color } as CSSProperties}
                  onClick={() => setSel(sel === a.id ? null : a.id)}
                >
                  <span className="sc-n">{i + 1}</span>
                  <span className="sc-t">
                    <b>{nameOf(i)}</b>
                    <i>{warn ? `! ${warn.short}` : STATE_TEXT[st][ui]}</i>
                  </span>
                </button>
              );
            })}
          </div>
          {asking >= 0 && (
            <button className="street-ask flat" onClick={() => setSel(agents[asking].id)}>
              <b>
                {asking + 1} · {nameOf(asking)}:
              </b>{" "}
              <span>{alert?.text}</span>
            </button>
          )}
        </div>
      )}
      <div className="cafe-pops">
        {selIdx >= 0 && lay.seats[selIdx] && (
          <ScenePop anchor={seatAnchor(selIdx)} color={agents[selIdx].color} label={nameOf(selIdx)} onClose={() => setSel(null)}>
            <AgentCard
              model={model}
              view={views[selIdx].view}
              agent={selIdx}
              clock={clock}
              eta={etas?.[selIdx] ?? null}
              nameOf={nameOf}
              asking={alert?.kind === "ask" && alert.agent === selIdx ? alert.text : undefined}
              stuck={warns?.get(selIdx)?.long}
              onPick={(i) => setSel(agents[i].id)}
              onReact={onReact && ((emoji) => onReact(selIdx, emoji))}
              look={lookOf(looks, agents[selIdx])}
              onLook={onLook && ((pick) => onLook(agents[selIdx], pick))}
              costume={worn?.[selIdx] ?? null}
              wardrobe={dress?.owned}
              onDress={dress?.set && ((c) => dress.set?.(selIdx, c))}
            />
          </ScenePop>
        )}
        {pops}
      </div>
    </div>
  );
}

/**
 * The question card hangs over the facade beside the sign, on the side of the agent asking, its tail pointing down at
 * that agent's window.
 */
function askStyle(lay: StreetLayout, i: number): CSSProperties {
  const s = lay.seats[i];
  const W = lay.width;
  const x = s.px + SEAT_W / 2;
  const S = lay.sign;
  const cw = Math.min(S.x - lay.fx0 + 6, W * 0.36);
  const left = x < S.x + S.w / 2 ? Math.max(2, Math.min(S.x - 3 - cw, x - 22)) : Math.max(S.x + S.w + 3, Math.min(W - cw - 2, x - 22));
  // over the awning; with a floor above, over that floor's windows so their tags stay in sight
  const top = Math.min(...lay.wins.map((w) => w.y));
  const bottom = lay.floors === 2 ? top - 3 : s.y0 - 14;
  return {
    left: `${(left / W) * 100}%`,
    width: `${(cw / W) * 100}%`,
    bottom: `${(1 - bottom / lay.height) * 100}%`,
    "--tail": `${(Math.max(6, Math.min(cw - 6, x - left)) / cw) * 100}%`,
  } as CSSProperties;
}
