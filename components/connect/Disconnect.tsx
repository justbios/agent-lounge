"use client";

import { RELAY_SH, STATUS_LINE, statusChain } from "@/lib/live/hookConfig.mjs";
import Code from "./Code";

const OFF = `Відключи мій Claude Code від Agent Lounge — сайту, який показував моїх агентів наживо. Чіпай лише записи Agent Lounge, усе інше в налаштуваннях залиш як є.

1. Збережи копію ~/.claude/settings.json (на Windows це %USERPROFILE%\\.claude\\settings.json) як settings.json.bak-relay-off.
2. Якщо поруч лежить settings.json.bak-relay — копія, зроблена перед підключенням, — порівняй її з поточним файлом. Якщо вони різняться лише хуками й статус-рядком Agent Lounge, віднови цю копію і переходь до кроку 5.
3. Інакше прибери з "hooks" кожен хук, у "command" чи "url" якого є "/api/claude-hook", а потім групи й події, що лишились порожніми. Інші хуки не чіпай.
4. Статус-рядок. Якщо його команда — ${STATUS_LINE.command}, прибери "statusLine" повністю. Якщо вона має вигляд
${statusChain("<стара команда>")}
залиш у ній лише <стару команду>. Будь-який інший статус-рядок не чіпай.
5. Якщо в мене стоїть плагін agent-lounge, скажи мені виконати в чаті /plugin uninstall agent-lounge@agent-lounge: його хуки живуть у плагіні, а не в settings.json.
6. Тека ${RELAY_SH.replace("/relay.sh", "").replace("$HOME", "~")} з копією скрипта й посиланням на кафе лишається. Спитай мене, чи видалити її: у посиланні мій ключ.
7. Перевір, що в settings.json більше немає "/api/claude-hook" і "relay.sh", і коротко скажи, що змінилось. Хуки перестануть працювати з наступного чату Claude Code.`;

/** Takes Agent Lounge back out of Claude Code: only its hooks and status line, the rest of the settings untouched. */
export default function Disconnect() {
  return (
    <details className="step-more">
      <summary className="step-ttl">Відключити Agent Lounge</summary>
      <div className="step-body">
        <p className="step-p">
          Встав у чат Claude Code. Він збереже копію налаштувань і прибере з них лише хуки й статус-рядок Agent Lounge.
          Якщо після підключення ти більше нічого там не міняв, він просто поверне копію{" "}
          <code>settings.json.bak-relay</code>, зроблену перед підключенням. Решта налаштувань лишиться як була.
        </p>
        <Code text={OFF} wrap />
        <p className="step-p">
          Плагін вимикається окремо: <code>/plugin uninstall agent-lounge@agent-lounge</code>. Кафе й події в ньому
          лишаються, їх просто перестане поповнювати цей комп&apos;ютер.
        </p>
      </div>
    </details>
  );
}
