"use client";

import { FormEvent, ReactNode, useState, useSyncExternalStore } from "react";
import { Users, UserPlus } from "lucide-react";
import { ROOM_KEY } from "@/lib/live/hookConfig.mjs";
import { cleanMember } from "@/lib/live/member";
import { useAccess } from "@/lib/live/access";
import { newKey, saveKey } from "@/lib/live/relayKey";
import { KnownCafe, rememberCafe, setMe, useCafes, useMe } from "@/lib/live/team";
import { Ui, tr, useTr, useUi } from "@/lib/i18n";

const TEAM = /[#&]team=([A-Za-z0-9_-]{20,128})/;

/** The labels this page stores for a café; they stay Ukrainian in storage and are translated where shown. */
const MINE = "моє кафе";
const TEAMS = "кафе команди";

/** A remembered café's label in the viewer's language; one named some other way shows as it is. */
export function cafeLabel(label: string, ui: Ui): string {
  if (label === MINE) return tr(ui, "моє кафе", "my café");
  if (label === TEAMS) return tr(ui, "кафе команди", "team café");
  return label;
}

function subscribeHash(fn: () => void) {
  window.addEventListener("hashchange", fn);
  return () => window.removeEventListener("hashchange", fn);
}

/** An invite link /connect#team=<key> hands a teammate the team café's key. */
export function useTeamInvite(): string | null {
  return useSyncExternalStore(subscribeHash, () => TEAM.exec(location.hash)?.[1] ?? null, () => null);
}

function clearHash() {
  history.replaceState(null, "", location.pathname + location.search);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function NameForm({ initial, button, onSave }: { initial: string; button: string; onSave: (name: string) => void }) {
  const t = useTr();
  const [name, setName] = useState(initial);
  const clean = cleanMember(name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (clean) onSave(clean);
  };
  return (
    <form className="key-paste-row" onSubmit={submit}>
      <input
        className="team-name"
        value={name}
        maxLength={24}
        placeholder={t("наприклад, Оля", "e.g. Alex")}
        aria-label={t("твоє ім'я в команді", "your name on the team")}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn" disabled={!clean || clean === initial}>
        {button}
      </button>
    </form>
  );
}

export function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="step">
      <div className="step-n">{icon}</div>
      <div className="step-body">
        <div className="step-ttl">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function JoinTeam({ teamKey, current }: { teamKey: string; current: string | null }) {
  const t = useTr();
  const valid = ROOM_KEY.test(teamKey);
  const access = useAccess(valid ? teamKey : null);
  const join = (name: string) => {
    if (current && current !== teamKey) rememberCafe(current, MINE);
    rememberCafe(teamKey, TEAMS);
    setMe(teamKey, name);
    saveKey(teamKey);
    clearHash();
  };
  if (!valid)
    return (
      <p className="key-paste-bad">
        {t("Посилання-запрошення пошкоджене. Попроси нове.", "This invite link is broken. Ask for a new one.")}
      </p>
    );
  if (!access) return <p className="step-p">{t("Перевіряю запрошення…", "Checking the invite…")}</p>;
  if (access.lost)
    return (
      <p className="key-paste-bad">
        {t(
          "Це запрошення вже не діє. Попроси у власника кафе нове.",
          "This invite no longer works. Ask the café owner for a new one.",
        )}
      </p>
    );
  const named = access.name;
  if (named)
    return (
      <Step
        icon={<UserPlus size={14} />}
        title={t(`Тебе запросили в кафе команди як «${named}»`, `You're invited to the team café as “${named}”`)}
      >
        <p className="step-p">
          {t(
            "Ключ у запрошенні особистий: ним підписані твої чати, а пуші приходитимуть лише про твого Claude. " +
              "Приєднайся і віддай своєму Claude фразу, що з'явиться нижче.",
            "The key in this invite is personal: it signs your chats, and push notifications will come only about " +
              "your Claude. Join, then give your Claude the phrase that appears below.",
          )}
        </p>
        <button className="btn" onClick={() => join(named)}>
          {t("приєднатися", "join")}
        </button>
      </Step>
    );
  return (
    <Step icon={<UserPlus size={14} />} title={t("Тебе запросили в кафе команди", "You're invited to a team café")}>
      <p className="step-p">
        {t(
          "Тут за столами сидять Claude усіх учасників. Напиши, як тебе підписати, і далі віддай своєму Claude фразу, " +
            "що з'явиться нижче. Твій Claude слатиме події в кафе команди замість особистого, а пуші приходитимуть " +
            "лише про нього.",
          "Every teammate's Claude sits at the tables here. Write the name to sign you with, then give your Claude " +
            "the phrase that appears below. Your Claude will send events to the team café instead of your own, and " +
            "push notifications will come only about it.",
        )}
      </p>
      <NameForm initial="" button={t("приєднатися", "join")} onSave={join} />
    </Step>
  );
}

export function MemberName({ roomKey, fixed }: { roomKey: string; fixed: string | null }) {
  const t = useTr();
  const me = useMe(roomKey);
  if (fixed)
    return (
      <div className="team-me-row">
        <span className="step-p">
          {t(
            `Твоє ім'я в кафе: ${fixed}. Воно закріплене за особистим ключем, ним підписані твої чати.`,
            `Your name in the café: ${fixed}. It's tied to your personal key and signs your chats.`,
          )}
        </span>
      </div>
    );
  return (
    <div className="team-me-row">
      <span className="step-p">
        {t(
          `Твоє ім'я в кафе${me ? `: ${me}` : ""}. Потрібне, лише коли до кафе підключено кількох людей: ним ` +
            "підписані твої чати, а пуші приходять тільки про твого Claude.",
          `Your name in the café${me ? `: ${me}` : ""}. Needed only when several people are connected to the café: ` +
            "it signs your chats, and push notifications come only about your Claude.",
        )}
      </span>
      <NameForm key={me ?? ""} initial={me ?? ""} button={t("зберегти", "save")} onSave={(n) => setMe(roomKey, n)} />
    </div>
  );
}

export function TeamInvite({ site, roomKey }: { site: string; roomKey: string }) {
  const t = useTr();
  const me = useMe(roomKey);
  const [copied, setCopied] = useState(false);
  const link = `${site}/connect#team=${roomKey}`;
  const separate = () => {
    rememberCafe(roomKey, MINE);
    const k = newKey();
    rememberCafe(k, TEAMS);
    if (me) setMe(k, me);
    saveKey(k);
  };
  return (
    <Step icon={<Users size={14} />} title={t("Командне кафе", "Team café")}>
      <p className="step-p">
        {t(
          "Надішли це посилання команді. Кожен вкаже своє ім'я, віддасть фразу своєму Claude, і всі сядуть в одному " +
            "кафе: вкладка «уся команда» покаже, хто що робить, а чати підписані іменами.",
          "Send this link to your team. Everyone enters their name and gives the phrase to their Claude, and you all " +
            "sit in one café: the “whole team” tab shows who's doing what, and chats are signed with names.",
        )}
      </p>
      <div className="codeblock wrap">
        <button
          className="copybtn"
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? t("скопійовано", "copied") : t("копіювати", "copy")}
        </button>
        <pre>{link}</pre>
      </div>
      <p className="step-p">
        {t(
          "Посилання дає повний доступ до цього кафе: бачити все й підключати свого Claude. Давай лише своїй команді; " +
            "забрати доступ можна тільки новим ключем. Якщо не хочеш змішувати команду з особистими чатами, відкрий " +
            "окреме кафе для команди. Своє нікуди не дінеться: перемикач між кафе з'явиться вгорі цієї сторінки.",
          "The link gives full access to this café: seeing everything and connecting your own Claude. Give it only to " +
            "your team; access can be taken back only with a new key. If you'd rather not mix the team with your " +
            "personal chats, open a separate café for the team. Yours stays put: a café switcher appears at the top " +
            "of this page.",
        )}
      </p>
      <div className="team-actions">
        <button className="btn" onClick={separate}>
          <UserPlus size={13} /> {t("окреме кафе для команди", "separate team café")}
        </button>
      </div>
    </Step>
  );
}

function CafePill({ cafe, on }: { cafe: KnownCafe; on: boolean }) {
  const ui = useUi();
  const lost = useAccess(on ? null : cafe.key)?.lost;
  if (lost) return null;
  return (
    <button className={`team-pill ${on ? "on" : ""}`} onClick={() => saveKey(cafe.key)}>
      {cafeLabel(cafe.label, ui)} <span className="team-n">{cafe.key.slice(0, 4)}…</span>
    </button>
  );
}

export function CafeSwitcher({ current }: { current: string }) {
  const t = useTr();
  const cafes = useCafes();
  const list = cafes.some((c) => c.key === current) ? cafes : [{ key: current, label: MINE }, ...cafes];
  if (list.length < 2) return null;
  return (
    <div className="cafe-switch">
      <span className="step-p">{t("Кафе в цьому браузері:", "Cafés in this browser:")}</span>
      {list.map((c) => (
        <CafePill key={c.key} cafe={c} on={c.key === current} />
      ))}
    </div>
  );
}
