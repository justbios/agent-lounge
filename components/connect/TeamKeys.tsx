"use client";

import { FormEvent, useEffect, useState } from "react";
import { Crown, KeyRound, UserMinus, UserPlus, Users } from "lucide-react";
import { Access, KeyError, KeyRow, inviteKey, listKeys, refreshAccess, removeKey, startKeys } from "@/lib/live/access";
import { cleanMember } from "@/lib/live/member";
import { saveKey } from "@/lib/live/relayKey";
import { setMe, swapCafe, useMe } from "@/lib/live/team";
import { Two, useTr, useUi } from "@/lib/i18n";
import { Step } from "./TeamConnect";

const ERRORS: Record<KeyError, Two> = {
  "name taken": { uk: "Таке ім'я вже є в команді.", en: "That name is already on the team." },
  "too many": { uk: "У команді вже 30 людей.", en: "The team already has 30 people." },
  "bad name": {
    uk: "Ім'я до 24 символів, без лапок і кутових дужок.",
    en: "A name of up to 24 characters, with no quotes or angle brackets.",
  },
  "not owner": { uk: "Це може лише власник кафе.", en: "Only the café owner can do this." },
  failed: { uk: "Не вийшло, спробуй ще раз.", en: "That didn't work, try again." },
};

interface NameFieldProps {
  button: string;
  busy: boolean;
  onSubmit: (name: string) => Promise<boolean>;
}

function NameField({ button, busy, onSubmit }: NameFieldProps) {
  const t = useTr();
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
        placeholder={t("ім'я, наприклад Оля", "name, e.g. Alex")}
        aria-label={t("ім'я", "name")}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn" disabled={!clean || busy}>
        {button}
      </button>
    </form>
  );
}

function StartKeys({ roomKey }: { roomKey: string }) {
  const ui = useUi();
  const t = useTr();
  const me = useMe(roomKey);
  const [name, setName] = useState(me ?? "");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<KeyError | null>(null);
  const clean = cleanMember(name);

  const start = async () => {
    if (!clean) return;
    setBusy(true);
    setErr(null);
    const res = await startKeys(roomKey, clean);
    setBusy(false);
    if ("error" in res) return setErr(res.error);
    swapCafe(roomKey, res.data.key);
    setMe(res.data.key, res.data.name);
    saveKey(res.data.key);
    refreshAccess(roomKey);
  };

  return (
    <Step icon={<KeyRound size={14} />} title={t("Особисті ключі", "Personal keys")}>
      <p className="step-p">
        {t(
          "Зараз у кафе один спільний ключ: у кого посилання, той і в кафе, і прибрати когось не вийде. З особистими " +
            "ключами ти станеш власником: кожному даси окреме запрошення і будь-кого зможеш прибрати. Кафе, зерна, " +
            "меблі й чат лишаються.",
          "Right now the café has one shared key: whoever has the link is in, and there's no removing anyone. With " +
            "personal keys you become the owner: you give each person their own invite and can remove anyone. The " +
            "café, beans, furniture and chat all stay.",
        )}
      </p>
      <p className="step-p">
        {t(
          "Спільний ключ одразу перестане діяти, тож кожен, і ти теж, має один раз віддати своєму Claude нову фразу. " +
            "Поки цього не зробили, їхні чати сюди не пишуть. Посилання для перегляду теж зміниться.",
          "The shared key stops working right away, so everyone, you included, has to give their Claude the new " +
            "phrase once. Until they do, their chats don't write here. The view-only link changes too.",
        )}
      </p>
      <div className="key-paste-row">
        <input
          className="team-name"
          value={name}
          maxLength={24}
          placeholder={t("твоє ім'я, наприклад Сергій", "your name, e.g. Sam")}
          aria-label={t("твоє ім'я в команді", "your name on the team")}
          onChange={(e) => {
            setName(e.target.value);
            setSure(false);
          }}
        />
        {sure ? (
          <>
            <button className="btn" disabled={!clean || busy} onClick={start}>
              {t("так, увімкнути", "yes, turn on")}
            </button>
            <button className="btn" onClick={() => setSure(false)}>
              {t("ні", "no")}
            </button>
          </>
        ) : (
          <button className="btn" disabled={!clean} onClick={() => setSure(true)}>
            {t("увімкнути", "turn on")}
          </button>
        )}
      </div>
      {sure && (
        <p className="step-p">
          {t(
            "Точно? Спільний ключ перестане діяти для всіх одразу.",
            "Sure? The shared key stops working for everyone at once.",
          )}
        </p>
      )}
      {err && <p className="key-paste-bad">{ERRORS[err][ui]}</p>}
    </Step>
  );
}

