"use client";

import { useState } from "react";
import { pairFrom } from "@/lib/live/answerKeys";
import { useTr } from "@/lib/i18n";

/** Where the link from `relay.sh pair` goes when it can't be opened here, as in a home-screen app on iPhone. */
export default function PairPaste() {
  const t = useTr();
  const [text, setText] = useState("");
  const [state, setState] = useState<"ok" | "bad" | null>(null);
  const submit = async () => {
    const kid = await pairFrom(text);
    setState(kid ? "ok" : "bad");
    if (kid) setText("");
  };
  return (
    <form
      className="key-paste pair-paste"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <span className="key-paste-hint">
        {t("Не відкривається тут? Встав посилання для спарювання:", "Won't open here? Paste the pairing link:")}
      </span>
      <span className="key-paste-row">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setState(null);
          }}
          placeholder="https://…/#pair=…"
          aria-invalid={state === "bad"}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn" type="submit">
          {t("спарити", "pair")}
        </button>
      </span>
      {state === "ok" && <span className="pair-paste-ok">{t("Спарено ✓", "Paired ✓")}</span>}
      {state === "bad" && (
        <span className="key-paste-bad">
          {t("У цьому тексті немає посилання для спарювання.", "There's no pairing link in this text.")}
        </span>
      )}
    </form>
  );
}
