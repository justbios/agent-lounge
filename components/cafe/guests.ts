import { Guest } from "@/lib/live/social";
import { Look, drawSeated, lookFor } from "./people";
import { Ctx } from "./pixel";
import { STOOLS, STOOL_TOP } from "./room";

const COATS = ["#5aa9e6", "#f4a259", "#9b5de5", "#43aa8b", "#e5989b", "#c9b458"];

export interface GuestSeat {
  id: string;
  name: string;
  x: number;
  look: Look;
}

function hashOf(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The first guests take the bar stools, each with a look that stays the same for that tab; the rest only count. */
export function seatGuests(guests: Guest[]): GuestSeat[] {
  return guests.slice(0, STOOLS.length).map((g, i) => {
    const h = hashOf(g.id);
    return { id: g.id, name: g.name, x: STOOLS[i], look: lookFor(h, COATS[h % COATS.length]) };
  });
}

/** Guests sit on the stools with their backs to the room, now and then leaning in to sip. */
export function drawGuests(ctx: Ctx, seats: GuestSeat[], t: number) {
  for (const s of seats) {
    const sip = (t + s.x * 0.37) % 9 < 1.2;
    drawSeated(ctx, s.x, STOOL_TOP - 11, s.look, sip ? "done" : "idle", 0);
  }
}
