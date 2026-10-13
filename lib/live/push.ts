"use client";

import { supabase } from "@/lib/supabaseClient";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const DONE_PREF = "relay.pushDone";

export type PushState = "unsupported" | "install" | "denied" | "off" | "on";

export function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function b64(s: string): Uint8Array<ArrayBuffer> {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushDonePref(): boolean {
  try {
    return localStorage.getItem(DONE_PREF) === "1";
  } catch {
    return false;
  }
}

function saveDonePref(done: boolean) {
  try {
    localStorage.setItem(DONE_PREF, done ? "1" : "0");
  } catch {}
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js");
}

async function save(key: string, sub: PushSubscription, done: boolean) {
  const { error } = await supabase!.rpc("relay_push_subscribe", { p_key: key, p_sub: sub.toJSON(), p_done: done });
  if (error) throw new Error(error.message);
}

/** iPhone only delivers web push to a site added to the home screen, so Safari in a tab gets the install hint instead. */
export async function pushState(key: string | null): Promise<PushState> {
  if (!PUBLIC || !supabase || !key) return "unsupported";
  if (!supported()) return isIos() && !isStandalone() ? "install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return "off";
  // Re-file the device under the current key, in case the key changed since it subscribed.
  await save(key, sub, pushDonePref()).catch(() => {});
  return "on";
}

export async function enablePush(key: string, done: boolean): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(PUBLIC) }));
  await save(key, sub, done);
  saveDonePref(done);
  return "on";
}

export async function setPushDone(key: string, done: boolean) {
  const sub = await (await registration()).pushManager.getSubscription();
  saveDonePref(done);
  if (sub) await save(key, sub, done);
}

export async function disablePush(key: string): Promise<PushState> {
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) {
    await supabase!.rpc("relay_push_unsubscribe", { p_key: key, p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return "off";
}

export async function testPush(key: string): Promise<number> {
  const r = await fetch("/api/push-test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ k: key }),
  }).catch(() => null);
  if (!r?.ok) return 0;
  return ((await r.json().catch(() => ({ sent: 0 }))) as { sent: number }).sent;
}
