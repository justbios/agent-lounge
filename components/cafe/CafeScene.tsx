"use client";

import { CSSProperties, MouseEvent, PointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PROJECT_URL } from "@/lib/brand";
import { cafeLayout } from "@/lib/cafe/layout";
import { Two, Ui, tr, useUi } from "@/lib/i18n";
import { CafeModel } from "@/lib/cafe/model";
import { Bubble, agentView, bubbleFor, buildTimeline } from "@/lib/cafe/timeline";
import { Point } from "@/lib/layout";
import type { AgentDef } from "@/lib/types";
import {
  BRAND,
  Costume,
  EMPTY_INTERIOR,
  Interior,
  ItemId,
  LookPick,
  Placed,
  agentName,
  itemOf,
  lookOf,
  owns,
  titleFit,
} from "@/lib/live/interior";
import { Guest } from "@/lib/live/social";
import { visitAt } from "@/lib/live/visitors";
import type { Eta } from "@/lib/live/eta";
import { AgentCard, ScenePop } from "./AgentCard";
import { BLACK_CAT, Cat, DOG } from "./cat";
import { clipFrame, clipWanted, sceneMounted } from "./clip";
import { themeAt, usePhase } from "./daylight";
import { DecorSet } from "./decor";
import { Ghost, STATUS_COLOR, Status, drawFrame, seatStatus } from "./frame";
import { CAT2 } from "./furniture";
import { GuestSeat, barOverflow, seatGuests } from "./guests";
import { HIT_HINT, Hit, hitTest } from "./hit";
import { lookFor, pickedLook } from "./people";
import { Standing, spotAt, standing, standingAt, toPlaced } from "./placement";
import { PlateIn, placeAsk, placePlates, seatBox } from "./plates";
import { buildRoom, doorOf, fixtures } from "./room";
import {
  Anchor,
  CafeBubble,
  FixturePick,
  Placing,
  SceneAlert,
  SceneWarn,
  agentAnchor,
  anchorAt,
  fixtureAnchor,
  onCat,
} from "./sceneParts";
import { BeanGains, BeanSack, ChatTag, GuestTags, JukeTag, ReactionLayer, SeatReaction } from "./SceneSocial";
import { HALLOWEEN, THEMES, Theme } from "./theme";
import { GOLD_COAT, visitorFrame, visitorSeat } from "./visitor";
import VisitorTag from "./VisitorTag";
import { fmtTokens } from "../live/tokens";
import type { Gain } from "@/lib/live/useBeanGains";
import { useHalloween } from "@/lib/live/season";

export type { Anchor, FixturePick, Placing, SceneAlert, SceneWarn } from "./sceneParts";

const NO_DECOR: DecorSet = new Set();
const SIGN_TEXT: Two = { uk: "інтернет-кафе", en: "internet café" };
const LATE_TEXT: Two = { uk: "нічна зміна", en: "night shift" };
const CLOSED_TEXT: Two = { uk: "зачинено до ранку", en: "closed till morning" };
const MACHINES: ItemId[] = ["jukebox", "arcade"];
/** Below this width the name plates turn into numbers, with the names in a list under the picture. */
const NARROW_PX = 560;
/** The name-and-state plates over the desks; the speech bubbles carry the name now. */
const SHOW_PLATES = false;
const STATUS_TEXT: Record<Status, Two> = {
  work: { uk: "працює", en: "working" },
  wait: { uk: "питає тебе", en: "asking you" },
  done: { uk: "готово", en: "done" },
  idle: { uk: "відпочиває", en: "resting" },
};
const ASKS: Two = { uk: "питає тебе", en: "is asking you" };
const OPEN_CARD: Two = { uk: "відкрити картку агента", en: "open the agent's card" };
const LEGEND_LABEL: Two = { uk: "агенти в залі", en: "agents in the room" };
/** a stuck agent's plate, the orange its small name used to turn */
const WARN_COLOR = "#ff9f43";
/** the hint for anyone, then for the owner, who may also drag the machine */
const JUKE_HINT: Two[] = [
  { uk: "музичний автомат: вибрати мелодію", en: "jukebox: pick a tune" },
  { uk: "клацни, щоб вибрати мелодію, або перетягни", en: "click to pick a tune, or drag it" },
];
const ARCADE_HINT: Two[] = [
  { uk: "ігровий автомат: пограти", en: "arcade machine: play" },
  { uk: "клацни, щоб пограти, або перетягни", en: "click to play, or drag it" },
];
const DOG_HINT: Two = { uk: "погладити песика", en: "pet the dog" };
const PIECE_HINT: Two = {
  uk: "перетягни або клацни, щоб перемістити чи прибрати",
  en: "drag or click to move or remove it",
};
const sceneLabel = (ui: Ui, dog: boolean) =>
  ui === "en"
    ? "Pixel internet café: agents work at their computers and pass work to each other. " +
      `Click an agent, the ${dog ? "dog" : "cat"}, the board, a machine, the window or the door.`
    : "Піксельне інтернет-кафе: агенти працюють за комп'ютерами й передають одне одному роботу. " +
      `Клікни агента, ${dog ? "песика" : "кота"}, дошку, автомат, вікно чи двері.`;

