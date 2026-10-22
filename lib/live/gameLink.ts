import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/** public STUN servers that tell each browser its outside address; no TURN, so a line that can't go direct stays on the relay */
const STUN = ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"];
const HI_MS = 1000;
const PING_MS = 1000;
/** the browser that offers tries again this often until the direct line opens, at most RETRIES more times */
const OFFER_MS = 5000;
const RETRIES = 2;
/** more than this waiting to go out on a direct line and new messages take the relay instead */
const MAX_BUFFER = 1 << 16;

/** A made-up bad line for trying the games out: each message is late by `ms` plus up to `jitter`, or lost. */
export interface Lag {
  ms: number;
  jitter: number;
  loss: number;
}

interface Conn {
  id: string;
  heard: boolean;
  pc: RTCPeerConnection | null;
  dc: RTCDataChannel | null;
  open: boolean;
  /** ICE candidates that came before the other side's description */
  early: RTCIceCandidateInit[];
  offers: number;
  offeredAt: number;
  rtt: number;
  /** a round trip has been timed */
  timed: boolean;
}

type Wire =
  | { k: "hi"; f: string }
  | { k: "sdp"; f: string; to: string; d: RTCSessionDescriptionInit }
  | { k: "ice"; f: string; to: string; c: RTCIceCandidateInit }
  | { k: "ping"; f: string; a: number }
  | { k: "pong"; f: string; to: string; a: number }
  | { k: "m"; f: string; d: object };

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const time = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function cleanIce(v: unknown): RTCIceCandidateInit | null {
  const c = v as Record<string, unknown> | null;
  if (!c || typeof c.candidate !== "string" || c.candidate.length > 1000) return null;
  const mid = c.sdpMid ?? null;
  const line = c.sdpMLineIndex ?? null;
  if (mid !== null && !str(mid, 64)) return null;
  if (line !== null && !(Number.isInteger(line) && (line as number) >= 0 && (line as number) < 64)) return null;
  return { candidate: c.candidate, sdpMid: mid, sdpMLineIndex: line as number | null };
}

function cleanWire(p: unknown): Wire | null {
  const m = p as Record<string, unknown> | null;
  if (!m || !str(m.f, 64)) return null;
  const f = m.f;
  if (m.k === "hi") return { k: "hi", f };
  if (m.k === "m") return m.d && typeof m.d === "object" ? { k: "m", f, d: m.d } : null;
  if (m.k === "ping") return time(m.a) ? { k: "ping", f, a: m.a } : null;
  if (!str(m.to, 64)) return null;
  const to = m.to;
  if (m.k === "pong") return time(m.a) ? { k: "pong", f, to, a: m.a } : null;
  if (m.k === "sdp") {
    const d = m.d as Record<string, unknown> | null;
    const ok = d && (d.type === "offer" || d.type === "answer") && str(d.sdp, 20000);
    return ok ? { k: "sdp", f, to, d: { type: d.type as RTCSdpType, sdp: d.sdp as string } } : null;
  }
  if (m.k === "ice") {
    const c = cleanIce(m.c);
    return c ? { k: "ice", f, to, c } : null;
  }
  return null;
}

/**
 * A real-time game's line to the other players. It meets them on the match's Realtime channel, then tries to talk to
 * each one straight, browser to browser, over a WebRTC data channel that never waits for a lost message, so one late
 * packet holds nothing else up. Until that line is open, or where a network won't allow it, the same messages go
 * through the channel instead. Either way a message may be lost, late or come twice; the games send what matters again.
 */
export class GameLink {
  private ch: RealtimeChannel | null = null;
  private readonly conns = new Map<string, Conn>();
  private readonly timer: ReturnType<typeof setInterval>;
  private pingAt = 0;
  private closed = false;

