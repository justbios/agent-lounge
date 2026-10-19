import { PROJECT_URL } from "@/lib/brand";
import { Ui, enPlural, tr } from "@/lib/i18n";
import { agentColor } from "@/lib/live/liveModel";
import { Summary } from "@/lib/live/recap";
import { plural } from "./format";

const W = 1080;
const PAD = 60;
/** a square café would push everything else off the card */
const SCENE_MAX_H = 760;
const HEAD = 240;
const STATS = 320;
const AGENT_ROW = 48;
const FOOT = 190;

function pixelFont(px: number, weight = 400): string {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-pixel").trim() || "monospace";
  return `${weight} ${px}px ${family}, monospace`;
}

export interface CardInput {
  day: Summary;
  streak: number;
  date: string;
  scene: HTMLCanvasElement | null;
  /** the language the card's own words are drawn in */
  ui: Ui;
}

/** A portrait PNG of the day for sharing: the café as it looks now, the day's numbers and the busiest agents. */
export async function drawDayCard(c: CardInput): Promise<Blob> {
  const t = (uk: string, en: string) => tr(c.ui, uk, en);
  await document.fonts?.ready;
  let sw = W - PAD * 2;
  let sh = c.scene ? Math.round((c.scene.height / c.scene.width) * sw) : 0;
  if (sh > SCENE_MAX_H) {
    sw = Math.round((sw * SCENE_MAX_H) / sh);
    sh = SCENE_MAX_H;
  }
  const agents = c.day.agents.slice(0, 3);
  const H =
    HEAD +
    (c.scene ? sh + 50 : 0) +
    STATS +
    (agents.length ? 50 + agents.length * AGENT_ROW : 0) +
    (c.day.tools_by.length ? 22 + 50 + 42 : 0) +
    FOOT;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#06070c";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -80, 40, W / 2, -80, 900);
  glow.addColorStop(0, "rgba(124,92,255,0.32)");
  glow.addColorStop(1, "rgba(124,92,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = pixelFont(28, 700);
  ctx.fillStyle = "#5ce1ff";
  ctx.shadowColor = "#5ce1ff";
  ctx.shadowBlur = 14;
  ctx.fillText("AGENT LOUNGE", PAD, 58);
  ctx.shadowBlur = 0;
  ctx.font = pixelFont(58, 700);
  ctx.fillStyle = "#f3f0ff";
  ctx.fillText(t("Мій день з Claude Code", "My day with Claude Code"), PAD, 100);
  ctx.font = pixelFont(30);
  ctx.fillStyle = "#99a2b4";
  ctx.fillText(c.date, PAD, 176);

  let y = HEAD;
  if (c.scene) {
    const x = Math.round((W - sw) / 2);
    ctx.fillStyle = "#1c1f2b";
    ctx.fillRect(x - 3, y - 3, sw + 6, sh + 6);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c.scene, x, y, sw, sh);
    y += sh + 50;
  }

  const { prompts, tools, dispatches, minutes, chats } = c.day;
  const stats: [string, number | string][] = [
    [t(plural(prompts, "питання", "питання", "питань"), enPlural(prompts, "question", "questions")), prompts],
    [
      t(plural(tools, "дія інструментом", "дії інструментами", "дій інструментами"), enPlural(tools, "tool action", "tool actions")),
      tools,
    ],
    [
      t(plural(dispatches, "доручення агентам", "доручення агентам", "доручень агентам"), enPlural(dispatches, "handoff to agents", "handoffs to agents")),
      dispatches,
    ],
    [t(plural(minutes, "хвилина роботи", "хвилини роботи", "хвилин роботи"), enPlural(minutes, "minute of work", "minutes of work")), minutes],
    [t(plural(chats, "чат", "чати", "чатів"), enPlural(chats, "chat", "chats")), chats],
    [t(plural(c.streak, "день поспіль", "дні поспіль", "днів поспіль"), enPlural(c.streak, "day in a row", "days in a row")), c.streak],
  ];
  const colW = (W - PAD * 2) / 3;
  stats.forEach(([label, value], i) => {
    const x = PAD + (i % 3) * colW;
    const sy = y + Math.floor(i / 3) * 150;
    ctx.font = pixelFont(72, 700);
    ctx.fillStyle = i === 5 ? "#ffd25a" : "#ff9a62";
    ctx.fillText(String(value), x, sy);
    ctx.font = pixelFont(26);
    ctx.fillStyle = "#99a2b4";
    ctx.fillText(label, x, sy + 84);
  });
  y += STATS;

  if (agents.length) {
    ctx.font = pixelFont(28, 700);
    ctx.fillStyle = "#e9ebf2";
    ctx.fillText(t("Найзайнятіші агенти", "Busiest agents"), PAD, y);
    y += 50;
    const max = c.day.agents[0][1];
    for (const [name, n] of agents) {
      const color = agentColor(name);
      ctx.fillStyle = color;
      ctx.fillRect(PAD, y + 6, 22, 22);
      ctx.font = pixelFont(28);
      ctx.fillStyle = "#e9ebf2";
      ctx.fillText(name, PAD + 38, y);
      const barX = PAD + 420;
      const barW = (W - PAD - barX - 70) * (n / max);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(barX, y + 8, W - PAD - barX - 70, 18);
      ctx.fillStyle = color;
      ctx.fillRect(barX, y + 8, Math.max(6, barW), 18);
      ctx.textAlign = "right";
      ctx.fillStyle = "#99a2b4";
      ctx.fillText(String(n), W - PAD, y);
      ctx.textAlign = "left";
      y += AGENT_ROW;
    }
  }

  if (c.day.tools_by.length) {
    y += 22;
    ctx.font = pixelFont(28, 700);
    ctx.fillStyle = "#e9ebf2";
    ctx.fillText(t("Інструменти", "Tools"), PAD, y);
    y += 50;
    ctx.font = pixelFont(26);
    let x = PAD;
    for (const [name, n] of c.day.tools_by.slice(0, 6)) {
      const label = `${name} ${n}`;
      const w = ctx.measureText(label).width + 28;
      if (x + w > W - PAD) break;
      ctx.fillStyle = "rgba(124,92,255,0.16)";
      ctx.fillRect(x, y - 6, w, 42);
      ctx.fillStyle = "#d9ccff";
      ctx.fillText(label, x + 14, y + 2);
      x += w + 12;
    }
  }

  ctx.textAlign = "left";
  ctx.font = pixelFont(30);
  ctx.fillStyle = "#e9ebf2";
  ctx.fillText(PROJECT_URL, PAD, H - 116);
  ctx.font = pixelFont(24);
  ctx.fillStyle = "#5d6577";
  ctx.fillText(
    t("зібрано з хуків Claude Code, без жодного токена", "built from Claude Code hooks, not a single token spent"),
    PAD,
    H - 70,
  );

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
}
