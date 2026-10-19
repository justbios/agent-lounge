"use client";

import { Languages } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { Lang, setSpeech, useSpeech } from "@/lib/live/speech";

const CHOICES = [
  { v: "en", label: "English" },
  { v: "uk", label: "Українська" },
  { v: "ru", label: "Русский" },
];

/**
 * The viewer's language: the café's buttons and cards (English, or Ukrainian for Ukrainian and Russian) and the plain
 * words agents' actions read in. «Technical» keeps the language and shows files, commands and tools instead.
 */
export default function SpeechPick() {
  const sp = useSpeech();
  const t = useTr();
  return (
    <label className="speech-pick" title={t("мова кафе й того, як агенти описують свою роботу", "the café's language, and how agents describe their work")}>
      <Languages size={14} />
      <select
        value={sp.plain ? sp.lang : "tech"}
        aria-label={t("мова", "language")}
        onChange={(e) => {
          const v = e.target.value;
          setSpeech(v === "tech" ? { lang: sp.lang, plain: false } : { lang: v as Lang, plain: true });
        }}
      >
        {CHOICES.map((c) => (
          <option key={c.v} value={c.v}>
            {c.label}
          </option>
        ))}
        <option value="tech">{t("технічно", "technical")}</option>
      </select>
    </label>
  );
}
