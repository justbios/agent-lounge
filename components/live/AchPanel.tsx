"use client";

import { Earned, ProgressDay, achText } from "@/lib/live/achievements";
import { Ui, useTr, useUi } from "@/lib/i18n";
import { THEMES, themeText } from "@/components/cafe/theme";
import { trackInfo, trackText } from "@/lib/live/tracks";
import { CafeState } from "@/lib/live/useCafe";
import { VISITOR_KINDS, useGuestBook, visitorText } from "@/lib/live/visitors";
import DaysMap from "./DaysMap";
import Sheet from "./Sheet";
import WeekQuest from "./WeekQuest";
import { fmtTokens } from "./tokens";

const locale = (ui: Ui) => (ui === "en" ? "en-GB" : "uk-UA");
const num = (n: number, ui: Ui) => (n >= 1e6 ? fmtTokens(n, ui) : n.toLocaleString(locale(ui)));
const dayLabel = (d: string, ui: Ui) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(locale(ui), { day: "numeric", month: "long" });

function Card({ e }: { e: Earned }) {
  const ui = useUi();
  const t = useTr();
  const { def } = e;
  const text = achText(def, ui);
  return (
    <div className={`ach ${e.done ? "done" : ""}`}>
      <span className="ach-icon" aria-hidden>
        {def.icon}
      </span>
      <div className="ach-body">
        <b>{text.title}</b>
        <span className="ach-hint">{text.hint}</span>
        {e.done ? (
          <span className="ach-when">
            {e.day ? t(`отримано ${dayLabel(e.day, ui)}`, `earned ${dayLabel(e.day, ui)}`) : t("отримано", "earned")}
          </span>
        ) : def.goal > 1 ? (
          <span
            className="ach-meter"
            title={t(`${num(e.value, ui)} з ${num(def.goal, ui)}`, `${num(e.value, ui)} of ${num(def.goal, ui)}`)}
          >
            <span className="recap-bar-track">
              <span style={{ width: `${Math.min(100, (e.value / def.goal) * 100)}%` }} />
            </span>
            <span className="ach-n">
              {num(Math.min(e.value, def.goal), ui)}/{num(def.goal, ui)}
            </span>
          </span>
        ) : (
          <span className="ach-when">{t("ще ні", "not yet")}</span>
        )}
        {text.decorName && (
          <span className="ach-decor">
            {e.done
              ? t(`у кафе: ${text.decorName}`, `in the café: ${text.decorName}`)
              : t(`відкриє: ${text.decorName}`, `unlocks: ${text.decorName}`)}
          </span>
        )}
        {def.theme && (
          <span className="ach-decor">
            {t(
              `${e.done ? "відкрито" : "відкриє"} тему «${themeText(THEMES[def.theme], ui).name}»`,
              `${e.done ? "unlocked" : "unlocks"} the “${themeText(THEMES[def.theme], ui).name}” theme`,
            )}
          </span>
        )}
        {def.track && (
          <span className="ach-decor">
            {t(
              `${e.done ? "відкрито" : "відкриє"} платівку «${trackText(trackInfo(def.track), ui).name}»`,
              `${e.done ? "unlocked" : "unlocks"} the “${trackText(trackInfo(def.track), ui).name}” record`,
            )}
          </span>
        )}
        <span className="ach-reward">{t(`+${def.reward} зерен`, `+${def.reward} beans`)}</span>
      </div>
    </div>
  );
}

const seenLabel = (at: number, ui: Ui) =>
  new Date(at).toLocaleDateString(locale(ui), { day: "numeric", month: "long" });