  constructor(
    private readonly sb: SupabaseClient,
    private readonly topic: string,
    private readonly self: string,
    others: readonly string[],
    private readonly onMsg: (from: string, m: object) => void,
    private readonly lag: Lag | null = null,
  ) {
    for (const id of others) {
      if (id === self) continue;
      this.conns.set(id, {
        id,
        heard: false,
        pc: null,
        dc: null,
        open: false,
        early: [],
        offers: 0,
        offeredAt: 0,
        rtt: 120,
        timed: false,
      });
    }
    void this.join();
    this.timer = setInterval(() => this.tick(), HI_MS / 4);
  }

  /**
   * Joins the match's channel once any earlier join of it on this page has quite left: Supabase hands back a channel
   * that is still on its way out for the same name, as when a game is opened again at once.
   */
  private async join() {
    const old = this.sb.getChannels().find((c) => c.topic === `realtime:${this.topic}`);
    if (old) await this.sb.removeChannel(old);
    if (this.closed) return;
    const ch = this.sb.channel(this.topic, { config: { broadcast: { self: false } } });
    this.ch = ch;
    ch.on("broadcast", { event: "g" }, ({ payload }) => this.arrive(payload));
    ch.subscribe((s) => {
      if (s === "SUBSCRIBED") this.relay({ k: "hi", f: this.self });
    });
  }

  /** everyone else has answered */
  get ready(): boolean {
    return [...this.conns.values()].every((c) => c.heard);
  }

  /** every other player is on a direct line */
  get direct(): boolean {
    return [...this.conns.values()].every((c) => c.open);
  }

  /** the slowest round trip to another player, ms */
  get rtt(): number {
    return Math.max(0, ...[...this.conns.values()].map((c) => c.rtt));
  }

  /** A game message to every other player. */
  send(d: object) {
    this.out({ k: "m", f: this.self, d });
  }

  close() {
    this.closed = true;
    clearInterval(this.timer);
    for (const c of this.conns.values()) this.drop(c);
    if (this.ch) void this.sb.removeChannel(this.ch);
  }

  private tick() {
    if (this.closed) return;
    const now = performance.now();
    if (now - this.pingAt < (this.ready ? PING_MS : HI_MS)) return;
    this.pingAt = now;
    if (!this.ready) this.relay({ k: "hi", f: this.self });
    else this.out({ k: "ping", f: this.self, a: now });
    for (const c of this.conns.values()) {
      const stale = c.heard && !c.open && this.self < c.id && now - c.offeredAt > OFFER_MS;
      if (stale && c.offers <= RETRIES) void this.offer(c);
    }
  }

  /** Sends on each direct line that is open, and once through the channel for anyone without one. */
  private out(w: Wire) {
    if (this.closed) return;
    let slow = false;
    const text = JSON.stringify(w);
    for (const c of this.conns.values()) if (!this.straight(c, text)) slow = true;
    if (slow) this.relay(w);
  }

  private straight(c: Conn, text: string): boolean {
    if (!c.open || !c.dc || c.dc.bufferedAmount > MAX_BUFFER) return false;
    try {
      c.dc.send(text);
      return true;
    } catch {
      c.open = false;
      return false;
    }
  }

  private relay(w: Wire) {
    void this.ch?.send({ type: "broadcast", event: "g", payload: w });
  }

  private to(c: Conn, w: Wire) {
    if (!this.straight(c, JSON.stringify(w))) this.relay(w);
  }

  private arrive(payload: unknown) {
    if (this.closed) return;
    const lag = this.lag;
    if (!lag) return this.take(payload);
    if (Math.random() < lag.loss) return;
    setTimeout(() => this.take(payload), lag.ms + Math.random() * lag.jitter);
  }

