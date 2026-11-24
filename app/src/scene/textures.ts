// Canvas textures for cards, packs and slab labels (cached; drawn once per card).
import * as THREE from "three";
import { drawBack, drawCard, elementOf, glyph, TIER_COLORS, type CardFace } from "../lib/art";

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

/**
 * A sealed booster pack's print, full bleed like a real wrapper: the element's colours with a holo
 * sheen, the element's creature art large in the middle, the set logo, "booster pack" band and the
 * spot number. Top and bottom 6% are the crimped seals (pressed ridges).
 */
export const packTexture = (spot: number, art: number) =>
  canvasTexture(`pack3|${spot}|${art}`, (c) => {
    c.width = 1024;
    c.height = 1520;
    const x = c.getContext("2d")!;
    x.scale(2, 2);
    const W = 512, H = 760, CR = 46;
    const el = elementOf(art);
    let seed = 1 + spot * 97 + art * 13;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // base: deep element colour, lit from the art
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, el.b);
    g.addColorStop(0.45, "#120d18");
    g.addColorStop(1, el.b);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // a wash of the element colour so the wrapper reads as printed colour, not grey, under light
    const wash = x.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, el.a + "38");
    wash.addColorStop(0.5, el.a + "1c");
    wash.addColorStop(1, el.a + "40");
    x.fillStyle = wash;
    x.fillRect(0, 0, W, H);
    const glow = x.createRadialGradient(256, 380, 10, 256, 380, 330);
    glow.addColorStop(0, el.a + "88");
    glow.addColorStop(0.45, el.a + "22");
    glow.addColorStop(1, "transparent");
    x.fillStyle = glow;
    x.fillRect(0, 0, W, H);
    // burst
    x.save();
    x.translate(256, 380);
    for (let i = 0; i < 48; i++) {
      x.rotate((Math.PI * 2) / 48);
      x.fillStyle = i % 2 ? el.a + "16" : "transparent";
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(-24, -620);
      x.lineTo(24, -620);
      x.fill();
    }
    x.restore();
    // holo bands
    x.save();
    x.globalCompositeOperation = "screen";
    const cols = ["#7cf7e4", "#b58cff", "#ffd27a", "#ff5fa8"];
    for (let i = 0; i < 5; i++) {
      const hg = x.createLinearGradient(0, 0, W, 0);
      hg.addColorStop(0, "transparent");
      hg.addColorStop(0.5, cols[(i + art) % 4] + "26");
      hg.addColorStop(1, "transparent");
      x.fillStyle = hg;
      x.save();
      x.translate(-100 + i * 140, 0);
      x.rotate(0.5);
      x.fillRect(0, -200, 46, 1200);
      x.restore();
    }
    x.restore();
    // art
    x.save();
    x.shadowColor = el.a;
    x.shadowBlur = 40;
    glyph(x, el.glyph, 256, 392, 132, el.a, R);
    x.restore();
    // logo band
    const lg = x.createLinearGradient(0, CR, 0, 220);
    lg.addColorStop(0, "rgba(0,0,0,0.55)");
    lg.addColorStop(1, "transparent");
    x.fillStyle = lg;
    x.fillRect(0, CR, W, 180);
    x.textAlign = "center";
    x.fillStyle = "#fff";
    x.shadowColor = "rgba(0,0,0,0.6)";
    x.shadowBlur = 12;
    x.font = "900 58px Unbounded, sans-serif";
    x.fillText("BREAKROOM", 256, 136);
    x.shadowBlur = 0;
    x.font = "600 17px 'JetBrains Mono', monospace";
    x.fillStyle = el.a;
    x.fillText("— GENESIS · SERIES 1 —", 256, 170);
    // bottom band
    const bg = x.createLinearGradient(0, 560, 0, H - CR);
    bg.addColorStop(0, "transparent");
    bg.addColorStop(0.5, "rgba(0,0,0,0.55)");
    bg.addColorStop(1, "rgba(0,0,0,0.75)");
    x.fillStyle = bg;
    x.fillRect(0, 540, W, H - CR - 540);
    x.textAlign = "left";
    x.fillStyle = "#fff";
    x.font = "800 30px Unbounded, sans-serif";
    x.fillText("BOOSTER", 40, 638);
    x.fillText("PACK", 40, 674);
    x.font = "500 15px 'JetBrains Mono', monospace";
    x.fillStyle = "rgba(255,255,255,0.65)";
    x.fillText("SEALED · VRF SHUFFLED", 40, 700);
    // spot badge
    x.beginPath();
    x.arc(436, 650, 40, 0, Math.PI * 2);
    x.fillStyle = "rgba(0,0,0,0.5)";
    x.fill();
    x.lineWidth = 4;
    x.strokeStyle = el.a;
    x.stroke();
    x.textAlign = "center";
    x.fillStyle = "#fff";
    x.font = "900 34px Unbounded, sans-serif";
    x.fillText(String(spot + 1), 436, 663);
    x.font = "600 10px 'JetBrains Mono', monospace";
    x.fillStyle = el.a;
    x.fillText("SPOT", 436, 714);
    // crimped seals: pressed vertical ridges, a shade lighter
    for (const y of [0, H - CR]) {
      const cg = x.createLinearGradient(0, y, 0, y + CR);
      cg.addColorStop(0, "rgba(255,255,255,0.10)");
      cg.addColorStop(0.5, "rgba(255,255,255,0.04)");
      cg.addColorStop(1, "rgba(255,255,255,0.10)");
      x.fillStyle = cg;
      x.fillRect(0, y, W, CR);
      for (let i = 0; i < W; i += 6) {
        x.fillStyle = "rgba(255,255,255,0.10)";
        x.fillRect(i, y + 4, 2, CR - 8);
        x.fillStyle = "rgba(0,0,0,0.22)";
        x.fillRect(i + 3, y + 4, 2, CR - 8);
      }
      x.fillStyle = "rgba(0,0,0,0.35)";
      x.fillRect(0, y === 0 ? CR - 2 : y, W, 2);
    }
  });

