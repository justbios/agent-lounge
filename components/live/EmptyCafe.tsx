import Link from "next/link";
import { tr, useUi } from "@/lib/i18n";
import KeyPaste from "./KeyPaste";

export default function EmptyCafe({
  viewing,
  unplugged,
  offline,
  cloud,
  pill,
}: {
  viewing: boolean;
  unplugged: boolean;
  offline: boolean;
  cloud: boolean;
  pill: string;
}) {
  const ui = useUi();
  const en = ui === "en";
  const connect = <Link href="/connect">{tr(ui, "підключити Claude", "connect Claude")}</Link>;
  return (
    <div className="cafe-wait">
      <b>
        {viewing
          ? tr(ui, "У цьому кафе зараз тихо", "It's quiet in this café right now")
          : unplugged
            ? tr(ui, "Твій Claude ще не підключений", "Your Claude isn't connected yet")
            : offline
              ? pill
              : tr(ui, "Чекаю на твого Claude…", "Waiting for your Claude…")}
      </b>
      {viewing ? (
        <>
          {tr(
            ui,
            "Щойно власник щось попросить у Claude Code, агенти сядуть за столи.",
            "As soon as the owner asks Claude Code for something, the agents take their desks.",
          )}
        </>
      ) : cloud ? (
        unplugged ? (
          <>
            {en ? (
              <>One sentence to your Claude Code, and your agents sit down here: {connect}.</>
            ) : (
              <>Одна фраза своєму Claude Code, і тут сядуть твої агенти: {connect}.</>
            )}
            <KeyPaste />
          </>
        ) : en ? (
          <>
            As soon as Claude Code does something in any chat, the agents take their desks. No hook yet? See {connect}.
          </>
        ) : (
          <>
            Щойно Claude Code в будь-якому чаті щось зробить, агенти сядуть за столи. Хук ще не стоїть? Дивись{" "}
            {connect}.
          </>
        )
      ) : offline ? (
        en ? (
          <>
            Live shows the agents from Agent Lounge on your computer. Not set up yet? Give your Claude one
            sentence: {connect}. Already set up: <code>npm run up</code> in the Agent Lounge folder, then open{" "}
            <a href="http://127.0.0.1:3737">127.0.0.1:3737</a>.
          </>
        ) : (
          <>
            Наживо показує агентів з Agent Lounge на твоєму комп&apos;ютері. Ще не стоїть? Віддай одну фразу своєму
            Claude: {connect}. Вже стоїть: <code>npm run up</code> у папці Agent Lounge і відкрий{" "}
            <a href="http://127.0.0.1:3737">127.0.0.1:3737</a>.
          </>
        )
      ) : en ? (
        <>
          The server is listening. As soon as Claude Code does something in any session, the agents take their desks. No
          hook yet? See {connect}.
        </>
      ) : (
        <>
          Сервер слухає. Щойно Claude Code в будь-якій сесії щось зробить, агенти сядуть за столи. Хук ще не стоїть?
          Дивись {connect}.
        </>
      )}
    </div>
  );
}
