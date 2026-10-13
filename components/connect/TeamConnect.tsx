"use client";

import { FormEvent, ReactNode, useState, useSyncExternalStore } from "react";
import { Users, UserPlus } from "lucide-react";
import { ROOM_KEY } from "@/lib/live/hookConfig.mjs";
import { cleanMember } from "@/lib/live/member";
import { useAccess } from "@/lib/live/access";
import { newKey, saveKey } from "@/lib/live/relayKey";
import { KnownCafe, rememberCafe, setMe, useCafes, useMe } from "@/lib/live/team";

const TEAM = /[#&]team=([A-Za-z0-9_-]{20,128})/;

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
        placeholder="наприклад, Оля"
        aria-label="твоє ім'я в команді"
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
  const valid = ROOM_KEY.test(teamKey);
  const access = useAccess(valid ? teamKey : null);
  const join = (name: string) => {
    if (current && current !== teamKey) rememberCafe(current, "моє кафе");
    rememberCafe(teamKey, "кафе команди");
    setMe(teamKey, name);
    saveKey(teamKey);
    clearHash();
  };
  if (!valid) return <p className="key-paste-bad">Посилання-запрошення пошкоджене. Попроси нове.</p>;
  if (!access) return <p className="step-p">Перевіряю запрошення…</p>;
  if (access.lost) return <p className="key-paste-bad">Це запрошення вже не діє. Попроси у власника кафе нове.</p>;
  const named = access.name;
  if (named)
    return (
      <Step icon={<UserPlus size={14} />} title={`Тебе запросили в кафе команди як «${named}»`}>
        <p className="step-p">
          Ключ у запрошенні особистий: ним підписані твої чати, а пуші приходитимуть лише про твого Claude. Приєднайся
          і віддай своєму Claude фразу, що з&apos;явиться нижче.
        </p>
        <button className="btn" onClick={() => join(named)}>
          приєднатися
        </button>
      </Step>
    );
  return (
    <Step icon={<UserPlus size={14} />} title="Тебе запросили в кафе команди">
      <p className="step-p">
        Тут за столами сидять Claude усіх учасників. Напиши, як тебе підписати, і далі віддай своєму Claude фразу, що
        з&apos;явиться нижче. Твій Claude слатиме події в кафе команди замість особистого, а пуші приходитимуть лише
        про нього.
      </p>
      <NameForm initial="" button="приєднатися" onSave={join} />
    </Step>
  );
}

export function MemberName({ roomKey, fixed }: { roomKey: string; fixed: string | null }) {
  const me = useMe(roomKey);
  if (fixed)
    return (
      <div className="team-me-row">
        <span className="step-p">
          Твоє ім&apos;я в кафе: {fixed}. Воно закріплене за особистим ключем, ним підписані твої чати.
        </span>
      </div>
    );
  return (
    <div className="team-me-row">
      <span className="step-p">
        Твоє ім&apos;я в кафе{me ? `: ${me}` : ""}. Потрібне, лише коли до кафе підключено кількох людей: ним
        підписані твої чати, а пуші приходять тільки про твого Claude.
      </span>
      <NameForm key={me ?? ""} initial={me ?? ""} button="зберегти" onSave={(n) => setMe(roomKey, n)} />
    </div>
  );
}

export function TeamInvite({ site, roomKey }: { site: string; roomKey: string }) {
  const me = useMe(roomKey);
  const [copied, setCopied] = useState(false);
  const link = `${site}/connect#team=${roomKey}`;
  const separate = () => {
    rememberCafe(roomKey, "моє кафе");
    const k = newKey();
    rememberCafe(k, "кафе команди");
    if (me) setMe(k, me);
    saveKey(k);
  };
  return (
    <Step icon={<Users size={14} />} title="Командне кафе">
      <p className="step-p">
        Надішли це посилання команді. Кожен вкаже своє ім&apos;я, віддасть фразу своєму Claude, і всі сядуть в одному
        кафе: вкладка «уся команда» покаже, хто що робить, а чати підписані іменами.
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
          {copied ? "скопійовано" : "копіювати"}
        </button>
        <pre>{link}</pre>
      </div>
      <p className="step-p">
        Посилання дає повний доступ до цього кафе: бачити все й підключати свого Claude. Давай лише своїй команді;
        забрати доступ можна тільки новим ключем. Якщо не хочеш змішувати команду з особистими чатами, відкрий окреме
        кафе для команди. Своє нікуди не дінеться: перемикач між кафе з&apos;явиться вгорі цієї сторінки.
      </p>
      <div className="team-actions">
        <button className="btn" onClick={separate}>
          <UserPlus size={13} /> окреме кафе для команди
        </button>
      </div>
    </Step>
  );
}

function CafePill({ cafe, on }: { cafe: KnownCafe; on: boolean }) {
  const lost = useAccess(on ? null : cafe.key)?.lost;
  if (lost) return null;
  return (
    <button className={`team-pill ${on ? "on" : ""}`} onClick={() => saveKey(cafe.key)}>
      {cafe.label} <span className="team-n">{cafe.key.slice(0, 4)}…</span>
    </button>
  );
}

export function CafeSwitcher({ current }: { current: string }) {
  const cafes = useCafes();
  const list = cafes.some((c) => c.key === current) ? cafes : [{ key: current, label: "моє кафе" }, ...cafes];
  if (list.length < 2) return null;
  return (
    <div className="cafe-switch">
      <span className="step-p">Кафе в цьому браузері:</span>
      {list.map((c) => (
        <CafePill key={c.key} cafe={c} on={c.key === current} />
      ))}
    </div>
  );
}
