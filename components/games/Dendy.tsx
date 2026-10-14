"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { FolderOpen, Pause, Play, RotateCcw, X } from "lucide-react";
import type { Browser, Controller } from "jsnes";
import { Cart } from "@/lib/live/cartShelf";
import { NES_GAMES, NesGame, fetchRom, readRom } from "@/lib/live/nesGames";
import { CartShelf, useCartShelf } from "./CartShelf";
import FullscreenButton from "./FullscreenButton";

type Players = 1 | 2;
type Btn = "A" | "B" | "SELECT" | "START" | "UP" | "DOWN" | "LEFT" | "RIGHT";
type Key = [code: number, player: Players, button: Btn, label: string];

const ONE: Key[] = [
  [38, 1, "UP", "↑"],
  [40, 1, "DOWN", "↓"],
  [37, 1, "LEFT", "←"],
  [39, 1, "RIGHT", "→"],
  [88, 1, "A", "X"],
  [90, 1, "B", "Z"],
  [13, 1, "START", "Enter"],
  [16, 1, "SELECT", "Shift"],
];

const TWO: Key[] = [
  [87, 1, "UP", "W"],
  [83, 1, "DOWN", "S"],
  [65, 1, "LEFT", "A"],
  [68, 1, "RIGHT", "D"],
  [71, 1, "A", "G"],
  [70, 1, "B", "F"],
  [69, 1, "START", "E"],
  [81, 1, "SELECT", "Q"],
  [38, 2, "UP", "↑"],
  [40, 2, "DOWN", "↓"],
  [37, 2, "LEFT", "←"],
  [39, 2, "RIGHT", "→"],
  [190, 2, "A", "."],
  [188, 2, "B", ","],
  [13, 2, "START", "Enter"],
  [191, 2, "SELECT", "/"],
];

const FAILS = {
  big: "Файл завеликий для гри з Денді.",
  notnes: "Це не файл гри для Денді: потрібен .nes.",
  net: "Не вдалося завантажити гру, спробуй ще раз.",
  load: "Емулятор не завантажився, спробуй ще раз.",
  crash: "Гра зависла в емуляторі. Натисни «спочатку».",
  full: "Полиця повна: прибери з неї картридж, щоб поставити цей.",
  shelf: "Браузер не дав зберегти гру на полицю, але грати можна.",
} as const;

const keyMap = (C: typeof Controller, list: Key[]) =>
  Object.fromEntries(list.map(([code, p, b, label]) => [code, [p, C[`BUTTON_${b}`], label]])) as Record<
    number,
    [number, number, string]
  >;

function romFail(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  const mapper = /Unsupported mapper: (\d+)/.exec(msg)?.[1];
  if (mapper) return `Цей картридж (маппер ${mapper}) емулятор поки не вміє запускати.`;
  return msg.includes("Not a valid NES ROM") ? FAILS.notnes : "Гру не вдалося запустити.";
}

const whoPlays = (g: NesGame) => (g.players === 2 ? "1–2 гравці" : "1 гравець");

interface Loaded {
  title: string;
  data: string;
  n: number;
}

