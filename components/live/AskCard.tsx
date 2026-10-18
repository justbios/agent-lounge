"use client";

import { useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { Ask, ASK_MS, AskQuestion } from "@/lib/live/asks";
import { Asks } from "@/lib/live/useAsks";

const clock = (t: number) => new Date(t).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

const WANTS = { AskUserQuestion: "питає", ExitPlanMode: "пропонує план" } as const;

function Questions({
  questions,
  onReply,
}: {
  questions: AskQuestion[];
  onReply: (answers: Record<string, string[]>) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const pick = (q: AskQuestion, label: string) =>
    setPicked((p) => {
      const was = p[q.question] ?? [];
      if (!q.multiSelect) return { ...p, [q.question]: [label] };
      return { ...p, [q.question]: was.includes(label) ? was.filter((l) => l !== label) : [...was, label] };
    });
  const ready = questions.every((q) => picked[q.question]?.length);

  return (
    <>
      {questions.map((q) => (
        <div className="ask-q" key={q.question}>
          <div className="ask-q-text">
            {q.header && <b>{q.header}</b>} {q.question}
            {q.multiSelect && <small> · можна кілька</small>}
          </div>
          <div className="ask-opts" role={q.multiSelect ? "group" : "radiogroup"} aria-label={q.question}>
            {q.options.map((o) => {
              const on = !!picked[q.question]?.includes(o.label);
              return (
                <button
                  key={o.label}
                  className={on ? "ask-opt on" : "ask-opt"}
                  role={q.multiSelect ? "checkbox" : "radio"}
                  aria-checked={on}
                  onClick={() => pick(q, o.label)}
                >
                  <span>{o.label}</span>
                  {o.description && <small>{o.description}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="ask-btns">
        <button className="btn ask-yes" disabled={!ready} onClick={() => onReply(picked)}>
          відповісти
        </button>
      </div>
    </>
  );
}

function AskRow({ a, now, asks, onOpen }: { a: Ask; now: number; asks: Asks; onOpen: (session: string) => void }) {
  const body = a.body;
  const left = Math.max(1, Math.ceil((a.at + ASK_MS - now) / 60_000));
  return (
    <div className="ask">
      <div className="ask-what">
        <span>
          <button className="ask-chat" onClick={() => onOpen(a.session)}>
            {a.label}
          </button>{" "}
          {body ? WANTS[body.tool] : "просить дозволу"} · ще {left} хв, потім спитає в терміналі
        </span>
        {!body && <code>{a.detail}</code>}
        {!body && a.change != null && (
          <details>
            <summary>що саме зміниться</summary>
            <pre className="ask-plan">{a.change}</pre>
          </details>
        )}
        {body?.tool === "ExitPlanMode" && <pre className="ask-plan">{body.input.plan}</pre>}
      </div>
      {!asks.canAnswer(a) ? (
        <p className="ask-unpaired">
          Цей браузер не спарено з комп&apos;ютером, який питає, тож відповісти звідси не можна. На тому комп&apos;ютері
          запусти <code>/agent-lounge:away pair</code> і відкрий посилання тут.
        </p>
      ) : body?.tool === "AskUserQuestion" ? (
        <Questions questions={body.input.questions} onReply={(answers) => asks.reply(a, answers)} />
      ) : (
        <div className="ask-btns">
          <button className="btn ask-yes" onClick={() => asks.answer(a, true)}>
            {body ? "затвердити план" : "дозволити раз"}
          </button>
          <button className="btn" onClick={() => asks.answer(a, false)}>
            {body ? "ні, хай планує далі" : "заборонити"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * While the user is away from the computer: the switch's state with a way back, and each permission prompt, question
 * or plan Claude is waiting on, to answer from here. `settled` holds the ones the terminal has already answered.
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
          питає чи показує план, це чекає тут.
        </span>
        <button className="btn" disabled={asks.busy} onClick={asks.back}>
          я повернувся
        </button>
      </div>
      {asks.failed && <p className="ask-unpaired">{asks.failed}</p>}
      {open.map((a) => (
        <AskRow key={a.id} a={a} now={now} asks={asks} onOpen={onOpen} />
      ))}
    </div>
  );
}
