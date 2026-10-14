"use client";

import { CSSProperties, ReactNode, useEffect, useEffectEvent, useState } from "react";
import { X } from "lucide-react";
import { CafeModel } from "@/lib/cafe/model";
import { AgentView } from "@/lib/cafe/timeline";
import { LookPick, NAME_MAX } from "@/lib/live/interior";
import { REACTIONS } from "@/lib/live/social";
import { chip, line, said, useSpeech } from "@/lib/live/speech";
import { badge, plural } from "../live/format";
import { fmtTokens } from "../live/tokens";
import { PROP_NAMES, potAt, propIndex } from "./desk";
import { LOOK_CHOICES, lookIndex, pickedLook } from "./people";

const LAST = 5;

function span(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return "менше хвилини";
  if (m < 60) return `${m} хв`;
  return `${Math.floor(m / 60)} год ${m % 60} хв`;
}

function since(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} с`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} хв` : `${Math.round(m / 60)} год`;
}

/** A pinned popover over the scene; closes on Escape or the ×. */
export function ScenePop({
  anchor,
  color,
  label,
  onClose,
  children,
}: {
  anchor: { x: number; y: number; below: boolean; beside?: "left" | "right" };
  color?: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  const side = anchor.beside ? `beside-${anchor.beside}` : anchor.x < 0.3 ? "l" : anchor.x > 0.7 ? "r" : "c";
  const style = {
    left: `${anchor.x * 100}%`,
    top: `${anchor.y * 100}%`,
    "--c": color ?? "#8b6dff",
  } as CSSProperties;
  return (
    <div className={`scene-pop pop-${side} ${anchor.below ? "below" : "above"}`} style={style} role="dialog" aria-label={label}>
      <button className="scene-pop-x" onClick={onClose} aria-label="закрити">
        <X size={13} />
      </button>
      {children}
    </div>
  );
}

const STYLES = ["навушники", "довге волосся", "гулька", "кепка"];

function NickField({ value, color, onSave }: { value?: string; color: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value ?? "");
  const save = () => v.trim() !== (value ?? "") && onSave(v);
  return (
    <form
      className="ac-nick"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        aria-label="табличка з ім'ям"
        placeholder="табличка з ім'ям"
        value={v}
        maxLength={NAME_MAX}
        style={{ "--c": color } as CSSProperties}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
      />
    </form>
  );
}

function LookRow({
  base,
  desk,
  color,
  pick,
  onLook,
}: {
  base: number;
  desk: number;
  color: string;
  pick?: LookPick;
  onLook: (p: LookPick | null) => void;
}) {
  const def = lookIndex(base);
  const cur = { style: pick?.style ?? def.style, hair: pick?.hair ?? def.hair, skin: pick?.skin ?? def.skin };
  const prop = pick?.prop ?? desk;
  const put = (patch: Partial<LookPick>) => {
    const p: LookPick = { ...pick, ...patch };
    for (const k of Object.keys(p) as (keyof LookPick)[]) if (p[k] == null || p[k] === "") delete p[k];
    onLook(Object.keys(p).length ? p : null);
  };
  const next = (k: keyof typeof cur) => put({ [k]: (cur[k] + 1) % LOOK_CHOICES[k] });
  const shirt = pick?.shirt == null ? 0 : pick.shirt + 1 < LOOK_CHOICES.shirt ? pick.shirt + 1 : undefined;
  const sw = (c?: string) => <i className="ac-sw" style={{ background: c }} />;
  return (
    <div className="ac-look" role="group" aria-label="вигляд агента">
      <button onClick={() => next("style")} title="наступна зачіска">
        {STYLES[cur.style]}
      </button>
      <button onClick={() => next("hair")} title="наступний колір волосся">
        {sw(pickedLook({ hair: cur.hair }).hair)} волосся
      </button>
      <button onClick={() => next("skin")} title="наступний відтінок шкіри">
        {sw(pickedLook({ skin: cur.skin }).skin)} шкіра
      </button>
      <button onClick={() => put({ shirt })} title="наступний колір одягу">
        {sw(pickedLook({ shirt: pick?.shirt }).shirt ?? color)} одяг
      </button>
      <button onClick={() => put({ prop: (prop + 1) % PROP_NAMES.length })} title="що стоїть на столі">
        на столі: {PROP_NAMES[prop % PROP_NAMES.length]}
      </button>
      {pick && (
        <button onClick={() => onLook(null)} title="повернути як було">
          як було
        </button>
      )}
      <NickField value={pick?.name} color={color} onSave={(name) => put({ name })} />
    </div>
  );
}

export function AgentCard({
  model,
  view,
  agent,
  clock,
  asking,
  onReact,
  look,
  onLook,
}: {
  model: CafeModel;
  view: AgentView;
  agent: number;
  clock: number;
  asking?: string;
  onReact?: (emoji: string) => void;
  look?: LookPick;
  /** lets the café owner change how this agent looks */
  onLook?: (pick: LookPick | null) => void;
}) {
  const a = model.agents[agent];
  const notes = model.notes[agent].filter((n) => n.ts <= clock);
  const recent = notes.slice(-LAST).reverse();
  const worked = model.stints[agent].reduce((sum, s) => (s.start > clock ? sum : sum + Math.max(0, Math.min(s.end, clock) - s.start)), 0);
  const sp = useSpeech();
  const carrying = !!view.walker?.carrying || (view.walker?.give ?? -1) >= 0;
  const b = asking ? { cls: "rr-ask", text: said("b_ask", sp, "чекає на тебе") } : badge(view, carrying, sp);
  const fill = potAt(a.pot, clock);
  const now = asking ?? (view.screen === "work" || view.walker ? (recent[0] ? line(recent[0], sp) : a.work) : null);
  return (
    <div className="agent-card">
      <div className="ac-hd">
        <span className="ac-dot" />
        <div className="ac-who">
          <b>{look?.name ?? a.name}</b>
          <span>{look?.name ? `${a.name} · ${a.role}` : a.role}</span>
        </div>
        <span className={`rr-badge ${b.cls}`}>{b.text}</span>
      </div>
      <div className="ac-now">
        <span className="ac-k">зараз</span>
        <span>{now || said("idle_now", sp, "нічого не робить, чекає задачу")}</span>
      </div>
      {fill != null && (
        <div className="ac-now" title="кавник на столі: скільки контексту вже зайнято; стиснення його спорожнює">
          <span className="ac-k">контекст</span>
          <span>{Math.round(fill * 100)}%</span>
        </div>
      )}
      <div className="ac-stats">
        <div>
          <b>{span(worked)}</b>
          <span>у роботі</span>
        </div>
        <div>
          <b>{notes.length}</b>
          <span>{plural(notes.length, "дія", "дії", "дій")}</span>
        </div>
        <div title={a.tokens == null ? "токени з'являться, коли хук почне їх надсилати" : undefined}>
          <b>{a.tokens == null ? "—" : fmtTokens(a.tokens)}</b>
          <span>токенів</span>
        </div>
      </div>
      {recent.length > 0 && (
        <ol className="ac-log">
          {recent.map((n) => (
            <li key={n.key} className={`tone-${n.tone}`}>
              <span className="ac-ago">{since(clock - n.ts)}</span>
              {chip(n.tool, sp) && <span className="ac-tool">{chip(n.tool, sp)}</span>}
              <span className="ac-txt">{line(n, sp)}</span>
            </li>
          ))}
        </ol>
      )}
      {onReact && (
        <div className="ac-react" role="group" aria-label="кинути реакцію">
          {REACTIONS.map((e) => (
            <button key={e} onClick={() => onReact(e)} title="усі в кафе побачать над столом">
              {e}
            </button>
          ))}
        </div>
      )}
      {onLook && (
        <LookRow
          key={a.id}
          base={a.look ?? agent}
          desk={propIndex(model.seed, agent)}
          color={a.color}
          pick={look}
          onLook={onLook}
        />
      )}
    </div>
  );
}
