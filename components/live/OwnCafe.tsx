"use client";

import { Coffee, TerminalSquare } from "lucide-react";
import { PROJECT_URL } from "@/lib/brand";
import { useTr } from "@/lib/i18n";
import Code from "../connect/Code";
import { Step } from "../connect/TeamConnect";
import KeyPaste from "./KeyPaste";

const RUN_OWN = `git clone https://${PROJECT_URL}.git ~/agent-lounge
cd ~/agent-lounge && npm install
npm run setup`;

export function ProjectLink() {
  return (
    <a href={`https://${PROJECT_URL}`} target="_blank" rel="noopener noreferrer">
      {PROJECT_URL}
    </a>
  );
}

/** The one-line pointer for the empty café and the door: whose café this is, and where to get one. */
export function OwnCafeLine() {
  const t = useTr();
  return (
    <>
      {t(
        "Тут власник дивиться на свого Claude, а нові кафе на цьому сайті не відкриваються. Заведи своє, безкоштовне і з " +
          "відкритим кодом: ",
        "Its owner watches their own Claude here, and new cafés don't open on this site. Run your own, free and open " +
          "source: ",
      )}
      <ProjectLink />.
    </>
  );
}

export function OwnerPaste() {
  const t = useTr();
  return <KeyPaste hint={t("Це твоє кафе? Встав посилання з ключем:", "Is this your café? Paste the link with your key:")} />;
}

/** /connect on a personal site for a browser with no key and no invite: how to run Agent Lounge yourself. */
export default function OwnCafe() {
  const t = useTr();
  return (
    <>
      <div className="notice">
        <Coffee size={14} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: 6 }} />
        <b>{t("Це особисте кафе.", "This is a personal café.")}</b> <OwnCafeLine />
      </div>

      <Step icon={<TerminalSquare size={14} />} title={t("На своєму комп'ютері", "On your computer")}>
        <Code text={RUN_OWN} />
        <p className="step-p">
          {t(
            "Кафе відкриється на 127.0.0.1:3737, і в мережу нічого не піде. Свій сайт на Vercel і Supabase описано в ",
            "The café opens at 127.0.0.1:3737, and nothing goes out to the network. Your own site on Vercel and " +
              "Supabase is in the ",
          )}
          <a href={`https://${PROJECT_URL}#readme`} target="_blank" rel="noopener noreferrer">
            README
          </a>
          .
        </p>
      </Step>

      <OwnerPaste />
    </>
  );
}
