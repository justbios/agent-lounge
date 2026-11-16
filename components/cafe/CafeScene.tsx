"use client";

import {
  CSSProperties,
  MouseEvent,
  PointerEvent,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PROJECT_URL } from "@/lib/brand";
import { useSceneView } from "@/lib/cafe/sceneView";
import { CafeLayout, cafeLayout } from "@/lib/cafe/layout";
import { Two, Ui, tr, useUi } from "@/lib/i18n";
import { CafeModel } from "@/lib/cafe/model";
import {
  Bubble,
  agentView,
  bubbleFor,
  buildTimeline,
} from "@/lib/cafe/timeline";
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
import { buildRoom } from "./hall";
import { doorOf, fixturesOf } from "./room";
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
import {
  BeanGains,
  BeanSack,
  ChatTag,
  GuestTags,
  JukeTag,
  ReactionLayer,
  SeatReaction,
} from "./SceneSocial";
import { HALLOWEEN, THEMES, Theme } from "./theme";
import { GOLD_COAT, visitorFrame, visitorSeat } from "./visitor";
import VisitorTag from "./VisitorTag";
import StreetScene from "./StreetScene";
import { fmtTokens } from "../live/tokens";
import type { Gain } from "@/lib/live/useBeanGains";
import { useHalloween } from "@/lib/live/season";

export type {
  Anchor,
  FixturePick,
  Placing,
  SceneAlert,
  SceneWarn,
} from "./sceneParts";

const NO_DECOR: DecorSet = new Set();
const SIGN_TEXT: Two = { uk: "інтернет-кафе", en: "internet café" };
const LATE_TEXT: Two = { uk: "нічна зміна", en: "night shift" };
const CLOSED_TEXT: Two = { uk: "зачинено до ранку", en: "closed till morning" };
const MACHINES: ItemId[] = ["jukebox", "arcade"];
/** Below this width the name plates turn into numbers, with the names in a list under the picture. */
const NARROW_PX = 560;
const STATUS_TEXT: Record<Status, Two> = {
  work: { uk: "працює", en: "working" },
  wait: { uk: "питає тебе", en: "is asking you" },
  done: { uk: "готово", en: "done" },
  idle: { uk: "відпочиває", en: "resting" },
};
const ASKS: Two = { uk: "питає тебе", en: "is asking you" };
/** the plate's words in a resting agent's colour, lighter than the seat's light so they read on the dark plate */
const PLATE_IDLE = "#b3a6cf";
const FREE_TEXT: Two = { uk: "вільні місця", en: "free seats" };
const LEGEND_LABEL: Two = { uk: "агенти в залі", en: "agents in the room" };
const freeSeats = (n: number, ui: Ui) =>
  ui === "en"
    ? `+${n} free seat${n === 1 ? "" : "s"}`
    : `+${n} ${n === 1 ? "вільне місце" : "вільні місця"}`;
