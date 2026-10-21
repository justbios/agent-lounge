"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, Send } from "lucide-react";
import { Two, enPlural, tr, useTr, useUi } from "@/lib/i18n";
import { chime, unlockChime } from "@/lib/live/chime";
import { setAlertPrefs, useAlertPrefs } from "@/lib/live/useAlerts";
import { Asks } from "@/lib/live/useAsks";
import { PushControl } from "@/lib/live/usePush";

function PushSection({ push }: { push: PushControl }) {
  const t = useTr();
  if (push.state === "install")
    return (
      <p className="alerts-hint">
        {t(
          "На iPhone пуші приходять лише з іконки на початковому екрані: «Поділитися» → «На початковий екран». Відкрий Agent Lounge з іконки, встав посилання з ключем і увімкни пуші там.",
          "On iPhone, push only works from a Home Screen icon: “Share” → “Add to Home Screen”. Open Agent Lounge from the icon, paste your link with the key and turn push on there.",
        )}
      </p>
    );
  if (push.state === "unsupported")
    return <p className="alerts-hint">{t("Цей браузер не вміє пуш-сповіщень.", "This browser can't do push notifications.")}</p>;
  if (push.state === "denied")
    return (
      <p className="alerts-hint">
        {t(
          "Сповіщення для цього сайту заборонені в налаштуваннях браузера.",
          "Notifications for this site are blocked in your browser settings.",
        )}
      </p>
    );
  if (push.state == null) return <p className="alerts-hint">{t("перевіряю…", "checking…")}</p>;
  const on = push.state === "on";
  return (
    <>
      <label className="alerts-row">
        <input type="checkbox" checked={on} disabled={push.busy} onChange={push.toggle} />
        <span>
          <b>{t("Пуш на цей пристрій", "Push to this device")}</b>
          <small>
            {t(
              "прийде, навіть коли сайт закритий: Claude просить дозвіл або чекає на тебе",
              "arrives even with the site closed: Claude asks for permission or waits for you",
            )}
          </small>
        </span>
      </label>
      <label className="alerts-row sub">
        <input type="checkbox" checked={push.done} disabled={push.busy} onChange={(e) => push.setDone(e.target.checked)} />
        <span>
          <b>{t("Одразу, щойно Claude відповів", "As soon as Claude answers")}</b>
          <small>{t("інакше нагадає через хвилину тиші", "otherwise after a quiet minute")}</small>
        </span>
      </label>
      {on && (
        <button className="btn alerts-test" disabled={push.busy} onClick={push.test}>
          <Send size={13} /> {t("надіслати тест", "send a test")}
        </button>
      )}
    </>
  );
}

const AWAY_ON: Two = {
  uk: "коли Claude просить дозволу, питає чи показує план, це до 10 хвилин чекає тут, а не в терміналі",
  en: "when Claude asks for permission, asks a question or shows a plan, it waits here for up to 10 minutes, not in the terminal",
};

/**
 * «Я не за комп'ютером» is switched on only on the computer, so nobody else holding the café key can make Claude wait
 * on the café; here it can only be switched off. Answers need this browser paired with that computer.
 */
function AwaySection({ asks }: { asks: Asks }) {
  const ui = useUi();
  const t = useTr();
  if (!asks.ok)
    return (
      <p className="alerts-hint">
        {t(
          "Відповідати Claude на дозволи, питання й плани звідси можна лише з особистим ключем:",
          "To answer Claude's permissions, questions and plans from here, you need a personal key:",
        )}{" "}
        <Link href="/connect">{t("підключити Claude", "connect Claude")}</Link> →{" "}
        {t("«Особисті ключі».", "“Personal keys”.")}
      </p>
    );
  const on = asks.until != null;
  const locale = ui === "en" ? "en-GB" : "uk-UA";
  const till = on ? new Date(asks.until!).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";
  const paired = asks.paired
    ? tr(
        ui,
        `Цей браузер спарено з комп'ютерами: ${asks.paired}.`,
        `This browser is paired with ${asks.paired} ${enPlural(asks.paired, "computer", "computers")}.`,
      )
    : tr(
        ui,
        "Цей браузер ще не спарено з жодним комп'ютером: на комп'ютері запусти /agent-lounge:away pair і відкрий " +
          "посилання тут.",
        "This browser isn't paired with any computer yet: on the computer, run /agent-lounge:away pair and open the " +
          "link here.",
      );
  return (
    <>
      <label className="alerts-row">
        <input type="checkbox" checked={on} disabled={asks.busy || !on} onChange={() => asks.back()} />
        <span>
          <b>{t("Я не за комп'ютером", "I'm away")}</b>
          <small>
            {on
              ? t(
                  `до ${till}: ${AWAY_ON.uk}. Зніми галочку, коли повернешся`,
                  `until ${till}: ${AWAY_ON.en}. Untick it when you're back`,
                )
              : t(
                  "вмикається на самому комп'ютері: /agent-lounge:away on у Claude Code або " +
                    "sh ~/.config/relay/relay.sh away on у терміналі. Тоді дозволи, питання й плани прийдуть сюди",
                  "switched on at the computer itself: /agent-lounge:away on in Claude Code, or " +
                    "sh ~/.config/relay/relay.sh away on in a terminal. Then permissions, questions and plans come here",
                )}
          </small>
        </span>
      </label>
      <p className="alerts-hint">{paired}</p>
    </>
  );
}

export default function AlertsMenu({ cloud, push, asks }: { cloud: boolean; push: PushControl; asks: Asks | null }) {
  const prefs = useAlertPrefs();
  const t = useTr();
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

  const anyOn = prefs.sound || (cloud ? push.state === "on" : prefs.desktop) || asks?.until != null;

  return (
    <div className="alerts" ref={box}>
      <button
        className={`btn btn-ic alerts-btn ${anyOn ? "on" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={t("сповіщення", "notifications")}
      >
        {anyOn ? <BellRing size={14} /> : <Bell size={14} />}
      </button>
      {open && (
        <div className="alerts-pop" role="dialog" aria-label={t("сповіщення", "notifications")}>
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
              <b>{t("Звук", "Sound")}</b>
              <small>
                {t(
                  "дверний дзвоник, коли Claude чекає на тебе (і ще двічі, якщо ніхто не відповів), коротший, коли він відповів, і чотири ноти вгору, коли ліміт скинувся, поки сторінка відкрита",
                  "a doorbell when Claude waits for you (twice more if nobody answers), a shorter chime when it answered, and four notes up when a limit resets, while the page is open",
                )}
              </small>
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
                <b>{t("Сповіщення на робочому столі", "Desktop notifications")}</b>
                <small>
                  {denied
                    ? t("браузер заборонив сповіщення для цього сайту", "the browser blocked notifications for this site")
                    : t("поки ця сторінка відкрита", "while this page is open")}
                </small>
              </span>
            </label>
          )}
          {asks && <AwaySection asks={asks} />}
          {push.note && <p className="alerts-note">{push.note}</p>}
        </div>
      )}
    </div>
  );
}
