import type { Ui } from "@/lib/i18n";
import { Guest } from "@/lib/live/social";
import { COSTUMES } from "./halloween";
import { Look, drawSeated, lookFor } from "./people";
import { Ctx } from "./pixel";
import { BAR_SEATS } from "./room";

const COATS = ["#5aa9e6", "#f4a259", "#9b5de5", "#43aa8b", "#e5989b", "#c9b458"];

export interface GuestSeat {
  id: string;
  name: string;
  x: number;
  /** the top of the seat */
  y: number;
  me: boolean;
  /** what the tag over the stool reads: «ти» for this tab, the name for everyone else */
  tag: string;
  look: Look;
}

function hashOf(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The first six take the seats at the bar, each with a look that stays the same for that tab; the rest only count. */
export function seatGuests(guests: Guest[], ui: Ui = "uk"): GuestSeat[] {
  return guests.slice(0, BAR_SEATS.length).map((g, i) => {
    const h = hashOf(g.id);
    const { x, y } = BAR_SEATS[i];
    const tag = g.me ? (ui === "en" ? "you" : "ти") : g.name;
    return { id: g.id, name: g.name, x, y, me: !!g.me, tag, look: lookFor(h, COATS[h % COATS.length]) };
  });
}

export const barOverflow = (guests: Guest[]) => Math.max(0, guests.length - BAR_SEATS.length);

export const guestTag = (s: GuestSeat) => s.tag;

/** Guests sit with their backs to the room, now and then leaning in to sip; in the Halloween week, in costume. */
export function drawGuests(ctx: Ctx, seats: GuestSeat[], t: number, dressed = false) {
  for (const s of seats) {
    const sip = (t + s.x * 0.37 + s.y * 0.11) % 9 < 1.2;
    const look = dressed ? { ...s.look, costume: COSTUMES[hashOf(s.id) % COSTUMES.length] } : s.look;
    drawSeated(ctx, s.x, s.y - 11, look, sip ? "done" : "idle", 0);
  }
}
