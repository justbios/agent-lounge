"use client";

import { useSyncExternalStore } from "react";
import { rng } from "@/lib/cafe/layout";

export type VisitorKind = "courier" | "goldcat" | "shiny";

export const VISITORS: Record<VisitorKind, { icon: string; name: string; hint: string }> = {
  courier: { icon: "🍕", name: "Кур'єр з піцою", hint: "Приносить піцу, сідає за стійку й чекає, хто її замовив" },
  goldcat: { icon: "🐈", name: "Золотий кіт", hint: "Мандрує кафе світу й зрідка вмощується на стільці біля стійки" },
  shiny: { icon: "✨", name: "Блискучий агент", hint: "Один гість із п'ятисот. Хто його бачив, той знає" },
};

export const VISITOR_KINDS = Object.keys(VISITORS) as VisitorKind[];

const SLOT_MS = 30 * 60_000;
/** How long a visitor stays, walking in and out included. */
export const STAY_MS = 4 * 60_000;
/** One half hour in six has a visitor: about every three hours. */
const CHANCE = 6;
const SHINY = 500;

export interface Visit {
  kind: VisitorKind;
  start: number;
  end: number;
}

/**
 * Who drops in at wall-clock time `now`, the same for everyone everywhere: every Relay café gets the visitor at once,
 * so all who watch one café see the same guest at the same moment.
 */
export function visitAt(now: number): Visit | null {
  const slot = Math.floor(now / SLOT_MS);
  const r = rng(slot * 7919 + 17);
  if (Math.floor(r() * CHANCE) !== 0) return null;
  const start = slot * SLOT_MS + Math.floor(r() * (SLOT_MS - STAY_MS));
  if (now < start || now >= start + STAY_MS) return null;
  const kind = Math.floor(r() * SHINY) === 0 ? "shiny" : r() < 0.6 ? "courier" : "goldcat";
  return { kind, start, end: start + STAY_MS };
}

const BOOK_KEY = "relay.guestbook";

export type GuestBook = Partial<Record<VisitorKind, number>>;

const listeners = new Set<() => void>();
let book: GuestBook | null = null;
let raw: string | null = null;

function read(): GuestBook {
  try {
    const now = localStorage.getItem(BOOK_KEY);
    if (book && now === raw) return book;
    raw = now;
    const parsed = now ? (JSON.parse(now) as unknown) : null;
    const out: GuestBook = {};
    if (parsed && typeof parsed === "object") {
      for (const k of VISITOR_KINDS) {
        const v = (parsed as Record<string, unknown>)[k];
        if (typeof v === "number" && v > 0) out[k] = v;
      }
    }
    book = out;
  } catch {
    book ??= {};
  }
  return book;
}

/** Writes down the first time this browser saw a kind of visitor; seeing it again changes nothing. */
export function noteVisitor(kind: VisitorKind, at: number) {
  const cur = read();
  if (cur[kind]) return;
  book = { ...cur, [kind]: at };
  try {
    raw = JSON.stringify(book);
    localStorage.setItem(BOOK_KEY, raw);
  } catch {}
  listeners.forEach((l) => l());
}

const EMPTY: GuestBook = {};

/** The visitors this browser has seen, each with when it first came. */
export function useGuestBook(): GuestBook {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => EMPTY,
  );
}
