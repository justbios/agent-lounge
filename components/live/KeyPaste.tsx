"use client";

import { useState } from "react";
import { ROOM_KEY } from "@/lib/live/hookConfig.mjs";
import { saveKey } from "@/lib/live/relayKey";
import { useTr } from "@/lib/i18n";

/** A home-screen app on iPhone keeps its own storage, so the link from another device is pasted here once. */
const HINT = "Уже підключав на іншому пристрої? Встав посилання з ключем:";
const HINT_EN = "Already connected on another device? Paste the link with the key:";

export default function KeyPaste({ hint }: { hint?: string }) {
  const t = useTr();
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const submit = () => {
    const raw = text.trim();
    const key = /[#&?](?:k|team)=([A-Za-z0-9_-]{20,128})/.exec(raw)?.[1] ?? (ROOM_KEY.test(raw) ? raw : null);
    if (!key) return setBad(true);
    saveKey(key);
  };
  return (
    <form
      className="key-paste"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className="key-paste-hint">{hint ?? t(HINT, HINT_EN)}</span>
      <span className="key-paste-row">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setBad(false);
          }}
          placeholder="https://…/#k=…"
          aria-invalid={bad}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn" type="submit">
          {t("відкрити", "open")}
        </button>
      </span>
      {bad && <span className="key-paste-bad">{t("У цьому тексті немає ключа Agent Lounge.", "There's no Agent Lounge key in this text.")}</span>}
    </form>
  );
}
