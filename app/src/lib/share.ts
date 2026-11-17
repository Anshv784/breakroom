// "I pulled …" share card: a 1200×630 image (downloads) plus a ready X post.
import type { CardInfo } from "../chain/layout";
import { drawCard, faceOf, TIER_COLORS, TIER_NAMES } from "./art";

export function shareImage(card: CardInfo, breakTitle: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const x = c.getContext("2d")!;
  const tc = TIER_COLORS[card.tier];
  const g = x.createLinearGradient(0, 0, 1200, 630);
  g.addColorStop(0, "#120d18");
  g.addColorStop(1, "#060509");
  x.fillStyle = g;
  x.fillRect(0, 0, 1200, 630);
  const glow = x.createRadialGradient(330, 315, 20, 330, 315, 380);
  glow.addColorStop(0, tc + "66");
  glow.addColorStop(1, "transparent");
  x.fillStyle = glow;
  x.fillRect(0, 0, 700, 630);
  const face = drawCard(document.createElement("canvas"), faceOf(card));
  x.save();
  x.translate(330, 315);
  x.rotate(-0.06);
  x.shadowColor = tc;
  x.shadowBlur = 60;
  x.drawImage(face, -190, -266, 380, 532);
  x.restore();
  x.fillStyle = tc;
  x.font = "600 26px 'JetBrains Mono', monospace";
  x.fillText(`${TIER_NAMES[card.tier]} PULL`, 640, 190);
  x.fillStyle = "#f3eff6";
  x.font = "900 64px Unbounded, sans-serif";
  x.fillText(card.name.toUpperCase().slice(0, 16), 640, 270);
  x.font = "700 52px 'JetBrains Mono', monospace";
  x.fillText(`$${(Number(card.value) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, 640, 345);
  x.fillStyle = "#b9b1c2";
  x.font = "500 26px 'Inter Tight', sans-serif";
  x.fillText(`grade ${(card.grade / 10).toFixed(1)} · ${breakTitle}`.slice(0, 48), 640, 395);
  x.fillStyle = "#7d7586";
  x.font = "500 22px 'Inter Tight', sans-serif";
  x.fillText("Shuffled by MagicBlock VRF, sealed in a TEE. Verified on Solana.", 640, 520);
  x.fillStyle = "#f3eff6";
  x.font = "900 30px Unbounded, sans-serif";
  x.fillText("BREAKROOM", 640, 570);
  return c;
}

export function shareCard(card: CardInfo, breakTitle: string, breakId: bigint) {
  const c = shareImage(card, breakTitle);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `breakroom-${card.name.replace(/\s+/g, "-").toLowerCase()}.png`;
  a.click();
  const url = `${location.origin}${location.pathname}#/verify/${breakId}`;
  const text = `Just pulled ${card.name} (${TIER_NAMES[card.tier].toLowerCase()}, $${(Number(card.value) / 1e6).toFixed(0)}) in a @BREAKROOM break. Shuffle sealed in a TEE with @magicblock VRF — verify it yourself:`;
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
}
