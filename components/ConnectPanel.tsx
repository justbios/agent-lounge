"use client";

import Link from "next/link";
import { useState } from "react";
import { Radio, ArrowLeft, Copy, Check, TerminalSquare, ShieldCheck, Sparkles } from "lucide-react";
import { HOOK_URL, hookSettings } from "@/lib/live/hookConfig";

const SITE = "https://agent-pipeline-viz-one.vercel.app";

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

const PROMPT = `Підключи Relay до мого Claude Code: прочитай ${SITE}/setup.md і виконай усі кроки звідти.`;
const MANUAL = `git clone https://github.com/justbios/agent-pipeline-viz.git ~/relay
cd ~/relay
npm install
npm run setup`;
const SETTINGS = JSON.stringify(hookSettings(), null, 2);
const TEST = `echo '{"session_id":"test","cwd":"/tmp/demo","hook_event_name":"UserPromptSubmit","prompt":"привіт, Relay"}' \\
  | curl -s -H 'content-type: application/json' --data-binary @- ${HOOK_URL}`;

export default function ConnectPanel() {
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

      <div className="notice">
        <ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Relay працює на твоєму комп&apos;ютері: хук шле події лише на <code>127.0.0.1:3737</code>, у мережу нічого не
        йде. Хук асинхронний і мовчазний, тож не гальмує агентів і не витрачає токенів. Якщо Relay не запущений, Claude
        працює як завжди.
      </div>

      <div className="step">
        <div className="step-n">
          <Sparkles size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">Найпростіше: віддай це своєму Claude</div>
          <p className="step-p">
            Встав у будь-який чат Claude Code. Він сам завантажить Relay, поставить хук і запустить сервер, це хвилини
            дві. Потрібен лише Node 20+.
          </p>
          <Code text={PROMPT} wrap />
          <p className="step-p">
            Далі відкрий <a href="http://127.0.0.1:3737">127.0.0.1:3737</a> і перемкнись на «наживо». Що саме він
            зробить, написано в <a href="/setup.md">setup.md</a>.
          </p>
        </div>
      </div>

      <div className="step">
        <div className="step-n">
          <TerminalSquare size={14} />
        </div>
        <div className="step-body">
          <div className="step-ttl">Або сам, чотири команди</div>
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
    </div>
  );
}
