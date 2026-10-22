"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Radio, ArrowLeft, TerminalSquare, ShieldCheck, Sparkles, Smartphone, RefreshCw, Puzzle } from "lucide-react";
import {
  HOOK_URL,
  KEY_HEADER,
  RELAY_SH,
  STATUS_LINE,
  cloudHookSettings,
  cloudHookUrl,
  hookSettings,
  httpHookSettings,
  pluginSteps,
  saveScript,
  splitKey,
  statusChain,
} from "@/lib/live/hookConfig.mjs";
import { useAccess } from "@/lib/live/access";
import pack from "@/lib/live/pluginPack.json";
import { PRIVATE_CAFE, newKey, saveKey, useHosted, useRelayKey } from "@/lib/live/relayKey";
import { useMe } from "@/lib/live/team";
import { Two, Ui, tr, useTr, useUi } from "@/lib/i18n";
import { CafeSwitcher, JoinTeam, MemberName, TeamInvite, useTeamInvite } from "./connect/TeamConnect";
import Code from "./connect/Code";
import Disconnect from "./connect/Disconnect";
import HookStatus from "./connect/HookStatus";
import OtherAgents from "./connect/OtherAgents";
import TeamKeys from "./connect/TeamKeys";
import KeyLost from "./live/KeyLost";
import OwnCafe from "./live/OwnCafe";

/** The phrase for Claude: the words follow the viewer's language, every command, path and key stays the same. */
function cloudPrompt(site: string, url: string, ui: Ui): string {
  const { url: bare, key } = splitKey(url);
  const check = `echo '{"session_id":"relay-check","cwd":"'"$PWD"'","hook_event_name":"UserPromptSubmit","prompt":"перевірка Agent Lounge"}' | curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' -H '${KEY_HEADER}: ${key}' --data-binary @- '${bare}'`;
  const file = RELAY_SH.replace("$HOME", "~");
  const save = saveScript(site);
  const status = `"statusLine": ${JSON.stringify(STATUS_LINE)}`;
  const json = JSON.stringify(cloudHookSettings(url), null, 2);
  return tr(
    ui,
    `Підключи мій Claude Code до Agent Lounge — сайту, який показує моїх агентів наживо. Хуки не витрачають токенів і не гальмують тебе: усі асинхронні, крім хуків на запит дозволу, на твої питання до мене й на план, а вони чекають на кафе лише тоді, коли я сам увімкнув на цьому комп'ютері «Я не за комп'ютером».

1. Збережи скрипт хуків Agent Lounge і звір його суму, вона має бути ${pack.script}:
${save}
Якщо сума інша, зупинись і скажи мені. Скрипт короткий, прочитай його: він пересилає подію хука в кафе, а з транскрипту чату бере лише назву чату й лічильники токенів. Коли ти просиш дозволу, питаєш мене з варіантами відповіді чи показуєш план, а я ввімкнув «Я не за комп'ютером» на цьому комп'ютері (sh ${file} away on), він показує це в кафе і до 10 хвилин чекає на мою відповідь: «дозволити раз» чи «заборонити», вибраний варіант, «затвердити план» чи «ні». Відповідь він приймає, лише коли її підписав мій телефон, спарений з цим комп'ютером (sh ${file} pair), і саме для того запиту, який він надіслав; інакше нічого не відповідає, і ти питаєш мене як завжди. Ключ кафе він шле в заголовку, а не в адресі.
2. Додай у ~/.claude/settings.json хуки з JSON нижче. Усі інші налаштування й хуки залиш як є. Якщо там уже є хуки, що містять "/api/claude-hook", заміни їх цими. Перед зміною збережи копію файлу як settings.json.bak-relay.
3. Ліміти підписки (5 годин і тиждень) Claude Code віддає лише статус-рядку. Якщо в settings.json немає "statusLine", додай:
${status}
Якщо вже є, не замінюй його, а заміни лише команду на цю, підставивши стару:
${statusChain("<стара команда>")}
4. Перевір підключення командою нижче, вона має вивести 204:
${check}
Якщо виведе 410, ключ у посиланні вже не діє: кафе перейшло на особисті ключі або власник прибрав цей ключ. Тоді скажи мені попросити у власника кафе нове особисте запрошення.
5. Скажи мені відкрити ${site}/connect: щойно ти зробиш будь-яку дію, там з'явиться «Claude підключений».

${json}`,
    `Connect my Claude Code to Agent Lounge, a site that shows my agents live. The hooks spend no tokens and don't slow you down: they're all async, except the hooks on permission requests, on your questions to me and on plans, and those wait on the café only when I've turned on “I'm away” on this computer myself.

1. Save the Agent Lounge hook script and check its checksum, which must be ${pack.script}:
${save}
If the checksum is different, stop and tell me. The script is short, so read it: it forwards the hook event to the café, and from the chat transcript it takes only the chat's name and the token counts. If I've turned on “I'm away” on this computer (sh ${file} away on), then whenever you ask for permission, ask me a question with answer options or show a plan, the script shows it in the café and waits up to 10 minutes for my answer: “allow once” or “deny”, the chosen option, “approve plan” or “no”. It accepts an answer only when my phone paired with this computer has signed it (sh ${file} pair), and only for the very request it sent; otherwise it answers nothing, and you ask me as usual. It sends the café key in a header, not in the address.
2. Add the hooks from the JSON below to ~/.claude/settings.json. Leave all other settings and hooks as they are. If there are already hooks containing "/api/claude-hook", replace them with these. Before the change, save a copy of the file as settings.json.bak-relay.
3. Claude Code hands the subscription limits (5-hour and weekly) only to the status line. If settings.json has no "statusLine", add:
${status}
If it already has one, don't replace it; replace only its command with this one, putting the old command in:
${statusChain("<old command>")}
4. Check the connection with the command below; it must print 204:
${check}
If it prints 410, the key in the link no longer works: the café moved to personal keys, or the owner removed this key. Then tell me to ask the café owner for a new personal invite.
5. Tell me to open ${site}/connect: as soon as you take any action, “Claude connected” will appear there.

${json}`,
  );
}

