"use client";

import { FormEvent, useEffect, useState } from "react";
import { Crown, KeyRound, UserMinus, UserPlus, Users } from "lucide-react";
import { Access, KeyError, KeyRow, inviteKey, listKeys, refreshAccess, removeKey, startKeys } from "@/lib/live/access";
import { cleanMember } from "@/lib/live/member";
import { saveKey } from "@/lib/live/relayKey";
import { setMe, swapCafe, useMe } from "@/lib/live/team";
import { Step } from "./TeamConnect";

const ERRORS: Record<KeyError, string> = {
  "name taken": "Таке ім'я вже є в команді.",
  "too many": "У команді вже 30 людей.",
  "bad name": "Ім'я до 24 символів, без лапок і кутових дужок.",
  "not owner": "Це може лише власник кафе.",
  failed: "Не вийшло, спробуй ще раз.",
};

interface NameFieldProps {
  button: string;
  busy: boolean;
  onSubmit: (name: string) => Promise<boolean>;
}

function NameField({ button, busy, onSubmit }: NameFieldProps) {
  const [name, setName] = useState("");
  const clean = cleanMember(name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (clean) onSubmit(clean).then((ok) => ok && setName(""));
  };
  return (
    <form className="key-paste-row" onSubmit={submit}>
      <input
        className="team-name"
        value={name}
        maxLength={24}
        placeholder="ім'я, наприклад Оля"
        aria-label="ім'я"
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn" disabled={!clean || busy}>
        {button}
      </button>
    </form>
  );
}

function StartKeys({ roomKey }: { roomKey: string }) {
  const me = useMe(roomKey);
  const [name, setName] = useState(me ?? "");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clean = cleanMember(name);

  const start = async () => {
    if (!clean) return;
    setBusy(true);
    setErr(null);
    const res = await startKeys(roomKey, clean);
    setBusy(false);
    if ("error" in res) return setErr(ERRORS[res.error]);
    swapCafe(roomKey, res.data.key);
    setMe(res.data.key, res.data.name);
    saveKey(res.data.key);
    refreshAccess(roomKey);
  };

  return (
    <Step icon={<KeyRound size={14} />} title="Особисті ключі">
      <p className="step-p">
        Зараз у кафе один спільний ключ: у кого посилання, той і в кафе, і прибрати когось не вийде. З особистими
        ключами ти станеш власником: кожному даси окреме запрошення і будь-кого зможеш прибрати. Кафе, зерна, меблі й
        чат лишаються.
      </p>
      <p className="step-p">
        Спільний ключ одразу перестане діяти, тож кожен, і ти теж, має один раз віддати своєму Claude нову фразу. Поки
        цього не зробили, їхні чати сюди не пишуть. Посилання для перегляду теж зміниться.
      </p>
      <div className="key-paste-row">
        <input
          className="team-name"
          value={name}
          maxLength={24}
          placeholder="твоє ім'я, наприклад Сергій"
          aria-label="твоє ім'я в команді"
          onChange={(e) => {
            setName(e.target.value);
            setSure(false);
          }}
        />
        {sure ? (
          <>
            <button className="btn" disabled={!clean || busy} onClick={start}>
              так, увімкнути
            </button>
            <button className="btn" onClick={() => setSure(false)}>
              ні
            </button>
          </>
        ) : (
          <button className="btn" disabled={!clean} onClick={() => setSure(true)}>
            увімкнути
          </button>
        )}
      </div>
      {sure && <p className="step-p">Точно? Спільний ключ перестане діяти для всіх одразу.</p>}
      {err && <p className="key-paste-bad">{err}</p>}
    </Step>
  );
}

function InviteLink({ link, name }: { link: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
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
        Запрошення для «{name}»: хто його відкриє, той і буде «{name}» у кафе. Надішли лише цій людині. Посилання
        показується один раз; загубиться, то прибери й запроси знову.
      </p>
    </>
  );
}

