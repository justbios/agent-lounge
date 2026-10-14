"use client";

import { CSSProperties, useState } from "react";
import { THEMES, THEME_IDS, ThemeId, themeOf } from "@/components/cafe/theme";
import { CafeState } from "@/lib/live/useCafe";

function heading(cafe: CafeState): string {
  if (cafe.kind === "mine") return "Тема твоєї кімнати";
  if (cafe.kind === "theirs") return `Тема кімнати: обирає ${cafe.whose}`;
  const what = cafe.kind === "lobby" ? "Тема спільної зали" : "Тема кафе";
  return cafe.editable ? what : `${what}: обирає власник кафе`;
}

function swatch(id: ThemeId): CSSProperties {
  const th = THEMES[id];
  return {
    "--sky": `linear-gradient(180deg, ${th.sky[0]}, ${th.sky[4]})`,
    "--wall": th.wall,
    "--rail": th.rail,
    "--floor": th.planks[0],
    "--frame": th.frame,
    "--lamp": th.lamp[0],
    "--fx": th.weatherColor,
  } as CSSProperties;
}

export default function ThemePicker({ cafe }: { cafe: CafeState }) {
  const current = themeOf(cafe.settings.theme).id;
  const [busy, setBusy] = useState<ThemeId | null>(null);
  const [bad, setBad] = useState(false);
  const pick = async (id: ThemeId) => {
    if (id === current || busy) return;
    setBusy(id);
    setBad(false);
    const ok = await cafe.save({ theme: id });
    setBusy(null);
    setBad(!ok);
  };
  return (
    <div className="theme-pick">
      <span className="theme-pick-ttl">{heading(cafe)}</span>
      <div className="theme-grid" role="radiogroup" aria-label="тема кафе">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={id === current}
            className={`theme-opt ${id === current ? "on" : ""}`}
            disabled={!cafe.editable || busy != null}
            onClick={() => pick(id)}
          >
            <span className="theme-swatch" style={swatch(id)} aria-hidden>
              <i />
            </span>
            <b>{THEMES[id].name}</b>
            <span className="ach-hint">{busy === id ? "зберігаю…" : THEMES[id].hint}</span>
          </button>
        ))}
      </div>
      {bad && <span className="key-paste-bad">Не вдалося змінити тему, спробуй ще раз.</span>}
    </div>
  );
}
