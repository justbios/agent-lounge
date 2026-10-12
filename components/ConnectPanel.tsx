"use client";

import { useEffect, useState } from "react";
import { Radio, ArrowLeft, Copy, Check, KeyRound, TerminalSquare } from "lucide-react";

interface Project {
  slug: string;
  ingest_token: string;
  name: string;
  demo?: boolean;
}

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

export default function ConnectPanel() {
  const [project, setProject] = useState<Project | null>(null);
  const [base, setBase] = useState("");

  useEffect(() => {
    setBase(window.location.origin);
    fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      .then(async (r) => {
        if (r.status === 201) return r.json();
        return { slug: "demo", ingest_token: "demo_paste_after_setup", name: "Demo pipeline", demo: true };
      })
      .then(setProject)
      .catch(() => setProject({ slug: "demo", ingest_token: "demo_paste_after_setup", name: "Demo pipeline", demo: true }));
  }, []);

  const url = base || "https://your-relay.vercel.app";
  const token = project?.ingest_token ?? "…";

  const settings = `{
  "hooks": {
    "PostToolUse":  [{ "hooks": [{ "type": "command", "command": "node ~/.relay/relay-hook.mjs" }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "node ~/.relay/relay-hook.mjs" }] }]
  }
}`;
  const env = `export RELAY_URL="${url}"
export RELAY_TOKEN="${token}"`;
  const curl = `curl -X POST ${url}/api/ingest \\
  -H "x-relay-token: ${token}" \\
  -H "content-type: application/json" \\
  -d '{"run":"test","agent":"planner","name":"Planner","type":"start"}'`;

  return (
    <div className="connect-wrap">
      <a className="back" href="/">
        <ArrowLeft size={15} /> назад до дашборду
      </a>

      <div className="connect-head">
        <span className="brand-badge">
          <Radio size={20} />
        </span>
        <div>
          <h1>Підключи свій Claude</h1>
          <p className="connect-sub">Встав один хук у Claude Code — і твої агенти з'являться в Relay наживо.</p>
        </div>
      </div>

      {project?.demo && (
        <div className="notice">
          Це демо-режим. Токен нижче — заглушка: коли підключимо Supabase (env <code>SUPABASE_URL</code> +{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>), тут з'явиться справжній токен твого проєкту.
        </div>
      )}

      <div className="token-card">
        <div className="token-lbl">
          <KeyRound size={14} /> твій ingest-токен
        </div>
        <div className="token-val">{token}</div>
        <div className="token-meta">проєкт: {project?.name ?? "…"} · slug: {project?.slug ?? "…"}</div>
      </div>

      <div className="step">
        <div className="step-n">1</div>
        <div className="step-body">
          <div className="step-ttl">Збережи репортер</div>
          <p className="step-p">
            Поклади <code>scripts/relay-hook.mjs</code> з репозиторію в <code>~/.relay/relay-hook.mjs</code>.
          </p>
        </div>
      </div>

      <div className="step">
        <div className="step-n">2</div>
        <div className="step-body">
          <div className="step-ttl">Додай токен в оточення</div>
          <Code text={env} />
        </div>
      </div>

      <div className="step">
        <div className="step-n">3</div>
        <div className="step-body">
          <div className="step-ttl">Додай хук у Claude Code</div>
          <p className="step-p">
            У <code>~/.claude/settings.json</code> (або <code>.claude/settings.json</code> проєкту):
          </p>
          <Code text={settings} />
        </div>
      </div>

      <div className="step">
        <div className="step-n">4</div>
        <div className="step-body">
          <div className="step-ttl">
            <TerminalSquare size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Перевір (необов'язково)
          </div>
          <Code text={curl} />
          <p className="step-p">
            Готово — запусти своїх агентів, відкрий <a href="/">дашборд</a>, і дивись, як вони бігають по кімнаті. Назви й
            порядок Relay візьме з подій.
          </p>
        </div>
      </div>
    </div>
  );
}
