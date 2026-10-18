import Link from "next/link";
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
  return (
    <div className="cafe-wait">
      <b>
        {viewing ? "У цьому кафе зараз тихо" : unplugged ? "Твій Claude ще не підключений" : offline ? pill : "Чекаю на твого Claude…"}
      </b>
      {viewing ? (
        <>Щойно власник щось попросить у Claude Code, агенти сядуть за столи.</>
      ) : cloud ? (
        unplugged ? (
          <>
            Одна фраза своєму Claude Code, і тут сядуть твої агенти: <Link href="/connect">підключити Claude</Link>.
            <KeyPaste />
          </>
        ) : (
          <>
            Щойно Claude Code в будь-якому чаті щось зробить, агенти сядуть за столи. Хук ще не стоїть? Дивись{" "}
            <Link href="/connect">підключити Claude</Link>.
          </>
        )
      ) : offline ? (
        <>
          Наживо показує агентів з Agent Lounge на твоєму комп&apos;ютері. Ще не стоїть? Віддай одну фразу своєму
          Claude: <Link href="/connect">підключити Claude</Link>. Вже стоїть: <code>npm run up</code> у папці
          Agent Lounge і відкрий <a href="http://127.0.0.1:3737">127.0.0.1:3737</a>.
        </>
      ) : (
        <>
          Сервер слухає. Щойно Claude Code в будь-якій сесії щось зробить, агенти сядуть за столи. Хук ще не
          стоїть? Дивись <Link href="/connect">підключити Claude</Link>.
        </>
      )}
    </div>
  );
}