/** A Dendy in the café: free homebrew games, or a game from your own disk that never leaves this browser. */
export default function Dendy() {
  const [game, setGame] = useState<Loaded | null>(null);
  const [players, setPlayers] = useState<Players>(1);
  const [fail, setFail] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const screen = useRef<HTMLDivElement>(null);
  const tv = useRef<HTMLDivElement>(null);
  const emu = useRef<{ b: Browser; C: typeof Controller } | null>(null);
  const playersRef = useRef(players);
  const shelf = useCartShelf();

  useEffect(() => {
    playersRef.current = players;
    const e = emu.current;
    if (e) e.b.keyboard.keys = keyMap(e.C, players === 2 ? TWO : ONE);
  }, [players]);

  useEffect(() => {
    if (!game) return;
    let gone = false;
    let made: Browser | null = null;
    import("jsnes").then(
      ({ Browser: Emu, Controller: C }) => {
        if (gone || !screen.current) return;
        const b = new Emu({ container: screen.current, onError: () => setFail(FAILS.crash) });
        try {
          b.nes.loadROM(game.data);
        } catch (e) {
          b.destroy();
          setFail(romFail(e));
          setGame(null);
          return;
        }
        b.keyboard.keys = keyMap(C, playersRef.current === 2 ? TWO : ONE);
        b.start();
        made = b;
        emu.current = { b, C };
      },
      () => !gone && setFail(FAILS.load),
    );
    return () => {
      gone = true;
      emu.current = null;
      made?.destroy();
    };
  }, [game]);

  const start = (title: string, data: string) => {
    setFail(null);
    setPaused(false);
    setGame((g) => ({ title, data, n: (g?.n ?? 0) + 1 }));
  };

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const r = await readRom(f);
    if ("error" in r) return setFail(FAILS[r.error]);
    const title = f.name.replace(/\.nes$/i, "");
    start(title, r.data);
    const kept = await shelf.keep(title, f);
    if (kept !== "ok") setFail(FAILS[kept === "full" ? "full" : "shelf"]);
  };

  const playCart = async (c: Cart) => {
    setBusy(c.id);
    const r = await readRom(new File([c.rom], `${c.title}.nes`));
    setBusy(null);
    if ("error" in r) return setFail(FAILS[r.error]);
    start(c.title, r.data);
  };

  const pickGame = async (g: NesGame) => {
    setBusy(g.id);
    const r = await fetchRom(g.file);
    setBusy(null);
    if ("error" in r) return setFail(FAILS[r.error]);
    setPlayers(1);
    start(g.title, r.data);
  };

  const pause = () => {
    const b = emu.current?.b;
    if (!b) return;
    if (paused) b.start();
    else b.stop();
    setPaused(!paused);
  };

  const again = () => {
    const b = emu.current?.b;
    if (!b) return;
    b.nes.reloadROM();
    if (paused) b.start();
    setPaused(false);
    setFail(null);
  };

  const quit = () => {
    setGame(null);
    setFail(null);
  };

  return (
    <div className="dendy">
      <div className="dendy-side">
        {NES_GAMES.length > 0 && (
          <ul className="dendy-games">
            {NES_GAMES.map((g) => (
              <li key={g.id}>
                <button className="btn" onClick={() => pickGame(g)} disabled={busy != null} title={g.about}>
                  {busy === g.id ? "вантажу…" : g.title}
                  <small>{whoPlays(g)}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        <CartShelf carts={shelf.carts} busy={busy} onPlay={playCart} onDrop={shelf.drop} />
        <div className="dendy-row">
          <label className="btn">
            <FolderOpen size={14} />
            своя гра з диска
            <input type="file" accept=".nes" hidden onChange={pickFile} />
          </label>
          <div className="viewseg" role="radiogroup" aria-label="скільки гравців">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={players === n}
                className={players === n ? "on" : ""}
                onClick={() => setPlayers(n)}
              >
                {n === 1 ? "1 гравець" : "2 гравці"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="dendy-main">
        {fail && <p className="key-paste-bad">{fail}</p>}
        {game && (
          <div className="dendy-bar">
            <b className="dendy-ttl">{game.title}</b>
            <button className="btn btn-ic" onClick={pause} title={paused ? "далі" : "пауза"}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button className="btn btn-ic" onClick={again} title="спочатку" aria-label="спочатку">
              <RotateCcw size={14} />
            </button>
            <FullscreenButton target={tv} />
            <button className="btn btn-ic" onClick={quit} title="вийти з гри" aria-label="вийти з гри">
              <X size={14} />
            </button>
          </div>
        )}
        <div className="dendy-tv" ref={tv}>
          {game ? (
            <div className="dendy-screen" ref={screen} key={game.n} />
          ) : (
            <div className="dendy-screen dendy-off">встав картридж</div>
          )}
        </div>
      </div>
    </div>
  );
}
