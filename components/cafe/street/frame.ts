import { CafeModel } from "@/lib/cafe/model";
import { Walker } from "@/lib/cafe/timeline";
import { ItemId, itemOf } from "@/lib/live/interior";
import { drawItem, itemLight } from "../furniture";
import { GuestSeat } from "../guests";
import { COSTUMES } from "../halloween";
import { Look, drawPacket, drawPerson, drawSeated, lookFor } from "../people";
import { Ctx, rand } from "../pixel";
import { Theme } from "../theme";
import { VisitorFrame, drawVisitor } from "../visitor";
import { Cat } from "../cat";
import { StreetArt, puddles } from "./facade";
import { StreetLayout, StreetSeat } from "./geom";
import { StreetPiece } from "./place";
import { clipped, pen } from "./px";
import { SeatView, StreetPet } from "./walk";
import { askAtGlass, chair, cup, desk, monitor, paperStack, screen, seatedSide, stateColor, zz } from "./seat";

export interface StreetFrame {
  lay: StreetLayout;
  art: StreetArt;
  model: CafeModel;
  seats: SeatView[];
  looks: Look[];
  clock: number;
  /** wall time, seconds */
  t: number;
  theme: Theme;
  guests: GuestSeat[];
  pieces: StreetPiece[];
  open: boolean;
  visitor: VisitorFrame | null;
  visitorCat: Cat | null;
  pets: StreetPet[];
  crown: boolean;
}

const BARISTA: Look = lookFor(6, "#e8e4da", { hair: "#2a1a12", hairDark: "#1a100a", style: 1 });

function seatOf(lay: StreetLayout, i: number): StreetSeat | undefined {
  return lay.seats[i];
}

function drawWalker(g: Ctx, w: Walker, look: Look, lay: StreetLayout, clock: number) {
  const x = Math.round(w.x);
  const y = Math.round(w.y);
  g.globalAlpha = 1 - w.settle * 0.5;
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(x - 4, y - 1, 9, 2);
  const step = w.moving ? 1 + (Math.floor(clock / 150) % 2) : 0;
  drawPerson(g, x, y + Math.round(w.settle * 4), look, { dir: w.dir, step, carrying: w.carrying });
  g.globalAlpha = 1;
  const to = seatOf(lay, w.target);
  if (to && w.give >= 0 && w.give < 1) {
    const fromX = x + (w.dir === "right" ? 3 : -9);
    const fromY = y - 10;
    const toX = to.px + 24;
    const toY = to.y0 + 34;
    const k = w.give;
    drawPacket(g, fromX + (toX - fromX) * k, fromY + (toY - fromY) * k - Math.sin(Math.PI * k) * 6, look.accent);
  }
}

function piece(g: Ctx, p: StreetPiece, t: number) {
  drawItem(g, p.s.item, p.s.w, p.cx, p.bottom, t);
}

