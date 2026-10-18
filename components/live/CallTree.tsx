"use client";

import { useMemo } from "react";
import { CallNode, Turn, callTree, countCalls } from "@/lib/live/callTree";
import { Speech } from "@/lib/live/speech";
import { LiveEvent } from "@/lib/live/types";
import { clockTime, logText, plural } from "./format";

const TURNS = 30;

function took(ms: number | null): string | null {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  if (s < 1) return "<1 с";
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} хв ${s % 60} с` : `${m} хв`;
  return `${Math.floor(m / 60)} год ${m % 60} хв`;
}

type ColorOf = (agent?: string) => string;

const actions = (n: number) => `${n} ${plural(n, "дія", "дії", "дій")}`;

interface CallsProps {
  calls: CallNode[];
  sp: Speech;
  colorOf: ColorOf;
  /** the turn has its answer, so a handoff with no start seen will not start any more */
  answered: boolean;
}

function state(c: CallNode, answered: boolean): string {
  if (c.done) return ` · ${took(c.ms) ?? ""}`;
  if (c.agent) return " · працює";
  return answered ? " · Agent Lounge не бачив старту" : " · чекає старту";
}

function Calls({ calls, sp, colorOf, answered }: CallsProps) {
  return (
    <ul className="tree-calls">
      {calls.map((c) =>
        c.calls ? (
          <li key={`a:${c.agent ?? c.e.seq}`}>
            <details open className="tree-sub">
              <summary>
                <span className="log-time">{c.e.at ? clockTime(c.e.at) : ""}</span>
                <span className="log-dot" style={{ background: colorOf(c.agent) }} />
                <b style={{ color: colorOf(c.agent) }}>{c.agentType ?? c.e.target ?? "агент"}</b>
                <span className="log-msg">{c.e.text ?? ""}</span>
                <span className="tree-took">
                  {actions(countCalls(c.calls))}
                  {state(c, answered)}
                </span>
              </summary>
              <Calls calls={c.calls} sp={sp} colorOf={colorOf} answered={answered} />
            </details>
          </li>
        ) : (
          <li key={c.e.seq} className={`tree-call ${c.e.kind}`}>
            <span className="log-time">{clockTime(c.e.at)}</span>
            <span className="log-msg">{logText(c.e, sp)}</span>
            {took(c.ms) && <span className="tree-took">{took(c.ms)}</span>}
          </li>
        ),
      )}
    </ul>
  );
}

function TurnRow({ t, open, sp, colorOf }: { t: Turn; open: boolean; sp: Speech; colorOf: ColorOf }) {
  const at = t.prompt?.at ?? t.calls[0]?.e.at;
  return (
    <details open={open} className="tree-turn">
      <summary>
        <span className="log-time">{at ? clockTime(at) : ""}</span>
        <b className="tree-q">{t.prompt ? (t.prompt.text ?? "питання") : "до першого питання в журналі"}</b>
        <span className="tree-took">
          {actions(countCalls(t.calls))} · {t.answered ? "відповів" : "працює"}
        </span>
      </summary>
      {t.calls.length ? (
        <Calls calls={t.calls} sp={sp} colorOf={colorOf} answered={t.answered} />
      ) : (
        <p className="muted-sm tree-none">ще жодної дії</p>
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
  const turns = useMemo(() => callTree(events), [events]);
  const shown = turns.slice(-TURNS);
  if (!turns.length) return <p className="muted-sm tree-none">Поки порожньо: дерево з&apos;явиться з першою дією.</p>;
  return (
    <div className="tree">
      {turns.length > shown.length && (
        <p className="muted-sm tree-none">ще {turns.length - shown.length} давніших питань у журналі сховано</p>
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
        Біля кожної дії — скільки часу минуло до наступної дії того самого агента. Agent Lounge бачить лише короткий
        опис дії, без вмісту файлів і відповідей.
      </p>
    </div>
  );
}