/** The costumes in a scene: what each desk's agent wears, what there is to put on, and how to change it. */
export interface Dressing {
  worn: (Costume | null)[];
  owned: Costume[];
  /** absent for someone only watching */
  set?: (agent: number, costume: Costume | null) => void;
}

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
  placing,
  onPlacing,
  onPlace,
  onFurniture,
  onMachine,
  playing,
  beans,
  gains,
  asleep,
  visitors = false,
}: {
  model: CafeModel;
  clock: number;
  alert?: SceneAlert;
  /** desks whose agent looks stuck: a few words for its name plate and the whole story for its card */
  warns?: Map<number, SceneWarn>;
  /** per desk: the guess of the time its job has left, for the agent card */
  etas?: (Eta | null)[];
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
  onLook?: (agent: AgentDef, pick: LookPick | null) => void;
  dress?: Dressing;
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
  /** what the latest work earned, floating up from the sack */
  gains?: Gain[];
  /** the whole café has been quiet for an hour: only then does the night close it */
  asleep?: boolean;
  /** now and then a rare visitor walks in and sits at the last stool for a few minutes */
  visitors?: boolean;
}) {
  const ui = useUi();
  const [sel, setSel] = useState<string | null>(null);
  /** the picture's width on screen, 0 until it has been measured */
  const [wide, setWide] = useState(0);
  /** the plates' typeface, read once the page has it, for measuring them */
  const [family, setFamily] = useState<string | null>(null);
  /** bumped when a web font arrives, so the plates are measured again in the real typeface */
  const [fontsIn, setFontsIn] = useState(0);
  const roomRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLSpanElement>(null);
  const cat2Ref = useRef<HTMLSpanElement>(null);
  const clockRef = useRef(clock);
  const alertRef = useRef(alert);
  const decorRef = useRef(decor);
  const looks = interior.looks;
  const worn = dress?.worn;
  const sign = owns(interior, "neon") ? interior.sign : undefined;
  const hasCat2 = owns(interior, "cat2");
  const cat2Name = hasCat2 ? interior.cat2Name : undefined;
  const title = name ?? interior.title ?? BRAND;
  const namesRef = useRef({ cat: catName, cat2: cat2Name, sign, title });
  const seats = useMemo(() => seatGuests(guests ?? [], ui), [guests, ui]);
  const seatsRef = useRef<GuestSeat[]>(seats);
  const agents = model.agents;
  const lay = useMemo(() => cafeLayout(agents.length, model.seed), [agents.length, model.seed]);
  const dog = interior.pet === "dog";
  const halloween = useHalloween().on;
  const cat = useMemo(
    () => (dog ? new Cat(lay, model.seed, DOG, "dog") : new Cat(lay, model.seed, halloween ? BLACK_CAT : undefined)),
    [dog, lay, model.seed, halloween],
  );
  const cat2 = useMemo(() => (hasCat2 ? new Cat(lay, model.seed + 101, CAT2) : null), [hasCat2, lay, model.seed]);
  const goldCat = useMemo(() => new Cat(lay, 777, GOLD_COAT), [lay]);
  const visitorsRef = useRef(visitors);
  const tl = useMemo(() => buildTimeline(model), [model]);
  const phase = usePhase();
  const th = useMemo(() => themeAt(halloween ? HALLOWEEN : theme, phase), [theme, phase, halloween]);
  const views = agents.map((_, i) => agentView(model, tl, lay, i, clock));
  const working = views.some((v) => v.screen === "work" || v.walker);
  const closed = !!asleep && phase === "night" && alert?.kind !== "ask" && !working;
  const late = phase === "night" && working;
  const sub = closed ? CLOSED_TEXT[ui] : (sign ?? (late ? LATE_TEXT : SIGN_TEXT)[ui]);
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
    visitorsRef.current = visitors;
    seatsRef.current = seats;
    shownRef.current = shown;
  }, [clock, alert, decor, catName, cat2Name, sign, title, seats, shown, closed, visitors]);

  useEffect(() => {
    if (placing) return;
    ghostRef.current = null;
    if (dragRef.current?.on) dragRef.current = null;
  }, [placing]);

  useEffect(() => sceneMounted(), []);

  useEffect(() => {
    const read = () => {
      widths.clear();
      setFamily(getComputedStyle(document.body).getPropertyValue("--sans").trim() || "sans-serif");
      setFontsIn((n) => n + 1);
    };
    read();
    document.fonts?.addEventListener("loadingdone", read);
    return () => document.fonts?.removeEventListener("loadingdone", read);
  }, []);

  useEffect(() => {
    const el = roomRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWide(Math.round(e.contentRect.width)));
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
    const props = agents.map((a) => lookOf(looks, a)?.prop);
    const named = agents.map((a) => ({ ...a, name: agentName(a, lookOf(looks, a)) }));
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
      const wall = Date.now();
      const visit = visitorsRef.current && !closedRef.current ? visitAt(wall) : null;
      const stool = visit ? visitorSeat(seatsRef.current.length) : null;
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
        visitor: visit && stool ? visitorFrame(lay, visit, stool, wall) : null,
        visitorCat: goldCat,
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
        const watermark = `agent lounge · ${PROJECT_URL}`;
        const alert = alertRef.current;
        clipFrame(canvas, { lay, agents: named, bubbles, alert, cats, sign: n.sign, title: n.title, watermark });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [model, agents, lay, tl, cat, cat2, goldCat, th, looks, worn]);

  const nameOf = (i: number) => agentName(agents[i], lookOf(looks, agents[i]));
  const asking = alert?.kind === "ask" && lay.desks[alert.agent] ? alert.agent : -1;
  const narrow = wide > 0 && wide < NARROW_PX;
  /** screen pixels to a room pixel */
  const scale = wide / lay.width;
  /** what each plate says under the name, and in which colour */
  const tags = agents.map((_, i) => {
    const st = seatStatus(model, views[i], i, clock, alert);
    const warn = st === "wait" ? undefined : warns?.get(i);
    return { warn, color: warn ? WARN_COLOR : STATUS_COLOR[st], state: warn ? `! ${warn.short}` : STATUS_TEXT[st][ui] };
  });
  /** everyone's head and monitor, which no plate may cover */
  const heads = lay.desks.map((d) => seatBox(d.x, d.top));
  const planKey = `${fontsIn}|${wide}|${lay.width}|${family}`;
  /** the plates kept clear of each other, of heads and of monitors; numbers only on a phone, or when even that fails */
  const plan = (() => {
    if (narrow || !wide || !family) return undefined;
    const usual = Object.values(STATUS_TEXT).map((t) => t[ui]);
    const list: PlateIn[] = agents.map((a, i) => {
      const d = lay.desks[i];
      return { key: a.id, x: d.x, top: d.top, row: d.row, name: nameOf(i), state: tags[i].state, states: usual };
    });
    return cached(`plan|${planKey}|${JSON.stringify(list)}`, () =>
      placePlates(list, scale, lay.width, heads, family, measureText),
    );
  })();
  /** the question card beside the asking agent or over its monitor; null when it has to go under the picture */
  const askSpot = (() => {
    if (!plan || !family || asking < 0 || !alert) return null;
    const d = lay.desks[asking];
    const ask = { key: agents[asking].id, x: d.x, top: d.top, title: `${nameOf(asking)} ${ASKS[ui]}`, text: alert.text };
    return cached(`ask|${planKey}|${JSON.stringify([ask, [...plan.spots]])}`, () =>
      placeAsk(ask, plan, scale, lay.width, lay.height, heads, family, measureText),
    );
  })();
  /** the asking agent's plate gives its place to a question card that sits over the monitor */
  const noPlate = askSpot?.where === "above" ? asking : -1;
  const spots = agents.map((a, i) => (i === noPlate ? undefined : plan?.spots.get(a.id)));
  // the question card already says what the asking agent wants
  const said = agents
    .map((_, i) => bubbleFor(model, tl, lay, i, views[i], clock))
    .filter((b): b is Bubble => b != null && !(b.seated && askSpot && b.agent === asking));
  /**
   * agents speaking from a plate too close to the top wall to fit their speech over it: the speech takes the plate's
   * place, as it took the old name's
   */
  const cramped = new Set(
    said.filter((b) => b.seated && (spots[b.agent]?.t ?? Infinity) < bubbleRoom(wide)).map((b) => b.agent),
  );
  /** each agent's plate on screen, in screen pixels from the room's top left; none until the plates are down */
  const plates = spots.map((b, i) => (cramped.has(i) ? undefined : b));
  const badges = narrow || plan === null;
  const flatAsk = asking >= 0 && (badges || (plan !== undefined && !askSpot));
  const pointAt = (e: MouseEvent | PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * lay.width, y: ((e.clientY - r.top) / r.height) * lay.height };
  };
  const hitAt = (p: Point): Hit | null => {
    // a plate lies over whoever walks behind it, and is its agent to click
    const x = p.x * scale;
    const y = p.y * scale;
    for (let i = 0; i < plates.length; i++) {
      const b = plates[i];
      if (b && x >= b.l && x < b.r && y >= b.t && y < b.b) return { kind: "agent", agent: i };
    }
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
  /** someone in front of a piece takes the click; a window or the board behind it doesn't */
  const blocked = (p: Point) => {
    const h = hitAt(p);
    return h?.kind === "agent" || h?.kind === "cat";
  };
  const pieceAt = (p: Point) => (onFurniture && !blocked(p) ? standingAt(shown, p) : null);
  const machineAt = (p: Point) => {
    const s = onMachine && !blocked(p) ? standingAt(shown, p) : null;
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
      el.title = (m.item === "arcade" ? ARCADE_HINT : JUKE_HINT)[onPlacing ? 1 : 0][ui];
      return;
    }
    if (pieceAt(p)) {
      el.style.cursor = onPlacing ? "grab" : "pointer";
      el.title = PIECE_HINT[ui];
      return;
    }
    const c2 = !h && cat2 && onCat(cat2.pos, p);
    el.style.cursor = h || c2 ? "pointer" : "";
    const hint = !h ? "" : h.kind === "agent" ? `${nameOf(h.agent)}: ${HIT_HINT.agent[ui]}` : HIT_HINT[h.kind][ui];
    el.title = c2 ? HIT_HINT.cat[ui] : h?.kind === "cat" && dog ? DOG_HINT[ui] : hint;
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
  /** the top of an agent's plate in the room's own pixels, once the plates are down */
  const plateTop = (i: number) => {
    const b = plates[i];
    return b ? b.t / scale : undefined;
  };
  // everyone at a desk speaks from over their plate
  const bubbles = said.map((b) => (b.seated ? { ...b, y: (plateTop(b.agent) ?? b.y + 2) - 2 } : b));
  const door = doorOf(lay);
  const talking = new Set(bubbles.filter((b) => b.seated).map((b) => b.agent));
  const reactAt = (i: number) => {
    const w = agentView(model, tl, lay, i, clock).walker;
    return w ? { x: w.x, y: w.y - 24 } : { x: lay.desks[i].x, y: (plateTop(i) ?? lay.desks[i].top - 4) - 2 };
  };
  /** a plate's place and size from the plan; until the room has been measured the CSS puts it over the monitor */
  const placed = (i: number): CSSProperties | null => {
    const b = plates[i];
    if (!plan || !b) return null;
    return {
      left: `${(b.l / wide) * 100}%`,
      top: `${(b.t / (lay.height * scale)) * 100}%`,
      width: b.r - b.l,
      "--pf": `${plan.font}px`,
      "--sf": `${plan.small}px`,
    } as CSSProperties;
  };

  return (
    <div className="cafe-wrap" style={{ "--ar": lay.width / lay.height } as CSSProperties}>
      <div className="cafe-room">
        <div className="arcade cafe" ref={roomRef} style={{ "--k": 384 / lay.width } as CSSProperties}>
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
            aria-label={sceneLabel(ui, dog)}
          />
          <div className="cafe-overlay" aria-hidden>
            <div className={`cafe-neon ${closed ? "off" : ""}`} style={pos(SIGN.x + SIGN.w / 2, SIGN.y + SIGN.h / 2)}>
              <span className="cafe-neon-main" style={{ "--fit": titleFit(title) } as CSSProperties}>
                {title}
              </span>
              <span className="cafe-neon-sub">{sub}</span>
            </div>
            {closed && (
              <span className="cafe-closed" style={pos(door.x + door.w / 2, door.y - 3)}>
                {tr(ui, "зачинено", "closed")}
              </span>
            )}
            <span className={`cafe-meter ${rate > 0 ? "on" : ""}`} style={pos(METER.x + METER.w / 2, METER.y + METER.h / 2)}>
              {`${rate > 0 ? fmtTokens(rate, ui) : "0"} ${tr(ui, "ток/хв", "tok/min")}`}
            </span>
            {agents.map((a, i) => {
              const d = lay.desks[i];
              const { warn, color, state } = tags[i];
              if (badges) {
                // on a phone a talking agent's number rides in its speech bubble
                if (talking.has(i)) return null;
                return (
                  <span
                    key={a.id}
                    className={`cafe-badge ${warn ? "warn" : ""}`}
                    style={{ ...pos(d.x, d.top - 2), "--c": color } as CSSProperties}
                  >
                    {i + 1}
                  </span>
                );
              }
              // on a wide screen the speech bubble already says who and what: no name plates under it
              if (!SHOW_PLATES || i === noPlate || cramped.has(i)) return null;
              const spot = placed(i);
              return (
                <span
                  key={a.id}
                  className={`cafe-plate ${spot ? "placed" : ""}`}
                  style={{ ...(spot ?? pos(d.x, d.top - 3)), "--c": color } as CSSProperties}
                >
                  <b>{nameOf(i)}</b>
                  <i>{state}</i>
                </span>
              );
            })}
            <GuestTags seats={seats} more={barOverflow(guests ?? [])} pos={pos} />
            <VisitorTag lay={lay} guests={seats.length} on={visitors && !closed} pos={pos} />
            <ChatTag unread={chatUnread} pos={pos} />
            <BeanSack beans={beans} pos={pos} />
            {beans != null && <BeanGains list={gains} pos={pos} />}
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
              <CafeBubble
                key={b.key}
                b={b}
                name={nameOf(b.agent)}
                color={agents[b.agent].color}
                style={pos(b.x, b.y)}
                warn={alert?.kind === "ask" && alert.agent === b.agent ? undefined : warns?.get(b.agent)}
                n={badges && b.seated ? b.agent + 1 : undefined}
              />
            ))}
          </div>
          {askSpot && plan && (
            <div className="cafe-ui">
              <button
                className={`cafe-ask ${askSpot.where}`}
                style={
                  {
                    left: `${(askSpot.l / wide) * 100}%`,
                    top: `${(askSpot.t / (lay.height * scale)) * 100}%`,
                    width: askSpot.r - askSpot.l,
                    "--pf": `${plan.font}px`,
                    "--lines": askSpot.lines,
                    "--tail": `${askSpot.tail}px`,
                  } as CSSProperties
                }
                onClick={() => setSel(agents[asking].id)}
                title={OPEN_CARD[ui]}
              >
                <b>
                  {nameOf(asking)} {ASKS[ui]}
                </b>
                <span>{alert?.text}</span>
              </button>
            </div>
          )}
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
      {(badges || flatAsk) && (
        <div className="cafe-legend" role="group" aria-label={LEGEND_LABEL[ui]}>
          {badges && (
            <ol>
              {agents.map((a, i) => (
                <li key={a.id}>
                  <button
                    className={tags[i].warn ? "warn" : ""}
                    style={{ "--c": tags[i].color } as CSSProperties}
                    onClick={() => setSel(sel === a.id ? null : a.id)}
                    title={OPEN_CARD[ui]}
                  >
                    <span className="cl-n">{i + 1}</span>
                    <b>{nameOf(i)}</b>
                    <i>— {tags[i].state}</i>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {flatAsk && (
            <button className="cafe-ask-flat" onClick={() => setSel(agents[asking].id)} title={OPEN_CARD[ui]}>
              {badges && <span className="cl-n">{asking + 1}</span>}
              <span>
                <b>{nameOf(asking)}:</b> {alert?.text}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Screen pixels a speech bubble needs over its anchor in a room this wide to show its name row and a line or two of
 * text, tail included, after the CSS in globals.css (.cafe-bubble).
 */
function bubbleRoom(wide: number): number {
  const font = Math.min(15, Math.max(9, wide * 0.012));
  return font * 5 + 6;
}

let measurer: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();
/** How wide a line of text is in this font, for keeping the plates apart. */
function measureText(text: string, font: string): number {
  const key = `${font}|${text}`;
  const known = widths.get(key);
  if (known != null) return known;
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return text.length * 10;
  measurer.font = font;
  const w = measurer.measureText(text).width;
  if (widths.size > 2000) widths.clear();
  widths.set(key, w);
  return w;
}

const plans = new Map<string, unknown>();
/** The scene draws many times a second and its plates seldom change: the last few layouts are kept by what went in. */
function cached<T>(key: string, make: () => T): T {
  if (plans.has(key)) return plans.get(key) as T;
  const made = make();
  if (plans.size > 24) plans.clear();
  plans.set(key, made);
  return made;
}