function httpPrompt(site: string, url: string, ui: Ui): string {
  const json = JSON.stringify(httpHookSettings(url), null, 2);
  return tr(
    ui,
    `Підключи мій Claude Code до Agent Lounge — сайту, який показує моїх агентів наживо. Скриптів не треба: Claude Code сам надсилає подію хука на сайт, а сайт відповідає одразу.

1. Додай у ~/.claude/settings.json (на Windows це %USERPROFILE%\\.claude\\settings.json) хуки з JSON нижче. Усі інші налаштування й хуки залиш як є. Якщо там уже є хуки, що містять "/api/claude-hook", заміни їх цими. Перед зміною збережи копію файлу як settings.json.bak-relay.
2. Не надсилай у кафе тестових подій руками (curl, Invoke-WebRequest): там вони виглядають як справжні. Перевіркою буде твоя наступна дія.
3. Скажи мені відкрити ${site}/connect: щойно ти зробиш будь-яку дію, там з'явиться «Claude підключений». Якщо за хвилину нічого, скажи мені відкрити новий чат Claude Code.

${json}`,
    `Connect my Claude Code to Agent Lounge, a site that shows my agents live. No scripts needed: Claude Code sends each hook event to the site itself, and the site answers right away.

1. Add the hooks from the JSON below to ~/.claude/settings.json (on Windows it's %USERPROFILE%\\.claude\\settings.json). Leave all other settings and hooks as they are. If there are already hooks containing "/api/claude-hook", replace them with these. Before the change, save a copy of the file as settings.json.bak-relay.
2. Don't send test events to the café by hand (curl, Invoke-WebRequest): there they look like real ones. Your next action will be the check.
3. Tell me to open ${site}/connect: as soon as you take any action, “Claude connected” will appear there. If nothing shows up within a minute, tell me to open a new Claude Code chat.

${json}`,
  );
}

const OSES = [
  ["nix", "macOS · Linux"],
  ["win", "Windows"],
] as const;
const noSub = () => () => {};

const LOST_LOCKED: Two = {
  uk:
    "Особистий ключ потрапив не туди? Власник кафе прибирає його і дає нове запрошення. " +
    "Новий ключ нижче відкриє окреме порожнє кафе.",
  en:
    "Your personal key ended up in the wrong hands? The café owner removes it and gives you a new invite. " +
    "A new key below opens a separate, empty café.",
};
const LOST_SHARED: Two = {
  uk:
    "Якщо посилання з ключем потрапило не туди, візьми новий ключ і знову віддай фразу вище своєму Claude: " +
    "старі хуки він замінить.",
  en:
    "If the link with your key ended up in the wrong hands, take a new key and give the phrase above to your " +
    "Claude again: it will replace the old hooks.",
};

