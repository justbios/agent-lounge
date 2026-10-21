"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { tr, useUi } from "@/lib/i18n";
import { attentionText } from "@/lib/live/attention";
import { LiveSession } from "@/lib/live/liveModel";
import { useSpeech } from "@/lib/live/speech";
import { Stuck, stuckShort } from "@/lib/live/stuck";
import { memberName, memberOf } from "@/lib/live/teamModel";
import { ago, logText } from "./format";
import { ACTIVE_MS } from "./House";

const OPEN_KEY = "relay.board";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

/** At work right now: busy a moment ago and not waiting on anyone. */
const working = (s: LiveSession, now: number) => !s.attn && now - s.last < ACTIVE_MS;

/**
 * Waiting on you first, longest first; then a turn that broke off, one that looks stuck, your turn, busy, the rest.
 */
function rank(s: LiveSession, waiting: Set<string>, stuck: Map<string, Stuck[]>, now: number): number {
  const a = waiting.has(s.id) ? s.attn : null;
  if (a?.kind === "ask") return 0;
  if (a?.err) return 1;
  if (stuck.has(s.id)) return 2;
  if (a) return 3;
  return working(s, now) ? 4 : 5;
}

/**
 * Every chat of the last hours on one board, the ones that wait on you on top; a click opens that chat's café. While
 * Claude waits on you anywhere, the board's first line says so in yellow and stays until you answer.
 */
export default function ChatBoard({
  chats,
  waiting,
  stuck,
  current,
  now,
  team,
  onOpen,
}: {
  chats: LiveSession[];
  /** chats that wait on the user: a question or a permission, or an answer not seen yet */
  waiting: Set<string>;
  /** chats where an agent goes in circles or the job runs long past Claude's own estimate */
  stuck: Map<string, Stuck[]>;
  current: string | null;
  now: number;
  /** a team café names each chat's teammate */
  team: boolean;
  onOpen: (id: string) => void;
}) {
  const ui = useUi();
  const sp = useSpeech();
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(OPEN_KEY, open ? "0" : "1");
    } catch {}
  };
  const list = [...chats].sort((a, b) => {
    const d = rank(a, waiting, stuck, now) - rank(b, waiting, stuck, now);
    if (d) return d;
    return rank(a, waiting, stuck, now) === 0 ? a.attn!.at - b.attn!.at : b.last - a.last;
  });
  const asking = list.filter((s) => rank(s, waiting, stuck, now) === 0);
  const first = asking[0];
  if (list.length < 2 && !first) return null;
  const busy = list.filter((s) => working(s, now)).length;

  return (
    <section className={`card board ${first ? "board-wait" : ""}`} aria-label={tr(ui, "усі чати", "all chats")}>
      <div className="board-hd">
        {first ? (
          <button className="board-ask" role="alert" onClick={() => onOpen(first.id)}>
            <span className="chat-flag flag-ask">!</span>
            <b>{tr(ui, "Claude чекає на тебе", "Claude is waiting for you")}</b>
            <span className="board-what">
              {first.label}: {attentionText(first.attn!, ui)} · {ago(now - first.attn!.at, ui)}
            </span>
            {asking.length > 1 && <span className="board-more">+{asking.length - 1}</span>}
          </button>
        ) : (
          <span className="board-sum">
            <span className="card-ttl">{tr(ui, "усі чати", "all chats")}</span>
            <span className="muted-sm">
              {list.length} · {tr(ui, `працюють ${busy}`, `${busy} busy`)}
            </span>
          </span>
        )}
        <button
          className="btn btn-ic"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? tr(ui, "згорнути чати", "fold the chats") : tr(ui, "показати всі чати", "show all chats")}
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {open && (
        <div className="board-rows">
          {list.map((s) => {
            const a = waiting.has(s.id) ? s.attn : null;
            const w = a?.kind === "ask" || a?.err ? undefined : stuck.get(s.id)?.[0];
            const tone = w ? "warn" : a ? (a.kind === "done" && a.err ? "err" : a.kind) : null;
            const doing = w
              ? `${stuckShort(w, ui)}${w.e ? `: ${logText(w.e, sp)}` : ""}`
              : a
                ? attentionText(a, ui)
                : s.latest
                  ? logText(s.latest, sp)
                  : "";
            return (
              <button
                key={s.id}
                className={`board-row ${s.id === current ? "on" : ""} ${tone ? `attn-${tone}` : ""}`}
                onClick={() => onOpen(s.id)}
              >
                {tone ? (
                  <span className={`chat-flag flag-${tone}`}>
                    {tone === "ask" || tone === "warn" ? "!" : tone === "err" ? "×" : "✓"}
                  </span>
                ) : (
                  <span className={`chat-dot ${working(s, now) ? "busy" : ""}`} />
                )}
                <span className="board-nm">
                  {s.label}
                  {team && <small> · {memberName(memberOf(s), ui)}</small>}
                </span>
                <span className="board-now">{doing}</span>
                <span className="board-ago">{ago(now - (w?.at ?? a?.at ?? s.last), ui)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
