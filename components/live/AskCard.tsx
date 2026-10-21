"use client";

import { useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { Two, Ui, useTr, useUi } from "@/lib/i18n";
import { Ask, ASK_MS, AskQuestion, OWN_MAX } from "@/lib/live/asks";
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
  // a text of your own: one choice takes it instead of an option, several take it after the options
  const [own, setOwn] = useState<Record<string, string>>({});
  const pick = (q: AskQuestion, label: string) => {
    setPicked((p) => {
      const was = p[q.question] ?? [];
      if (!q.multiSelect) return { ...p, [q.question]: [label] };
      return { ...p, [q.question]: was.includes(label) ? was.filter((l) => l !== label) : [...was, label] };
    });
    if (!q.multiSelect) setOwn((o) => ({ ...o, [q.question]: "" }));
  };
  const write = (q: AskQuestion, text: string) => {
    setOwn((o) => ({ ...o, [q.question]: text }));
    if (!q.multiSelect && text.trim()) setPicked((p) => ({ ...p, [q.question]: [] }));
  };
  const answers = Object.fromEntries(
    questions.map((q) => {
      const text = own[q.question]?.trim();
      return [q.question, [...new Set([...(picked[q.question] ?? []), ...(text ? [text] : [])])]];
    }),
  );
  const ready = questions.every((q) => answers[q.question].length);

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
          <input
            className="ask-own"
            value={own[q.question] ?? ""}
            maxLength={OWN_MAX}
            placeholder={
              q.multiSelect
                ? t("і свій варіант, якщо треба…", "and your own, if needed…")
                : t("або свій варіант…", "or your own answer…")
            }
            aria-label={t(`Свій варіант: ${q.question}`, `Your own answer: ${q.question}`)}
            onChange={(e) => write(q, e.target.value)}
          />
        </div>
      ))}
      <div className="ask-btns">
        <button className="btn ask-yes" disabled={!ready} onClick={() => onReply(answers)}>
          {t("відповісти", "answer")}
        </button>
      </div>
    </>
  );
}

function AskRow({ a, now, asks, onOpen }: { a: Ask; now: number; asks: Asks; onOpen: (session: string) => void }) {
  const ui = useUi();
  const t = useTr();
  // why not, or what to change in the plan: Claude reads it with the «no»
  const [note, setNote] = useState("");
  const body = a.body;
  const why = note.trim() !== "";
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
        <div className="ask-say">
          <input
            className="ask-own"
            value={note}
            maxLength={OWN_MAX}
            placeholder={
              body
                ? t("що змінити в плані: піде разом із «ні»", "what to change: sent with “no”")
                : t("чому ні: піде разом із «заборонити»", "why not: sent with “deny”")
            }
            aria-label={body ? t("Що змінити в плані", "What to change in the plan") : t("Чому ні", "Why not")}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="ask-btns">
            <button
              className="btn ask-yes"
              disabled={why}
              title={
                why
                  ? t("Ти написав, чому ні: зітри це, щоб дозволити", "You wrote why not: clear it to allow")
                  : undefined
              }
              onClick={() => asks.answer(a, true)}
            >
              {body ? t("затвердити план", "approve plan") : t("дозволити раз", "allow once")}
            </button>
            <button className={why ? "btn ask-no" : "btn"} onClick={() => asks.answer(a, false, note)}>
              {body ? t("ні, хай планує далі", "no, keep planning") : t("заборонити", "deny")}
            </button>
          </div>
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
