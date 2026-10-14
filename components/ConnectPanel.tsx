"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Radio, ArrowLeft, Copy, Check, TerminalSquare, ShieldCheck, Sparkles, Smartphone, RefreshCw, Puzzle } from "lucide-react";
import {
  HOOK_URL,
  RELAY_SH,
  STATUS_LINE,
  cloudHookSettings,
  cloudHookUrl,
  hookSettings,
  httpHookSettings,
  pluginSteps,
  statusChain,
} from "@/lib/live/hookConfig.mjs";
import { useAccess } from "@/lib/live/access";
import pack from "@/lib/live/pluginPack.json";
import { newKey, saveKey, useHosted, useRelayKey } from "@/lib/live/relayKey";
import { useMe } from "@/lib/live/team";
import { CafeSwitcher, JoinTeam, MemberName, TeamInvite, useTeamInvite } from "./connect/TeamConnect";
import HookStatus from "./connect/HookStatus";
import TeamKeys from "./connect/TeamKeys";
import KeyLost from "./live/KeyLost";

function Code({ text, wrap }: { text: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={wrap ? "codeblock wrap" : "codeblock"}>
      <button
        className="copybtn"
        onClick={() => {
          navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "скопійовано" : "копіювати"}
      </button>
      <pre>{text}</pre>
    </div>
  );
}

function cloudPrompt(site: string, url: string): string {
  const check = `echo '{"session_id":"relay-check","cwd":"'"$PWD"'","hook_event_name":"UserPromptSubmit","prompt":"перевірка Relay"}' | curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' --data-binary @- '${url}'`;
  const file = RELAY_SH.replace("$HOME", "~");
  return `Підключи мій Claude Code до Relay — сайту, який показує моїх агентів наживо. Хуки не витрачають токенів і не гальмують тебе: усі асинхронні, крім хуків на запит дозволу, на твої питання до мене й на план, а вони чекають на кафе лише тоді, коли там увімкнено «Я не за комп'ютером».

1. Збережи скрипт хуків Relay і звір його суму, вона має бути ${pack.script}:
mkdir -p ~/.config/relay && curl -fsS ${site}/relay.sh -o ${file} && (shasum -a 256 ${file} || sha256sum ${file})
Якщо сума інша, зупинись і скажи мені. Скрипт короткий, прочитай його: він пересилає подію хука в кафе, а з транскрипту чату бере лише назву чату й лічильники токенів. Коли ти просиш дозволу, питаєш мене з варіантами відповіді чи показуєш план, а в кафе ввімкнено «Я не за комп'ютером», він показує це там і до 10 хвилин чекає на мою відповідь: «дозволити раз» чи «заборонити», вибраний варіант, «затвердити план» чи «ні»; інакше нічого не відповідає, і ти питаєш мене як завжди.
2. Додай у ~/.claude/settings.json хуки з JSON нижче. Усі інші налаштування й хуки залиш як є. Якщо там уже є хуки, що містять "/api/claude-hook", заміни їх цими. Перед зміною збережи копію файлу як settings.json.bak-relay.
3. Ліміти підписки (5 годин і тиждень) Claude Code віддає лише статус-рядку. Якщо в settings.json немає "statusLine", додай:
"statusLine": ${JSON.stringify(STATUS_LINE)}
Якщо вже є, не замінюй його, а заміни лише команду на цю, підставивши стару:
${statusChain("<стара команда>")}
4. Перевір підключення командою нижче, вона має вивести 204:
${check}
Якщо виведе 410, ключ у посиланні вже не діє: кафе перейшло на особисті ключі або власник прибрав цей ключ. Тоді скажи мені попросити у власника кафе нове особисте запрошення.
5. Скажи мені відкрити ${site}/connect: щойно ти зробиш будь-яку дію, там з'явиться «Claude підключений».

${JSON.stringify(cloudHookSettings(url), null, 2)}`;
}

function httpPrompt(site: string, url: string): string {
  return `Підключи мій Claude Code до Relay — сайту, який показує моїх агентів наживо. Скриптів не треба: Claude Code сам надсилає подію хука на сайт, а сайт відповідає одразу.

1. Додай у ~/.claude/settings.json (на Windows це %USERPROFILE%\\.claude\\settings.json) хуки з JSON нижче. Усі інші налаштування й хуки залиш як є. Якщо там уже є хуки, що містять "/api/claude-hook", заміни їх цими. Перед зміною збережи копію файлу як settings.json.bak-relay.
2. Скажи мені відкрити ${site}/connect: щойно ти зробиш будь-яку дію, там з'явиться «Claude підключений». Якщо за хвилину нічого, скажи мені відкрити новий чат Claude Code.

${JSON.stringify(httpHookSettings(url), null, 2)}`;
}

const OSES = [
  ["nix", "macOS · Linux"],
  ["win", "Windows"],
] as const;
const noSub = () => () => {};

const LOST_LOCKED =
  "Особистий ключ потрапив не туди? Власник кафе прибирає його і дає нове запрошення. " +
  "Новий ключ нижче відкриє окреме порожнє кафе.";
const LOST_SHARED =
  "Якщо посилання з ключем потрапило не туди, візьми новий ключ і знову віддай фразу вище своєму Claude: " +
  "старі хуки він замінить.";

function CloudConnect({ site, roomKey }: { site: string; roomKey: string }) {
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
        Хук шле сюди лише короткі описи: назву чату, початок питання, назви файлів, опис команди, імена агентів, а ще
        лічильники токенів і відсотки лімітів підписки. Вміст файлів і
        повний текст відкидаються одразу. Усе лежить під твоїм ключем: бачиш лише ти і ті, кому ти сам даси посилання. Зберігається добу. Хук
        асинхронний, тож не гальмує агентів і не витрачає токенів.
      </div>

      <div className="step">
        <div className="step-n">
          <Sparkles size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">Віддай це своєму Claude</div>
          <div className="viewseg os-pick" role="radiogroup" aria-label="система">
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
              Встав у будь-який чат Claude Code. Він допише хуки в налаштування, і далі Claude Code сам слатиме сюди
              кожну подію, без скриптів і bash. Кафе бачитиме всі дії агентів, але без назв чатів, токенів і лімітів
              підписки: їх читає скрипт, а йому потрібен sh. Стоїть Git Bash? Тоді бери «macOS · Linux».
            </p>
          ) : (
            <p className="step-p">
              Встав у будь-який чат Claude Code. Він збереже короткий скрипт хуків у <code>~/.config/relay</code>,
              допише хуки й статус-рядок у налаштування і перевірить зв&apos;язок, це з пів хвилини.
            </p>
          )}
          <MemberName roomKey={roomKey} fixed={access?.name ?? null} />
          <Code text={win ? httpPrompt(site, url) : cloudPrompt(site, url)} wrap />
          <p className="step-p">
            Далі просто працюй, а тут, на вкладці «наживо», за столами сидітимуть твої агенти. Кожен чат на окремій
            вкладці, у кожного агента свої токени. Відсотки лімітів підписки приходять зі статус-рядка. Якщо Claude
            вперся в ліміт, тут буде «ліміт вичерпано», навіть коли статус-рядок не запускається.
          </p>
        </div>
      </div>

      <HookStatus roomKey={roomKey} me={access?.name ?? me} />

      <div className="step">
        <div className="step-n">
          <Puzzle size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">Або плагіном Claude Code</div>
          <p className="step-p">
            Ті самі хуки, тільки з плагіна: хуки не пишуться в <code>settings.json</code>, а посилання на кафе лежить
            в окремому файлі <code>~/.config/relay/hook-url</code>. Статус-рядок для лімітів <code>/relay:connect</code>{" "}
            запропонує додати окремо. Встав по черзі в чат Claude Code:
          </p>
          <Code text={pluginSteps(`${site}/marketplace.json`, url)} wrap />
          <p className="step-p">
            Перевірити: <code>/relay:status</code>. Вимкнути: <code>/plugin disable relay</code>.
          </p>
        </div>
      </div>

      <div className="step">
        <div className="step-n">
          <Smartphone size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">Телефон, що дзвонить, коли Claude чекає</div>
          <p className="step-p">
            Відкрий це посилання на телефоні чи іншому комп&apos;ютері. У ньому твій ключ, тож нікому його не
            показуй.
          </p>
          <Code text={`${site}/#k=${roomKey}`} wrap />
          <p className="step-p">
            Далі на «наживо» натисни «сповіщення» → «Пуш на цей пристрій». Телефон дзвенітиме, коли Claude просить
            дозвіл або чекає на відповідь, навіть із закритим сайтом. На iPhone спершу «Поділитися» → «На початковий
            екран», відкрий Relay з іконки і встав це посилання ще раз: iPhone тримає дані іконки окремо від Safari.
          </p>
        </div>
      </div>

      {access && !access.locked && <TeamInvite site={site} roomKey={roomKey} />}
      {access && <TeamKeys site={site} roomKey={roomKey} access={access} />}

      <details className="step-more">
        <summary className="step-ttl">Новий ключ або відключення</summary>
        <div className="step-body">
          <p className="step-p">
            {access?.locked ? LOST_LOCKED : LOST_SHARED} Щоб відключитись зовсім, попроси Claude прибрати з{" "}
            <code>~/.claude/settings.json</code> хуки, що містять <code>/api/claude-hook</code>.
          </p>
          <button className="btn" onClick={() => saveKey(newKey())}>
            <RefreshCw size={13} /> {access?.locked ? "нове порожнє кафе" : "новий ключ"}
          </button>
        </div>
      </details>
    </>
  );
}

