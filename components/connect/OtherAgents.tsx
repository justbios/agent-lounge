"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import {
  RELAY_SH,
  codexHookSettings,
  copilotHookSettings,
  geminiHookSettings,
  opencodePlugin,
  saveScript,
} from "@/lib/live/hookConfig.mjs";
import pack from "@/lib/live/pluginPack.json";
import { SOURCES } from "@/lib/live/source";
import { AgentSrc } from "@/lib/live/types";
import { Two, Ui, tr, useTr, useUi } from "@/lib/i18n";
import Code from "./Code";

const AGENTS: AgentSrc[] = ["codex", "copilot", "gemini", "opencode", "cursor"];

/** What the café sees of each agent, and what it can't do for it. */
const SEES: Record<AgentSrc, Two> = {
  codex: {
    uk:
      "Codex сідає за стіл з усіма субагентами й діями, а його запит дозволу можна схвалити з телефона так само, як " +
      "у Claude. Токенів і лімітів кафе не бачить: Codex не дає їх хукам.",
    en:
      "Codex sits at a table with all its subagents and actions, and you can approve its permission requests from " +
      "your phone just as with Claude. The café doesn't see its tokens or limits: Codex doesn't give them to hooks.",
  },
  copilot: {
    uk:
      "Copilot CLI видно з субагентами, діями й «чекає на тебе». Відповісти йому з кафе не вийде: його хук дозволу " +
      "спрацьовує на кожну перевірку, а не лише тоді, коли він питає тебе.",
    en:
      "Copilot CLI shows with its subagents, actions and “waiting for you”. You can't answer it from the café: its " +
      "permission hook runs on every check, not only when it asks you.",
  },
  gemini: {
    uk:
      "Gemini CLI видно з діями й «чекає на тебе». Субагентів у Gemini нема, а схвалити запит з кафе не вийде: його " +
      "хуки вміють лише заборонити інструмент, а не дозволити.",
    en:
      "Gemini CLI shows with its actions and “waiting for you”. Gemini has no subagents, and you can't approve a " +
      "request from the café: its hooks can only deny a tool, not allow one.",
  },
  opencode: {
    uk:
      "OpenCode підключається плагіном, без скрипта хуків. Видно його дії, субагентів і «чекає на тебе»; відповідати " +
      "йому з кафе поки не можна.",
    en:
      "OpenCode connects with a plugin, without the hook script. Its actions, subagents and “waiting for you” show; " +
      "you can't answer it from the café yet.",
  },
  cursor: {
    uk:
      "Cursor сам запускає хуки Claude Code з ~/.claude/settings.json, поки в його налаштуваннях увімкнено «Include " +
      "Third-Party Plugins, Skills, and Other Configs», а так за замовчуванням. Тож коли Claude Code уже підключено, " +
      "чати Cursor теж сідають за столи, з позначкою Cursor. Чекання на тебе Cursor хукам не віддає.",
    en:
      "Cursor runs Claude Code's hooks from ~/.claude/settings.json itself while “Include Third-Party Plugins, " +
      "Skills, and Other Configs” is on in its settings, which it is by default. So once Claude Code is connected, " +
      "Cursor's chats sit at the tables too, marked Cursor. Cursor doesn't tell hooks when it waits for you.",
  },
};

/** relay.sh's first step, the same for every agent that runs hooks: save it and check it. */
function scriptStep(site: string, ui: Ui, codex: boolean): string {
  const file = RELAY_SH.replace("$HOME", "~");
  const away = codex
    ? tr(
        ui,
        ` Коли ти просиш дозволу, а я ввімкнув «Я не за комп'ютером» на цьому комп'ютері (sh ${file} away on), він показує запит у кафе й до 10 хвилин чекає на мою відповідь, підписану телефоном, спареним з цим комп'ютером; інакше нічого не відповідає, і ти питаєш мене як завжди.`,
        ` If I've turned on “I'm away” on this computer (sh ${file} away on), then when you ask for permission, it shows the request in the café and waits up to 10 minutes for my answer, signed by the phone paired with this computer; otherwise it answers nothing, and you ask me as usual.`,
      )
    : "";
  return tr(
    ui,
    `1. Збережи скрипт хуків Agent Lounge і звір його суму, вона має бути ${pack.script}:
${saveScript(site)}
Якщо сума інша, зупинись і скажи мені. Скрипт короткий, прочитай його: він пересилає подію хука в кафе, а ключ кафе шле в заголовку, не в адресі.${away}`,
    `1. Save the Agent Lounge hook script and check its checksum, which must be ${pack.script}:
${saveScript(site)}
If the checksum is different, stop and tell me. The script is short, so read it: it forwards the hook event to the café and sends the café key in a header, not in the address.${away}`,
  );
}

