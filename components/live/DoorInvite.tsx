"use client";

import { useState } from "react";
import { DoorOpen } from "lucide-react";
import { useTr } from "@/lib/i18n";

export default function DoorInvite({ cloud, roomKey, viewing }: { cloud: boolean; roomKey: string | null; viewing: boolean }) {
  const t = useTr();
  const [copied, setCopied] = useState(false);
  if (viewing) {
    return (
      <div className="door-pop">
        <b>
          <DoorOpen size={14} /> {t("Вхід", "Entrance")}
        </b>
        <p>
          {t(
            "Це чуже кафе за посиланням. Запросити сюди може лише власник.",
            "This is someone else's café, opened by a link. Only its owner can invite people here.",
          )}
        </p>
      </div>
    );
  }
  if (!cloud || !roomKey) {
    return (
      <div className="door-pop">
        <b>
          <DoorOpen size={14} /> {t("Командне кафе", "Team café")}
        </b>
        <p>
          {t(
            "Команда сідає в одне кафе в хмарному режимі: кожен підключає свого Claude, і всі столи в одній кімнаті.",
            "A team shares one café in cloud mode: everyone connects their own Claude, and all the tables are in one room.",
          )}
        </p>
        <a className="btn" href="/connect">
          {t("як підключити", "how to connect")}
        </a>
      </div>
    );
  }
  const link = `${location.origin}/connect#team=${roomKey}`;
  return (
    <div className="door-pop">
      <b>
        <DoorOpen size={14} /> {t("Запроси команду", "Invite your team")}
      </b>
      <p>
        {t(
          "Надішли посилання. Кожен вкаже ім'я, підключить свого Claude, і ви сядете в одному кафе.",
          "Send the link. Everyone enters a name and connects their Claude, and you all sit in one café.",
        )}
      </p>
      <div className="codeblock wrap">
        <button
          className="copybtn"
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? t("скопійовано", "copied") : t("копіювати", "copy")}
        </button>
        <pre>{link}</pre>
      </div>
      <p className="door-hint">
        {t(
          "Посилання дає повний доступ до кафе, тож давай його лише своїм. Окреме кафе для команди можна відкрити на ",
          "The link gives full access to the café, so share it only with your own people. You can open a separate " +
            "team café on the ",
        )}
        <a href="/connect">{t("сторінці підключення", "connect page")}</a>.
      </p>
    </div>
  );
}