  private take(payload: unknown) {
    const w = cleanWire(payload);
    const c = w && this.conns.get(w.f);
    if (!w || !c || this.closed) return;
    if ("to" in w && w.to !== this.self) return;
    switch (w.k) {
      case "hi":
        if (c.heard) return;
        c.heard = true;
        this.relay({ k: "hi", f: this.self });
        if (this.self < c.id) void this.offer(c);
        return;
      case "m":
        c.heard = true;
        this.onMsg(c.id, w.d);
        return;
      case "ping":
        this.to(c, { k: "pong", f: this.self, to: c.id, a: w.a });
        return;
      case "pong": {
        const took = performance.now() - w.a;
        if (took < 0 || took > 10000) return;
        c.rtt = c.timed ? c.rtt * 0.7 + took * 0.3 : took;
        c.timed = true;
        return;
      }
      case "sdp":
        void this.described(c, w.d);
        return;
      case "ice":
        if (c.pc?.remoteDescription) c.pc.addIceCandidate(w.c).catch(() => {});
        else if (c.early.length < 50) c.early.push(w.c);
        return;
    }
  }

  /** A fresh peer connection to `c` with its one data channel, agreed on by both sides beforehand. */
  private line(c: Conn): RTCPeerConnection | null {
    const early = c.early;
    this.drop(c);
    c.early = early;
    if (typeof RTCPeerConnection === "undefined") return null;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: STUN }] });
    const dc = pc.createDataChannel("g", { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
    c.pc = pc;
    c.dc = dc;
    pc.onicecandidate = (e) => {
      if (e.candidate && c.pc === pc) this.relay({ k: "ice", f: this.self, to: c.id, c: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (c.pc === pc && (pc.connectionState === "failed" || pc.connectionState === "closed")) c.open = false;
    };
    dc.onopen = () => {
      if (c.dc === dc) c.open = true;
    };
    dc.onclose = () => {
      if (c.dc === dc) c.open = false;
    };
    dc.onmessage = (e) => {
      if (c.dc !== dc || typeof e.data !== "string" || e.data.length > 100000) return;
      try {
        this.arrive(JSON.parse(e.data));
      } catch {
        // not one of ours
      }
    };
    return pc;
  }

  /** The browser with the smaller id offers the direct line; the other answers. */
  private async offer(c: Conn) {
    c.offers += 1;
    c.offeredAt = performance.now();
    const pc = this.line(c);
    if (!pc) return;
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (c.pc === pc && pc.localDescription && !this.closed) {
        this.relay({ k: "sdp", f: this.self, to: c.id, d: pc.localDescription.toJSON() });
      }
    } catch {
      if (c.pc === pc) this.drop(c);
    }
  }

  private async described(c: Conn, d: RTCSessionDescriptionInit) {
    let pc = c.pc;
    try {
      if (d.type === "offer") {
        if (this.self < c.id) return;
        pc = this.line(c);
        if (!pc) return;
        await pc.setRemoteDescription(d);
        this.flush(c, pc);
        await pc.setLocalDescription(await pc.createAnswer());
        if (c.pc === pc && pc.localDescription && !this.closed) {
          this.relay({ k: "sdp", f: this.self, to: c.id, d: pc.localDescription.toJSON() });
        }
      } else if (pc && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(d);
        this.flush(c, pc);
      }
    } catch {
      if (pc && c.pc === pc) this.drop(c);
    }
  }

  private flush(c: Conn, pc: RTCPeerConnection) {
    for (const cand of c.early.splice(0)) pc.addIceCandidate(cand).catch(() => {});
  }

  private drop(c: Conn) {
    c.open = false;
    c.early = [];
    const { pc, dc } = c;
    c.pc = null;
    c.dc = null;
    try {
      dc?.close();
      pc?.close();
    } catch {
      // already closed
    }
  }
}

/**
 * A made-up bad line from the page address while developing, as `?lag=ms,jitter,loss` (say `?lag=60,40,0.05`), to
 * feel how the games play over a poor connection; never on a built café.
 */
export function devLag(): Lag | null {
  if (process.env.NODE_ENV === "production" || typeof location === "undefined") return null;
  const v = new URLSearchParams(location.search).get("lag");
  if (!v) return null;
  const [ms = 0, jitter = 0, loss = 0] = v.split(",").map(Number);
  return { ms: ms || 0, jitter: jitter || 0, loss: Math.min(0.9, loss || 0) };
}
