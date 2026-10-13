"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Send } from "lucide-react";
import { chime, unlockChime } from "@/lib/live/chime";
import { setAlertPrefs, useAlertPrefs } from "@/lib/live/useAlerts";
import { PushControl } from "@/lib/live/usePush";

function PushSection({ push }: { push: PushControl }) {
  if (push.state === "install")
    return (
      <p className="alerts-hint">
        На iPhone пуші приходять лише з іконки на початковому екрані: «Поділитися» → «На початковий екран». Відкрий
        Relay з іконки, встав посилання з ключем і увімкни пуші там.
      </p>
    );
  if (push.state === "unsupported") return <p className="alerts-hint">Цей браузер не вміє пуш-сповіщень.</p>;
  if (push.state === "denied")
    return <p className="alerts-hint">Сповіщення для цього сайту заборонені в налаштуваннях браузера.</p>;
  if (push.state == null) return <p className="alerts-hint">перевіряю…</p>;
  const on = push.state === "on";
  return (
    <>
      <label className="alerts-row">
        <input type="checkbox" checked={on} disabled={push.busy} onChange={push.toggle} />
        <span>
          <b>Пуш на цей пристрій</b>
          <small>прийде, навіть коли сайт закритий: Claude просить дозвіл або чекає на тебе</small>
        </span>
      </label>
      <label className="alerts-row sub">
        <input type="checkbox" checked={push.done} disabled={push.busy} onChange={(e) => push.setDone(e.target.checked)} />
        <span>
          <b>Одразу, щойно Claude відповів</b>
          <small>інакше нагадає через хвилину тиші</small>
        </span>
      </label>
      {on && (
        <button className="btn alerts-test" disabled={push.busy} onClick={push.test}>
          <Send size={13} /> надіслати тест
        </button>
      )}
    </>
  );
}

export default function AlertsMenu({ cloud, push }: { cloud: boolean; push: PushControl }) {
  const prefs = useAlertPrefs();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [denied, setDenied] = useState(false);

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

  const anyOn = prefs.sound || (cloud ? push.state === "on" : prefs.desktop);

  return (
    <div className="alerts" ref={box}>
      <button
        className={`btn btn-ic alerts-btn ${anyOn ? "on" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="сповіщення"
      >
        {anyOn ? <BellRing size={14} /> : <Bell size={14} />}
      </button>
      {open && (
        <div className="alerts-pop" role="dialog" aria-label="сповіщення">
          <label className="alerts-row">
            <input
              type="checkbox"
              checked={prefs.sound}
              onChange={(e) => {
                setAlertPrefs({ sound: e.target.checked });
                if (e.target.checked) {
                  unlockChime();
                  setTimeout(() => chime("ask"), 30);
                }
              }}
            />
            <span>
              <b>Звук</b>
              <small>дзвіночок, коли Claude чекає на тебе, поки сторінка відкрита</small>
            </span>
          </label>
          {cloud ? (
            <PushSection push={push} />
          ) : (
            <label className="alerts-row">
              <input
                type="checkbox"
                checked={prefs.desktop}
                onChange={async (e) => {
                  const want = e.target.checked;
                  if (!want) return setAlertPrefs({ desktop: false });
                  const perm = "Notification" in window ? await Notification.requestPermission() : "denied";
                  setDenied(perm !== "granted");
                  setAlertPrefs({ desktop: perm === "granted" });
                }}
              />
              <span>
                <b>Сповіщення на робочому столі</b>
                <small>{denied ? "браузер заборонив сповіщення для цього сайту" : "поки ця сторінка відкрита"}</small>
              </span>
            </label>
          )}
          {push.note && <p className="alerts-note">{push.note}</p>}
        </div>
      )}
    </div>
  );
}
