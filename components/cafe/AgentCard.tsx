"use client";

import { CSSProperties, ReactNode, useEffect, useEffectEvent, useState } from "react";
import { X } from "lucide-react";
import { CafeModel } from "@/lib/cafe/model";
import { AgentView } from "@/lib/cafe/timeline";
import { Two, Ui, enPlural, tr, useTr, useUi } from "@/lib/i18n";
import { COSTUMES, Costume, LookPick, NAME_MAX } from "@/lib/live/interior";
import { useHalloween } from "@/lib/live/season";
import { Eta, etaDetail } from "@/lib/live/eta";
import { fmtCost, modelName } from "@/lib/live/price";
import { REACTIONS } from "@/lib/live/social";
import { Speech, chip, line, said, useSpeech } from "@/lib/live/speech";
import { badge, plural } from "../live/format";
import { fmtTokens } from "../live/tokens";
import { PROP_NAMES, potAt, propIndex, propName } from "./desk";
import { LOOK_CHOICES, hideOf, lookIndex, pickedLook } from "./people";

const LAST = 5;
/** the crew shows agents that worked this long before the card's moment, or still do */
const CREW_RECENT_MS = 3 * 3600 * 1000;
const CREW_MAX = 8;

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

const KINDS: Two[] = [
  { uk: "людина", en: "person" },
  { uk: "робот", en: "robot" },
  { uk: "кіт", en: "cat" },
  { uk: "прибулець", en: "alien" },
];

