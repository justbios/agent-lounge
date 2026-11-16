import { CafeLayout, Dir, GIVE_MS, SIT_MS, STAND_MS, WALK_PX_PER_MS, pathLength, pointAt, rng } from "@/lib/cafe/layout";
import { CafeModel, Trip } from "@/lib/cafe/model";
import { AgentView, CafeTimeline, Walker, agentView } from "@/lib/cafe/timeline";
import { Point } from "@/lib/layout";
import { Visit } from "@/lib/live/visitors";
import { Cat } from "../cat";
import { VisitorFrame } from "../visitor";
import { SeatState } from "./seat";
import { StreetLayout, floorY } from "./geom";

/** Where a hand-off walks behind the glass: along the window's floor, behind the wall to another window or floor. */
export function streetPath(lay: StreetLayout, from: number, to: number): Point[] {
  const a = lay.seats[from];
  const b = lay.seats[to];
  if (!a || !b) return [{ x: 0, y: 0 }];
  const ya = floorY(a);
  const yb = floorY(b);
  const right = b.px > a.px || (b.px === a.px && to > from);
  const start = { x: a.px + 8, y: ya };
  const end = { x: right ? b.px + 2 : b.px + 37, y: yb };
  if (ya === yb) return [start, end];
  const cross = lay.door.x + 16;
  return [start, { x: cross, y: ya }, { x: cross, y: yb }, end];
}

function currentTrip(trips: Trip[], clock: number): Trip | null {
  for (const tr of trips) {
    if (tr.start > clock) return null;
    if (clock < tr.home) return tr;
  }
  return null;
}

/** The trip's walker as the timeline has it, moved onto the street's path: same timing, other ground. */
function walkerOn(tr: Trip, lay: StreetLayout, clock: number): Walker {
  const target = tr.to;
  const path = streetPath(lay, tr.from, tr.to);
  const len = pathLength(path);
  const t = clock - tr.start;
  const stand = STAND_MS / tr.pace;
  const giveMs = GIVE_MS / tr.pace;
  if (clock < tr.arrive) {
    const walkMs = Math.max(1, tr.arrive - tr.start - stand - giveMs);
    if (t < stand) return { ...pointAt(path, 0), moving: false, carrying: true, settle: 1 - t / stand, give: -1, target };
    if (t < stand + walkMs) {
      return { ...pointAt(path, ((t - stand) / walkMs) * len), moving: true, carrying: true, settle: 0, give: -1, target };
    }
    const end = path[path.length - 1];
    const seat = lay.seats[target];
    const dir: Dir = seat && seat.px + 20 > end.x ? "right" : "left";
    return { x: end.x, y: end.y, dir, moving: false, carrying: false, settle: 0, give: Math.min(1, (t - stand - walkMs) / giveMs), target };
  }
  const back = clock - tr.arrive;
  const walkBack = tr.len / (WALK_PX_PER_MS * tr.pace);
  if (back < walkBack) {
    const p = pointAt([...path].reverse(), (back / walkBack) * len);
    return { ...p, moving: true, carrying: false, settle: 0, give: -1, target };
  }
  const settle = Math.min(1, (back - walkBack) / (SIT_MS / tr.pace));
  return { ...path[0], dir: "left", moving: false, carrying: false, settle, give: -1, target };
}

export interface SeatView {
  view: AgentView;
  state: SeatState;
  /** on the street's own path, or null while in the chair */
  walker: Walker | null;
}

/**
 * Each agent's state at `clock`. The timeline keeps its own (hall) layout, so trips last as long whichever way the
 * café is shown; only where the walker is gets worked out again here.
 */
export function seatViews(
  model: CafeModel,
  tl: CafeTimeline,
  hall: CafeLayout,
  lay: StreetLayout,
  clock: number,
  alert?: { agent: number; kind: "ask" | "done" },
): SeatView[] {
  return model.agents.map((_, i) => {
    const view = agentView(model, tl, hall, i, clock);
    const tr = view.walker ? currentTrip(tl.byFrom[i], clock) : null;
    const walker = tr ? walkerOn(tr, lay, clock) : null;
    const asking = alert?.kind === "ask" && alert.agent === i && !walker;
    const state: SeatState = asking
      ? "ask"
      : alert?.kind === "done" && alert.agent === i && view.screen === "idle"
        ? "done"
        : view.screen;
    return { view, state, walker };
  });
}

/** Whether a point is behind one of the shop windows' glass: walkers are only seen there. */
export function behindGlass(lay: StreetLayout, x: number, y: number): boolean {
  return lay.wins.some((w) => x >= w.x && x < w.x + w.w && y > w.y && y <= w.y + w.h + 2);
}

