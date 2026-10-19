"use client";

import { CSSProperties, ReactNode, useEffect, useEffectEvent, useState } from "react";
import { X } from "lucide-react";
import { CafeModel } from "@/lib/cafe/model";
import { AgentView } from "@/lib/cafe/timeline";
import { Two, Ui, enPlural, tr, useTr, useUi } from "@/lib/i18n";
import { LookPick, NAME_MAX } from "@/lib/live/interior";
import { REACTIONS } from "@/lib/live/social";
import { chip, line, said, useSpeech } from "@/lib/live/speech";
import { badge, plural } from "../live/format";
import { fmtTokens } from "../live/tokens";
import { PROP_NAMES, potAt, propIndex, propName } from "./desk";
import { LOOK_CHOICES, lookIndex, pickedLook } from "./people";

const LAST = 5;

function span(ms: number, ui: Ui): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return tr(ui, "менше хвилини", "under a minute");
  if (m < 60) return tr(ui, `${m} хв`, `${m} min`);
  return tr(ui, `${Math.floor(m / 60)} год ${m % 60} хв`, `${Math.floor(m / 60)} h ${m % 60} min`);
}

function since(ms: number, ui: Ui): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return tr(ui, `${s} с`, `${s}s`);
  const m = Math.round(s / 60);
  return m < 60 ? tr(ui, `${m} хв`, `${m} min`) : tr(ui, `${Math.round(m / 60)} год`, `${Math.round(m / 60)} h`);
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
  const t = useTr();
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
      <button className="scene-pop-x" onClick={onClose} aria-label={t("закрити", "close")}>
        <X size={13} />
      </button>
      {children}
    </div>
  );
}

const STYLES: Two[] = [
  { uk: "навушники", en: "headphones" },
  { uk: "довге волосся", en: "long hair" },
  { uk: "гулька", en: "bun" },
  { uk: "кепка", en: "cap" },
];

function NickField({ value, color, onSave }: { value?: string; color: string; onSave: (v: string) => void }) {
  const t = useTr();
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
        aria-label={t("табличка з ім'ям", "name tag")}
        placeholder={t("табличка з ім'ям", "name tag")}
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
  const ui = useUi();
  const t = useTr();
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
    <div className="ac-look" role="group" aria-label={t("вигляд агента", "agent's look")}>
      <button onClick={() => next("style")} title={t("наступна зачіска", "next hairstyle")}>
        {STYLES[cur.style]?.[ui]}
      </button>
      <button onClick={() => next("hair")} title={t("наступний колір волосся", "next hair colour")}>
        {sw(pickedLook({ hair: cur.hair }).hair)} {t("волосся", "hair")}
      </button>
      <button onClick={() => next("skin")} title={t("наступний відтінок шкіри", "next skin tone")}>
        {sw(pickedLook({ skin: cur.skin }).skin)} {t("шкіра", "skin")}
      </button>
      <button onClick={() => put({ shirt })} title={t("наступний колір одягу", "next clothes colour")}>
        {sw(pickedLook({ shirt: pick?.shirt }).shirt ?? color)} {t("одяг", "clothes")}
      </button>
      <button
        onClick={() => put({ prop: (prop + 1) % PROP_NAMES.length })}
        title={t("що стоїть на столі", "what's on the desk")}
      >
        {t("на столі", "desk")}: {propName(prop, ui)}
      </button>
      {pick && (
        <button onClick={() => onLook(null)} title={t("повернути як було", "back to the original look")}>
          {t("як було", "reset")}
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
  const ui = useUi();
  const t = useTr();
  const carrying = !!view.walker?.carrying || (view.walker?.give ?? -1) >= 0;
  const b = asking
    ? { cls: "rr-ask", text: said("b_ask", sp, t("чекає на тебе", "waiting for you")) }
    : badge(view, carrying, sp);
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
        <span className="ac-k">{t("зараз", "now")}</span>
        <span>{now || said("idle_now", sp, t("нічого не робить, чекає задачу", "idle, waiting for a task"))}</span>
      </div>
      {fill != null && (
        <div
          className="ac-now"
          title={t(
            "кавник на столі: скільки контексту вже зайнято; стиснення його спорожнює",
            "the coffee pot on the desk: how much context is used; compacting empties it",
          )}
        >
          <span className="ac-k">{t("контекст", "context")}</span>
          <span>{Math.round(fill * 100)}%</span>
        </div>
      )}
      <div className="ac-stats">
        <div>
          <b>{span(worked, ui)}</b>
          <span>{t("у роботі", "worked")}</span>
        </div>
        <div>
          <b>{notes.length}</b>
          <span>{t(plural(notes.length, "дія", "дії", "дій"), enPlural(notes.length, "action", "actions"))}</span>
        </div>
        <div
          title={
            a.tokens == null
              ? t("токени з'являться, коли хук почне їх надсилати", "tokens show up once the hook starts sending them")
              : undefined
          }
        >
          <b>{a.tokens == null ? "—" : fmtTokens(a.tokens, ui)}</b>
          <span>{t("токенів", "tokens")}</span>
        </div>
      </div>
      {recent.length > 0 && (
        <ol className="ac-log">
          {recent.map((n) => (
            <li key={n.key} className={`tone-${n.tone}`}>
              <span className="ac-ago">{since(clock - n.ts, ui)}</span>
              {chip(n.tool, sp) && <span className="ac-tool">{chip(n.tool, sp)}</span>}
              <span className="ac-txt">{line(n, sp)}</span>
            </li>
          ))}
        </ol>
      )}
      {onReact && (
        <div className="ac-react" role="group" aria-label={t("кинути реакцію", "send a reaction")}>
          {REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => onReact(e)}
              title={t("усі в кафе побачать над столом", "everyone in the café sees it above the desk")}
            >
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
