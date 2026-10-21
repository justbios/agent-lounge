import { Usage } from "./types";

/**
 * API prices in dollars per million tokens: input, output and cache read; a 5-minute cache write is 1.25× input.
 * On a Pro or Max subscription nobody pays these, but they weigh the tokens the way the limit does: an Opus
 * token costs more of it than a Haiku one. The first match wins, so newer ids come before their family's default.
 */
const PRICES: [RegExp, number, number, number][] = [
  [/(fable|mythos)-5-1/, 10, 50, 0.25],
  [/fable|mythos/, 10, 50, 1],
  [/opus-5-5/, 4, 20, 0.2],
  [/opus-4-1|opus-4-2025|opus-4-0/, 15, 75, 1.5],
  [/opus/, 5, 25, 0.5],
  [/sonnet-5/, 2, 10, 0.2],
  [/sonnet/, 3, 15, 0.3],
  [/haiku-5/, 0.1, 0.5, 0.01],
  [/haiku-4/, 1, 5, 0.1],
  [/haiku/, 0.8, 4, 0.08],
];

/** What the tokens would cost on the API, in dollars; null for a model the table doesn't know. */
export function costOf(u: Usage, model: string): number | null {
  const p = PRICES.find(([re]) => re.test(model));
  if (!p) return null;
  const [, inp, out, read] = p;
  return (u.in * inp + u.cw * inp * 1.25 + u.cr * read + u.out * out) / 1e6;
}

/** A model id as people say it: claude-opus-5-5 → Opus 5.5. */
export function modelName(id: string): string {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(id);
  const old = /claude-(\d+)-(\d+)-([a-z]+)/.exec(id);
  const [family, major, minor] = m ? [m[1], m[2], m[3]] : old ? [old[3], old[1], old[2]] : [];
  if (!family) return id;
  return `${family[0].toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ""}`;
}

export function fmtCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  return usd < 10 ? `$${usd.toFixed(2)}` : `$${Math.round(usd)}`;
}