function CloudConnect({ site, roomKey }: { site: string; roomKey: string }) {
  const ui = useUi();
  const t = useTr();
  const me = useMe(roomKey);
  const access = useAccess(roomKey);
  const url = cloudHookUrl(site, roomKey, access?.name ?? me);
  const winUA = useSyncExternalStore(noSub, () => /Windows/i.test(navigator.userAgent), () => false);
  const [os, setOs] = useState<"nix" | "win" | null>(null);
  const win = (os ?? (winUA ? "win" : "nix")) === "win";
  if (access?.lost) return <KeyLost kind={access.lost} current={roomKey} />;
  return (
    <>
      <div className="notice">
        <ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        {t(
          "Хук шле сюди лише короткі описи: назву чату, початок питання, назви файлів, опис команди, імена агентів, а ще " +
            "лічильники токенів і відсотки лімітів підписки. Вміст файлів і повний текст відкидаються одразу. Усе лежить " +
            "під твоїм ключем: бачиш лише ти і ті, кому ти сам даси посилання. Зберігається добу. Хук асинхронний, тож " +
            "не гальмує агентів і не витрачає токенів.",
          "The hook sends only short descriptions here: the chat's name, the start of a question, file names, what a " +
            "command does, agent names, plus token counts and subscription limit percentages. File contents and full " +
            "text are dropped right away. Everything sits under your key: only you can see it, and whoever you give " +
            "the link to. It's kept for a day. The hook is async, so it doesn't slow agents down or spend tokens.",
        )}
      </div>

      <div className="step">
        <div className="step-n">
          <Sparkles size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">{t("Віддай це своєму Claude", "Give this to your Claude")}</div>
          <div className="viewseg os-pick" role="radiogroup" aria-label={t("система", "system")}>
            {OSES.map(([id, label]) => (
              <button
                key={id}
                role="radio"
                aria-checked={win === (id === "win")}
                className={win === (id === "win") ? "on" : ""}
                onClick={() => setOs(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {win ? (
            <p className="step-p">
              {t(
                "Встав у будь-який чат Claude Code. Він допише хуки в налаштування, і далі Claude Code сам слатиме сюди " +
                  "кожну подію, без скриптів і bash. Кафе бачитиме всі дії агентів, але без назв чатів, токенів і " +
                  "лімітів підписки: їх читає скрипт, а йому потрібен sh. Стоїть Git Bash? Тоді бери «macOS · Linux».",
                "Paste it into any Claude Code chat. It adds the hooks to the settings, and from then on Claude Code " +
                  "itself sends every event here, with no scripts or bash. The café will see all the agents' actions, " +
                  "but no chat names, tokens or subscription limits: the script reads those, and it needs sh. Have Git " +
                  "Bash? Then pick “macOS · Linux”.",
              )}
            </p>
          ) : (
            <p className="step-p">
              {t(
                "Встав у будь-який чат Claude Code. Він збереже короткий скрипт хуків у ",
                "Paste it into any Claude Code chat. It saves a short hook script in ",
              )}
              <code>~/.config/relay</code>
              {t(
                ", допише хуки й статус-рядок у налаштування і перевірить зв'язок, це з пів хвилини.",
                ", adds the hooks and the status line to the settings and checks the connection, in about half a minute.",
              )}
            </p>
          )}
          <MemberName roomKey={roomKey} fixed={access?.name ?? null} />
          <Code text={win ? httpPrompt(site, url, ui) : cloudPrompt(site, url, ui)} wrap />
          <p className="step-p">
            {t(
              "Далі просто працюй, а тут, на вкладці «наживо», за столами сидітимуть твої агенти. Кожен чат на окремій " +
                "вкладці, у кожного агента свої токени. Відсотки лімітів підписки приходять зі статус-рядка. Якщо Claude " +
                "вперся в ліміт, тут буде «ліміт вичерпано», навіть коли статус-рядок не запускається.",
              "Then just work, and here, on the “live” tab, your agents will sit at the tables. Each chat gets its own " +
                "tab, each agent its own tokens. Subscription limit percentages come from the status line. If Claude " +
                "hits a limit, you'll see “limit reached” here even when the status line doesn't run.",
            )}
          </p>
        </div>
      </div>

      <HookStatus roomKey={roomKey} me={access?.name ?? me} />

      <div className="step">
        <div className="step-n">
          <Puzzle size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">{t("Або плагіном Claude Code", "Or as a Claude Code plugin")}</div>
          <p className="step-p">
            {t("Ті самі хуки, тільки з плагіна: хуки не пишуться в ", "The same hooks, only from a plugin: they aren't written to ")}
            <code>settings.json</code>
            {t(", а посилання на кафе лежить в окремому файлі ", ", and the café link lives in a separate file, ")}
            <code>~/.config/relay/hook-url</code>
            {t(". Статус-рядок для лімітів ", ". For the limits status line, ")}
            <code>/agent-lounge:connect</code>
            {t(
              " запропонує додати окремо. Встав по черзі в чат Claude Code:",
              " offers to add it separately. Paste these into a Claude Code chat one at a time:",
            )}
          </p>
          <Code text={pluginSteps(`${site}/marketplace.json`, url)} wrap />
          <p className="step-p">
            {t("Перевірити: ", "Check: ")}
            <code>/agent-lounge:status</code>
            {t(". Вимкнути: ", ". Turn off: ")}
            <code>/plugin disable agent-lounge</code>.
          </p>
        </div>
      </div>

      <OtherAgents site={site} url={url} />

      <div className="step">
        <div className="step-n">
          <Smartphone size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">{t("Телефон, що дзвонить, коли Claude чекає", "A phone that rings when Claude waits")}</div>
          <p className="step-p">
            {t(
              "Відкрий це посилання на телефоні чи іншому комп'ютері. У ньому твій ключ, тож нікому його не показуй.",
              "Open this link on your phone or another computer. It holds your key, so don't show it to anyone.",
            )}
          </p>
          <Code text={`${site}/#k=${roomKey}`} wrap />
          <p className="step-p">
            {t(
              "Далі на «наживо» натисни «сповіщення» → «Пуш на цей пристрій». Телефон дзвенітиме, коли Claude просить " +
                "дозвіл або чекає на відповідь, навіть із закритим сайтом. На iPhone спершу «Поділитися» → «На " +
                "початковий екран», відкрий Agent Lounge з іконки і встав це посилання ще раз: iPhone тримає дані іконки " +
                "окремо від Safari.",
              "Then on “live” tap “notifications” → “Push to this device”. The phone will ring when Claude asks for " +
                "permission or waits for an answer, even with the site closed. On iPhone, first tap “Share” → “Add to " +
                "Home Screen”, open Agent Lounge from the icon and paste this link again: iPhone keeps the icon's data " +
                "apart from Safari.",
            )}
          </p>
        </div>
      </div>

      {access && !access.locked && <TeamInvite site={site} roomKey={roomKey} />}
      {access && <TeamKeys site={site} roomKey={roomKey} access={access} />}

      <details className="step-more">
        <summary className="step-ttl">{t("Новий ключ", "New key")}</summary>
        <div className="step-body">
          <p className="step-p">{(access?.locked ? LOST_LOCKED : LOST_SHARED)[ui]}</p>
          <button className="btn" onClick={() => saveKey(newKey())}>
            <RefreshCw size={13} />{" "}
            {access?.locked ? t("нове порожнє кафе", "new empty café") : t("новий ключ", "new key")}
          </button>
        </div>
      </details>

      <Disconnect />
    </>
  );
}

const LOCAL_PROMPT: Two = {
  uk: "Підключи Agent Lounge до мого Claude Code: прочитай setup.md у цьому репозиторії й виконай усі кроки звідти.",
  en: "Connect Agent Lounge to my Claude Code: read setup.md in this repository and follow all the steps in it.",
};
const MANUAL = `cd ~/agent-lounge
npm install
npm run setup`;
const SETTINGS = JSON.stringify(hookSettings(), null, 2);
const PLUGIN_LOCAL = `claude plugin marketplace add ~/agent-lounge
claude plugin install agent-lounge@agent-lounge`;
const TEST = `echo '{"session_id":"test","cwd":"/tmp/demo","hook_event_name":"UserPromptSubmit","prompt":"привіт, Agent Lounge"}' \\
  | curl -s -H 'content-type: application/json' --data-binary @- ${HOOK_URL}`;

function LocalConnect() {
  const ui = useUi();
  const t = useTr();
  return (
    <>
      <div className="notice">
        <ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        {t(
          "Цей Agent Lounge працює на твоєму комп'ютері: хук шле події лише на ",
          "This Agent Lounge runs on your computer: the hook sends events only to ",
        )}
        <code>127.0.0.1:3737</code>
        {t(
          ", у мережу нічого не йде. Хук асинхронний і мовчазний, тож не гальмує агентів і не витрачає токенів.",
          ", and nothing goes out to the network. The hook is async and silent, so it doesn't slow agents down or " +
            "spend tokens.",
        )}
      </div>

      <div className="step">
        <div className="step-n">
          <Sparkles size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">{t("Віддай це своєму Claude", "Give this to your Claude")}</div>
          <Code text={LOCAL_PROMPT[ui]} wrap />
        </div>
      </div>

      <div className="step">
        <div className="step-n">
          <TerminalSquare size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">{t("Або сам", "Or by hand")}</div>
          <Code text={MANUAL} />
          <p className="step-p">
            <code>npm run setup</code>
            {t(" дописує хук у ", " adds the hook to ")}
            <code>~/.claude/settings.json</code>
            {t(
              " (інші налаштування не чіпає, стару версію зберігає як ",
              " (leaves the other settings alone and saves the old version as ",
            )}
            <code>settings.json.bak-relay</code>
            {t("), кладе скрипт хуків у ", "), puts the hook script in ")}
            <code>~/.config/relay</code>
            {t(" і запускає Agent Lounge у фоні. Після перезавантаження: ", " and starts Agent Lounge in the background. After a reboot: ")}
            <code>npm run up</code>
            {t(". Зупинити: ", ". Stop: ")}
            <code>npm run down</code>
            {t(", прибрати хук: ", ", remove the hook: ")}
            <code>npm run unhook</code>.
          </p>
        </div>
      </div>

      <div className="step">
        <div className="step-n">
          <Puzzle size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">{t("Або плагіном Claude Code", "Or as a Claude Code plugin")}</div>
          <p className="step-p">
            {t(
              "Плагін лежить у самому репозиторії, тож нічого не качається з мережі. У терміналі:",
              "The plugin lives in the repository itself, so nothing is downloaded from the network. In a terminal:",
            )}
          </p>
          <Code text={PLUGIN_LOCAL} />
          <p className="step-p">
            {t("Далі в чаті Claude Code: ", "Then in a Claude Code chat: ")}
            <code>/agent-lounge:connect local</code>
            {t(". Agent Lounge при цьому має працювати: ", ". Agent Lounge has to be running for this: ")}
            <code>npm run up</code>.
          </p>
        </div>
      </div>

      <details className="step-more">
        <summary className="step-ttl">{t("Хук вручну й перевірка", "The hook by hand, and a check")}</summary>
        <div className="step-body">
          <p className="step-p">
            {t("Блок для ", "A block for ")}
            <code>~/.claude/settings.json</code>
            {t(
              ", поряд з іншими ключами. Діє на всі проєкти й нові сесії, включно з desktop-застосунком і worktree. " +
                "Хуки запускають скрипт ",
              ", next to the other keys. It applies to all projects and new sessions, including the desktop app and " +
                "worktrees. The hooks run the script ",
            )}
            <code>~/.config/relay/relay.sh</code>
            {t(", його кладе туди ", ", which ")}
            <code>npm run hooks</code>
            {t(". Ліміти підписки бачить лише статус-рядок: ", " puts there. Only the status line sees the subscription limits: ")}
            <code>node scripts/install-hooks.mjs --statusline</code>.
          </p>
          <Code text={SETTINGS} />
          <p className="step-p">
            {t(
              "Перевірка: у кафе з'явиться сесія «demo» з питанням над головою Claude.",
              "Check: a “demo” session shows up in the café with a question over Claude's head.",
            )}
          </p>
          <Code text={TEST} />
        </div>
      </details>
    </>
  );
}

export default function ConnectPanel() {
  const t = useTr();
  const hosted = useHosted();
  const roomKey = useRelayKey();
  const invite = useTeamInvite();

  useEffect(() => {
    if (hosted && !roomKey && !invite && !PRIVATE_CAFE) saveKey(newKey());
  }, [hosted, roomKey, invite]);

  return (
    <div className="connect-wrap">
      <Link className="back" href="/">
        <ArrowLeft size={15} /> {t("назад до кафе", "back to the café")}
      </Link>

      <div className="connect-head">
        <span className="brand-badge">
          <Radio size={20} />
        </span>
        <div>
          <h1>{t("Підключи свій Claude", "Connect your Claude")}</h1>
          <p className="connect-sub">
            {t(
              "Твої справжні агенти сядуть за столи: хто працює, що саме робить, кому несе задачу. Кожен чат на окремій " +
                "вкладці, уся команда з ",
              "Your real agents take their seats at the tables: who's working, what exactly they're doing, who they're " +
                "carrying a task to. Each chat on its own tab, the whole team from ",
            )}
            <code>.claude/agents</code>
            {t(" за своїми столами.", " at their own tables.")}
          </p>
        </div>
      </div>

      {hosted === false && <LocalConnect />}
      {hosted && invite && <JoinTeam teamKey={invite} current={roomKey} />}
      {hosted && !roomKey && !invite && PRIVATE_CAFE && <OwnCafe />}
      {hosted && roomKey && !invite && (
        <>
          <CafeSwitcher current={roomKey} />
          <CloudConnect site={location.origin} roomKey={roomKey} />
        </>
      )}
    </div>
  );
}
