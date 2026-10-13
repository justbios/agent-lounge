"use client";

import { useState } from "react";
import { DoorOpen } from "lucide-react";

export default function DoorInvite({ cloud, roomKey, viewing }: { cloud: boolean; roomKey: string | null; viewing: boolean }) {
  const [copied, setCopied] = useState(false);
  if (viewing) {
    return (
      <div className="door-pop">
        <b>
          <DoorOpen size={14} /> Вхід
        </b>
        <p>Це чуже кафе за посиланням. Запросити сюди може лише власник.</p>
      </div>
    );
  }
  if (!cloud || !roomKey) {
    return (
      <div className="door-pop">
        <b>
          <DoorOpen size={14} /> Командне кафе
        </b>
        <p>Команда сідає в одне кафе в хмарному режимі: кожен підключає свого Claude, і всі столи в одній кімнаті.</p>
        <a className="btn" href="/connect">
          як підключити
        </a>
      </div>
    );
  }
  const link = `${location.origin}/connect#team=${roomKey}`;
  return (
    <div className="door-pop">
      <b>
        <DoorOpen size={14} /> Запроси команду
      </b>
      <p>Надішли посилання. Кожен вкаже ім&apos;я, підключить свого Claude, і ви сядете в одному кафе.</p>
      <div className="codeblock wrap">
        <button
          className="copybtn"
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? "скопійовано" : "копіювати"}
        </button>
        <pre>{link}</pre>
      </div>
      <p className="door-hint">
        Посилання дає повний доступ до кафе, тож давай його лише своїм. Окреме кафе для команди можна відкрити на{" "}
        <a href="/connect">сторінці підключення</a>.
      </p>
    </div>
  );
}
