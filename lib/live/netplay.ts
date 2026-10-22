import { Rollback, Rules } from "./rollback";

/** what Netplay needs of a line to the others; a GameLink, or a made-up one in tests */
export interface Line {
  readonly ready: boolean;
  readonly direct: boolean;
  readonly rtt: number;
  send(d: object): void;
}

/** how often one's inputs go out on a direct line, and through the relay, where every message counts */
const SEND_MS = 16;
const RELAY_MS = 50;
/** with nothing new, an ack still goes out this often */
const IDLE_MS = 120;
const SUM_MS = 1000;
const WANT_MS = 2000;
/** a screen ahead of the others by more than this many steps holds one back, at most every HOLD_MS */
const LEAD = 1;
const HOLD_MS = 120;
/** steps played on guesses before the game stops and waits for the others */
const GUESS_MS = 300;
/** a screen far behind (a tab that was hidden) plays at most this many steps a frame to catch up */
const CATCH_UP = 60;

type NetMsg =
  | { t: "in"; n: number; f: number; a: number[]; d: unknown[] }
  | { t: "sum"; n: number; h: number }
  | { t: "want" }
  | { t: "state"; n: number; s: unknown };

const step = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= -1 && (v as number) < 1e8;

function cleanNet(p: object, seats: number): NetMsg | null {
  const m = p as Record<string, unknown>;
  switch (m.t) {
    case "in": {
      const { n, f, a, d } = m;
      const ok = step(n) && step(f) && Array.isArray(a) && a.length === seats && a.every(step) && Array.isArray(d);
      return ok && d.length <= 128 && n >= d.length - 1 ? { t: "in", n, f, a, d } : null;
    }
    case "sum":
      return step(m.n) && Number.isInteger(m.h) ? { t: "sum", n: m.n, h: m.h as number } : null;
    case "want":
      return { t: "want" };
    case "state":
      return step(m.n) && m.s !== undefined ? { t: "state", n: m.n, s: m.s } : null;
  }
  return null;
}

/**
 * A rollback game played over a GameLink: it starts once every player has answered, keeps the steps in time with the
 * clock, holds back a screen that runs ahead of the others, sends this seat's inputs and takes theirs. The first seat
 * also sends a sum of the settled game now and then, and a screen whose game came out different takes the first
 * seat's over.
 */
export class Netplay<S, I> {
  readonly game: Rollback<S, I>;
  /** the game a step before `game.state`, to draw between the two */
  prev: S;
  started = false;
  /** when this screen has been waiting on the others, or 0 */
  stalledSince = 0;
  private t0 = 0;
  private sentAt = 0;
  private sentTop = -1;
  private sumAt = 0;
  private wantAt = 0;
  private holdAt = 0;
  /** the time `run` was last called with */
  private now = 0;
  private readonly lead: (number | null)[];
  private pending: { n: number; h: number } | null = null;

  constructor(
    readonly rules: Rules<S, I>,
    /** each seat's player id, in seat order */
    readonly ids: readonly string[],
    me: string,
    private readonly link: Line,
  ) {
    this.game = new Rollback(rules, ids.length, ids.indexOf(me));
    this.prev = rules.copy(this.game.state);
    this.lead = ids.map(() => null);
  }

  get me(): number {
    return this.game.me;
  }

  /** how far between the last two steps the clock is, 0 to 1 */
  between(now: number): number {
    if (!this.started) return 1;
    const f = (now - this.t0) / this.rules.ms - this.game.frame;
    return f < 0 ? 0 : f > 1 ? 1 : f;
  }

  /** Called every animation frame: plays the steps that are due, with `input` sampled for each. */
  run(now: number, input: () => I) {
    const g = this.game;
    this.now = now;
    if (!this.started) {
      if (!this.link.ready) return;
      this.started = true;
      this.t0 = now;
    }
    const lead = Math.max(0, ...this.lead.map((l) => l ?? 0));
    if (lead > LEAD && now - this.holdAt > HOLD_MS) {
      this.holdAt = now;
      this.t0 += this.rules.ms;
    }
    let due = Math.floor((now - this.t0) / this.rules.ms) - g.frame;
    if (due > CATCH_UP) {
      this.t0 += (due - CATCH_UP) * this.rules.ms;
      due = CATCH_UP;
    }
    const most = Math.ceil(GUESS_MS / this.rules.ms);
    g.sync();
    for (let k = 0; k < due; k++) {
      if (g.unsure >= most) {
        if (!this.stalledSince) this.stalledSince = now;
        this.t0 = now - g.frame * this.rules.ms;
        break;
      }
      this.stalledSince = 0;
      if (k === due - 1) this.prev = this.rules.copy(g.state);
      g.advance(input());
    }
    if (this.pending) {
      const ok = g.matches(this.pending.n, this.pending.h);
      if (ok !== null) this.pending = null;
      if (ok === false) this.want(now);
    }
    this.flush(now);
  }

  private flush(now: number) {
    const g = this.game;
    const out = g.outgoing();
    const top = out?.n ?? -1;
    const wait = this.link.direct ? SEND_MS : RELAY_MS * Math.max(1, this.ids.length - 1);
    const fresh = top > this.sentTop;
    if (now - this.sentAt < (fresh ? wait : IDLE_MS)) return;
    this.sentAt = now;
    this.sentTop = top;
    const a = g.haves;
    if (out) this.link.send({ t: "in", n: out.n, f: g.frame, a, d: out.d });
    else this.link.send({ t: "in", n: g.rules.delay - 1, f: g.frame, a, d: [] });
    const sum = this.me === 0 ? g.lastSum : null;
    if (sum && now - this.sumAt > SUM_MS) {
      this.sumAt = now;
      this.link.send({ t: "sum", n: sum.n, h: sum.h });
    }
  }

  private want(now: number) {
    if (now - this.wantAt < WANT_MS) return;
    this.wantAt = now;
    this.link.send({ t: "want" });
  }

  /** A message from the player with id `from`. */
  receive(from: string, p: object) {
    const seat = this.ids.indexOf(from);
    const g = this.game;
    if (seat < 0 || seat === this.me) return;
    const m = cleanNet(p, this.ids.length);
    if (!m) return;
    if (m.t === "in") {
      const first = m.n - m.d.length + 1;
      m.d.forEach((v, k) => {
        const i = this.rules.dec(v);
        if (i !== null) g.receive(seat, first + k, i);
      });
      g.ack(seat, m.a[this.me]);
      const there = m.f + this.link.rtt / 2 / this.rules.ms;
      const ahead = g.frame - there;
      const was = this.lead[seat];
      this.lead[seat] = was === null ? ahead : was * 0.8 + ahead * 0.2;
    } else if (m.t === "sum") {
      if (seat !== 0) return;
      const ok = g.matches(m.n, m.h);
      if (ok === null) this.pending = { n: m.n, h: m.h };
      else if (!ok) this.want(this.now);
    } else if (m.t === "want") {
      if (this.me === 0) this.link.send({ t: "state", n: g.settled, s: this.rules.pack(g.sure) });
    } else if (seat === 0) {
      const s = this.rules.unpack(m.s);
      if (s) g.adopt(m.n, s);
    }
  }
}
