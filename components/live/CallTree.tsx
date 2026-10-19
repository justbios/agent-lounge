"use client";

import { useMemo } from "react";
import { Ui, enPlural, tr, useUi } from "@/lib/i18n";
import { CallNode, Turn, callTree, countCalls } from "@/lib/live/callTree";
import { Speech } from "@/lib/live/speech";
import { LiveEvent } from "@/lib/live/types";
import { clockTime, logText, plural } from "./format";

const TURNS = 30;

function took(ms: number | null, ui: Ui): string | null {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  if (s < 1) return tr(ui, "<1 с", "<1s");
  if (s < 60) return tr(ui, `${s} с`, `${s}s`);
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? tr(ui, `${m} хв ${s % 60} с`, `${m} min ${s % 60}s`) : tr(ui, `${m} хв`, `${m} min`);
  return tr(ui, `${Math.floor(m / 60)} год ${m % 60} хв`, `${Math.floor(m / 60)} h ${m % 60} min`);
}

type ColorOf = (agent?: string) => string;

const actions = (n: number, ui: Ui) =>
  tr(ui, `${n} ${plural(n, "дія", "дії", "дій")}`, `${n} ${enPlural(n, "action", "actions")}`);

interface CallsProps {
  calls: CallNode[];
  sp: Speech;
  colorOf: ColorOf;
  /** the turn has its answer, so a handoff with no start seen will not start any more */
  answered: boolean;
}

function state(c: CallNode, answered: boolean, ui: Ui): string {
  if (c.done) return ` · ${took(c.ms, ui) ?? ""}`;
  if (c.agent) return tr(ui, " · працює", " · working");
  return answered
    ? tr(ui, " · Agent Lounge не бачив старту", " · Agent Lounge never saw it start")
    : tr(ui, " · чекає старту", " · waiting to start");
}

function Calls({ calls, sp, colorOf, answered }: CallsProps) {
  const ui = useUi();
  return (
    <ul className="tree-calls">
      {calls.map((c) =>
        c.calls ? (
          <li key={`a:${c.agent ?? c.e.seq}`}>
            <details open className="tree-sub">
              <summary>
                <span className="log-time">{c.e.at ? clockTime(c.e.at) : ""}</span>
                <span className="log-dot" style={{ background: colorOf(c.agent) }} />
                <b style={{ color: colorOf(c.agent) }}>{c.agentType ?? c.e.target ?? tr(ui, "агент", "agent")}</b>
                <span className="log-msg">{c.e.text ?? ""}</span>
                <span className="tree-took">
                  {actions(countCalls(c.calls), ui)}
                  {state(c, answered, ui)}
                </span>
              </summary>
              <Calls calls={c.calls} sp={sp} colorOf={colorOf} answered={answered} />
            </details>
          </li>
        ) : (
          <li key={c.e.seq} className={`tree-call ${c.e.kind}`}>
            <span className="log-time">{clockTime(c.e.at)}</span>
            <span className="log-msg">{logText(c.e, sp)}</span>
            {took(c.ms, ui) && <span className="tree-took">{took(c.ms, ui)}</span>}
          </li>
        ),
      )}
    </ul>
  );
}

function TurnRow({ t, open, sp, colorOf }: { t: Turn; open: boolean; sp: Speech; colorOf: ColorOf }) {
  const ui = useUi();
  const at = t.prompt?.at ?? t.calls[0]?.e.at;
  return (
    <details open={open} className="tree-turn">
      <summary>
        <span className="log-time">{at ? clockTime(at) : ""}</span>
        <b className="tree-q">{t.prompt
            ? (t.prompt.text ?? tr(ui, "питання", "prompt"))
            : tr(ui, "до першого питання в журналі", "before the first prompt in the log")}</b>
        <span className="tree-took">
          {actions(countCalls(t.calls), ui)} ·{" "}
          {t.answered ? tr(ui, "відповів", "answered") : tr(ui, "працює", "working")}
        </span>
      </summary>
      {t.calls.length ? (
        <Calls calls={t.calls} sp={sp} colorOf={colorOf} answered={t.answered} />
      ) : (
        <p className="muted-sm tree-none">{tr(ui, "ще жодної дії", "no actions yet")}</p>
      )}
    </details>
  );
}

/** One chat's log as questions, Claude's calls for each, and every subagent's own calls nested under its handoff. */
export default function CallTree({
  events,
  sp,
  colorOf,
}: {
  events: LiveEvent[];
  sp: Speech;
  colorOf: ColorOf;
}) {
  const ui = useUi();
  const turns = useMemo(() => callTree(events), [events]);
  const shown = turns.slice(-TURNS);
  if (!turns.length)
    return (
      <p className="muted-sm tree-none">
        {tr(
          ui,
          "Поки порожньо: дерево з'явиться з першою дією.",
          "Empty for now: the tree appears with the first action.",
        )}
      </p>
    );
  const hidden = turns.length - shown.length;
  return (
    <div className="tree">
      {hidden > 0 && (
        <p className="muted-sm tree-none">
          {tr(
            ui,
            `ще ${hidden} давніших питань у журналі сховано`,
            `${hidden} older ${enPlural(hidden, "prompt", "prompts")} hidden`,
          )}
        </p>
      )}
      {shown.map((t, i) => (
        <TurnRow
          key={t.prompt?.seq ?? `pre:${i}`}
          t={t}
          open={i === shown.length - 1}
          sp={sp}
          colorOf={colorOf}
        />
      ))}
      <p className="muted-sm tree-none">
        {tr(
          ui,
          "Біля кожної дії — скільки часу минуло до наступної дії того самого агента. Agent Lounge бачить лише " +
            "короткий опис дії, без вмісту файлів і відповідей.",
          "Next to each action: the time until the same agent's next action. Agent Lounge sees only a short " +
            "description of each action, never file contents or answers.",
        )}
      </p>
    </div>
  );
}