const LOCAL_PROMPT = "Підключи Relay до мого Claude Code: прочитай setup.md у цьому репозиторії й виконай усі кроки звідти.";
const MANUAL = `cd ~/relay
npm install
npm run setup`;
const SETTINGS = JSON.stringify(hookSettings(), null, 2);
const PLUGIN_LOCAL = `claude plugin marketplace add ~/relay
claude plugin install relay@relay`;
const TEST = `echo '{"session_id":"test","cwd":"/tmp/demo","hook_event_name":"UserPromptSubmit","prompt":"привіт, Relay"}' \\
  | curl -s -H 'content-type: application/json' --data-binary @- ${HOOK_URL}`;

function LocalConnect() {
  return (
    <>
      <div className="notice">
        <ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Цей Relay працює на твоєму комп&apos;ютері: хук шле події лише на <code>127.0.0.1:3737</code>, у мережу нічого
        не йде. Хук асинхронний і мовчазний, тож не гальмує агентів і не витрачає токенів.
      </div>

      <div className="step">
        <div className="step-n">
          <Sparkles size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">Віддай це своєму Claude</div>
          <Code text={LOCAL_PROMPT} wrap />
        </div>
      </div>

      <div className="step">
        <div className="step-n">
          <TerminalSquare size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">Або сам</div>
          <Code text={MANUAL} />
          <p className="step-p">
            <code>npm run setup</code> дописує хук у <code>~/.claude/settings.json</code> (інші налаштування не
            чіпає, стару версію зберігає як <code>settings.json.bak-relay</code>), кладе скрипт хуків у{" "}
            <code>~/.config/relay</code> і запускає Relay у фоні. Після
            перезавантаження: <code>npm run up</code>. Зупинити: <code>npm run down</code>, прибрати хук:{" "}
            <code>npm run unhook</code>.
          </p>
        </div>
      </div>

      <div className="step">
        <div className="step-n">
          <Puzzle size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">Або плагіном Claude Code</div>
          <p className="step-p">
            Плагін лежить у самому репозиторії, тож нічого не качається з мережі. У терміналі:
          </p>
          <Code text={PLUGIN_LOCAL} />
          <p className="step-p">
            Далі в чаті Claude Code: <code>/relay:connect local</code>. Relay при цьому має працювати:{" "}
            <code>npm run up</code>.
          </p>
        </div>
      </div>

      <details className="step-more">
        <summary className="step-ttl">Хук вручну й перевірка</summary>
        <div className="step-body">
          <p className="step-p">
            Блок для <code>~/.claude/settings.json</code>, поряд з іншими ключами. Діє на всі проєкти й нові сесії,
            включно з desktop-застосунком і worktree. Хуки запускають скрипт <code>~/.config/relay/relay.sh</code>,
            його кладе туди <code>npm run hooks</code>. Ліміти підписки бачить лише статус-рядок:{" "}
            <code>node scripts/install-hooks.mjs --statusline</code>.
          </p>
          <Code text={SETTINGS} />
          <p className="step-p">Перевірка: у кафе з&apos;явиться сесія «demo» з питанням над головою Claude.</p>
          <Code text={TEST} />
        </div>
      </details>
    </>
  );
}

export default function ConnectPanel() {
  const hosted = useHosted();
  const roomKey = useRelayKey();
  const invite = useTeamInvite();

  useEffect(() => {
    if (hosted && !roomKey && !invite) saveKey(newKey());
  }, [hosted, roomKey, invite]);

  return (
    <div className="connect-wrap">
      <Link className="back" href="/">
        <ArrowLeft size={15} /> назад до кафе
      </Link>

      <div className="connect-head">
        <span className="brand-badge">
          <Radio size={20} />
        </span>
        <div>
          <h1>Підключи свій Claude</h1>
          <p className="connect-sub">
            Твої справжні агенти сядуть за столи: хто працює, що саме робить, кому несе задачу. Кожен чат на окремій
            вкладці, уся команда з <code>.claude/agents</code> за своїми столами.
          </p>
        </div>
      </div>

      {hosted === false && <LocalConnect />}
      {hosted && invite && <JoinTeam teamKey={invite} current={roomKey} />}
      {hosted && roomKey && !invite && (
        <>
          <CafeSwitcher current={roomKey} />
          <CloudConnect site={location.origin} roomKey={roomKey} />
        </>
      )}
    </div>
  );
}
