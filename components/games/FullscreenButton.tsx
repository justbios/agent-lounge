"use client";

import { RefObject, useSyncExternalStore } from "react";
import { Maximize, Minimize } from "lucide-react";

const subscribe = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
};

/** Opens a game on the whole screen and back; hidden where the browser cannot, as on an iPhone. */
export default function FullscreenButton({ target }: { target: RefObject<HTMLElement | null> }) {
  const able = useSyncExternalStore(subscribe, () => !!document.fullscreenEnabled, () => false);
  const full = useSyncExternalStore(
    subscribe,
    () => !!document.fullscreenElement && document.fullscreenElement === target.current,
    () => false,
  );

  if (!able) return null;
  const toggle = () => {
    if (full) void document.exitFullscreen().catch(() => {});
    else void target.current?.requestFullscreen().catch(() => {});
  };
  const label = full ? "вийти з повного екрана" : "на весь екран";
  return (
    <button className="btn btn-ic" onClick={toggle} title={label} aria-label={label}>
      {full ? <Minimize size={14} /> : <Maximize size={14} />}
    </button>
  );
}
