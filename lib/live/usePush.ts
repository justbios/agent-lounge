"use client";

import { useEffect, useState } from "react";
import { enPlural, tr, uiNow } from "@/lib/i18n";
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

/** `member` files this device under one teammate, so in a team café only their own Claude rings it. */
export function usePush(key: string | null, enabled: boolean, member: string | null = null): PushControl {
  const [found, setFound] = useState<{ key: string | null; state: PushState } | null>(null);
  const [override, setOverride] = useState<PushState | null>(null);
  const [done, setDoneState] = useState(() => typeof window !== "undefined" && pushDonePref());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    pushState(key, member)
      .then((s) => live && setFound({ key, state: s }))
      .catch(() => live && setFound({ key, state: "unsupported" }));
    return () => {
      live = false;
    };
  }, [key, enabled, member]);

  const state = !enabled ? null : (override ?? (found?.key === key ? found.state : null));

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await job();
    } catch {
      setNote(tr(uiNow(), "не вдалося, спробуй ще раз", "that didn't work, try again"));
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
        const next = state === "on" ? await disablePush(key) : await enablePush(key, done, member);
        setOverride(next);
        if (next === "on") setNote(tr(uiNow(), "готово: пуші йтимуть на цей пристрій", "done: push will come to this device"));
      }),
    setDone: (d) => {
      setDoneState(d);
      if (key && state === "on") void run(() => setPushDone(key, d, member));
    },
    test: () =>
      key &&
      run(async () => {
        const n = await testPush(key);
        const ui = uiNow();
        setNote(
          n
            ? tr(ui, `надіслано на ${n} пристр.`, `sent to ${n} ${enPlural(n, "device", "devices")}`)
            : tr(ui, "жоден пристрій не підписаний", "no device is subscribed"),
        );
      }),
  };
}
