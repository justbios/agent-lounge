"use client";

import { Earned } from "@/lib/live/achievements";
import { THEMES } from "@/components/cafe/theme";
import { trackInfo } from "@/lib/live/tracks";
import { CafeState } from "@/lib/live/useCafe";
import { VISITORS, VISITOR_KINDS, useGuestBook } from "@/lib/live/visitors";
import Sheet from "./Sheet";
import { fmtTokens } from "./tokens";

const num = (n: number) => (n >= 1e6 ? fmtTokens(n) : n.toLocaleString("uk-UA"));
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });

function Card({ e }: { e: Earned }) {
  const { def } = e;
  return (
    <div className={`ach ${e.done ? "done" : ""}`}>
      <span className="ach-icon" aria-hidden>
        {def.icon}
      </span>
      <div className="ach-body">
        <b>{def.title}</b>
        <span className="ach-hint">{def.hint}</span>
        {e.done ? (
          <span className="ach-when">{e.day ? `отримано ${dayLabel(e.day)}` : "отримано"}</span>
        ) : def.goal > 1 ? (
          <span className="ach-meter" title={`${num(e.value)} з ${num(def.goal)}`}>
            <span className="recap-bar-track">
              <span style={{ width: `${Math.min(100, (e.value / def.goal) * 100)}%` }} />
            </span>
            <span className="ach-n">
              {num(Math.min(e.value, def.goal))}/{num(def.goal)}
            </span>
          </span>
        ) : (
          <span className="ach-when">ще ні</span>
        )}
        {def.decorName && <span className="ach-decor">{e.done ? `у кафе: ${def.decorName}` : `відкриє: ${def.decorName}`}</span>}
        {def.theme && (
          <span className="ach-decor">
            {e.done ? "відкрито" : "відкриє"} тему «{THEMES[def.theme].name}»
          </span>
        )}
        {def.track && (
          <span className="ach-decor">
            {e.done ? "відкрито" : "відкриє"} платівку «{trackInfo(def.track).name}»
          </span>
        )}
        <span className="ach-reward">+{def.reward} зерен</span>
      </div>
    </div>
  );
}

const seenLabel = (t: number) => new Date(t).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });

function GuestBook() {
  const book = useGuestBook();
  return (
    <>
      <div className="share-ttl">Гостьова книга</div>
      <p className="alerts-hint">
        Рідкісні гості заходять у кафе зрідка й на кілька хвилин, однаково для всіх, хто його дивиться. Книга
        пам&apos;ятає, кого бачив цей браузер.
      </p>
      <div className="ach-grid">
        {VISITOR_KINDS.map((k) => {
          const v = VISITORS[k];
          const seen = book[k];
          return (
            <div key={k} className={`ach ${seen ? "done" : ""}`}>
              <span className="ach-icon" aria-hidden>
                {seen ? v.icon : "?"}
              </span>
              <div className="ach-body">
                <b>{v.name}</b>
                <span className="ach-hint">{v.hint}</span>
                <span className="ach-when">{seen ? `уперше ${seenLabel(seen)}` : "ще не заходив"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function AchPanel({ cafe, onClose }: { cafe: CafeState; onClose: () => void }) {
  const done = cafe.earned.filter((e) => e.done).length;
  const decor = cafe.earned.filter((e) => e.def.decor);
  const learn = cafe.earned.filter((e) => e.def.learn);
  const rest = cafe.earned.filter((e) => !e.def.learn);
  return (
    <Sheet
      label="досягнення"
      title="Досягнення"
      sub={cafe.progress ? `${done} з ${cafe.earned.length} · декору ${cafe.decor.size} з ${decor.length}` : "рахую…"}
      onClose={onClose}
    >
      <p className="alerts-hint">
        {cafe.kind === "mine" && "Твої власні досягнення, лише з твоєї роботи. "}
        {cafe.kind === "theirs" && `${cafe.whose}: досягнення лише з власної роботи. `}
        {cafe.kind === "lobby" && "Досягнення всієї команди разом. "}
        Кожне досягнення рахується з хуків за весь час і дає від 50 до 300 зерен, якщо отримане після нового відліку
        зерен. Деякі додають у кімнату нову річ, відкривають тему чи платівку на автоматі. Перші шість навчають
        прийомів Claude Code, яких легко не помітити.
      </p>
      {cafe.error && <p className="key-paste-bad">Не вдалося дістати прогрес, спробую ще раз за хвилину.</p>}
      {cafe.progress && (
        <>
          <div className="share-ttl">Спробуй у Claude Code</div>
          <div className="ach-grid">
            {learn.map((e) => (
              <Card key={e.def.id} e={e} />
            ))}
          </div>
          <div className="share-ttl">Робота</div>
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
