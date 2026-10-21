"use client";

import { useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { Two, Ui, useTr, useUi } from "@/lib/i18n";
import { Ask, ASK_MS, AskQuestion, OWN_MAX, recommended } from "@/lib/live/asks";
import { Asks } from "@/lib/live/useAsks";

const clock = (t: number, ui: Ui) =>
  new Date(t).toLocaleTimeString(ui === "en" ? "en-GB" : "uk-UA", { hour: "2-digit", minute: "2-digit" });

const WANTS: Record<"AskUserQuestion" | "ExitPlanMode", Two> = {
  AskUserQuestion: { uk: "питає", en: "asks" },
  ExitPlanMode: { uk: "пропонує план", en: "proposes a plan" },
};

/** A text of your own, folded behind a small link until you want it. */
function Own({
  value,
  label,
  hint,
  onChange,
}: {
  value: string;
  label: string;
  hint: string;
  onChange: (text: string) => void;
}) {
  const [open, setOpen] = useState(value !== "");
  if (!open) {
    return (
      <button className="ask-link" onClick={() => setOpen(true)}>
        ✎ {label}
      </button>
    );
  }
  return (
    <input
      className="ask-own"
      autoFocus
      value={value}
      maxLength={OWN_MAX}
      placeholder={hint}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

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
          <p className="ask-q-text">
            {q.question}
            {q.multiSelect && <small> · {t("можна кілька", "pick any")}</small>}
          </p>
          <div className="ask-opts" role={q.multiSelect ? "group" : "radiogroup"} aria-label={q.question}>
            {q.options.map((o) => {
              const on = !!picked[q.question]?.includes(o.label);
              const { text, best } = recommended(o.label);
              return (
                <button
                  key={o.label}
                  className={`ask-opt ${on ? "on" : ""} ${best ? "best" : ""}`}
                  role={q.multiSelect ? "checkbox" : "radio"}
                  aria-checked={on}
                  onClick={() => pick(q, o.label)}
                >
                  <span className="ask-opt-l">
                    {text}
                    {best && <em className="ask-best">★ {t("радить Claude", "Claude's pick")}</em>}
                  </span>
                  {o.description && <small>{o.description}</small>}
                </button>
              );
            })}
          </div>
          <Own
            value={own[q.question] ?? ""}
            label={t("свій варіант", "your own answer")}
            hint={
              q.multiSelect
                ? t("додасться після вибраних", "goes after the ones picked")
                : t("замість варіантів вище", "instead of the options above")
            }
            onChange={(text) => write(q, text)}
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

function AskRow({
  a,
  now,
  more,
  asks,
  onOpen,
}: {
  a: Ask;
  now: number;
  /** how many more wait after this one */
  more: number;
  asks: Asks;
  onOpen: (session: string) => void;
}) {
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
      <div className="ask-hd">
        <span>
          <button className="ask-chat" onClick={() => onOpen(a.session)}>
            {a.label}
          </button>{" "}
          {body ? WANTS[body.tool][ui] : t("просить дозволу", "asks permission")}
        </span>
        <span
          className="ask-left"
          title={t(`за ${left} хв спитає в терміналі`, `in ${left} min it asks in the terminal`)}
        >
          {more > 0 && t(`ще ${more} · `, `${more} more · `)}
          {t(`${left} хв`, `${left} min`)}
        </span>
      </div>
      {!body && <code className="ask-cmd">{detail}</code>}
      {!body && a.change != null && (
        <details>
          <summary>{t("що саме зміниться", "what exactly changes")}</summary>
          <pre className="ask-plan">{a.change}</pre>
        </details>
      )}
      {body?.tool === "ExitPlanMode" && <pre className="ask-plan">{body.input.plan}</pre>}
      {!asks.canAnswer(a) ? (
        <p className="ask-note">
          {t(
            "Цей браузер не спарено з комп'ютером, який питає, тож відповісти звідси не можна. На тому комп'ютері запусти",
            "This browser isn't paired with the computer that's asking, so you can't answer from here. On that computer, run",
          )}{" "}
          <code>/agent-lounge:away pair</code> {t("і відкрий посилання тут.", "and open the link here.")}
        </p>
      ) : body?.tool === "AskUserQuestion" ? (
        <Questions questions={body.input.questions} onReply={(answers) => asks.reply(a, answers)} />
      ) : (
        <>
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
              ✓ {body ? t("затвердити", "approve") : t("дозволити раз", "allow once")}
            </button>
            <button className="btn ask-no" onClick={() => asks.answer(a, false, note)}>
              ✗ {body ? t("ні, хай доробить", "no, keep planning") : t("ні", "deny")}
            </button>
          </div>
          <Own
            value={note}
            label={body ? t("що змінити в плані", "what to change") : t("пояснити «ні»", "say why not")}
            hint={t("Claude прочитає це разом із «ні»", "Claude reads it with the “no”")}
            onChange={setNote}
          />
        </>
      )}
    </div>
  );
}

/**
 * While the user is away from the computer: the permission prompt, question or plan Claude has waited on longest, to
 * answer from here, one at a time, and the switch's state with a way back. `settled` holds the ones the terminal has
 * already answered.
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
  const open = asks.asks.filter((a) => a.at + ASK_MS > now && !settled.has(a.id)).sort((x, y) => x.at - y.at);
  const first = open[0];

  return (
    <section className={`card asks ${first ? "asks-now" : ""}`} role={first ? "alert" : "status"}>
      {first && <AskRow key={first.id} a={first} now={now} more={open.length - 1} asks={asks} onOpen={onOpen} />}
      {asks.failed && <p className="ask-note">{asks.failed}</p>}
      <div className="away-ft">
        <span>
          <ShieldQuestion size={14} />
          {first
            ? t(`Ти не за комп'ютером до ${clock(asks.until, ui)}`, `You're away until ${clock(asks.until, ui)}`)
            : t(
                `Ти не за комп'ютером до ${clock(asks.until, ui)}: питання Claude прийдуть сюди`,
                `You're away until ${clock(asks.until, ui)}: Claude's questions will come here`,
              )}
        </span>
        <button className="btn" disabled={asks.busy} onClick={asks.back}>
          {t("я повернувся", "I'm back")}
        </button>
      </div>
    </section>
  );
}