function useKeyRows(roomKey: string, topic: string | null) {
  const [rows, setRows] = useState<{ topic: string | null; list: KeyRow[] } | null>(null);
  useEffect(() => {
    let live = true;
    listKeys(roomKey).then((r) => live && "data" in r && setRows({ topic, list: r.data }));
    return () => {
      live = false;
    };
  }, [roomKey, topic]);
  return [rows?.list ?? null, (list: KeyRow[]) => setRows({ topic, list })] as const;
}

function Members({ site, roomKey, access }: { site: string; roomKey: string; access: Access }) {
  const [rows, setRows] = useKeyRows(roomKey, access.topic);
  const [invite, setInvite] = useState<{ link: string; name: string } | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const owner = access.role === "owner";
  const ownerName = rows?.find((r) => r.role === "owner")?.name;

  const add = async (name: string) => {
    setBusy(true);
    setNote(null);
    const res = await inviteKey(roomKey, name);
    setBusy(false);
    if ("error" in res) {
      setNote(ERRORS[res.error]);
      return false;
    }
    setInvite({ link: `${site}/connect#team=${res.data.key}`, name: res.data.name });
    listKeys(roomKey).then((r) => "data" in r && setRows(r.data));
    return true;
  };

  const drop = async (name: string) => {
    setBusy(true);
    setNote(null);
    const res = await removeKey(roomKey, name);
    setBusy(false);
    setSure(null);
    if ("error" in res) return setNote(ERRORS[res.error]);
    setRows(res.data);
    if (invite?.name === name) setInvite(null);
    setNote(`«${name}» більше не бачить кафе. Посилання для перегляду змінилось: якщо ділився ним, надішли нове.`);
    refreshAccess(roomKey);
  };

  return (
    <Step icon={<Users size={14} />} title="Команда">
      <p className="step-p">
        Кафе на особистих ключах: у кожного свій, і ім&apos;я в кафе дає власник разом із запрошенням.
      </p>
      {owner && rows?.length === 1 && (
        <p className="notice">
          Поки в команді лише ти. Щойно увімкнув особисті ключі? Спільний ключ уже не діє, тож віддай своєму Claude
          фразу з кроку «Віддай це своєму Claude» вище ще раз, а команді створи запрошення нижче, кожному своє.
        </p>
      )}
      <ul className="team-keys">
        {(rows ?? []).map((r) => (
          <li key={r.name}>
            {r.role === "owner" && <Crown size={13} aria-label="власник" />}
            <span>{r.name}</span>
            {r.name === access.name && <span className="team-me">це ти</span>}
            {owner && r.role === "member" && (
              <span className="team-key-act">
                {sure === r.name ? (
                  <>
                    <button className="btn" disabled={busy} onClick={() => drop(r.name)}>
                      так, прибрати
                    </button>
                    <button className="btn" onClick={() => setSure(null)}>
                      ні
                    </button>
                  </>
                ) : (
                  <button className="btn" onClick={() => setSure(r.name)}>
                    <UserMinus size={13} /> прибрати
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {owner ? (
        <>
          <div className="step-ttl">
            <UserPlus size={13} /> Запросити
          </div>
          <NameField button="створити запрошення" busy={busy} onSubmit={add} />
          {invite && <InviteLink link={invite.link} name={invite.name} />}
        </>
      ) : (
        <p className="step-p">
          Запрошувати й прибирати людей може лише власник кафе{ownerName ? `, ${ownerName}` : ""}.
        </p>
      )}
      {note && <p className="step-p">{note}</p>}
    </Step>
  );
}

/** The café's people: the switch to personal keys on a shared key, then its members and the owner's controls. */
export default function TeamKeys({ site, roomKey, access }: { site: string; roomKey: string; access: Access }) {
  return access.locked ? <Members site={site} roomKey={roomKey} access={access} /> : <StartKeys roomKey={roomKey} />;
}
