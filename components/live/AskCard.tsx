"use client";

import { useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { Two, Ui, useTr, useUi } from "@/lib/i18n";
import { Ask, ASK_MS, AskQuestion } from "@/lib/live/asks";
import { Asks } from "@/lib/live/useAsks";

const clock = (t: number, ui: Ui) =>
  new Date(t).toLocaleTimeString(ui === "en" ? "en-GB" : "uk-UA", { hour: "2-digit", minute: "2-digit" });

const WANTS: Record<"AskUserQuestion" | "ExitPlanMode", Two> = {
  AskUserQuestion: { uk: "питає", en: "asks" },
  ExitPlanMode: { uk: "пропонує план", en: "proposes a plan" },
};

function Questions({
  questions,
  onReply,
}: {
  questions: AskQuestion[];
  onReply: (answers: Record<string, string[]>) => void;
}) {
  const t = useTr();
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
            {q.multiSelect && <small> · {t("можна кілька", "pick any")}</small>}
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
          {t("відповісти", "answer")}
        </button>
      </div>
    </>
  );
}

function AskRow({ a, now, asks, onOpen }: { a: Ask; now: number; asks: Asks; onOpen: (session: string) => void }) {
  const ui = useUi();
  const t = useTr();
  const body = a.body;
  const left = Math.max(1, Math.ceil((a.at + ASK_MS - now) / 60_000));
  const detail = ui === "en" ? (a.detailEn ?? a.detail) : a.detail;
  return (
    <div className="ask">
      <div className="ask-what">
        <span>
          <button className="ask-chat" onClick={() => onOpen(a.session)}>
            {a.label}
          </button>{" "}
          {body ? WANTS[body.tool][ui] : t("просить дозволу", "asks permission")} ·{" "}
          {t(`ще ${left} хв, потім спитає в терміналі`, `${left} min left, then it asks in the terminal`)}
        </span>
        {!body && <code>{detail}</code>}
        {!body && a.change != null && (
          <details>
            <summary>{t("що саме зміниться", "what exactly changes")}</summary>
            <pre className="ask-plan">{a.change}</pre>
          </details>
        )}
        {body?.tool === "ExitPlanMode" && <pre className="ask-plan">{body.input.plan}</pre>}
      </div>
      {!asks.canAnswer(a) ? (
        <p className="ask-unpaired">
          {t(
            "Цей браузер не спарено з комп'ютером, який питає, тож відповісти звідси не можна. На тому комп'ютері запусти",
            "This browser isn't paired with the computer that's asking, so you can't answer from here. On that computer, run",
          )}{" "}
          <code>/agent-lounge:away pair</code> {t("і відкрий посилання тут.", "and open the link here.")}
        </p>
      ) : body?.tool === "AskUserQuestion" ? (
        <Questions questions={body.input.questions} onReply={(answers) => asks.reply(a, answers)} />
      ) : (
        <div className="ask-btns">
          <button className="btn ask-yes" onClick={() => asks.answer(a, true)}>
            {body ? t("затвердити план", "approve plan") : t("дозволити раз", "allow once")}
          </button>
          <button className="btn" onClick={() => asks.answer(a, false)}>
            {body ? t("ні, хай планує далі", "no, keep planning") : t("заборонити", "deny")}
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
  const ui = useUi();
  const t = useTr();
  if (asks.until == null) return null;
  const open = asks.asks.filter((a) => a.at + ASK_MS > now && !settled.has(a.id));

  return (
    <div className={`notice asks ${open.length ? "asks-now" : ""}`} role={open.length ? "alert" : "status"}>
      <div className="away-hd">
        <span>
          <ShieldQuestion size={14} />{" "}
          {t(
            `Ти не за комп'ютером до ${clock(asks.until, ui)}: коли Claude просить дозволу, питає чи показує план, це чекає тут.`,
            `You're away until ${clock(asks.until, ui)}: when Claude asks for permission, asks a question or shows a plan, it waits here.`,
          )}
        </span>
        <button className="btn" disabled={asks.busy} onClick={asks.back}>
          {t("я повернувся", "I'm back")}
        </button>
      </div>
      {asks.failed && <p className="ask-unpaired">{asks.failed}</p>}
      {open.map((a) => (
        <AskRow key={a.id} a={a} now={now} asks={asks} onOpen={onOpen} />
      ))}
    </div>
  );
}