/** the hint for anyone, then for the owner, who may also drag the machine */
const JUKE_HINT: Two[] = [
  { uk: "музичний автомат: вибрати мелодію", en: "jukebox: pick a tune" },
  {
    uk: "клацни, щоб вибрати мелодію, або перетягни",
    en: "click to pick a tune, or drag it",
  },
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

/** What the café scene shows, either way it is looked at. */
export interface CafeSceneProps {
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
}

/** The café: from the street by default, or the room inside; placing furniture always happens inside. */
export default function CafeScene(props: CafeSceneProps) {
  const [view] = useSceneView();
  return view === "street" && !props.placing ? (
    <StreetScene {...props} />
  ) : (
    <HallScene {...props} />
  );
}

function HallScene({
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
}: CafeSceneProps) {
  const ui = useUi();
  const [sel, setSel] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [wide, setWide] = useState(0);
  /** the plates overlap at this size: numbers and a legend instead, until the size or the names change */
  const [crowded, setCrowded] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
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
  const brand = title.trim().toUpperCase() === BRAND;
  const namesRef = useRef({ cat: catName, cat2: cat2Name, sign, title });
  const agents = model.agents;
  const lay = useMemo(
    () => cafeLayout(agents.length, model.seed),
    [agents.length, model.seed],
  );
  const seats = useMemo(
    () => seatGuests(guests ?? [], ui, lay.width, lay.front),
    [guests, ui, lay],
  );
  const seatsRef = useRef<GuestSeat[]>(seats);
  const dog = interior.pet === "dog";
  const halloween = useHalloween().on;
  const cat = useMemo(
    () =>
      dog
        ? new Cat(lay, model.seed, DOG, "dog")
        : new Cat(lay, model.seed, halloween ? BLACK_CAT : undefined),
    [dog, lay, model.seed, halloween],
  );
  const cat2 = useMemo(
    () => (hasCat2 ? new Cat(lay, model.seed + 101, CAT2) : null),
    [hasCat2, lay, model.seed],
  );
  const goldCat = useMemo(() => new Cat(lay, 777, GOLD_COAT), [lay]);
  const visitorsRef = useRef(visitors);
  const tl = useMemo(() => buildTimeline(model), [model]);
  const phase = usePhase();
  const th = useMemo(
    () => themeAt(halloween ? HALLOWEEN : theme, phase),
    [theme, phase, halloween],
  );
  const views = agents.map((_, i) => agentView(model, tl, lay, i, clock));
  const working = views.some((v) => v.screen === "work" || v.walker);
  const closed =
    !!asleep && phase === "night" && alert?.kind !== "ask" && !working;
  const late = phase === "night" && working;
  const sub = closed
    ? CLOSED_TEXT[ui]
    : (sign ?? (late ? LATE_TEXT : SIGN_TEXT)[ui]);
  const closedRef = useRef(closed);
  const stand = useMemo(
    () => standing(lay, interior.placed, decor ?? NO_DECOR),
    [lay, interior.placed, decor],
  );
  const shown = useMemo(
    () => (placing ? stand.filter((s) => s.pid !== placing.pid) : stand),
    [stand, placing],
  );
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
  }, [
    clock,
    alert,
    decor,
    catName,
    cat2Name,
    sign,
    title,
    seats,
    shown,
    closed,
    visitors,
  ]);

  useEffect(() => {
    if (placing) return;
    ghostRef.current = null;
    if (dragRef.current?.on) dragRef.current = null;
  }, [placing]);

  useEffect(() => sceneMounted(), []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      setNarrow(e.contentRect.width < NARROW_PX);
      setWide(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const faces = agents.map((a, i) => ({
      ...lookFor(
        a.look ?? i,
        a.color,
        pickedLook(lookOf(looks, a), a.look ?? i),
      ),
      costume: worn?.[i] ?? null,
    }));
    const props = agents.map((a) => lookOf(looks, a)?.prop);
    const named = agents.map((a) => ({
      ...a,
      name: agentName(a, lookOf(looks, a)),
    }));
    const room = buildRoom(lay, agents, model.seed, th, props, brand);
    const sofa = fixturesOf(lay).SOFA;
    const cushion = { x: sofa.x + 43, y: sofa.y + 13 };
    const pin = (el: HTMLElement | null, p: Point) => {
      if (!el) return;
      el.style.left = `${(p.x / lay.width) * 100}%`;
      el.style.top = `${((p.y - 13) / lay.height) * 100}%`;
    };
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const clock = clockRef.current;
      const busy = agents
        .map((_, i) => i)
        .filter((i) => agentView(model, tl, lay, i, clock).screen === "work");
      const dt = last ? Math.min(100, now - last) : 0;
      const beds = [
        ...shownRef.current
          .filter((s) => s.item === "catbed")
          .map((s) => ({ x: s.cx, y: s.bottom })),
        cushion,
      ];
      const freeOf = (other: Cat | null) =>
        beds.filter((b) => b.x !== other?.bed?.x || b.y !== other.bed.y);
      cat.step(dt, now, busy, freeOf(cat2));
      cat2?.step(dt, now, busy, freeOf(cat));
      last = now;
      const wall = Date.now();
      const visit =
        visitorsRef.current && !closedRef.current ? visitAt(wall) : null;
      const stool = visit ? visitorSeat(seatsRef.current.length, lay) : null;
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
          .map((_, i) =>
            bubbleFor(
              model,
              tl,
              lay,
              i,
              agentView(model, tl, lay, i, clock),
              clock,
            ),
          )
          .filter((b): b is Bubble => b != null)
          .map((b) => seatedAt(lay, b));
        const cats = [
          ...(n.cat ? [{ ...cat.pos, name: n.cat }] : []),
          ...(cat2 && n.cat2 ? [{ ...cat2.pos, name: n.cat2 }] : []),
        ];
        const watermark = `agent lounge · ${PROJECT_URL}`;
        const alert = alertRef.current;
        clipFrame(canvas, {
          lay,
          agents: named,
          bubbles,
          alert,
          cats,
          sign: n.sign,
          title: n.title,
          watermark,
          noSign: brand,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [model, agents, lay, tl, cat, cat2, goldCat, th, looks, worn, brand]);

  const nameOf = (i: number) => agentName(agents[i], lookOf(looks, agents[i]));
  const pointAt = (e: MouseEvent | PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * lay.width,
      y: ((e.clientY - r.top) / r.height) * lay.height,
    };
  };
  const hitAt = (p: Point): Hit | null => {
    const at = agents.map((_, i) =>
      agentView(model, tl, lay, i, clockRef.current),
    );
    return hitTest(lay, at, cat.pos, p, beans != null);
  };
  const ghostAt = (pl: Placing, p: Point): Ghost | null => {
    const it = itemOf(pl.item);
    if (!it) return null;
    const s = spotAt(
      lay,
      it,
      p,
      stand.filter((q) => q.pid !== pl.pid),
    );
    const base = { item: it.id, w: it.w, h: it.h };
    return s
      ? { ...base, ...s, ok: true }
      : { ...base, cx: p.x, bottom: p.y + it.h / 2, ok: false };
  };
  /** someone in front of a piece takes the click; a window or the board behind it doesn't */
  const blocked = (p: Point) => {
    const h = hitAt(p);
    return h?.kind === "agent" || h?.kind === "cat";
  };
  const pieceAt = (p: Point) =>
    onFurniture && !blocked(p) ? standingAt(shown, p) : null;
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
    if (
      d &&
      !d.on &&
      e.buttons & 1 &&
      Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3
    ) {
      d.on = true;
      el.setPointerCapture(e.pointerId);
      onPlacing?.({ item: d.s.item, pid: d.s.pid });
    }
    const pl = placing ?? (d?.on ? d.s : null);
    const p = pointAt(e);
    if (pl) {
      ghostRef.current = ghostAt(pl, p);
      el.style.cursor = ghostRef.current?.ok
        ? d?.on
          ? "grabbing"
          : "copy"
        : "not-allowed";
      el.title = "";
      return;
    }
    const h = hitAt(p);
    const m = machineAt(p);
    if (m) {
      el.style.cursor = "pointer";
      el.title = (m.item === "arcade" ? ARCADE_HINT : JUKE_HINT)[
        onPlacing ? 1 : 0
      ][ui];
      return;
    }
    if (pieceAt(p)) {
      el.style.cursor = onPlacing ? "grab" : "pointer";
      el.title = PIECE_HINT[ui];
      return;
    }
    const c2 = !h && cat2 && onCat(cat2.pos, p);
    el.style.cursor = h || c2 ? "pointer" : "";
    const hint = !h
      ? ""
      : h.kind === "agent"
        ? `${nameOf(h.agent)}: ${HIT_HINT.agent[ui]}`
        : HIT_HINT[h.kind][ui];
    el.title = c2
      ? HIT_HINT.cat[ui]
      : h?.kind === "cat" && dog
        ? DOG_HINT[ui]
        : hint;
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
      onMachine!(
        { pid: m.pid, item: m.item },
        anchorAt(lay, m.cx, m.bottom - m.h, m.bottom),
      );
      return;
    }
    const f = pieceAt(p);
    if (f) {
      onFurniture!(
        { pid: f.pid, item: f.item },
        anchorAt(lay, f.cx, f.bottom - f.h, f.bottom),
      );
      return;
    }
    if (h?.kind === "cat" || (!h && cat2 && onCat(cat2.pos, p))) {
      (h ? cat : cat2!).pet(performance.now());
      onPick?.(null);
      return;
    }
    onPick?.(
      h ? { kind: h.kind, anchor: fixtureAnchor(lay, h.kind, p) } : null,
    );
  };
  const selIdx = sel == null ? -1 : agents.findIndex((a) => a.id === sel);

  const { SIGN, METER } = fixturesOf(lay);
  /** where a seat's plate sits: over the head in the far row, under the chair in the near one */
  const plateAt = (i: number) => {
    const d = lay.desks[i];
    const D = lay.pods[d.pod]?.d ?? d.top + 12;
    return d.face === "front"
      ? { x: d.x, y: D - 14, far: true, side: d.side }
      : { x: d.x + (d.side ? -6 : 6), y: D + 42, far: false, side: d.side };
  };
  /** the free seats of a pod that is not full, under its middle */
  const freeAt = (p: CafeLayout["pods"][number]) => ({
    x: p.used <= 2 ? p.x + 35 : p.x + 55,
    y: p.d + 42,
  });
  /** on a phone, and wherever the plates would run into each other, numbers with a legend under the room */
  const plateKey = `${wide}|${agents.map((_, i) => nameOf(i)).join("|")}`;
  const badges = narrow || crowded === plateKey;
  useLayoutEffect(() => {
    if (badges || !overlayRef.current) return;
    const boxes = [...overlayRef.current.querySelectorAll(".hall-plate")].map((el) => el.getBoundingClientRect());
    const hit = boxes.some((a, k) =>
      boxes.some((b, j) => j > k && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom),
    );
    if (hit) setCrowded(plateKey);
  }, [badges, plateKey, clock, alert, warns]);
  const tagFor = (i: number) => {
    const st = seatStatus(model, views[i], i, clock, alert);
    const warn = st === "wait" ? undefined : warns?.get(i);
    const color = warn ? "#ff7a5c" : st === "idle" ? PLATE_IDLE : STATUS_COLOR[st];
    return { st, warn, color };
  };
  const pos = (x: number, y: number): CSSProperties => ({
    left: `${(x / lay.width) * 100}%`,
    top: `${(y / lay.height) * 100}%`,
  });
  const asking = alert?.kind === "ask" ? alert.agent : -1;
  /** the question card already says what the asking agent wants: no speech bubble under it */
  const bubbles = agents
    .map((_, i) => bubbleFor(model, tl, lay, i, views[i], clock))
    .filter(
      (b): b is Bubble =>
        b != null && !(b.seated && !narrow && b.agent === asking),
    )
    .map((b) => seatedAt(lay, b));
  const door = doorOf(lay);
  /** a far-row talker's bubble sits where its plate would be */
  const talking = new Set(
    bubbles
      .filter((b) => b.seated && lay.desks[b.agent].face === "front")
      .map((b) => b.agent),
  );
  const reactAt = (i: number) => {
    const w = agentView(model, tl, lay, i, clock).walker;
    return w
      ? { x: w.x, y: w.y - 24 }
      : { x: lay.desks[i].x, y: lay.desks[i].top - 6 };
  };

  return (
    <div
      className="cafe-wrap hall-wrap"
      ref={wrapRef}
      style={{ "--ar": lay.width / lay.height } as CSSProperties}
    >
      <div
        className="arcade cafe"
        style={{ "--k": 384 / lay.width } as CSSProperties}
      >
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
        <div className="cafe-overlay" aria-hidden ref={overlayRef}>
          {brand ? (
            <span
              className={`hall-sub ${closed ? "off" : ""}`}
              style={pos(SIGN.x + SIGN.w / 2, SIGN.y + SIGN.h + 3)}
            >
              {sub}
            </span>
          ) : (
            <div
              className={`cafe-neon ${closed ? "off" : ""}`}
              style={pos(SIGN.x + SIGN.w / 2, SIGN.y + SIGN.h / 2)}
            >
              <span
                className="cafe-neon-main"
                style={{ "--fit": titleFit(title) } as CSSProperties}
              >
                {title}
              </span>
              <span className="cafe-neon-sub">{sub}</span>
            </div>
          )}
          {closed && (
            <span
              className="cafe-closed"
              style={pos(door.x + door.w / 2, door.y - 3)}
            >
              {tr(ui, "зачинено", "closed")}
            </span>
          )}
          <span
            className={`cafe-meter ${rate > 0 ? "on" : ""}`}
            style={pos(METER.x + METER.w / 2, METER.y + METER.h / 2)}
          >
            {`${rate > 0 ? fmtTokens(rate, ui) : "0"} ${tr(ui, "ток/хв", "tok/min")}`}
          </span>
          {agents.map((a, i) => {
            if (!lay.desks[i]) return null;
            const { st, warn, color } = tagFor(i);
            if (badges) {
              const d = lay.desks[i];
              const D = lay.pods[d.pod]?.d ?? d.top + 12;
              const far = d.face === "front";
              return (
                <span
                  key={a.id}
                  className={`hall-badge ${far ? "far" : "near"} ${warn ? "warn" : ""}`}
                  style={{ ...pos(d.x, far ? D - 13 : D + 40), "--c": color } as CSSProperties}
                >
                  {i + 1}
                </span>
              );
            }
            if (talking.has(i)) return null;
            const at = plateAt(i);
            const where = at.far ? "far" : `near s${at.side}`;
            return (
              <span
                key={a.id}
                className={`hall-plate ${where} st-${st} ${warn ? "warn" : ""}`}
                style={{ ...pos(at.x, at.y), "--c": color } as CSSProperties}
              >
                <b>{nameOf(i)}</b>
                <i>{warn ? `! ${warn.short}` : STATUS_TEXT[st][ui]}</i>
              </span>
            );
          })}
          {lay.pods.map((p, k) => {
            if (p.used >= 4) return null;
            const at = freeAt(p);
            return badges ? (
              <span
                key={`free${k}`}
                className="hall-badge near free"
                style={pos(at.x, p.d + 40)}
              >
                +{4 - p.used}
              </span>
            ) : (
              <span key={`free${k}`} className="hall-plate free" style={pos(at.x, at.y)}>
                <b>{freeSeats(4 - p.used, ui)}</b>
              </span>
            );
          })}
          <GuestTags seats={seats} more={barOverflow(guests ?? [])} pos={pos} />
          <VisitorTag
            lay={lay}
            guests={seats.length}
            on={visitors && !closed}
            pos={pos}
          />
          <ChatTag unread={chatUnread} pos={pos} />
          <BeanSack beans={beans} pos={pos} />
          {beans != null && <BeanGains list={gains} pos={pos} />}
          <JukeTag
            playing={playing}
            at={shown.find((s) => s.item === "jukebox")}
            pos={pos}
          />
          {reactions && (
            <ReactionLayer list={reactions} anchor={reactAt} pos={pos} />
          )}
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
              warn={
                alert?.kind === "ask" && alert.agent === b.agent
                  ? undefined
                  : warns?.get(b.agent)
              }
            />
          ))}
        </div>
        {asking >= 0 && !narrow && lay.desks[asking] && (
          <div className="street-ui">
            <button
              className={`room-ask ${askSide(lay, asking)}`}
              style={askStyle(lay, asking)}
              onClick={() => setSel(agents[asking].id)}
              title={tr(ui, "відкрити картку агента", "open the agent's card")}
            >
              <b>
                {nameOf(asking)} {ASKS[ui]}
              </b>
              <span>{alert?.text}</span>
            </button>
          </div>
        )}
      </div>
      {(badges || (narrow && asking >= 0)) && (
        <div className="hall-legend" aria-label={LEGEND_LABEL[ui]}>
          {badges && (
            <ol>
              {agents.map((a, i) => {
                const { st, warn, color } = tagFor(i);
                return (
                  <li key={a.id}>
                    <button
                      className={warn ? "warn" : ""}
                      style={{ "--c": color } as CSSProperties}
                      onClick={() => setSel(sel === a.id ? null : a.id)}
                    >
                      <span className="hl-n">{i + 1}</span>
                      <b>{nameOf(i)}</b>
                      <i>— {warn ? `! ${warn.short}` : STATUS_TEXT[st][ui]}</i>
                    </button>
                  </li>
                );
              })}
              {(() => {
                const free = lay.pods.reduce((n, p) => n + 4 - p.used, 0);
                return free > 0 ? (
                  <li className="free">
                    <span className="hl-n">+{free}</span>
                    <b>{FREE_TEXT[ui]}</b>
                  </li>
                ) : null;
              })()}
            </ol>
          )}
          {asking >= 0 && (
            <button className="hall-ask-flat" onClick={() => setSel(agents[asking].id)}>
              {badges && <span className="hl-n">{asking + 1}</span>}
              <span>
                <b>{nameOf(asking)}:</b> {alert?.text}
              </span>
            </button>
          )}
        </div>
      )}
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
              asking={
                alert?.kind === "ask" && alert.agent === selIdx
                  ? alert.text
                  : undefined
              }
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

