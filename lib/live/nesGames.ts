/** A free homebrew game the café ships, with what its licence asks us to show. */
export interface NesGame {
  id: string;
  title: string;
  /** under public/roms */
  file: string;
  players: 1 | 2;
  about: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
}

const GPL3 = "https://www.gnu.org/licenses/gpl-3.0.html";

/** Only games whose authors let anyone share them; never a cartridge someone sells or owns the rights to. */
export const NES_GAMES: NesGame[] = [
  {
    id: "nova",
    title: "Nova the Squirrel",
    file: "nova.nes",
    players: 1,
    about: "Платформер: білка Нова, 33 рівні, 7 босів, п'ять світів.",
    author: "NovaSquirrel",
    license: "код GPL-3.0, графіка й рівні CC BY-NC-SA 4.0",
    licenseUrl: "https://github.com/NovaSquirrel/NovaTheSquirrel#license",
    source: "https://github.com/NovaSquirrel/NovaTheSquirrel",
  },
  {
    id: "thwaite",
    title: "Thwaite",
    file: "thwaite128.nes",
    players: 1,
    about: "Збивай ракети, поки вони не влучили в міста.",
    author: "Damian Yerrick",
    license: "GPL-3.0",
    licenseUrl: GPL3,
    source: "https://github.com/pinobatch/thwaite-nes",
  },
  {
    id: "croom",
    title: "Concentration Room",
    file: "croom.nes",
    players: 2,
    about: "Знайди пари карток: сам, проти комп'ютера або вдвох.",
    author: "Damian Yerrick",
    license: "GPL-3.0",
    licenseUrl: GPL3,
    source: "https://github.com/pinobatch/croom-nes",
  },
];

export const MAX_ROM_BYTES = 4 * 1024 * 1024;

/** A ROM file as the binary string jsnes reads, or why it is not one. */
export async function readRom(f: File): Promise<{ data: string } | { error: "big" | "notnes" }> {
  if (f.size > MAX_ROM_BYTES) return { error: "big" };
  const buf = new Uint8Array(await f.arrayBuffer());
  if (buf[0] !== 0x4e || buf[1] !== 0x45 || buf[2] !== 0x53 || buf[3] !== 0x1a) return { error: "notnes" };
  let data = "";
  for (let i = 0; i < buf.length; i += 0x8000) data += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { data };
}

/** Fetches one of the café's own ROMs the same way. */
export async function fetchRom(file: string): Promise<{ data: string } | { error: "notnes" | "net" }> {
  try {
    const res = await fetch(`/roms/${encodeURIComponent(file)}`);
    if (!res.ok) return { error: "net" };
    const blob = await res.blob();
    const r = await readRom(new File([blob], file));
    return "data" in r ? r : { error: "notnes" };
  } catch {
    return { error: "net" };
  }
}
