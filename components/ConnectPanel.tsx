"use client";

import Link from "next/link";
import { useState } from "react";
import { Radio, ArrowLeft, Copy, Check, TerminalSquare, ShieldCheck } from "lucide-react";
import { HOOK_URL, hookSettings } from "@/lib/live/hookConfig";

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="codeblock">
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

const SETTINGS = JSON.stringify(hookSettings(), null, 2);
const RUN = `cd /Volumes/Безіменний/2026/agent-pipeline-viz
npm run live`;
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
            Один хук у Claude Code, і твої справжні агенти сядуть за столи: хто працює, що саме робить, кому несе задачу.
          </p>
        </div>
      </div>

      <div className="notice">
        <ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Усе локально: хук шле події лише на <code>127.0.0.1:3737</code>, у мережу нічого не йде. Хук асинхронний і
        мовчазний, тож він не гальмує агентів і не витрачає токенів. Якщо Relay не запущений, curl тихо падає, і Claude
        працює як завжди.
      </div>

      <div className="step">
        <div className="step-n">1</div>
        <div className="step-body">
          <div className="step-ttl">Запусти Relay у себе</div>
          <Code text={RUN} />
          <p className="step-p">
            Відкрий <a href="http://127.0.0.1:3737">127.0.0.1:3737</a> і перемкнись на «наживо».
          </p>
        </div>
      </div>

      <div className="step">
        <div className="step-n">2</div>
        <div className="step-body">
          <div className="step-ttl">Додай хук у Claude Code</div>
          <p className="step-p">
            У <code>~/.claude/settings.json</code>, поряд з іншими ключами. Діє на всі проєкти й нові сесії, включно з
            desktop-застосунком і worktree.
          </p>
          <Code text={SETTINGS} />
        </div>
      </div>

      <div className="step">
        <div className="step-n">3</div>
        <div className="step-body">
          <div className="step-ttl">
            <TerminalSquare size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Перевір (необов&apos;язково)
          </div>
          <Code text={TEST} />
          <p className="step-p">
            У кафе з&apos;явиться сесія «demo» з питанням над головою Claude. Далі просто працюй: кожен виклик субагента
            стане походом до його столу.
          </p>
        </div>
      </div>
    </div>
  );
}
