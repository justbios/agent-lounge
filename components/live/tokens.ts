const compact = new Intl.NumberFormat("uk-UA", { notation: "compact", maximumFractionDigits: 1 });

/** 950 → «950», 12 340 → «12,3 тис.», 1 200 000 → «1,2 млн». */
export function fmtTokens(n: number): string {
  return compact.format(Math.round(n));
}
