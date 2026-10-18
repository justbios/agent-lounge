"use client";

import { useSyncExternalStore } from "react";

/**
 * The answer keys this browser holds: one per computer paired with it through `relay.sh pair`, under the key's id
 * (kid). Only a device holding a computer's key can answer that computer's Claude from the café: it signs each answer,
 * and relay.sh on the computer checks the signature, so the server and anyone else with the room key cannot.
 */
const STORE = "relay.answer-keys";
const SECRET = /^[0-9a-f]{64}$/;
const KID = /^[0-9a-f]{16}$/;
const PAIR = /[#&]pair=([0-9a-f]{64})/;
const listeners = new Set<() => void>();
const EMPTY: Record<string, string> = {};
let keys: Record<string, string> | null = null;

function load(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE) ?? "{}") as unknown;
    const out: Record<string, string> = {};
    if (parsed && typeof parsed === "object") {
      for (const [kid, s] of Object.entries(parsed as Record<string, unknown>)) {
        if (KID.test(kid) && typeof s === "string" && SECRET.test(s)) out[kid] = s;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function save(next: Record<string, string>) {
  keys = next;
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {}
  for (const fn of listeners) fn();
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytes = (s: string) => new TextEncoder().encode(s);

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytes(text)));
}

/** The same id relay.sh prints: the first 16 hex digits of sha256 over the key as written. */
export async function kidOf(secret: string): Promise<string> {
  return (await sha256Hex(secret)).slice(0, 16);
}

/** HMAC-SHA256 with the key's text as the secret, as `openssl dgst -sha256 -hmac` computes it in relay.sh. */
export async function signWith(secret: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, bytes(message)));
}

/** A pairing link /#pair=<key> files the key and leaves the address bar at once, before anything else reads it. */
function takeFromHash() {
  const m = PAIR.exec(location.hash);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  const secret = m[1];
  void kidOf(secret).then((kid) => save({ ...(keys ?? load()), [kid]: secret }));
}

function snapshot(): Record<string, string> {
  if (keys == null) {
    keys = load();
    takeFromHash();
  }
  return keys;
}

function subscribe(fn: () => void) {
  if (!listeners.size) window.addEventListener("hashchange", takeFromHash);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) window.removeEventListener("hashchange", takeFromHash);
  };
}

export function useAnswerKeys(): Record<string, string> {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function forgetAnswerKey(kid: string) {
  const { [kid]: _gone, ...rest } = snapshot();
  void _gone;
  save(rest);
}
