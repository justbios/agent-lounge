"use client";

import { Earned } from "@/lib/live/achievements";
import { CafeState } from "@/lib/live/useCafe";
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
      </div>
    </div>
  );
}

export default function AchPanel({ cafe, onClose }: { cafe: CafeState; onClose: () => void }) {
  const done = cafe.earned.filter((e) => e.done).length;
  const decor = cafe.earned.filter((e) => e.def.decor);
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
        Кожне досягнення рахується з хуків за весь час. Деякі додають у кімнату нову річ: гірлянду, акваріум, сову на
        підвіконні.
      </p>
      {cafe.error && <p className="key-paste-bad">Не вдалося дістати прогрес, спробую ще раз за хвилину.</p>}
      {cafe.progress && (
        <div className="ach-grid">
          {cafe.earned.map((e) => (
            <Card key={e.def.id} e={e} />
          ))}
        </div>
      )}
    </Sheet>
  );
}
