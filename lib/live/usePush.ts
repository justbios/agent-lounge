"use client";

import { useEffect, useState } from "react";
import { PushState, disablePush, enablePush, pushDonePref, pushState, setPushDone, testPush } from "./push";

export interface PushControl {
  state: PushState | null;
  done: boolean;
  busy: boolean;
  note: string | null;
  toggle: () => void;
  setDone: (done: boolean) => void;
  test: () => void;
}

export function usePush(key: string | null, enabled: boolean): PushControl {
  const [found, setFound] = useState<{ key: string | null; state: PushState } | null>(null);
  const [override, setOverride] = useState<PushState | null>(null);
  const [done, setDoneState] = useState(() => typeof window !== "undefined" && pushDonePref());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    pushState(key)
      .then((s) => live && setFound({ key, state: s }))
      .catch(() => live && setFound({ key, state: "unsupported" }));
    return () => {
      live = false;
    };
  }, [key, enabled]);

  const state = !enabled ? null : (override ?? (found?.key === key ? found.state : null));

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await job();
    } catch {
      setNote("не вдалося, спробуй ще раз");
    } finally {
      setBusy(false);
    }
  };

  return {
    state,
    done,
    busy,
    note,
    toggle: () =>
      key &&
      run(async () => {
        const next = state === "on" ? await disablePush(key) : await enablePush(key, done);
        setOverride(next);
        if (next === "on") setNote("готово: пуші йтимуть на цей пристрій");
      }),
    setDone: (d) => {
      setDoneState(d);
      if (key && state === "on") void run(() => setPushDone(key, d));
    },
    test: () =>
      key &&
      run(async () => {
        const n = await testPush(key);
        setNote(n ? `надіслано на ${n} пристр.` : "жоден пристрій не підписаний");
      }),
  };
}
