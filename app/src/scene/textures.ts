// Canvas textures for cards, packs and slab labels (cached; drawn once per card).
import * as THREE from "three";
import { drawBack, drawCard, elementOf, TIER_COLORS, type CardFace } from "../lib/art";

const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, draw: (c: HTMLCanvasElement) => void) {
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  draw(c);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

export const faceTexture = (f: CardFace) => canvasTexture(`face|${f.name}|${f.tier}|${f.grade}|${f.art}|${f.value ?? ""}`, (c) => drawCard(c, f));
export const backTexture = () => canvasTexture("back", drawBack);

/** A sealed booster pack's print: the set name, a big element glyph, the spot number. */
export const packTexture = (spot: number, art: number) =>
  canvasTexture(`pack|${spot}|${art}`, (c) => {
    c.width = 512;
    c.height = 760;
    const ctx = c.getContext("2d")!;
    const el = elementOf(art);
    const g = ctx.createLinearGradient(0, 0, 512, 760);
    g.addColorStop(0, "#1b1325");
    g.addColorStop(0.5, el.b);
    g.addColorStop(1, "#08070b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 760);
    // crimp bands
    for (const y of [0, 712]) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, y, 512, 48);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      for (let x = 0; x < 512; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x + 6, y + 42);
        ctx.stroke();
      }
    }
    // rays
    ctx.save();
    ctx.translate(256, 380);
    for (let i = 0; i < 36; i++) {
      ctx.rotate((Math.PI * 2) / 36);
      ctx.fillStyle = i % 2 ? el.a + "22" : "transparent";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-30, -600);
      ctx.lineTo(30, -600);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "900 64px Unbounded, sans-serif";
    ctx.fillText("BREAK", 256, 160);
    ctx.fillText("ROOM", 256, 228);
    ctx.font = "600 22px 'JetBrains Mono', monospace";
    ctx.fillStyle = el.a;
    ctx.fillText("GENESIS · SEALED PACK", 256, 280);
    ctx.beginPath();
    ctx.arc(256, 450, 96, 0, Math.PI * 2);
    ctx.strokeStyle = el.a;
    ctx.lineWidth = 8;
    ctx.shadowColor = el.a;
    ctx.shadowBlur = 30;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "900 92px Unbounded, sans-serif";
    ctx.fillText(String(spot + 1), 256, 482);
    ctx.font = "600 20px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("SPOT", 256, 590);
  });

/** Grading label on top of a slab. */
export const slabLabelTexture = (f: CardFace) =>
  canvasTexture(`label|${f.name}|${f.grade}|${f.cert ?? ""}|${f.tier}`, (c) => {
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f4f1f7";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = TIER_COLORS[f.tier];
    ctx.fillRect(0, 0, 10, 128);
    ctx.fillStyle = "#16121b";
    ctx.font = "700 30px Unbounded, sans-serif";
    ctx.fillText(f.name.toUpperCase().slice(0, 18), 28, 50);
    ctx.font = "500 18px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#5c5566";
    ctx.fillText(`GENESIS · CERT ${String(f.cert ?? "").slice(0, 10)}`, 28, 92);
    ctx.fillStyle = "#16121b";
    ctx.font = "900 56px Unbounded, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText((f.grade / 10).toFixed(1), 492, 86);
  });
