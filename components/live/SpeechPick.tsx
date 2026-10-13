"use client";

import { Languages } from "lucide-react";
import { Lang, setSpeech, useSpeech } from "@/lib/live/speech";

const CHOICES = [
  { v: "uk", label: "укр · просто" },
  { v: "en", label: "eng · simple" },
  { v: "ru", label: "рус · просто" },
  { v: "tech", label: "технічно" },
];

/** How agents' actions read for this viewer: plain words in one of three languages, or files, commands and tools. */
export default function SpeechPick() {
  const sp = useSpeech();
  return (
    <label className="speech-pick" title="як агенти описують свою роботу: простими словами чи технічно">
      <Languages size={14} />
      <select
        value={sp.plain ? sp.lang : "tech"}
        aria-label="мова дій агентів"
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
      </select>
    </label>
  );
}
