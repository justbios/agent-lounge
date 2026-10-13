"use client";

import { useState } from "react";
import { ROOM_KEY } from "@/lib/live/hookConfig.mjs";
import { saveKey } from "@/lib/live/relayKey";

/** A home-screen app on iPhone keeps its own storage, so the link from another device is pasted here once. */
export default function KeyPaste() {
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const submit = () => {
    const raw = text.trim();
    const key = /[#&?]k=([A-Za-z0-9_-]{20,128})/.exec(raw)?.[1] ?? (ROOM_KEY.test(raw) ? raw : null);
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
      <span className="key-paste-hint">Уже підключав на іншому пристрої? Встав посилання з ключем:</span>
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
          відкрити
        </button>
      </span>
      {bad && <span className="key-paste-bad">У цьому тексті немає ключа Relay.</span>}
    </form>
  );
}
