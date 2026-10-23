import type { Two } from "@/lib/i18n";

/** One part of a game and the licence it is under, shown as the licence asks. */
export interface Licence {
  what: Two;
  name: string;
  url: string;
}

/**
 * A game that lives on its authors' own site and opens in a window in the games. Nothing of it is copied into the
 * café: the authors serve it, so its code, art and sound stay theirs and under their licences.
 */
export interface WebGame {
  id: string;
  title: string;
  icon: string;
  /** the page the window opens; its origin is also in frame-src in next.config.ts */
  url: string;
  about: Two;
  players: Two;
  authors: Two;
  licences: Licence[];
  source: string;
  /** what the authors ask to be said about their name and logo */
  mark?: Two;
}

const AGPL3 = "https://www.gnu.org/licenses/agpl-3.0.html";
const CC_BY_SA4 = "https://creativecommons.org/licenses/by-sa/4.0/";

/** Only games that are free to play and open, made by people who put them on the web themselves. */
export const WEB_GAMES: WebGame[] = [
  {
    id: "ancientBeast",
    title: "Ancient Beast",
    icon: "🐺",
    url: "https://play.ancientbeast.com/",
    about: {
      uk: "Покрокові бої істот на шестикутниках, як у «Героях»: збираєш армію, у кожної істоти свої вміння.",
      en: "Turn-based creature battles on hexes, as in Heroes: build an army, each creature with its own abilities.",
    },
    players: { uk: "1×1 чи 2×2, за одним екраном або онлайн", en: "1v1 or 2v2, on one screen or online" },
    authors: { uk: "Freezing Moon і спільнота", en: "Freezing Moon and contributors" },
    licences: [
      { what: { uk: "код", en: "code" }, name: "AGPL-3.0", url: AGPL3 },
      { what: { uk: "графіка й звук", en: "art and audio" }, name: "CC BY-SA 4.0", url: CC_BY_SA4 },
    ],
    source: "https://github.com/FreezingMoon/AncientBeast",
    mark: {
      uk: "Назва й логотип Ancient Beast — торгові марки Freezing Moon.",
      en: "The Ancient Beast name and logo are trademarks of Freezing Moon.",
    },
  },
];

/** The origins the games' windows open, for the café's Content-Security-Policy. */
export const WEB_GAME_ORIGINS = [...new Set(WEB_GAMES.map((g) => new URL(g.url).origin))];
