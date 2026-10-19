"use client";

import { PROJECT_URL } from "@/lib/brand";
import { PRIVATE_CAFE, newKey, saveKey } from "@/lib/live/relayKey";
import { useCafes } from "@/lib/live/team";
import { Two, tr, useUi } from "@/lib/i18n";
import { cafeLabel } from "../connect/TeamConnect";
import KeyPaste from "./KeyPaste";

const REVOKED: Two = {
  uk: "Власник кафе прибрав тебе з команди: цей ключ більше нічого не відкриває, і твій Claude сюди не пише.",
  en: "The café owner removed you from the team: this key no longer opens anything, and your Claude doesn't write here.",
};
const RETIRED: Two = {
  uk: "Кафе перейшло на особисті ключі, спільний ключ більше не діє. Попроси у власника особисте запрошення.",
  en: "The café moved to personal keys, and the shared key no longer works. Ask the owner for a personal invite.",
};

/** The page's key no longer opens its café: the owner removed you, or the café moved to personal keys. */
export default function KeyLost({ kind, current }: { kind: "revoked" | "retired"; current: string }) {
  const ui = useUi();
  const others = useCafes().filter((c) => c.key !== current);
  return (
    <div className="notice key-lost">
      <p>{(kind === "revoked" ? REVOKED : RETIRED)[ui]}</p>
      <div className="team-actions">
        {others.map((c) => (
          <button key={c.key} className="btn" onClick={() => saveKey(c.key)}>
            {cafeLabel(c.label, ui)}
          </button>
        ))}
        {PRIVATE_CAFE ? (
          <a className="btn" href={`https://${PROJECT_URL}`} target="_blank" rel="noopener noreferrer">
            {tr(ui, "завести своє кафе", "run my own café")}
          </a>
        ) : (
          <button className="btn" onClick={() => saveKey(newKey())}>
            {tr(ui, "відкрити своє кафе", "open my own café")}
          </button>
        )}
      </div>
      <KeyPaste
        hint={tr(
          ui,
          "Маєш нове запрошення чи посилання з ключем? Встав його сюди:",
          "Got a new invite or a link with a key? Paste it here:",
        )}
      />
    </div>
  );
}