/** what the skin pick is called for each kind */
const HIDES: Two[] = [
  { uk: "шкіра", en: "skin" },
  { uk: "метал", en: "metal" },
  { uk: "шерсть", en: "fur" },
  { uk: "колір", en: "colour" },
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

const COSTUME_NAMES: Record<Costume, Two> = {
  hat: { uk: "🧙 відьма", en: "🧙 witch" },
  pumpkin: { uk: "🎃 гарбуз", en: "🎃 pumpkin" },
  ghost: { uk: "👻 привид", en: "👻 ghost" },
  vampire: { uk: "🧛 вампір", en: "🧛 vampire" },
  devil: { uk: "😈 чорт", en: "😈 devil" },
};

/** Puts a costume from the café's wardrobe on this agent, anyone's agent: everyone in the café sees it. */
function DressRow({
  costume,
  wardrobe,
  onDress,
}: {
  costume: Costume | null;
  wardrobe: Costume[];
  onDress: (c: Costume | null) => void;
}) {
  const ui = useUi();
  const t = useTr();
  const week = useHalloween().week;
  if (!wardrobe.length && !costume) {
    if (!week) return null;
    return (
      <p className="ac-dress-hint muted-sm">
        {t(
          "👻 Перевдягнути агента в привида чи гарбуза: костюми в магазині, до 1 листопада",
          "👻 Dress this agent up as a ghost or a pumpkin: costumes are in the shop until 1 November",
        )}
      </p>
    );
  }
  return (
    <div
      className="ac-look ac-dress"
      role="group"
      aria-label={t("костюм", "costume")}
      title={t("усі в кафе побачать, і господар теж", "everyone in the café sees it, the owner too")}
    >
      {COSTUMES.filter((c) => wardrobe.includes(c) || c === costume).map((c) => (
        <button
          key={c}
          className={c === costume ? "on" : undefined}
          aria-pressed={c === costume}
          onClick={() => onDress(c === costume ? null : c)}
        >
          {COSTUME_NAMES[c][ui]}
        </button>
      ))}
      {costume && (
        <button onClick={() => onDress(null)} title={t("зняти костюм", "take the costume off")}>
          {t("зняти", "take off")}
        </button>
      )}
    </div>
  );
}

/** The buttons that change one agent's look, and its desk plate: in its card and in the café's settings. */
export function LookRow({
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
  const kind = pick?.kind ?? 0;
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
      <button
        onClick={() => put({ kind: (kind + 1) % LOOK_CHOICES.kind || undefined })}
        title={t(
          "хто за столом: людина, робот, кіт чи прибулець",
          "who sits at the desk: a person, a robot, a cat or an alien",
        )}
      >
        {KINDS[kind][ui]}
      </button>
      {kind === 0 && (
        <button onClick={() => next("style")} title={t("наступна зачіска", "next hairstyle")}>
          {STYLES[cur.style]?.[ui]}
        </button>
      )}
      {kind === 0 && (
        <button onClick={() => next("hair")} title={t("наступний колір волосся", "next hair colour")}>
          {sw(pickedLook({ hair: cur.hair }).hair)} {t("волосся", "hair")}
        </button>
      )}
      <button onClick={() => next("skin")} title={t("наступний відтінок", "next shade")}>
        {sw(hideOf(kind, cur.skin))} {HIDES[kind][ui]}
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

function crewState(model: CafeModel, i: number, clock: number): "work" | "done" | "idle" {
  const s = model.stints[i].filter((x) => x.start <= clock);
  const last = s.at(-1);
  if (last && last.end > clock) return "work";
  return model.notes[i].findLast((n) => n.ts <= clock)?.tone === "done" ? "done" : "idle";
}

/** Who handed this agent its task, and whom it handed work to in turn, nested, with what each does now. */
function Crew({
  model,
  agent,
  clock,
  nameOf,
  onPick,
  sp,
}: {
  model: CafeModel;
  agent: number;
  clock: number;
  nameOf: (i: number) => string;
  onPick?: (i: number) => void;
  sp: Speech;
}) {
  const t = useTr();
  const recent = (j: number) => model.stints[j].some((s) => s.start <= clock && s.end > clock - CREW_RECENT_MS);
  const kids = (i: number) => model.agents.flatMap((a, j) => (j !== i && a.parent === i && recent(j) ? [j] : []));
  const rows: { i: number; depth: number }[] = [];
  const walk = (i: number, depth: number) => {
    for (const j of kids(i)) {
      if (rows.length >= CREW_MAX || rows.some((r) => r.i === j)) continue;
      rows.push({ i: j, depth });
      if (depth < 3) walk(j, depth + 1);
    }
  };
  walk(agent, 0);
  const more = kids(agent).length - rows.filter((r) => r.depth === 0).length;
  const parent = agent > 0 ? model.agents[agent].parent : undefined;
  if (parent == null && !rows.length) return null;
  const pick = (i: number) => (onPick ? { onClick: () => onPick(i) } : {});
  return (
    <div className="ac-crew">
      <span className="ac-k">{t("хто кого запустив", "who started whom")}</span>
      {parent != null && (
        <button className="ac-crew-up" {...pick(parent)} disabled={!onPick}>
          ↑ {t("запустив", "started by")} <b>{nameOf(parent)}</b>
        </button>
      )}
      {rows.map(({ i, depth }) => {
        const st = crewState(model, i, clock);
        const n = model.notes[i].findLast((x) => x.ts <= clock);
        const doing = st === "work" ? (n ? line(n, sp) : "") : st === "done" ? t("готово", "done") : t("чекає", "idle");
        return (
          <button
            key={i}
            className={`ac-crew-row cr-${st}`}
            style={{ "--d": depth, "--c": model.agents[i].color } as CSSProperties}
            {...pick(i)}
            disabled={!onPick}
          >
            <i aria-hidden />
            <b>{nameOf(i)}</b>
            <span>{doing}</span>
          </button>
        );
      })}
      {more > 0 && <span className="ac-crew-more">{t(`і ще ${more}`, `and ${more} more`)}</span>}
    </div>
  );
}

export function AgentCard({
  model,
  view,
  agent,
  clock,
  eta,
  nameOf,
  asking,
  onReact,
  look,
  onLook,
  costume,
  wardrobe,
  onDress,
  stuck,
  onPick,
}: {
  model: CafeModel;
  view: AgentView;
  agent: number;
  clock: number;
  /** why this agent looks stuck: going in circles, or the job running long past Claude's own estimate */
  stuck?: string;
  /** opens another agent's card, from the crew */
  onPick?: (i: number) => void;
  /** the guess of the time this agent's job has left */
  eta?: Eta | null;
  /** an agent's name as the scene shows it, for "waiting on …" */
  nameOf?: (i: number) => string;
  asking?: string;
  onReact?: (emoji: string) => void;
  look?: LookPick;
  /** lets the café owner change how this agent looks */
  onLook?: (pick: LookPick | null) => void;
  costume?: Costume | null;
  /** the costumes there are to put on */
  wardrobe?: Costume[];
  /** lets anyone in the café dress this agent up */
  onDress?: (c: Costume | null) => void;
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
  const name = nameOf ?? ((i: number) => model.agents[i].name);
  const allCost = model.agents.reduce((s, x) => s + (x.cost ?? 0), 0);
  const share = a.cost && allCost > a.cost ? Math.round((a.cost / allCost) * 100) : null;
  const u = a.usage;
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
      {stuck && (
        <p className="ac-warn" role="alert">
          <b>!</b> {stuck}
        </p>
      )}
      <div className="ac-now">
        <span className="ac-k">{t("зараз", "now")}</span>
        <span>{now || said("idle_now", sp, t("нічого не робить, чекає задачу", "idle, waiting for a task"))}</span>
      </div>
      {eta && (
        <div
          className="ac-now"
          title={t(
            "приблизно: за темпом списку задач агента, а без нього за тим, скільки цей агент працював раніше",
            "a rough guess: from the pace of the agent's task list, or else from how long this agent took before",
          )}
        >
          <span className="ac-k">{t("лишилось", "time left")}</span>
          <span>{etaDetail(eta, ui, nameOf ?? ((i) => model.agents[i].name))}</span>
        </div>
      )}
      {fill != null && (
        <div
          className="ac-now"
          title={t(
            "кавник на столі: скільки контексту вже зайнято; стиснення його спорожнює",
            "the coffee pot on the desk: how much context is used; compacting empties it",
          )}
        >
          <span className="ac-k">{t("контекст", "context")}</span>
          <span>
            {Math.round(fill * 100)}%
            {a.ctxSize != null &&
              t(
                ` · ${fmtTokens(fill * a.ctxSize, ui)} з ${fmtTokens(a.ctxSize, ui)}, лишилось ~${fmtTokens((1 - fill) * a.ctxSize, ui)}`,
                ` · ${fmtTokens(fill * a.ctxSize, ui)} of ${fmtTokens(a.ctxSize, ui)}, ~${fmtTokens((1 - fill) * a.ctxSize, ui)} left`,
              )}
          </span>
        </div>
      )}
      {a.cost != null && (
        <div
          className="ac-now"
          title={t(
            "що ці токени коштували б за цінами API; на підписці Pro чи Max це не гроші, а частка ліміту: дорожча модель з'їдає його швидше",
            "what these tokens would cost at API prices; on a Pro or Max plan it isn't money but a share of the limit: a pricier model eats it faster",
          )}
        >
          <span className="ac-k">{t("витрати", "cost")}</span>
          <span>
            {a.costPart ? "≥ " : "≈ "}
            {fmtCost(a.cost)}
            {a.model && ` · ${modelName(a.model)}`}
            {share != null && t(` · ${share}% витрат чату`, ` · ${share}% of the chat's`)}
          </span>
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
              : u &&
                t(
                  `вхід ${fmtTokens(u.in, ui)} · запис у кеш ${fmtTokens(u.cw, ui)} · читання з кешу ${fmtTokens(u.cr, ui)} · вихід ${fmtTokens(u.out, ui)}`,
                  `input ${fmtTokens(u.in, ui)} · cache write ${fmtTokens(u.cw, ui)} · cache read ${fmtTokens(u.cr, ui)} · output ${fmtTokens(u.out, ui)}`,
                )
          }
        >
          <b>{a.tokens == null ? "—" : fmtTokens(a.tokens, ui)}</b>
          <span>{t("токенів", "tokens")}</span>
        </div>
      </div>
      <Crew model={model} agent={agent} clock={clock} nameOf={name} onPick={onPick} sp={sp} />
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
      {onDress && <DressRow costume={costume ?? null} wardrobe={wardrobe ?? []} onDress={onDress} />}
    </div>
  );
}
