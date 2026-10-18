"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { sha256Hex, signWith, useAnswerKeys } from "./answerKeys";
import { Ask, AskBody, answerText, askChange, askFromRaw } from "./asks";

const AWAY_POLL_MS = 3_000;
const IDLE_POLL_MS = 60_000;

export interface Asks {
  /** the café knows this key as one person's: asks need a personal key */
  ok: boolean;
  /** away from the computer until then; null while at it */
  until: number | null;
  asks: Ask[];
  busy: boolean;
  /** «я повернувся»: the café can switch «я не за комп'ютером» off; only the computer switches it on */
  back: () => void;
  /** this browser holds the answer key of the computer that asked, so it can answer */
  canAnswer: (a: Ask) => boolean;
  /** how many computers this browser is paired with */
  paired: number;
  answer: (a: Ask, allow: boolean) => void;
  /** a question's answers: each question's text to the option labels picked */
  reply: (a: Ask, picked: Record<string, string[]>) => void;
  /** the last answer that did not go through: the ask is back in the list */
  failed: string | null;
}

interface Row {
  id: string;
  session: string;
  label: string;
  tool: string;
  detail: string;
  at: string;
  body: AskBody | null;
  kid: string | null;
  raw: string | null;
}

/** What the café shows of an ask comes from the hook's own JSON, the same text the signature covers. */
function fromRow(r: Row): Ask {
  const own = r.raw ? askFromRaw(r.raw) : null;
  const base = { id: r.id, session: r.session, label: r.label, at: Date.parse(r.at) };
  if (!own || !r.kid) return { ...base, tool: r.tool, detail: r.detail, body: r.body };
  const change = askChange(own.name, own.input);
  const { tool, detail, body, input } = own;
  return { ...base, tool, detail, body, input, change, kid: r.kid, raw: r.raw! };
}

/**
 * «Я не за комп'ютером» and the permission prompts waiting on it, for the person whose personal key this is. Asked
 * every few seconds while the switch is on and the page is on screen, otherwise once a minute, so turning it on from
 * the computer shows here too.
 */
export function useAsks(key: string | null, personal: boolean): Asks {
  const [until, setUntil] = useState<number | null>(null);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const answered = useRef(new Set<string>());
  const keys = useAnswerKeys();
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
            setAsks(open.map(fromRow));
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

  const back = async () => {
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase!.rpc("relay_away_set", { p_key: key, p_on: false });
    setBusy(false);
    if (error) return;
    setUntil(null);
    setAsks([]);
  };

  const canAnswer = (a: Ask) => !!a.kid && !!a.raw && !!keys[a.kid];

  /** HMAC over id:answer:sha256(raw):u with the asking computer's key; relay.sh recomputes it before it answers. */
  const sign = async (a: Ask, verdict: "allow" | "deny", u: string) => {
    const secret = a.kid ? keys[a.kid] : undefined;
    if (!secret || !a.raw) return null;
    return signWith(secret, `${a.id}:${verdict}:${await sha256Hex(a.raw)}:${u}`);
  };

  const send = (a: Ask, go: () => Promise<boolean>) => {
    if (!ok || !canAnswer(a)) return;
    answered.current.add(a.id);
    setAsks((list) => list.filter((x) => x.id !== a.id));
    setFailed(null);
    go()
      .catch(() => false)
      .then((done) => {
        if (done) return;
        answered.current.delete(a.id);
        setFailed("Відповідь не пройшла: спробуй ще раз або відповідай у терміналі.");
      });
  };

  const answer = (a: Ask, allow: boolean) =>
    send(a, async () => {
      const u = allow && a.body?.tool === "ExitPlanMode" ? JSON.stringify(a.input ?? {}) : "";
      const p_sig = await sign(a, allow ? "allow" : "deny", u);
      if (!p_sig) return false;
      const { data, error } = await supabase!.rpc("relay_ask_answer", {
        p_key: key,
        p_id: a.id,
        p_allow: allow,
        p_u: u || null,
        p_sig,
      });
      return !error && data === true;
    });

  const reply = (a: Ask, picked: Record<string, string[]>) =>
    send(a, async () => {
      if (a.body?.tool !== "AskUserQuestion") return false;
      const u = JSON.stringify({ ...a.input, answers: answerText(a.body.input.questions, picked) });
      const p_sig = await sign(a, "allow", u);
      if (!p_sig) return false;
      const { data, error } = await supabase!.rpc("relay_ask_reply", {
        p_key: key,
        p_id: a.id,
        p_answers: picked,
        p_u: u,
        p_sig,
      });
      return !error && data === true;
    });

  return {
    ok,
    until: ok ? until : null,
    asks: ok ? asks : [],
    busy,
    back,
    canAnswer,
    paired: Object.keys(keys).length,
    answer,
    reply,
    failed,
  };
}
