"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Ask, AskBody } from "./asks";

const AWAY_POLL_MS = 3_000;
const IDLE_POLL_MS = 60_000;

export interface Asks {
  /** the café knows this key as one person's: asks need a personal key */
  ok: boolean;
  /** away from the computer until then; null while at it */
  until: number | null;
  asks: Ask[];
  busy: boolean;
  setAway: (on: boolean) => void;
  answer: (id: string, allow: boolean) => void;
  /** a question's answers: each question's text to the option labels picked */
  reply: (id: string, answers: Record<string, string[]>) => void;
}

interface Row {
  id: string;
  session: string;
  label: string;
  tool: string;
  detail: string;
  at: string;
  body: AskBody | null;
}

/**
 * «Я не за комп'ютером» and the permission prompts waiting on it, for the person whose personal key this is. Asked
 * every few seconds while the switch is on and the page is on screen, otherwise once a minute, so turning it on from
 * another device shows here too.
 */
export function useAsks(key: string | null, personal: boolean): Asks {
  const [until, setUntil] = useState<number | null>(null);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [busy, setBusy] = useState(false);
  const answered = useRef(new Set<string>());
  const ok = !!key && personal && !!supabase;
  const away = until != null;

  useEffect(() => {
    if (!ok) return;
    let dead = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (running) return;
      running = true;
      clearTimeout(timer);
      try {
        if (document.visibilityState === "visible") {
          const { data, error } = await supabase!.rpc("relay_asks_list", { p_key: key });
          if (!dead && !error) {
            const d = data as { until: string | null; asks: Row[] } | null;
            setUntil(d?.until ? Date.parse(d.until) : null);
            const open = (d?.asks ?? []).filter((a) => !answered.current.has(a.id));
            setAsks(open.map((a) => ({ ...a, at: Date.parse(a.at) })));
          }
        }
      } finally {
        running = false;
      }
      if (!dead) timer = setTimeout(load, away ? AWAY_POLL_MS : IDLE_POLL_MS);
    };
    const seen = () => document.visibilityState === "visible" && load();
    load();
    document.addEventListener("visibilitychange", seen);
    return () => {
      dead = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", seen);
    };
  }, [ok, key, away]);

  const setAway = async (on: boolean) => {
    if (!ok) return;
    setBusy(true);
    const { data, error } = await supabase!.rpc("relay_away_set", { p_key: key, p_on: on });
    setBusy(false);
    if (error) return;
    setUntil(typeof data === "string" ? Date.parse(data) : null);
    if (!on) setAsks([]);
  };

  const done = (id: string) => {
    answered.current.add(id);
    setAsks((list) => list.filter((a) => a.id !== id));
  };

  const answer = (id: string, allow: boolean) => {
    if (!ok) return;
    done(id);
    supabase!.rpc("relay_ask_answer", { p_key: key, p_id: id, p_allow: allow }).then(() => undefined);
  };

  const reply = (id: string, answers: Record<string, string[]>) => {
    if (!ok) return;
    done(id);
    supabase!.rpc("relay_ask_reply", { p_key: key, p_id: id, p_answers: answers }).then(() => undefined);
  };

  return { ok, until: ok ? until : null, asks: ok ? asks : [], busy, setAway, answer, reply };
}
