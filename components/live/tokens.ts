import type { Ui } from "@/lib/i18n";

const compact = {
  uk: new Intl.NumberFormat("uk-UA", { notation: "compact", maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }),
};

/** 950 → «950», 12 340 → «12,3 тис.» or "12.3K", 1 200 000 → «1,2 млн» or "1.2M". */
export function fmtTokens(n: number, ui: Ui = "uk"): string {
  return compact[ui].format(Math.round(n));
}
