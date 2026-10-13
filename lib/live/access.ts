"use client";

import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabaseClient";
import { roomOf } from "./relayKey";

export type Role = "owner" | "member";

/** What a key opens: the café's channel and, on personal keys, whose key it is. */
export interface Access {
  /** the Realtime channel and view-link id: the room's hash, or a private alias once the café is on personal keys */
  topic: string | null;
  name: string | null;
  role: Role | null;
  /** the café runs on personal keys, and its owner can remove people */
  locked: boolean;
  /** why the key no longer opens the café: its owner removed you, or the café moved to personal keys */
  lost: "revoked" | "retired" | null;
}

interface Who {
  topic?: string;
  name?: string | null;
  role?: Role | null;
  locked?: boolean;
}

const cache = new Map<string, Access>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const lostOf = (msg: string): Access["lost"] =>
  msg.includes("key revoked") ? "revoked" : msg.includes("key retired") ? "retired" : null;

async function fetchAccess(key: string): Promise<Access> {
  const { data, error } = await supabase!.rpc("relay_whoami", { p_key: key });
  if (!error) {
    const w = data as Who;
    return { topic: w.topic ?? null, name: w.name ?? null, role: w.role ?? null, locked: !!w.locked, lost: null };
  }
  const lost = lostOf(error.message ?? "");
  if (lost) return { topic: null, name: null, role: null, locked: true, lost };
  return { topic: await roomOf(key), name: null, role: null, locked: false, lost: null };
}

function load(key: string) {
  if (loading.has(key) || !supabase) return;
  loading.add(key);
  fetchAccess(key)
    .then((a) => cache.set(key, a))
    .finally(() => {
      loading.delete(key);
      emit();
    });
}

/** Asks Relay again what `key` opens, after the café moved to personal keys or someone was removed. */
export function refreshAccess(key: string) {
  load(key);
}

/** Remembers what a key opens without asking, for a key Relay has just handed out. */
export function primeAccess(key: string, a: Access) {
  cache.set(key, a);
  emit();
}

/** What `key` opens in Relay; null while it is being asked, or with no key. */
export function useAccess(key: string | null): Access | null {
  const a = useSyncExternalStore(
    subscribe,
    () => (key ? (cache.get(key) ?? null) : null),
    () => null,
  );
  useEffect(() => {
    if (key && !cache.has(key)) load(key);
  }, [key]);
  return a;
}

export interface KeyRow {
  name: string;
  role: Role;
  since: string;
}

export type KeyError = "name taken" | "too many" | "bad name" | "not owner" | "failed";

const keyError = (msg: string | undefined): KeyError =>
  (["name taken", "too many", "bad name", "not owner"] as const).find((e) => msg?.includes(e)) ?? "failed";

async function call<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T } | { error: KeyError }> {
  if (!supabase) return { error: "failed" };
  const { data, error } = await supabase.rpc(fn, args);
  return error ? { error: keyError(error.message) } : { data: data as T };
}

export const listKeys = (key: string) => call<KeyRow[]>("relay_keys_list", { p_key: key });

/** Turns the café over to personal keys: the shared key stops working, and you get the owner's key. */
export const startKeys = (key: string, name: string) =>
  call<{ key: string; name: string }>("relay_keys_start", { p_key: key, p_name: name });

export const inviteKey = (key: string, name: string) =>
  call<{ key: string; name: string }>("relay_key_invite", { p_key: key, p_name: name });

/** Takes a teammate's key back; the café's channel and view link change, so they stop seeing it too. */
export const removeKey = (key: string, name: string) =>
  call<KeyRow[]>("relay_key_remove", { p_key: key, p_name: name });
