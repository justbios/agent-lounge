"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, Download, Film, Share2, Eye } from "lucide-react";
import { Clip, clipSupported, recordClip, useSceneOnScreen } from "@/components/cafe/clip";
import { useAccess } from "@/lib/live/access";
import { useHosted, useRelayKey, useViewRoom } from "@/lib/live/relayKey";

const CLIP_SECONDS = 15;
const never = () => () => {};
const origin = () => (typeof location === "undefined" ? "" : location.origin);

function useOnClient(): boolean {
  return useSyncExternalStore(never, () => true, () => false);
}

function ClipSection() {
  const onScreen = useSceneOnScreen();
  const [clip, setClip] = useState<{ clip: Clip; url: string; file: File } | null>(null);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => () => void (clip && URL.revokeObjectURL(clip.url)), [clip]);

  const record = async () => {
    setErr(null);
    setClip(null);
    const t0 = Date.now();
    setLeft(CLIP_SECONDS);
    const tick = setInterval(() => setLeft(Math.max(0, CLIP_SECONDS - Math.floor((Date.now() - t0) / 1000))), 250);
    try {
      const c = await recordClip(CLIP_SECONDS);
      const file = new File([c.blob], `relay-${Date.now()}.${c.ext}`, { type: c.mime });
      setClip({ clip: c, url: URL.createObjectURL(c.blob), file });
    } catch {
      setErr("не вдалося записати, спробуй ще раз");
    } finally {
      clearInterval(tick);
      setLeft(0);
    }
  };

  if (!clipSupported()) return <p className="alerts-hint">Цей браузер не вміє записувати відео з canvas.</p>;
  const file = clip?.file ?? null;
  const canShare = !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  return (
    <div className="share-sec">
      <div className="share-ttl">
        <Film size={13} /> Кліп кафе, {CLIP_SECONDS} секунд
      </div>
      {!onScreen ? (
        <p className="alerts-hint">Відкрий кафе (не схему), тоді його можна записати.</p>
      ) : left ? (
        <p className="share-rec">
          <span className="rec-dot" /> запис… {left} с
        </p>
      ) : (
        <button className="btn" onClick={record}>
          <span className="rec-dot" /> {clip ? "записати ще" : "записати"}
        </button>
      )}
      {clip && (
        <>
          <video className="share-video" src={clip.url} autoPlay loop muted playsInline />
          <div className="share-actions">
            <a className="btn" href={clip.url} download={file!.name}>
              <Download size={13} /> завантажити
            </a>
            {canShare && (
              <button className="btn" onClick={() => navigator.share({ files: [file!], title: "Мої агенти в Agent Lounge" }).catch(() => {})}>
                <Share2 size={13} /> поділитися
              </button>
            )}
          </div>
        </>
      )}
      {err && <p className="key-paste-bad">{err}</p>}
    </div>
  );
}

function ViewLinkSection({ url, locked }: { url: string; locked: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="share-sec">
      <div className="share-ttl">
        <Eye size={13} /> Посилання лише для перегляду
      </div>
      <p className="alerts-hint">
        Хто відкриє, бачитиме твоє кафе наживо: питання, назви файлів, імена агентів. Писати чи керувати не зможе.
        {locked
          ? " Посилання змінюється щоразу, коли когось прибирають із команди, і старе перестає діяти."
          : " Закрити доступ можна лише новим ключем на сторінці підключення."}
      </p>
      <div className="share-link">
        <code>{url}</code>
        <button
          className="btn"
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

export default function SharePanel() {
  const hosted = useHosted();
  const key = useRelayKey();
  const viewing = useViewRoom();
  const [open, setOpen] = useState(false);
  const client = useOnClient();
  const box = useRef<HTMLDivElement>(null);
  const access = useAccess(hosted && !viewing ? key : null);
  const viewUrl = access?.topic ? `${origin()}/#v=${access.topic}` : null;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="alerts share" ref={box}>
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Share2 size={14} /> поділитися
      </button>
      {client && (
        <div className="alerts-pop" role="dialog" aria-label="поділитися" hidden={!open}>
          <ClipSection />
          {viewUrl && <ViewLinkSection url={viewUrl} locked={!!access?.locked} />}
        </div>
      )}
    </div>
  );
}
