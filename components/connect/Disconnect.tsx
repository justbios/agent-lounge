"use client";

import { RELAY_SH, STATUS_LINE, statusChain } from "@/lib/live/hookConfig.mjs";
import { Two, useTr, useUi } from "@/lib/i18n";
import Code from "./Code";

const DIR = RELAY_SH.replace("/relay.sh", "").replace("$HOME", "~");

const OFF: Two = {
  uk: `Відключи мій Claude Code від Agent Lounge — сайту, який показував моїх агентів наживо. Чіпай лише записи Agent Lounge, усе інше в налаштуваннях залиш як є.

1. Збережи копію ~/.claude/settings.json (на Windows це %USERPROFILE%\\.claude\\settings.json) як settings.json.bak-relay-off.
2. Якщо поруч лежить settings.json.bak-relay — копія, зроблена перед підключенням, — порівняй її з поточним файлом. Якщо вони різняться лише хуками й статус-рядком Agent Lounge, віднови цю копію і переходь до кроку 5.
3. Інакше прибери з "hooks" кожен хук, у "command" чи "url" якого є "/api/claude-hook", а потім групи й події, що лишились порожніми. Інші хуки не чіпай.
4. Статус-рядок. Якщо його команда — ${STATUS_LINE.command}, прибери "statusLine" повністю. Якщо вона має вигляд
${statusChain("<стара команда>")}
залиш у ній лише <стару команду>. Будь-який інший статус-рядок не чіпай.
5. Якщо в мене стоїть плагін agent-lounge, скажи мені виконати в чаті /plugin uninstall agent-lounge@agent-lounge: його хуки живуть у плагіні, а не в settings.json.
6. Тека ${DIR} з копією скрипта й посиланням на кафе лишається. Спитай мене, чи видалити її: у посиланні мій ключ.
7. Перевір, що в settings.json більше немає "/api/claude-hook" і "relay.sh", і коротко скажи, що змінилось. Хуки перестануть працювати з наступного чату Claude Code.`,
  en: `Disconnect my Claude Code from Agent Lounge, a site that showed my agents live. Touch only the Agent Lounge entries and leave everything else in the settings as it is.

1. Save a copy of ~/.claude/settings.json (on Windows it's %USERPROFILE%\\.claude\\settings.json) as settings.json.bak-relay-off.
2. If settings.json.bak-relay sits next to it (a copy made before connecting), compare it with the current file. If they differ only in the Agent Lounge hooks and status line, restore that copy and skip to step 5.
3. Otherwise remove from "hooks" every hook whose "command" or "url" contains "/api/claude-hook", then the groups and events left empty. Leave other hooks alone.
4. The status line. If its command is ${STATUS_LINE.command}, remove "statusLine" entirely. If it looks like
${statusChain("<old command>")}
keep only <old command> in it. Leave any other status line alone.
5. If I have the agent-lounge plugin installed, tell me to run /plugin uninstall agent-lounge@agent-lounge in the chat: its hooks live in the plugin, not in settings.json.
6. The ${DIR} folder, with the copy of the script and the café link, stays. Ask me whether to delete it: the link holds my key.
7. Check that settings.json no longer has "/api/claude-hook" or "relay.sh", and tell me briefly what changed. The hooks stop working from the next Claude Code chat.`,
};

/** Takes Agent Lounge back out of Claude Code: only its hooks and status line, the rest of the settings untouched. */
export default function Disconnect() {
  const ui = useUi();
  const t = useTr();
  return (
    <details className="step-more">
      <summary className="step-ttl">{t("Відключити Agent Lounge", "Disconnect Agent Lounge")}</summary>
      <div className="step-body">
        <p className="step-p">
          {t(
            "Встав у чат Claude Code. Він збереже копію налаштувань і прибере з них лише хуки й статус-рядок Agent " +
              "Lounge. Якщо після підключення ти більше нічого там не міняв, він просто поверне копію ",
            "Paste this into a Claude Code chat. It saves a copy of the settings and removes only the Agent Lounge " +
              "hooks and status line from them. If you haven't changed anything there since connecting, it simply " +
              "restores the copy ",
          )}
          <code>settings.json.bak-relay</code>
          {t(
            ", зроблену перед підключенням. Решта налаштувань лишиться як була.",
            " made before connecting. The rest of the settings stays as it was.",
          )}
        </p>
        <Code text={OFF[ui]} wrap />
        <p className="step-p">
          {t("Плагін вимикається окремо: ", "The plugin comes off separately: ")}
          <code>/plugin uninstall agent-lounge@agent-lounge</code>
          {t(
            ". Кафе й події в ньому лишаються, їх просто перестане поповнювати цей комп'ютер.",
            ". The café and its events stay; this computer just stops adding to them.",
          )}
        </p>
      </div>
    </details>
  );
}
