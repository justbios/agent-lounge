const MEMBER_MAX = 24;

/** A teammate's name from the hook URL or the connect form: letters, digits, spaces and . _ -, at most 24 characters. */
export function cleanMember(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MEMBER_MAX)
    .trim();
  return s || null;
}