function GuestBook() {
  const ui = useUi();
  const t = useTr();
  const book = useGuestBook();
  return (
    <>
      <div className="share-ttl">{t("Гостьова книга", "Guest book")}</div>
      <p className="alerts-hint">
        {t(
          "Рідкісні гості заходять у кафе зрідка й на кілька хвилин, однаково для всіх, хто його дивиться. Книга пам'ятає, кого бачив цей браузер.",
          "Rare guests drop into the café now and then, for a few minutes, the same for everyone watching it. The book remembers who this browser has seen.",
        )}
      </p>
      <div className="ach-grid">
        {VISITOR_KINDS.map((k) => {
          const v = visitorText(k, ui);
          const seen = book[k];
          return (
            <div key={k} className={`ach ${seen ? "done" : ""}`}>
              <span className="ach-icon" aria-hidden>
                {seen ? v.icon : "?"}
              </span>
              <div className="ach-body">
                <b>{v.name}</b>
                <span className="ach-hint">{v.hint}</span>
                <span className="ach-when">
                  {seen
                    ? t(`уперше ${seenLabel(seen, ui)}`, `first seen ${seenLabel(seen, ui)}`)
                    : t("ще не заходив", "not seen yet")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export interface TeamWeek {
  /** the whole café's days */
  days: ProgressDay[];
  /** each teammate's days, on personal keys */
  members: Record<string, ProgressDay[]> | null;
}

export default function AchPanel({ cafe, week, onClose }: { cafe: CafeState; week: TeamWeek; onClose: () => void }) {
  const t = useTr();
  const done = cafe.earned.filter((e) => e.done).length;
  const decor = cafe.earned.filter((e) => e.def.decor);
  const learn = cafe.earned.filter((e) => e.def.learn);
  const rest = cafe.earned.filter((e) => !e.def.learn);
  return (
    <Sheet
      label={t("досягнення", "achievements")}
      title={t("Досягнення", "Achievements")}
      sub={
        cafe.progress
          ? t(
              `${done} з ${cafe.earned.length} · декору ${cafe.decor.size} з ${decor.length}`,
              `${done} of ${cafe.earned.length} · decor ${cafe.decor.size} of ${decor.length}`,
            )
          : t("рахую…", "counting…")
      }
      onClose={onClose}
    >
      <p className="alerts-hint">
        {cafe.kind === "mine" &&
          t("Твої власні досягнення, лише з твоєї роботи. ", "Your own achievements, from your work only. ")}
        {cafe.kind === "theirs" &&
          t(
            `${cafe.whose}: досягнення лише з власної роботи. `,
            `${cafe.whose}: achievements from their own work only. `,
          )}
        {cafe.kind === "lobby" && t("Досягнення всієї команди разом. ", "The whole team's achievements together. ")}
        {t(
          "Кожне досягнення рахується з хуків за весь час і дає від 50 до 300 зерен, якщо отримане після нового відліку зерен; квест тижня дає ще 100. Деякі додають у кімнату нову річ, відкривають тему чи платівку на автоматі. Перші шість навчають прийомів Claude Code, яких легко не помітити.",
          "Every achievement is counted from the hooks over all time and pays 50 to 300 beans if earned after the beans started over; the weekly quest pays another 100. Some add a new piece to the room, or unlock a theme or a record on the jukebox. The first six teach Claude Code tricks that are easy to miss.",
        )}
      </p>
      {cafe.error && (
        <p className="key-paste-bad">
          {t(
            "Не вдалося дістати прогрес, спробую ще раз за хвилину.",
            "Couldn't load progress, I'll try again in a minute.",
          )}
        </p>
      )}
      {cafe.progress && (
        <>
          <DaysMap days={cafe.progress.days} />
          <WeekQuest days={week.days} members={week.members} />
          <div className="share-ttl">{t("Спробуй у Claude Code", "Try in Claude Code")}</div>
          <div className="ach-grid">
            {learn.map((e) => (
              <Card key={e.def.id} e={e} />
            ))}
          </div>
          <div className="share-ttl">{t("Робота", "Work")}</div>
          <div className="ach-grid">
            {rest.map((e) => (
              <Card key={e.def.id} e={e} />
            ))}
          </div>
        </>
      )}
      <GuestBook />
    </Sheet>
  );
}
