"use client";

import { CSSProperties, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Gauge, Timer, Users } from "lucide-react";
import { useTr, useUi } from "@/lib/i18n";
import { setClockPick, useClockPick } from "@/lib/live/clock";
import { CLOCKS, DuelKind, PARTY, TIMED, duelName } from "@/lib/live/duel";
import type { LookPick } from "@/lib/live/interior";
import { Guest } from "@/lib/live/social";
import { LEVELS, Level, SOLO_KINDS, botPlayer } from "@/lib/live/solo";
import { setSoloLevel, useSoloLevel, useSoloTally } from "@/lib/live/soloStore";
import { hallBack, hallCall, hallPick, hallSet, hallStart, hallTick } from "@/lib/live/sounds/hall";
import { Duels as DuelsState } from "@/lib/live/useDuels";
import type { AgentDef } from "@/lib/types";
import { PixelNum } from "../Arcade";
import GameArt from "./GameArt";
import RivalSprite from "./RivalSprite";
import { GAMES, rivalsOf } from "./games";
import { recallGame, recallRival, recalledRival } from "./last";

const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One choice out of a few, as a row of buttons: the arrows move it, as in any group of radio buttons. */
function Seg<T extends string | number>({
  label,
  icon,
  options,
  value,
  name,
  onPick,
}: {
  label: string;
  icon: ReactNode;
  options: readonly T[];
  value: T;
  name: (v: T) => ReactNode;
  onPick: (v: T, i: number) => void;
}) {
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = (options.indexOf(value) + d + options.length) % options.length;
    onPick(options[i], i);
    e.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[i]?.focus();
  };
  return (
    <div className="clock-pick" role="radiogroup" aria-label={label} onKeyDown={keys}>
      <span>
        {icon} {label}
      </span>
      <div className="clock-opts">
        {options.map((o, i) => (
          <button
            key={o}
            className={`btn${o === value ? " on" : ""}`}
            role="radio"
            aria-checked={o === value}
            tabIndex={o === value ? 0 : -1}
            onClick={() => onPick(o, i)}
          >
            {name(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The clock chess and draughts are offered with: none, or minutes a side. */
function ClockPick() {
  const t = useTr();
  const pick = useClockPick();
  return (
    <Seg
      label={t("годинник", "clock")}
      icon={<Timer size={13} />}
      options={CLOCKS}
      value={pick}
      name={(s) => (s ? t(`${s / 60} хв`, `${s / 60} min`) : t("без", "none"))}
      onPick={(s, i) => {
        setClockPick(s);
        hallSet(i);
      }}
    />
  );
}

/** How well the café's agents play, for this browser. */
function LevelPick() {
  const t = useTr();
  const level = useSoloLevel();
  const names: Record<Level, string> = {
    easy: t("легко", "easy"),
    normal: t("нормально", "normal"),
    hard: t("складно", "hard"),
  };
  return (
    <Seg
      label={t("рівень агента", "agent's level")}
      icon={<Gauge size={13} />}
      options={LEVELS}
      value={level}
      name={(l) => (
        <>
          <i className={`glevel glevel-${l}`} aria-hidden />
          {names[l]}
        </>
      )}
      onPick={(l, i) => {
        setSoloLevel(l);
        hallSet(i);
      }}
    />
  );
}

/**
 * The hall's wall of machines and, under the one picked, who to play with: one of the café's own agents, at once
 * and with nothing sent anywhere, or a guest, by invite. While an invite is out, the wait for its answer instead.
 */
export default function Lobby({
  duels,
  guests,
  online,
  agents,
  looks,
  game,
  onGame,
  picked,
  onPicked,
}: {
  duels: DuelsState;
  guests: Guest[];
  online: boolean;
  agents: AgentDef[];
  looks?: Record<string, LookPick>;
  /** the machine picked, kept by the caller so it is still picked after a match */
  game: DuelKind | null;
  onGame: (g: DuelKind) => void;
  /** the guests marked to invite */
  picked: string[];
  onPicked: (next: (list: string[]) => string[]) => void;
}) {
  const ui = useUi();
  const t = useTr();
  const pick = useClockPick();
  const level = useSoloLevel();
  const tally = useSoloTally();
  const barista = t("Бариста", "Barista");
  const rivals = useMemo(() => rivalsOf(agents, looks ?? {}, barista), [agents, looks, barista]);
  /** the machine under the pointer or the focus: its picture runs */
  const [hot, setHot] = useState<DuelKind | null>(null);
  const [eager, setEager] = useState<string | null>(null);
  const [cols, setCols] = useState(5);
  const [lastRival] = useState(recalledRival);
  const hall = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = hall.current;
    if (!el) return;
    const sized = new ResizeObserver(() =>
      setCols(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length)),
    );
    sized.observe(el);
    return () => sized.disconnect();
  }, []);

  // the arrows work the moment the hall opens: the focus starts on the machine picked last, or the first
  useEffect(() => {
    hall.current?.querySelector<HTMLElement>('.gtile[tabindex="0"]')?.focus({ preventScroll: true });
  }, []);

  const gameName = (g: { kind: DuelKind; clock?: number }) =>
    duelName(g.kind, ui) + (g.clock ? t(` на ${g.clock / 60} хв`, ` on ${g.clock / 60} min`) : "");
  const w = duels.waiting;
  if (w) {
    const waitFor = w.party
      ? w.party
          .filter((g) => !w.yes?.includes(g.id))
          .map((g) => g.name)
          .join(t(" і ", " and "))
      : w.to.name;
    const ready = w.party?.filter((g) => w.yes?.includes(g.id)).map((g) => g.name) ?? [];
    return (
      <div className="ttt-lobby">
        <div className="ttt-wait" role="status">
          <span className="gtile-scr">
            <GameArt scene={w.kind} hot />
          </span>
          <div className="ttt-wait-say">
            <b>{gameName(w)}</b>
            <span>
              {w.party && !ready.length
                ? t(
                    `Чекаю, поки ${waitFor} погодяться на ${gameName(w)} утрьох…`,
                    `Waiting for ${waitFor} to say yes to ${gameName(w)} for three…`,
                  )
                : t(
                    `Чекаю, поки ${waitFor} погодиться на ${gameName(w)}…`,
                    `Waiting for ${waitFor} to say yes to ${gameName(w)}…`,
                  )}
            </span>
            {ready.length > 0 && <small>{t(`${ready.join(", ")} уже з тобою`, `${ready.join(", ")} is in`)}</small>}
            <i className="ttt-wait-dots" aria-hidden />
          </div>
          <button
            className="btn"
            onClick={() => {
              hallBack();
              duels.close();
            }}
          >
            {t("скасувати", "cancel")}
          </button>
        </div>
      </div>
    );
  }

  const sel = game ? GAMES.findIndex((g) => g.kind === game) : -1;
  const info = sel >= 0 ? GAMES[sel] : null;
  const most = game && PARTY.includes(game) ? 2 : 1;
  const chosen = guests.filter((g) => picked.includes(g.id)).slice(0, most);
  const clock = game && TIMED.includes(game) ? pick : 0;
  /** this game can be played against one of the café's agents */
  const alone = !!game && SOLO_KINDS.includes(game);
  const played = (kind: DuelKind) => {
    const m = tally[kind];
    return m && m.won + m.lost + m.drawn > 0 ? m : null;
  };
  const score = game ? played(game) : null;
  const names = chosen.map((g) => g.name).join(t(" і ", " and "));
  const go = () => {
    if (!game || !chosen.length) return;
    hallCall();
    if (chosen.length === 2) duels.invite(game, chosen);
    else duels.invite(game, chosen[0], clock);
  };
  const toggle = (id: string) => {
    hallSet(picked.includes(id) ? 0 : 1);
    onPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-most)));
  };

  /** Into who-to-play-with: the agent played last time, or the first thing there that can be pressed. */
  const intoStage = () => {
    const el = stage.current;
    (el?.querySelector<HTMLElement>("[data-first]") ?? el?.querySelector<HTMLElement>("button:not(:disabled)"))?.focus();
  };
  const choose = (kind: DuelKind, byKeys: boolean) => {
    if (kind !== game) hallPick();
    recallGame(kind);
    onGame(kind);
    // once the machine's own panel is on the page: bring it into view, and with the keyboard step into it
    requestAnimationFrame(() => {
      if (byKeys) intoStage();
      stage.current?.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
    });
  };
  const wallKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = (e.target as HTMLElement).closest<HTMLElement>(".gtile");
    if (!at) return;
    const i = Number(at.dataset.i);
    const end = GAMES.length - 1;
    const step: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + cols,
      ArrowUp: i - cols,
      Home: 0,
      End: end,
    };
    let n = step[e.key];
    if (n === undefined) return;
    e.preventDefault();
    if (e.key === "ArrowDown" && n > end) {
      // off the bottom of the wall: the short last row first, then on to who to play with
      if (Math.floor(i / cols) < Math.floor(end / cols)) n = end;
      else return intoStage();
    }
    if (n < 0 || n > end || n === i) return;
    hall.current?.querySelector<HTMLElement>(`.gtile[data-i="${n}"]`)?.focus();
    hallTick(n);
  };
  const rivalKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = [...e.currentTarget.querySelectorAll<HTMLElement>(".gbot")];
    const i = list.indexOf(e.target as HTMLElement);
    if (i < 0) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      hall.current?.querySelector<HTMLElement>('.gtile[tabindex="0"]')?.focus();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const n = Math.max(0, Math.min(list.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)));
      if (n !== i) {
        list[n].focus();
        hallTick(n);
      }
    }
  };
  const start = (key: string, name: string) => {
    if (!game) return;
    hallStart();
    recallRival(key);
    duels.solo(game, botPlayer(key, name), { level }, { clock });
  };

  // on a narrow wall the panel opens right under the row of the machine picked; on a wide one it stays below the wall
  const under: CSSProperties | undefined = cols <= 3 && sel >= 0 ? { gridRow: Math.floor(sel / cols) + 2 } : undefined;
  const first = rivals.some((r) => r.key === lastRival) ? lastRival : rivals[0]?.key;

  return (
    <div className="ttt-lobby">
      <div className="ghall" ref={hall}>
        <div className="gtiles" role="radiogroup" aria-label={t("гра", "game")} onKeyDown={wallKeys}>
          {GAMES.map((g, i) => {
            const on = game === g.kind;
            const mine = played(g.kind);
            const solo = SOLO_KINDS.includes(g.kind);
            const party = PARTY.includes(g.kind);
            return (
              <button
                key={g.kind}
                className={`gtile${on ? " on" : ""}`}
                role="radio"
                aria-checked={on}
                tabIndex={(sel < 0 ? i === 0 : on) ? 0 : -1}
                data-i={i}
                data-kind={g.kind}
                style={{ "--i": i } as CSSProperties}
                onClick={(e) => choose(g.kind, e.detail === 0)}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "mouse") return;
                  setHot(g.kind);
                  hallTick(i);
                }}
                onPointerLeave={() => setHot((h) => (h === g.kind ? null : h))}
                onFocus={() => setHot(g.kind)}
                onBlur={() => setHot((h) => (h === g.kind ? null : h))}
              >
                <span className="gtile-scr">
                  <GameArt scene={g.kind} hot={on || hot === g.kind} />
                  {mine && (
                    <span
                      className="gtile-tally"
                      title={t(
                        `ти ${mine.won} : ${mine.lost} агенти`,
                        `you ${mine.won} : ${mine.lost} the agents`,
                      )}
                    >
                      <PixelNum n={mine.won} />
                      <i>:</i>
                      <PixelNum n={mine.lost} />
                    </span>
                  )}
                </span>
                <b>{duelName(g.kind, ui)}</b>
                <small>{g.about[ui]}</small>
                <span className="gtile-n">
                  {solo && (
                    <span className="gtile-chip gtile-solo">
                      <Bot size={11} />
                      {t("агент", "agent")}
                    </span>
                  )}
                  <span className="gtile-chip">
                    <Users size={11} />
                    {party ? (solo ? "2–3" : t("2–3 гравці", "2–3 players")) : t("удвох", "for two")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <section
          ref={stage}
          className={`gwho${info ? "" : " gwho-idle"}`}
          style={under}
          aria-label={t("з ким грати", "who to play with")}
        >
          {!game || !info ? (
            <>
              <div className="gwho-hd">
                <b className="gwho-name">{t("Обери автомат", "Pick a machine")}</b>
                <span className="gwho-about">
                  {rivals.length > 1
                    ? t(
                        "Твої агенти вже тут: вибереш гру, і хтось із них сяде навпроти.",
                        "Your agents are here already: pick a game and one of them sits down across from you.",
                      )
                    : t(
                        `${rivals[0].name} уже тут: вибереш гру, і зіграєте.`,
                        `${rivals[0].name} is here already: pick a game and play.`,
                      )}
                </span>
              </div>
              <div className="gbots gbots-queue" aria-hidden>
                {rivals.map((r) => (
                  <span key={r.key} className="gbot">
                    <span className="gbot-fig">
                      <RivalSprite look={r.look} />
                    </span>
                    <b style={{ color: r.color }}>{r.name}</b>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="gwho-hd">
                <b className="gwho-name">{duelName(game, ui)}</b>
                <span className="gwho-about">{info.about[ui]}</span>
                {score && (
                  <span className="gwho-score">
                    <span>{t("ти", "you")}</span>
                    <PixelNum n={score.won} />
                    <i>:</i>
                    <PixelNum n={score.lost} />
                    <span>{t("агенти", "agents")}</span>
                    {score.drawn > 0 && <small>{t(`нічиїх ${score.drawn}`, `${score.drawn} drawn`)}</small>}
                  </span>
                )}
              </div>
              {alone && (
                <div className="gwho-solo">
                  <div className="gset">
                    <LevelPick />
                    {TIMED.includes(game) && <ClockPick />}
                  </div>
                  <div className="gwho-ttl gwho-bot">
                    <Bot size={14} />
                    {t("Обери суперника: гра почнеться одразу", "Pick your rival: the game starts at once")}
                  </div>
                  <div className="gbots" onKeyDown={rivalKeys}>
                    {rivals.map((r) => (
                      <button
                        key={r.key}
                        className={`gbot${r.key === lastRival ? " again" : ""}`}
                        aria-label={t(`Грати з агентом ${r.name}`, `Play against ${r.name}`)}
                        data-first={r.key === first ? "" : undefined}
                        onClick={() => start(r.key, r.name)}
                        onPointerEnter={(e) => {
                          if (e.pointerType !== "mouse") return;
                          setEager(r.key);
                          hallTick(GAMES.length + rivals.indexOf(r));
                        }}
                        onPointerLeave={() => setEager((k) => (k === r.key ? null : k))}
                        onFocus={() => setEager(r.key)}
                        onBlur={() => setEager((k) => (k === r.key ? null : k))}
                      >
                        <span className="gbot-fig">
                          <RivalSprite look={r.look} eager={eager === r.key} />
                        </span>
                        <b style={{ color: r.color }}>{r.name}</b>
                        <small>▶ {t("грати", "play")}</small>
                        {r.key === lastRival && rivals.length > 1 && (
                          <span className="gbot-again">{t("ще раз?", "again?")}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {online && guests.length ? (
                <div className={`gwho-guests${alone ? " gwho-or" : ""}`}>
                  <div className="gwho-ttl">
                    <Users size={14} />
                    {alone
                      ? most === 2
                        ? t("Або з гостями кафе: познач одного чи двох", "Or with the café's guests: pick one or two")
                        : t("Або з гостем кафе", "Or with a guest of the café")
                      : most === 2
                        ? t("З ким? Познач одного або двох", "Who with? Pick one or two")
                        : t("З ким?", "Who with?")}
                  </div>
                  <div className="gchips">
                    {guests.map((g, i) => {
                      const on = chosen.some((c) => c.id === g.id);
                      return (
                        <button
                          key={g.id}
                          className={`gchip${on ? " on" : ""}`}
                          aria-pressed={on}
                          data-first={!alone && i === 0 ? "" : undefined}
                          onClick={() => toggle(g.id)}
                        >
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                  {TIMED.includes(game) && !alone && <ClockPick />}
                  <button className="btn ask-yes ggo" disabled={!chosen.length} onClick={go}>
                    {chosen.length
                      ? t(`▶ Запросити: ${names}`, `▶ Invite ${names}`)
                      : t("Познач, з ким грати", "Pick who to play with")}
                  </button>
                </div>
              ) : (
                <p className={`alerts-hint${alone ? " gwho-or" : ""}`}>
                  {!online
                    ? alone
                      ? t(
                          "З людьми грають у хмарному режимі: тоді тут з'являться гості кафе.",
                          "Games with people work in cloud mode: the café's guests show up here then.",
                        )
                      : t(
                          "У цю гру грають з тими, хто теж відкрив це кафе. Це працює в хмарному режимі.",
                          "This game is played with others who opened this café. It works in cloud mode.",
                        )
                    : alone
                      ? t(
                          "Гостей у кафе зараз немає. Запроси когось через двері в сцені, і зіграєте удвох.",
                          "No guests in the café right now. Invite someone through the door in the scene to play together.",
                        )
                      : t(
                          "Поки в кафе більше нікого. Запроси когось через двері в сцені: щойно людина відкриє кафе, " +
                            "її ім'я з'явиться тут.",
                          "Nobody else is in the café yet. Invite someone through the door in the scene: once they open " +
                            "the café, their name shows up here.",
                        )}
                </p>
              )}
            </>
          )}
        </section>
      </div>
      {duels.declined && (
        <p className="alerts-hint">
          {t(`${duels.declined} зараз не хоче грати.`, `${duels.declined} does not want to play right now.`)}
        </p>
      )}
    </div>
  );
}
