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
  source: string;
}

/** Only games whose authors let anyone share them; never a cartridge someone sells or owns the rights to. */
export const NES_GAMES: NesGame[] = [];

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
