"use client";

import { useSyncExternalStore } from "react";
import { Activity } from "lucide-react";
import { hooksSeen, staleHooks } from "@/lib/live/hookHealth";
import { useCloudFeed } from "@/lib/live/useCloudFeed";
import { ago } from "../live/format";

const TICK = 5000;
const STUCK = [
  "Відкрий новий чат Claude Code: у ньому хуки точно підхопляться.",
  "Попроси Claude показати хуки Relay у ~/.claude/settings.json. Якщо їх там нема, він не довів фразу до кінця: " +
    "віддай її ще раз.",
  "Windows без Git Bash: візьми фразу для Windows вище.",
  "Сесії Claude Code в хмарі, на claude.ai, не запускають хуків з твого комп'ютера. Потрібен Claude Code " +
    "у терміналі або в застосунку на комп'ютері.",
  "На робочому комп'ютері компанія може дозволяти лише свої хуки (allowManagedHooksOnly). Тоді Relay там не " +
    "підключиться.",
];

const subscribe = (cb: () => void) => {
  const id = setInterval(cb, TICK);
  return () => clearInterval(id);
};

/** Whether this person's Claude Code has reached the café yet, live, so the connect phrase can be checked by eye. */
export default function HookStatus({ roomKey, me }: { roomKey: string; me: string | null }) {
  const feed = useCloudFeed({ key: roomKey, room: null }, true);
  const now = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / TICK) * TICK, () => 0);
  const seen = hooksSeen(feed.events, me);
  const on = seen.last != null;

  let text = "Підключаюсь до кафе…";
  if (on) text = `Claude підключений · остання подія ${ago(now - seen.last!)}`;
  else if (feed.status === "open") text = "Чекаю першу подію від твого Claude…";

  return (
    <div className="step">
      <div className="step-n">
        <Activity size={14} />
      </div>
      <div className="step-body">
        <div className="step-ttl">Стан підключення</div>
        <div className="hook-status">
          <span className={`hook-dot ${on ? "on" : ""}`} />
          {text}
        </div>
        {on && seen.http && (
          <p className="step-p">Без скрипта: кафе бачить усі дії агентів, але без назв чатів, токенів і лімітів.</p>
        )}
        {on && !seen.http && staleHooks(feed.events, me) && (
          <p className="step-p">
            Хуки старої версії: віддай фразу ще раз, щоб з&apos;явилися ліміти, назви чатів і кавники контексту.
          </p>
        )}
        {!on && seen.checked && (
          <p className="step-p">
            Перевірка дійшла, отже ключ працює. Напиши щось у Claude Code, і тут з&apos;явиться перша справжня подія.
          </p>
        )}
        {!on && feed.status === "open" && (
          <details className="hook-stuck">
            <summary>Не з&apos;являється?</summary>
            <ul>
              {STUCK.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
