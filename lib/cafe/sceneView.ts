import { useCallback, useSyncExternalStore } from "react";

/** How the café is shown: from the street through its shop windows, or the room inside from above. */
export type SceneView = "street" | "hall";

const KEY = "lounge.sceneView";
const EVENT = "lounge-scene-view";
const DEFAULT: SceneView = "hall";
/** the pick of this page, for a browser that keeps nothing */
let picked: SceneView | null = null;

function read(): SceneView {
  if (picked) return picked;
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "hall" || v === "street" ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  const other = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    picked = null;
    cb();
  };
  window.addEventListener("storage", other);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", other);
  };
}

/** The view this browser picked for the café, remembered between visits; the hall by default. */
export function useSceneView(): [SceneView, (v: SceneView) => void] {
  const view = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const set = useCallback((v: SceneView) => {
    picked = v;
    try {
      window.localStorage.setItem(KEY, v);
    } catch {
      // private mode or blocked storage: the pick lasts until the page closes
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [view, set];
}
