"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { BODY_MAX } from "@/lib/live/chat";
import { cleanMember } from "@/lib/live/member";
import { Guest } from "@/lib/live/social";
import { Chat, SendResult } from "@/lib/live/useChat";

const time = (at: number) => new Date(at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

const SEND_NOTE: Record<Exclude<SendResult, "ok">, string> = {
  fast: "Забагато повідомлень за хвилину, зачекай трохи.",
  fail: "Не вдалося надіслати, спробуй ще раз.",
};

function NameStep({ onName }: { onName: (name: string) => void }) {
  const [v, setV] = useState("");
  const clean = cleanMember(v);
  return (
    <form
      className="chat-name"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean) onName(clean);
      }}
    >
      <label htmlFor="chat-name">Як тебе підписати? Це ім&apos;я побачить уся команда.</label>
      <div className="key-paste-row">
        <input id="chat-name" value={v} maxLength={24} placeholder="твоє ім'я" onChange={(e) => setV(e.target.value)} />
        <button className="btn" disabled={!clean}>
          далі
        </button>
      </div>
    </form>
  );
}

function Composer({ chat, me }: { chat: Chat; me: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Exclude<SendResult, "ok"> | null>(null);
  const body = text.trim();
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!body || busy) return;
    setBusy(true);
    const r = await chat.send(me, body);
    setBusy(false);
    if (r === "ok") setText("");
    setNote(r === "ok" ? null : r);
  };
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };
  return (
    <form className="chat-compose" onSubmit={submit}>
      <textarea
        value={text}
        rows={2}
        maxLength={BODY_MAX}
        placeholder={`${me}, напиши команді… (Enter надсилає)`}
        aria-label="повідомлення в чат кафе"
        onChange={(e) => {
          setText(e.target.value);
          setNote(null);
        }}
        onKeyDown={keys}
      />
      <button className="btn btn-ic" disabled={!body || busy} title="надіслати">
        <Send size={14} />
      </button>
      {note && <span className="key-paste-bad">{SEND_NOTE[note]}</span>}
    </form>
  );
}

/** The café's group chat, docked in the corner so the scene stays in view. */
export default function ChatPanel({
  chat,
  me,
  here,
  colorOf,
  onName,
  onClose,
}: {
  chat: Chat;
  /** the name this browser writes under, or null until it gives one */
  me: string | null;
  /** everyone at the bar right now */
  here: Guest[];
  colorOf: Record<string, string>;
  onName: (name: string) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const count = chat.msgs.length;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const names = here.map((g) => (g.me ? "ти" : g.name));
  return (
    <aside className="chat-panel" role="dialog" aria-label="чат кафе">
      <div className="chat-hd">
        <MessageCircle size={15} />
        <div className="chat-ttl">
          <b>Чат кафе</b>
          <span className="muted-sm">{names.length ? `біля бару: ${names.join(", ")}` : "усі, хто має це кафе"}</span>
        </div>
        <button className="btn btn-ic" onClick={onClose} aria-label="закрити">
          <X size={14} />
        </button>
      </div>
      <div className="chat-list" ref={listRef}>
        {!count && (
          <p className={chat.error ? "key-paste-bad" : "alerts-hint"}>
            {chat.error
              ? "Не вдалося дістати повідомлення, спробую ще раз за хвилину."
              : "Тут ще тихо. Напиши першим: побачать усі, хто відкрив це кафе."}
          </p>
        )}
        {chat.msgs.map((m, i) => {
          const prev = chat.msgs[i - 1];
          const head = !prev || prev.author !== m.author || m.at - prev.at > 5 * 60 * 1000;
          return (
            <div key={m.id} className={`chat-msg ${m.author === me ? "mine" : ""}`}>
              {head && (
                <div className="chat-who">
                  <b style={{ color: colorOf[m.author] }}>{m.author}</b>
                  <span>{time(m.at)}</span>
                </div>
              )}
              <p>{m.body}</p>
            </div>
          );
        })}
      </div>
      {!chat.canWrite ? (
        <p className="alerts-hint chat-ro">Лише перегляд: писати можуть ті, в кого є ключ цього кафе.</p>
      ) : me ? (
        <Composer chat={chat} me={me} />
      ) : (
        <NameStep onName={onName} />
      )}
    </aside>
  );
}
