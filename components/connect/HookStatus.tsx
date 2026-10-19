"use client";

import { useSyncExternalStore } from "react";
import { Activity } from "lucide-react";
import { hooksSeen, staleHooks } from "@/lib/live/hookHealth";
import { useCloudFeed } from "@/lib/live/useCloudFeed";
import { Two, useTr, useUi } from "@/lib/i18n";
import { ago } from "../live/format";

const TICK = 5000;
const STUCK: Two[] = [
  {
    uk: "Відкрий новий чат Claude Code: у ньому хуки точно підхопляться.",
    en: "Open a new Claude Code chat: the hooks are sure to load there.",
  },
  {
    uk:
      "Попроси Claude показати хуки Agent Lounge у ~/.claude/settings.json. Якщо їх там нема, він не довів фразу " +
      "до кінця: віддай її ще раз.",
    en:
      "Ask Claude to show the Agent Lounge hooks in ~/.claude/settings.json. If they aren't there, it didn't finish " +
      "the phrase: give it again.",
  },
  {
    uk: "Windows без Git Bash: візьми фразу для Windows вище.",
    en: "Windows without Git Bash: take the Windows phrase above.",
  },
  {
    uk:
      "Сесії Claude Code в хмарі, на claude.ai, не запускають хуків з твого комп'ютера. Потрібен Claude Code " +
      "у терміналі або в застосунку на комп'ютері.",
    en:
      "Claude Code sessions in the cloud, on claude.ai, don't run hooks from your computer. You need Claude Code " +
      "in a terminal or in the desktop app.",
  },
  {
    uk:
      "На робочому комп'ютері компанія може дозволяти лише свої хуки (allowManagedHooksOnly). Тоді Agent Lounge там не " +
      "підключиться.",
    en:
      "On a work computer the company may allow only its own hooks (allowManagedHooksOnly). Then Agent Lounge " +
      "won't connect there.",
  },
];

const subscribe = (cb: () => void) => {
  const id = setInterval(cb, TICK);
  return () => clearInterval(id);
};

/** Whether this person's Claude Code has reached the café yet, live, so the connect phrase can be checked by eye. */
export default function HookStatus({ roomKey, me }: { roomKey: string; me: string | null }) {
  const ui = useUi();
  const t = useTr();
  const feed = useCloudFeed({ key: roomKey, room: null }, true);
  const now = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / TICK) * TICK, () => 0);
  const seen = hooksSeen(feed.events, me);
  const on = seen.last != null;

  let text = t("Підключаюсь до кафе…", "Connecting to the café…");
  if (on) {
    const since = ago(now - seen.last!, ui);
    text = t(`Claude підключений · остання подія ${since}`, `Claude connected · last event ${since}`);
  } else if (feed.status === "open") {
    text = t("Чекаю першу подію від твого Claude…", "Waiting for the first event from your Claude…");
  }

  return (
    <div className="step">
      <div className="step-n">
        <Activity size={14} />
      </div>
      <div className="step-body">
        <div className="step-ttl">{t("Стан підключення", "Connection status")}</div>
        <div className="hook-status">
          <span className={`hook-dot ${on ? "on" : ""}`} />
          {text}
        </div>
        {on && seen.http && (
          <p className="step-p">
            {t(
              "Без скрипта: кафе бачить усі дії агентів, але без назв чатів, токенів і лімітів.",
              "No script: the café sees all the agents' actions, but no chat names, tokens or limits.",
            )}
          </p>
        )}
        {on && !seen.http && staleHooks(feed.events, me) && (
          <p className="step-p">
            {t(
              "Хуки старої версії: віддай фразу ще раз, щоб з'явилися ліміти, назви чатів і кавники контексту.",
              "These hooks are an old version: give the phrase again to get limits, chat names and the context " +
                "coffee pots.",
            )}
          </p>
        )}
        {!on && seen.checked && (
          <p className="step-p">
            {t(
              "Перевірка дійшла, отже ключ працює. Напиши щось у Claude Code, і тут з'явиться перша справжня подія.",
              "The check got through, so the key works. Write something in Claude Code, and the first real event " +
                "will show up here.",
            )}
          </p>
        )}
        {!on && feed.status === "open" && (
          <details className="hook-stuck">
            <summary>{t("Не з'являється?", "Not showing up?")}</summary>
            <ul>
              {STUCK.map((l) => (
                <li key={l.uk}>{l[ui]}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