/** A seated agent's speech sits over the head in the far row and over the monitor in the near one. */
function seatedAt(lay: CafeLayout, b: Bubble): Bubble {
  if (!b.seated) return b;
  const d = lay.desks[b.agent];
  const D = d && lay.pods[d.pod]?.d;
  return D == null ? b : { ...b, y: d.face === "front" ? D - 25 : D + 16 };
}

/** The question card beside the asking agent's pod, on the side with more room, its tail pointing at the agent. */
function askSide(lay: CafeLayout, agent: number): "left" | "right" {
  const p = lay.pods[lay.desks[agent].pod];
  return p.x + 35 < lay.width / 2 ? "left" : "right";
}

function askStyle(lay: CafeLayout, agent: number): CSSProperties {
  const W = lay.width;
  const d = lay.desks[agent];
  const p = lay.pods[d.pod];
  const tailY = d.face === "front" ? p.d + 2 : p.d + 24;
  const top = `${((tailY - 5) / lay.height) * 100}%`;
  if (askSide(lay, agent) === "left") {
    const edge = p.x - 15;
    return {
      right: `${(1 - edge / W) * 100}%`,
      top,
      "--room": `${((edge - 4) / W) * 100}cqw`,
    } as CSSProperties;
  }
  const edge = p.x + 85;
  return {
    left: `${(edge / W) * 100}%`,
    top,
    "--room": `${((W - edge - 4) / W) * 100}cqw`,
  } as CSSProperties;
}
