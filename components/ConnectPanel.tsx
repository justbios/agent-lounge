"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Radio, ArrowLeft, Copy, Check, TerminalSquare, ShieldCheck, Sparkles, Smartphone, RefreshCw } from "lucide-react";
import { HOOK_URL, cloudHookSettings, cloudHookUrl, hookSettings } from "@/lib/live/hookConfig.mjs";
import { newKey, saveKey, useHosted, useRelayKey } from "@/lib/live/relayKey";
import { useMe } from "@/lib/live/team";
import { CafeSwitcher, JoinTeam, MemberName, TeamInvite, useTeamInvite } from "./connect/TeamConnect";

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
  return `Підключи мій Claude Code до Relay — сайту, який показує моїх агентів наживо. Хуки асинхронні й не витрачають токенів.

1. Додай у ~/.claude/settings.json хуки з JSON нижче. Усі інші налаштування й хуки залиш як є. Якщо там уже є хуки, що містять "/api/claude-hook", заміни їх цими. Перед зміною збережи копію файлу як settings.json.bak-relay.
2. Перевір підключення командою нижче, вона має вивести 204:
${check}
3. Скажи мені відкрити ${site} і перемкнутись на «наживо».

${JSON.stringify(cloudHookSettings(url), null, 2)}`;
}

function CloudConnect({ site, roomKey }: { site: string; roomKey: string }) {
  const me = useMe(roomKey);
  const url = cloudHookUrl(site, roomKey, me);
  return (
    <>
      <div className="notice">
        <ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Хук шле сюди лише короткі описи: початок питання, назви файлів, опис команди, імена агентів. Вміст файлів і
        повний текст відкидаються одразу. Усе лежить під твоїм ключем: бачиш лише ти і ті, кому ти сам даси посилання. Зберігається добу. Хук
        асинхронний, тож не гальмує агентів і не витрачає токенів.
      </div>

      <div className="step">
        <div className="step-n">
          <Sparkles size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">Віддай це своєму Claude</div>
          <p className="step-p">
            Встав у будь-який чат Claude Code. Він сам допише хук у налаштування і перевірить зв&apos;язок, це секунд
            десять. Нічого завантажувати не треба.
          </p>
          <MemberName roomKey={roomKey} />
          <Code text={cloudPrompt(site, url)} wrap />
          <p className="step-p">
            Далі просто працюй, а тут, на вкладці «наживо», за столами сидітимуть твої агенти. Кожен чат на окремій
            вкладці.
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

      <TeamInvite site={site} roomKey={roomKey} />

      <details className="step-more">
        <summary className="step-ttl">Новий ключ або відключення</summary>
        <div className="step-body">
          <p className="step-p">
            Якщо посилання з ключем потрапило не туди, візьми новий ключ і знову віддай фразу вище своєму Claude: старі
            хуки він замінить. Щоб відключитись зовсім, попроси Claude прибрати з <code>~/.claude/settings.json</code>{" "}
            хуки, що містять <code>/api/claude-hook</code>.
          </p>
          <button className="btn" onClick={() => saveKey(newKey())}>
            <RefreshCw size={13} /> новий ключ
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
            чіпає, стару версію зберігає як <code>settings.json.bak-relay</code>) і запускає Relay у фоні. Після
            перезавантаження: <code>npm run up</code>. Зупинити: <code>npm run down</code>, прибрати хук:{" "}
            <code>npm run unhook</code>.
          </p>
        </div>
      </div>

      <details className="step-more">
        <summary className="step-ttl">Хук вручну й перевірка</summary>
        <div className="step-body">
          <p className="step-p">
            Блок для <code>~/.claude/settings.json</code>, поряд з іншими ключами. Діє на всі проєкти й нові сесії,
            включно з desktop-застосунком і worktree.
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