/** Normal map for the foil: soft crinkles all over and pressed ridges in the crimped seals. */
export const foilNormalTexture = () =>
  canvasTexture("foilN", (c) => {
    const W = 256, H = 380, CR = 23;
    c.width = W;
    c.height = H;
    const x = c.getContext("2d")!;
    const img = x.createImageData(W, H);
    const waves = Array.from({ length: 9 }, (_, i) => ({ a: (i * 2.399) % 6.283, f: 0.02 + (i % 4) * 0.013, p: i * 1.7, k: 0.18 + (i % 3) * 0.08 }));
    for (let py = 0; py < H; py++)
      for (let px = 0; px < W; px++) {
        let nx = 0, ny = 0;
        for (const w of waves) {
          const d = px * Math.cos(w.a) + py * Math.sin(w.a);
          const s = Math.cos(d * w.f + w.p) * w.k;
          nx += s * Math.cos(w.a);
          ny += s * Math.sin(w.a);
        }
        if (py < CR || py > H - CR) {
          nx = Math.sin(px * 2.1) * 0.9; // ridges
          ny *= 0.2;
        }
        const i = (py * W + px) * 4;
        img.data[i] = 128 + Math.max(-127, Math.min(127, nx * 70));
        img.data[i + 1] = 128 + Math.max(-127, Math.min(127, ny * 70));
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    x.putImageData(img, 0, 0);
  });

/** Alpha for the serrated top and bottom edges (pinking-shear teeth). */
export const serrationTexture = () =>
  canvasTexture("serr", (c) => {
    c.width = 512;
    c.height = 760;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 512, 760);
    x.fillStyle = "#000";
    for (const [y0, dir] of [[0, 1], [760, -1]] as const) {
      x.beginPath();
      x.moveTo(0, y0);
      for (let i = 0; i <= 512; i += 10) x.lineTo(i + 5, y0 + dir * 7), x.lineTo(i + 10, y0);
      x.closePath();
      x.fill();
    }
  });

/** Grading label on top of a slab. */
export const slabLabelTexture = (f: CardFace) =>
  canvasTexture(`label|${f.name}|${f.grade}|${f.cert ?? ""}|${f.tier}`, (c) => {
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.scale(2, 2);
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

/** The crimped seal strip on top of a pack: dark foil with pressed ridges and a thin element-coloured tear line. */
export const crimpTexture = (art: number) =>
  canvasTexture(`crimp|${art}`, (c) => {
    c.width = 512;
    c.height = 96;
    const x = c.getContext("2d")!;
    const el = elementOf(art);
    const g = x.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, "#241a30");
    g.addColorStop(1, "#140f1b");
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 96);
    for (let i = 0; i < 512; i += 8) {
      x.fillStyle = "rgba(255,255,255,0.07)";
      x.fillRect(i, 0, 3, 80);
      x.fillStyle = "rgba(0,0,0,0.25)";
      x.fillRect(i + 4, 0, 2, 80);
    }
    // dotted tear line
    x.fillStyle = el.a;
    for (let i = 6; i < 512; i += 14) x.fillRect(i, 86, 7, 3);
  });
