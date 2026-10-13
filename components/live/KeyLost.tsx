"use client";

import { newKey, saveKey } from "@/lib/live/relayKey";
import { useCafes } from "@/lib/live/team";
import KeyPaste from "./KeyPaste";

const REVOKED = "Власник кафе прибрав тебе з команди: цей ключ більше нічого не відкриває, і твій Claude сюди не пише.";
const RETIRED = "Кафе перейшло на особисті ключі, спільний ключ більше не діє. Попроси у власника особисте запрошення.";

/** The page's key no longer opens its café: the owner removed you, or the café moved to personal keys. */
export default function KeyLost({ kind, current }: { kind: "revoked" | "retired"; current: string }) {
  const others = useCafes().filter((c) => c.key !== current);
  return (
    <div className="notice key-lost">
      <p>{kind === "revoked" ? REVOKED : RETIRED}</p>
      <div className="team-actions">
        {others.map((c) => (
          <button key={c.key} className="btn" onClick={() => saveKey(c.key)}>
            {c.label}
          </button>
        ))}
        <button className="btn" onClick={() => saveKey(newKey())}>
          відкрити своє кафе
        </button>
      </div>
      <KeyPaste hint="Маєш нове запрошення чи посилання з ключем? Встав його сюди:" />
    </div>
  );
}