/** The two stools at the counter seen through the door: where guests and a visitor sit. */
export function counterSeats(lay: StreetLayout): Point[] {
  const g = lay.glass;
  return [
    { x: g.x + 5, y: g.y + 31 },
    { x: g.x + 20, y: g.y + 31 },
  ];
}

const CAT_SPEED = 0.018;

/** A visitor in from the right along the pavement, through the door to the counter, and back out at the end. */
export function streetVisitor(lay: StreetLayout, v: Visit, seat: Point | null, now: number): VisitorFrame | null {
  const goldcat = v.kind === "goldcat";
  const sit = goldcat ? { x: lay.door.x + 9, y: lay.walk + 1 } : seat;
  if (!sit) return null;
  const y = lay.walk + 12;
  const doorX = lay.door.x + 16;
  const path = [{ x: lay.width + 12, y }, { x: doorX, y }, { x: doorX, y: lay.walk + 2 }];
  const speed = goldcat ? CAT_SPEED : WALK_PX_PER_MS;
  const walk = pathLength(path) / speed;
  const sat: VisitorFrame = { kind: v.kind, x: sit.x, y: sit.y, dir: "left", walking: false, seat: sit };
  if (now - v.start < walk) return { ...sat, ...pointAt(path, (now - v.start) * speed), walking: true };
  if (v.end - now < walk) return { ...sat, ...pointAt([...path].reverse(), (walk - (v.end - now)) * speed), walking: true };
  return sat;
}

type PetMode = "home" | "hop" | "walk" | "sit" | "back" | "up";

/** The café cat outside: on a windowsill most of the time, now and then down for a stroll along the pavement. */
export class StreetPet {
  private mode: PetMode = "home";
  private until = 0;
  private from: Point;
  private to: Point;
  private x: number;
  private y: number;
  private dir: Dir = "left";
  private started = 0;
  private petUntil = -Infinity;
  private r: () => number;

  constructor(
    readonly cat: Cat,
    private lay: StreetLayout,
    private home: Point,
    seed: number,
    /** a dog keeps to the pavement */
    private ground = false,
  ) {
    this.r = rng(seed * 11 + 5);
    this.x = home.x;
    this.y = home.y;
    this.from = home;
    this.to = home;
    this.until = 6000 + this.r() * 20000;
  }

  get pos(): Point {
    return { x: this.x, y: this.y };
  }

  /** On the sill, so drawn with the shop front rather than on the pavement. */
  get high(): boolean {
    return this.y < this.lay.walk - 2;
  }

  pet(now: number) {
    this.cat.pet(now);
    this.petUntil = now + 3800;
  }

  private street(): number {
    return this.lay.walk + 12;
  }

  step(now: number) {
    if (now < this.petUntil) {
      this.cat.put(this.x, this.y, this.dir === "left" ? "left" : "right", false);
      return;
    }
    if (!this.started) this.started = now;
    const el = now - this.started;
    const go = (mode: PetMode, to: Point, ms: number) => {
      this.mode = mode;
      this.from = { x: this.x, y: this.y };
      this.to = to;
      this.started = now;
      this.until = ms;
    };
    if (el >= this.until) {
      const W = this.lay.width;
      switch (this.mode) {
        case "home":
          if (this.ground) go("walk", { x: 20 + this.r() * (W - 40), y: this.street() }, 0);
          else go("hop", { x: this.home.x + (this.r() < 0.5 ? -8 : 8), y: this.street() }, 520);
          break;
        case "hop":
        case "sit":
          go("walk", { x: Math.round(24 + this.r() * (W - 48)), y: this.street() }, 0);
          break;
        case "walk":
          if (this.r() < 0.55) go("sit", { x: this.x, y: this.y }, 4000 + this.r() * 6000);
          else go("back", { x: this.ground ? this.home.x : this.home.x + 8, y: this.ground ? this.home.y : this.street() }, 0);
          break;
        case "back":
          if (this.ground) go("home", this.home, 15000 + this.r() * 25000);
          else go("up", this.home, 520);
          break;
        case "up":
          go("home", this.home, 20000 + this.r() * 30000);
          break;
      }
      if (this.mode === "walk" || this.mode === "back") this.until = Math.abs(this.to.x - this.x) / CAT_SPEED + 1;
    }
    const k = this.until > 0 ? Math.min(1, (now - this.started) / this.until) : 1;
    const walking = this.mode === "walk" || this.mode === "back";
    const hop = this.mode === "hop" || this.mode === "up";
    this.x = this.from.x + (this.to.x - this.from.x) * k;
    this.y = this.from.y + (this.to.y - this.from.y) * k - (hop ? Math.sin(Math.PI * k) * 8 : 0);
    if (this.to.x !== this.from.x) this.dir = this.to.x > this.from.x ? "right" : "left";
    this.cat.put(this.x, this.y, this.dir, walking || hop);
  }
}
