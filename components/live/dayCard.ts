import { agentColor } from "@/lib/live/liveModel";
import { Summary } from "@/lib/live/recap";

const W = 1080;
const H = 1350;
const PAD = 60;

function pixelFont(px: number, weight = 400): string {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-pixel").trim() || "monospace";
  return `${weight} ${px}px ${family}, monospace`;
}

export interface CardInput {
  day: Summary;
  streak: number;
  date: string;
  scene: HTMLCanvasElement | null;
  site: string;
}

/** A portrait PNG of the day for sharing: the café as it looks now, the day's numbers and the busiest agents. */
export async function drawDayCard(c: CardInput): Promise<Blob> {
  await document.fonts?.ready;
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
  ctx.fillText("RELAY", PAD, 58);
  ctx.shadowBlur = 0;
  ctx.font = pixelFont(58, 700);
  ctx.fillStyle = "#f3f0ff";
  ctx.fillText("Мій день з Claude Code", PAD, 100);
  ctx.font = pixelFont(30);
  ctx.fillStyle = "#99a2b4";
  ctx.fillText(c.date, PAD, 176);

  let y = 240;
  if (c.scene) {
    const w = W - PAD * 2;
    const h = Math.round((c.scene.height / c.scene.width) * w);
    ctx.fillStyle = "#1c1f2b";
    ctx.fillRect(PAD - 3, y - 3, w + 6, h + 6);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c.scene, PAD, y, w, h);
    y += h + 50;
  }

  const stats: [string, number | string][] = [
    ["питань", c.day.prompts],
    ["дій інструментами", c.day.tools],
    ["доручень агентам", c.day.dispatches],
    ["хвилин роботи", c.day.minutes],
    ["чатів", c.day.chats],
    ["днів поспіль", c.streak],
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
  y += 320;

  if (c.day.agents.length) {
    ctx.font = pixelFont(28, 700);
    ctx.fillStyle = "#e9ebf2";
    ctx.fillText("Найзайнятіші агенти", PAD, y);
    y += 50;
    const max = c.day.agents[0][1];
    for (const [name, n] of c.day.agents.slice(0, 3)) {
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
      y += 48;
    }
  }

  if (c.day.tools_by.length) {
    y += 22;
    ctx.font = pixelFont(28, 700);
    ctx.fillStyle = "#e9ebf2";
    ctx.fillText("Інструменти", PAD, y);
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

  ctx.font = pixelFont(24);
  ctx.fillStyle = "#5d6577";
  ctx.textAlign = "left";
  ctx.fillText("зібрано з хуків Claude Code, без жодного токена", PAD, H - 70);
  ctx.textAlign = "right";
  ctx.fillStyle = "#99a2b4";
  ctx.fillText(c.site, W - PAD, H - 70);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
}
