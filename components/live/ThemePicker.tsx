"use client";

import { CSSProperties, useState } from "react";
import { THEMES, THEME_IDS, ThemeId, themeOf, themeText } from "@/components/cafe/theme";
import { Ui, useTr, useUi } from "@/lib/i18n";
import { achText, openThemes, themeKey } from "@/lib/live/achievements";
import { CafeState } from "@/lib/live/useCafe";

function heading(cafe: CafeState, ui: Ui): string {
  const en = ui === "en";
  if (cafe.kind === "mine") return en ? "Your room's theme" : "Тема твоєї кімнати";
  if (cafe.kind === "theirs") return en ? `Room theme: ${cafe.whose} picks` : `Тема кімнати: обирає ${cafe.whose}`;
  const what = cafe.kind === "lobby" ? (en ? "Lobby theme" : "Тема спільної зали") : en ? "Café theme" : "Тема кафе";
  if (cafe.editable) return what;
  return en ? `${what}: the café owner picks` : `${what}: обирає власник кафе`;
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
  const ui = useUi();
  const t = useTr();
  const current = themeOf(cafe.settings.theme).id;
  const [busy, setBusy] = useState<ThemeId | null>(null);
  const [bad, setBad] = useState(false);
  const open = openThemes(cafe.earned);
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
      <span className="theme-pick-ttl">{heading(cafe, ui)}</span>
      <div className="theme-grid" role="radiogroup" aria-label={t("тема кафе", "café theme")}>
        {THEME_IDS.map((id) => {
          const key = open.has(id) || id === current ? null : themeKey(id);
          const text = themeText(THEMES[id], ui);
          return (
          <button
            key={id}
            role="radio"
            aria-checked={id === current}
            className={`theme-opt ${id === current ? "on" : ""}`}
            disabled={!cafe.editable || busy != null || !!key}
            onClick={() => pick(id)}
          >
            <span className="theme-swatch" style={swatch(id)} aria-hidden>
              <i />
            </span>
            <b>{text.name}</b>
            <span className="ach-hint">
              {busy === id
                ? t("зберігаю…", "saving…")
                : key
                  ? t(`🔒 відкриє «${achText(key, ui).title}»`, `🔒 unlocked by “${achText(key, ui).title}”`)
                  : text.hint}
            </span>
          </button>
          );
        })}
      </div>
      {bad && (
        <span className="key-paste-bad">
          {t("Не вдалося змінити тему, спробуй ще раз.", "Couldn't change the theme, try again.")}
        </span>
      )}
    </div>
  );
}
