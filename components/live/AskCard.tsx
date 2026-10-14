"use client";

import { ShieldQuestion } from "lucide-react";
import { ASK_MS } from "@/lib/live/asks";
import { Asks } from "@/lib/live/useAsks";

const clock = (t: number) => new Date(t).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

/**
 * While the user is away from the computer: the switch's state with a way back, and each permission prompt Claude is
 * waiting on, to allow once or deny. `settled` holds the ones the terminal has already answered.
 */
export default function AskCard({
  asks,
  now,
  settled,
  onOpen,
}: {
  asks: Asks;
  now: number;
  settled: Set<string>;
  onOpen: (session: string) => void;
}) {
  if (asks.until == null) return null;
  const open = asks.asks.filter((a) => a.at + ASK_MS > now && !settled.has(a.id));

  return (
    <div className={`notice asks ${open.length ? "asks-now" : ""}`} role={open.length ? "alert" : "status"}>
      <div className="away-hd">
        <span>
          <ShieldQuestion size={14} /> Ти не за комп&apos;ютером до {clock(asks.until)}: коли Claude просить дозволу,
          питання чекає тут.
        </span>
        <button className="btn" disabled={asks.busy} onClick={() => asks.setAway(false)}>
          я повернувся
        </button>
      </div>
      {open.map((a) => (
        <div className="ask" key={a.id}>
          <div className="ask-what">
            <span>
              <button className="ask-chat" onClick={() => onOpen(a.session)}>
                {a.label}
              </button>{" "}
              просить дозволу · ще {Math.max(1, Math.ceil((a.at + ASK_MS - now) / 60_000))} хв, потім спитає в
              терміналі
            </span>
            <code>{a.detail}</code>
          </div>
          <div className="ask-btns">
            <button className="btn ask-yes" onClick={() => asks.answer(a.id, true)}>
              дозволити раз
            </button>
            <button className="btn" onClick={() => asks.answer(a.id, false)}>
              заборонити
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