function InviteLink({ link, name }: { link: string; name: string }) {
  const t = useTr();
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
          {copied ? t("скопійовано", "copied") : t("копіювати", "copy")}
        </button>
        <pre>{link}</pre>
      </div>
      <p className="step-p">
        {t(
          `Запрошення для «${name}»: хто його відкриє, той і буде «${name}» у кафе. Надішли лише цій людині. ` +
            "Посилання показується один раз; загубиться, то прибери й запроси знову.",
          `An invite for “${name}”: whoever opens it will be “${name}” in the café. Send it only to that person. ` +
            "The link is shown just once; if it gets lost, remove them and invite again.",
        )}
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
  const ui = useUi();
  const t = useTr();
  const [rows, setRows] = useKeyRows(roomKey, access.topic);
  const [invite, setInvite] = useState<{ link: string; name: string } | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Two | null>(null);
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
    setNote({
      uk: `«${name}» більше не бачить кафе. Посилання для перегляду змінилось: якщо ділився ним, надішли нове.`,
      en: `“${name}” can no longer see the café. The view-only link changed: if you shared it, send the new one.`,
    });
    refreshAccess(roomKey);
  };

  return (
    <Step icon={<Users size={14} />} title={t("Команда", "Team")}>
      <p className="step-p">
        {t(
          "Кафе на особистих ключах: у кожного свій, і ім'я в кафе дає власник разом із запрошенням.",
          "This café is on personal keys: everyone has their own, and the owner gives each name along with the invite.",
        )}
      </p>
      {owner && rows?.length === 1 && (
        <p className="notice">
          {t(
            "Поки в команді лише ти. Щойно увімкнув особисті ключі? Спільний ключ уже не діє, тож віддай своєму Claude " +
              "фразу з кроку «Віддай це своєму Claude» вище ще раз, а команді створи запрошення нижче, кожному своє.",
            "So far the team is just you. Just turned on personal keys? The shared key no longer works, so give your " +
              "Claude the phrase from the “Give this to your Claude” step above once more, and create invites for " +
              "your team below, one per person.",
          )}
        </p>
      )}
      <ul className="team-keys">
        {(rows ?? []).map((r) => (
          <li key={r.name}>
            {r.role === "owner" && <Crown size={13} aria-label={t("власник", "owner")} />}
            <span>{r.name}</span>
            {r.name === access.name && <span className="team-me">{t("це ти", "you")}</span>}
            {owner && r.role === "member" && (
              <span className="team-key-act">
                {sure === r.name ? (
                  <>
                    <button className="btn" disabled={busy} onClick={() => drop(r.name)}>
                      {t("так, прибрати", "yes, remove")}
                    </button>
                    <button className="btn" onClick={() => setSure(null)}>
                      {t("ні", "no")}
                    </button>
                  </>
                ) : (
                  <button className="btn" onClick={() => setSure(r.name)}>
                    <UserMinus size={13} /> {t("прибрати", "remove")}
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
            <UserPlus size={13} /> {t("Запросити", "Invite")}
          </div>
          <NameField button={t("створити запрошення", "create invite")} busy={busy} onSubmit={add} />
          {invite && <InviteLink link={invite.link} name={invite.name} />}
        </>
      ) : (
        <p className="step-p">
          {t(
            `Запрошувати й прибирати людей може лише власник кафе${ownerName ? `, ${ownerName}` : ""}.`,
            `Only the café owner${ownerName ? `, ${ownerName},` : ""} can invite and remove people.`,
          )}
        </p>
      )}
      {note && <p className="step-p">{note[ui]}</p>}
    </Step>
  );
}

/** The café's people: the switch to personal keys on a shared key, then its members and the owner's controls. */
export default function TeamKeys({ site, roomKey, access }: { site: string; roomKey: string; access: Access }) {
  return access.locked ? <Members site={site} roomKey={roomKey} access={access} /> : <StartKeys roomKey={roomKey} />;
}