export function drawStreet(g: Ctx, f: StreetFrame) {
  const { lay, art, model, seats, looks, clock, t } = f;
  const W = lay.width;
  const H = lay.height;
  const { P, A, glow } = pen(g);
  g.imageSmoothingEnabled = false;
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.drawImage(art.bg, 0, 0);
  const tick = Math.floor(clock / 110);
  const dressed = f.theme.id === "halloween";

  // ---------- behind each window's glass ----------
  lay.wins.forEach((win, wi) => {
    clipped(g, win.x, win.y, win.w, win.h, () => {
      for (const p of f.pieces) if (p.win === wi && p.back) piece(g, p, t);
      lay.seats.forEach((s, i) => {
        if (s.win !== wi) return;
        const sv = seats[i];
        if (!sv) return;
        const o = s.y0 - 88;
        const look = looks[i];
        const st = sv.state;
        const col = stateColor(st);
        glow(s.px + 22, 135 + o, 16, 3, col, 0.28 * (st === "idle" ? 0.6 : 1), 3);
        chair(g, s.px, o);
        const seated = !sv.walker && st !== "ask";
        if (seated) {
          const mode = st === "work" ? "work" : st === "incoming" ? "watch" : st === "done" ? "done" : "doze";
          seatedSide(g, s.px + 5, 116 + o, look, mode, tick);
        }
        desk(g, s.px, o);
        monitor(g, s.px, o, st, t, clock, i);
        if (st === "work" && seated) cup(g, s.px, o, t + i * 0.3, true);
        const tokens = model.agents[i]?.tokens;
        if (tokens) paperStack(g, s.px, o, tokens);
        glow(s.px + 22, 119 + o, 15, 10, col, (st === "idle" ? 0.18 : 0.42) * Math.max(0.6, art.lit), 4);
        screen(g, s.px, o, st, t, clock, i);
        if (st === "ask") askAtGlass(g, s.px, o, look, t);
        if (st === "idle" && seated) zz(g, s.px, o, t, i);
      });
      for (const [i, sv] of seats.entries()) if (sv.walker) drawWalker(g, sv.walker, looks[i], lay, clock);
      for (const p of f.pieces) if (p.win === wi && !p.back) piece(g, p, t);
    });
  });

  // ---------- the counter through the door ----------
  const gl = lay.glass;
  clipped(g, gl.x, gl.y, gl.w, gl.h, () => {
    if (f.open) {
      const bx = gl.x + 10 + Math.round(Math.sin(t * 0.45) * 3);
      drawPerson(g, bx, gl.y + 28, { ...BARISTA, costume: dressed ? "hat" : null }, { dir: "down", step: 0, carrying: false });
      if (bx > gl.x + 11) {
        const s = Math.floor(t * 3) % 3;
        A(gl.x + 19, gl.y + 4 - s, 1, 3, "#ffffff", 0.4);
      }
    }
    P(gl.x, gl.y + 21, gl.w, 9, "#5a2e20");
    P(gl.x, gl.y + 21, gl.w, 1, "#e09a58");
    P(gl.x, gl.y + 22, gl.w, 1, "#7a4428");
    for (let x = gl.x + 2; x < gl.x + gl.w; x += 5) P(x, gl.y + 24, 1, 6, "#4a2418");
    f.guests.forEach((s, k) => {
      const sip = (t + k * 3.1) % 9 < 1.2;
      const look = dressed ? { ...s.look, costume: COSTUMES[(k + 2) % COSTUMES.length] } : s.look;
      drawSeated(g, s.x, s.y - 11, look, sip ? "done" : "idle", 0);
    });
    const v = f.visitor;
    if (v && !v.walking && v.kind !== "goldcat") drawVisitor(g, v, t, null, dressed ? COSTUMES[new Date().getDate() % COSTUMES.length] : null);
  });

  // the glass itself, over everyone behind it; a closed café goes dark inside
  g.drawImage(art.glass, 0, 0);
  if (!f.open) {
    for (const w of lay.wins) A(w.x, w.y, w.w, w.h, "#05040b", 0.55);
    A(gl.x, gl.y, gl.w, gl.h, "#05040b", 0.6);
  }

  // ---------- out front: on the sills ----------
  for (const p of f.pieces) if (p.win < 0) piece(g, p, t);
  if (dressed) {
    const pw = itemOf("pumpkin")?.w ?? 9;
    const ground = lay.wins.filter((w) => w.floor === 0);
    const has = f.pieces.some((p) => p.s.item === "pumpkin");
    if (!has)
      ground.forEach((w, k) => drawItem(g, "pumpkin" as ItemId, pw, k ? w.x + w.w - 34 : w.x + 12, w.y + w.h + 1, t + k));
  }
  for (const p of f.pets) if (p.high) p.cat.draw(g, t, f.crown && p === f.pets[0]);

  // ---------- the wet pavement mirrors the shop front ----------
  const G = lay.walk;
  const src = g.canvas;
  const base = lay.wins.find((w) => w.floor === 0);
  if (art.wetStreet && base) {
    const top = base.y + 49;
    for (let y = G + 1; y < G + 16; y++) {
      const sy = Math.round(top - (y - G - 1) * 1.6);
      g.globalAlpha = y % 3 === 2 ? 0.08 : 0.3 - (y - G - 1) * 0.012;
      g.drawImage(src, 0, sy, W, 1, y % 4 === 0 ? 1 : 0, y, W, 1);
    }
    for (const pd of puddles(lay)) {
      for (let y = pd[1] - pd[3]; y <= pd[1] + pd[3]; y++) {
        const hw = Math.round(pd[2] * Math.sqrt(Math.max(0, 1 - Math.pow((y - pd[1]) / (pd[3] + 0.6), 2))));
        if (hw <= 0) continue;
        g.globalAlpha = 0.85;
        g.drawImage(src, pd[0] - hw, Math.round(base.y + 40 - (y - pd[1]) * 3), hw * 2, 1, pd[0] - hw, y, hw * 2, 1);
      }
    }
    g.globalAlpha = 1;
    if (art.wet) g.drawImage(art.wet, 0, 0);
  }

  // ---------- on the pavement ----------
  for (const p of f.pets) if (!p.high) p.cat.draw(g, t, f.crown && p === f.pets[0]);
  const v = f.visitor;
  if (v && (v.walking || v.kind === "goldcat")) {
    drawVisitor(g, v, t, f.visitorCat, dressed ? COSTUMES[new Date().getDate() % COSTUMES.length] : null);
  }

  // ---------- lights that live: the street lamp, the neon, the warm pieces ----------
  if (art.lit > 0.5) {
    const flick = rand(Math.floor(t * 9)) < 0.04 ? 0.45 : 1;
    glow(lay.lampX - 10, 52, 30, 26, "#bfe6ff", 0.3 * flick * art.lit, 5);
  }
  if (f.open && art.buzz.length && (t % 6.3 < 0.18 || (t % 6.3 > 0.32 && t % 6.3 < 0.4))) {
    for (const [x, y] of art.buzz) P(x, y, 1, 1, "#7a3a5a");
  }
  g.globalCompositeOperation = "lighter";
  for (const p of f.pieces) itemLight(g, p.s.item, p.cx, p.bottom, t);
  for (const pet of f.pets) {
    const e = pet.cat.eye;
    if (e) glow(e.x, e.y, 3, 3, "#ffd25a", 0.5, 2);
  }
  g.globalCompositeOperation = "source-over";

  weather(g, f, W, H, t);
  g.drawImage(art.front, 0, 0);
}