/** The phrase for that agent: the words follow the viewer's language, every command, path and key stays the same. */
function phrase(src: Exclude<AgentSrc, "cursor">, site: string, url: string, ui: Ui): string {
  const name = SOURCES[src];
  const head = tr(
    ui,
    `Підключи мій ${name} до Agent Lounge — сайту, який показує моїх агентів наживо.`,
    `Connect my ${name} to Agent Lounge, a site that shows my agents live.`,
  );
  const done = tr(
    ui,
    `Скажи мені відкрити ${site}/connect: щойно ти зробиш будь-яку дію, у кафе з'явиться цей чат з позначкою ${name}.`,
    `Tell me to open ${site}/connect: as soon as you take any action, this chat shows up in the café marked ${name}.`,
  );
  if (src === "opencode") {
    return tr(
      ui,
      `${head}

1. Збережи код нижче як ~/.config/opencode/plugins/agent-lounge.js, замінивши файл, якщо він уже є. Прочитай його: вміст файлів і вивід команд плагін не шле, а ключ кафе передає в заголовку. Скрипт хуків для цього не потрібен.
2. Скажи мені перезапустити OpenCode. ${done}

${opencodePlugin(url)}`,
      `${head}

1. Save the code below as ~/.config/opencode/plugins/agent-lounge.js, replacing the file if it's already there. Read it: the plugin never sends file contents or command output, and it passes the café key in a header. The hook script isn't needed for this.
2. Tell me to restart OpenCode. ${done}

${opencodePlugin(url)}`,
    );
  }
  const hooks = {
    codex: tr(
      ui,
      `2. Додай у ~/.codex/hooks.json хуки з JSON нижче. Інші хуки залиш як є, а ті, що містять "/api/claude-hook", заміни цими. Перед зміною збережи копію файлу як hooks.json.bak-relay.
3. Скажи мені відкрити /hooks у Codex і довірити нові хуки: доти Codex їх пропускає.
4. ${done}`,
      `2. Add the hooks from the JSON below to ~/.codex/hooks.json. Leave other hooks as they are, and replace the ones containing "/api/claude-hook" with these. Before the change, save a copy of the file as hooks.json.bak-relay.
3. Tell me to open /hooks in Codex and trust the new hooks: until then Codex skips them.
4. ${done}`,
    ),
    copilot: tr(
      ui,
      `2. Збережи JSON нижче як ~/.copilot/hooks/agent-lounge.json, замінивши файл, якщо він уже є. Інших файлів у ~/.copilot/hooks не чіпай.
3. Скажи мені перезапустити Copilot CLI. ${done}`,
      `2. Save the JSON below as ~/.copilot/hooks/agent-lounge.json, replacing the file if it's already there. Don't touch other files in ~/.copilot/hooks.
3. Tell me to restart Copilot CLI. ${done}`,
    ),
    gemini: tr(
      ui,
      `2. Додай у ~/.gemini/settings.json хуки з JSON нижче. Усі інші налаштування й хуки залиш як є, а ті, що містять "/api/claude-hook", заміни цими. Перед зміною збережи копію файлу як settings.json.bak-relay.
3. Скажи мені перезапустити Gemini CLI. ${done}`,
      `2. Add the hooks from the JSON below to ~/.gemini/settings.json. Leave all other settings and hooks as they are, and replace the ones containing "/api/claude-hook" with these. Before the change, save a copy of the file as settings.json.bak-relay.
3. Tell me to restart Gemini CLI. ${done}`,
    ),
  }[src];
  const json = { codex: codexHookSettings, copilot: copilotHookSettings, gemini: geminiHookSettings }[src](url);
  return `${head}

${scriptStep(site, ui, src === "codex")}
${hooks}

${JSON.stringify(json, null, 2)}`;
}

/** Codex, Copilot, Gemini and OpenCode at the same tables: a phrase for each, which that agent carries out itself. */
export default function OtherAgents({ site, url }: { site: string; url: string }) {
  const ui = useUi();
  const t = useTr();
  const [src, setSrc] = useState<AgentSrc>("codex");
  return (
    <div className="step">
      <div className="step-n">
        <Bot size={14} />
      </div>
      <div className="step-body">
        <div className="step-ttl">{t("Інші агенти", "Other agents")}</div>
        <p className="step-p">
          {t(
            "Codex, Copilot, Gemini і OpenCode теж сідають за столи в цьому кафе. Головний агент зветься їхнім ім'ям, " +
              "а на дошці всіх чатів має позначку. Віддай фразу самому агентові: він збереже хуки, як і Claude.",
            "Codex, Copilot, Gemini and OpenCode sit at the tables of this café too. The main agent goes by their " +
              "name and is marked on the board of all chats. Give the phrase to the agent itself: it saves the hooks, " +
              "just as Claude does.",
          )}
        </p>
        <div className="viewseg os-pick agent-pick" role="radiogroup" aria-label={t("агент", "agent")}>
          {AGENTS.map((a) => (
            <button
              key={a}
              role="radio"
              aria-checked={src === a}
              className={src === a ? "on" : ""}
              onClick={() => setSrc(a)}
            >
              {SOURCES[a]}
            </button>
          ))}
        </div>
        <p className="step-p">{SEES[src][ui]}</p>
        {src !== "cursor" && <Code text={phrase(src, site, url, ui)} wrap />}
      </div>
    </div>
  );
}