function weather(g: Ctx, f: StreetFrame, W: number, H: number, t: number) {
  const { P, A } = pen(g);
  const kind = f.art.weather;
  if (!kind) return;
  const G = f.lay.walk;
  if (kind === "rain") {
    for (let k = 0; k < 170; k++) {
      const sp = 90 + rand(k * 1.7) * 60;
      const y = (rand(k * 3.1) * (H + 20) + t * sp) % (H + 20) - 10;
      const x = Math.round(((rand(k * 7.3) * (W + 40) - y * 0.4) % (W + 40) + W + 40) % (W + 40)) - 10;
      const len = 3 + Math.floor(rand(k * 5.9) * 3);
      const a = 0.22 + rand(k * 2.3) * 0.3;
      for (let j = 0; j < len; j++) A(x - Math.floor(j * 0.4), Math.round(y) + j, 1, 1, "#a8bcf0", (a * (j + 1)) / len);
    }
    const b = Math.floor(t * 8);
    for (let k = 0; k < 18; k++) {
      const x = Math.floor(rand(b * 31 + k) * W);
      const y = G + 2 + Math.floor(rand(b * 17 + k * 3) * (H - G - 3));
      A(x - 1, y - 1, 1, 1, "#b8c8f4", 0.45);
      A(x + 1, y - 1, 1, 1, "#b8c8f4", 0.45);
    }
  } else if (kind === "snow") {
    for (let k = 0; k < 90; k++) {
      const y = (rand(k * 3.1) * H + t * (8 + rand(k) * 10)) % H;
      const x = (rand(k * 7.3) * W + Math.sin(t * 0.8 + k) * 3 + W) % W;
      P(x, y, 1, 1, rand(k * 1.1) < 0.3 ? "#ffffff" : "#dfe6ff");
    }
  } else if (kind === "fireflies") {
    for (let k = 0; k < 14; k++) {
      const on = (t * 0.7 + rand(k)) % 1 < 0.5;
      if (!on) continue;
      const x = (rand(k * 3.3) * W + Math.sin(t * 0.5 + k) * 6 + W) % W;
      const y = G - 30 + rand(k * 9.1) * 40 + Math.cos(t * 0.6 + k) * 3;
      A(x, y, 1, 1, "#d9ff7a", 0.9);
      A(x - 1, y, 3, 1, "#d9ff7a", 0.25);
    }
  } else if (kind === "bats") {
    for (let k = 0; k < 4; k++) {
      const x = ((t * (14 + k * 5) + rand(k) * W) % (W + 30)) - 15;
      const y = 6 + rand(k * 2.2) * 14 + Math.sin(t * 2 + k) * 2;
      const up = Math.floor(t * 8 + k) % 2 === 0;
      P(x, y, 2, 1, "#08040c");
      P(x - 2, y - (up ? 1 : 0), 2, 1, "#08040c");
      P(x + 2, y - (up ? 1 : 0), 2, 1, "#08040c");
    }
  } else {
    for (let k = 0; k < 20; k++) {
      const on = (t * 0.4 + rand(k * 4.4)) % 1 < 0.3;
      if (on) P(rand(k * 3.3) * W, rand(k * 5.5) * 24, 1, 1, "#e6f0ff");
    }
  }
}
