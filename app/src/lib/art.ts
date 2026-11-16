// Procedural card art for the BREAKROOM Genesis set. Every card is drawn from its on-chain
// appraisal (name, tier, grade, art seed), so the image is the same everywhere: the 3D table,
// the vault, the verify page. Original artwork: no third-party IP.
import type { CardInfo } from "../chain/layout";

export const CARD_W = 512;
export const CARD_H = 716;

export const ELEMENTS = [
  { key: "ember", a: "#ff7a3d", b: "#3b0f0a", glyph: "flame" },
  { key: "tidal", a: "#3ad7ff", b: "#06223a", glyph: "wave" },
  { key: "stone", a: "#c9b48a", b: "#2a2318", glyph: "crystal" },
  { key: "void", a: "#b58cff", b: "#12081f", glyph: "eye" },
  { key: "storm", a: "#9fe3ff", b: "#0d1630", glyph: "bolt" },
  { key: "bloom", a: "#6dffa8", b: "#0a2414", glyph: "petal" },
  { key: "frost", a: "#e2f6ff", b: "#132535", glyph: "star" },
  { key: "solar", a: "#ffd27a", b: "#2d1d05", glyph: "sun" },
] as const;

export const TIER_COLORS = ["#a7a1b0", "#5fb8ff", "#c58bff", "#ffb547", "#ff5fa8"];
export const TIER_NAMES = ["BASE", "RARE", "EPIC", "LEGENDARY", "CHASE"];

export function elementOf(art: number) {
  return ELEMENTS[art % ELEMENTS.length];
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function poly(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function glyph(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, r: number, color: string, R: () => number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  switch (kind) {
    case "flame": {
      for (let k = 0; k < 3; k++) {
        const s = 1 - k * 0.28;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * s);
        ctx.bezierCurveTo(cx + r * 0.7 * s, cy - r * 0.2 * s, cx + r * 0.55 * s, cy + r * 0.75 * s, cx, cy + r * 0.8 * s);
        ctx.bezierCurveTo(cx - r * 0.55 * s, cy + r * 0.75 * s, cx - r * 0.7 * s, cy - r * 0.2 * s, cx, cy - r * s);
        k === 2 ? ctx.fill() : ctx.stroke();
      }
      break;
    }
    case "wave": {
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        for (let x = -r; x <= r; x += 4) {
          const y = Math.sin((x / r) * Math.PI * 2 + k) * r * 0.12 + k * r * 0.28;
          x === -r ? ctx.moveTo(cx + x, cy + y) : ctx.lineTo(cx + x, cy + y);
        }
        ctx.stroke();
      }
      break;
    }
    case "crystal": {
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.38;
        const len = r * (0.6 + R() * 0.45);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a + 0.12) * r * 0.15, cy + r * 0.5);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len + r * 0.3);
        ctx.lineTo(cx + Math.cos(a - 0.12) * r * 0.15 + 18, cy + r * 0.5);
        ctx.closePath();
        ctx.stroke();
      }
      break;
    }
    case "eye": {
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.quadraticCurveTo(cx, cy - r * 0.9, cx + r, cy);
      ctx.quadraticCurveTo(cx, cy + r * 0.9, cx - r, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "bolt": {
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.15, cy - r);
      ctx.lineTo(cx - r * 0.35, cy + r * 0.1);
      ctx.lineTo(cx + r * 0.05, cy + r * 0.1);
      ctx.lineTo(cx - r * 0.15, cy + r);
      ctx.lineTo(cx + r * 0.4, cy - r * 0.15);
      ctx.lineTo(cx, cy - r * 0.15);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "petal": {
      for (let k = 0; k < 6; k++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((k / 6) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.5, r * 0.2, r * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "star": {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
        for (const t of [0.45, 0.7]) {
          const px = cx + Math.cos(a) * r * t;
          const py = cy + Math.sin(a) * r * t;
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(a + 0.9) * r * 0.16, py + Math.sin(a + 0.9) * r * 0.16);
          ctx.lineTo(px, py);
          ctx.lineTo(px + Math.cos(a - 0.9) * r * 0.16, py + Math.sin(a - 0.9) * r * 0.16);
          ctx.stroke();
        }
      }
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58);
        ctx.lineTo(cx + Math.cos(a) * r * (k % 2 ? 0.85 : 1), cy + Math.sin(a) * r * (k % 2 ? 0.85 : 1));
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export interface CardFace {
  name: string;
  set: string;
  tier: number;
  grade: number;
  art: number;
  value?: bigint;
  cert?: bigint;
}

export const faceOf = (c: CardInfo): CardFace => ({ name: c.name, set: c.set, tier: c.tier, grade: c.grade, art: c.art, value: c.value, cert: c.cert });

/** Draw a full card face (CARD_W x CARD_H). */
export function drawCard(canvas: HTMLCanvasElement, c: CardFace) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const el = elementOf(c.art);
  const tc = TIER_COLORS[c.tier] ?? TIER_COLORS[0];
  const R = rng(c.art * 2654435761 + c.tier * 97);
  const W = CARD_W;
  const H = CARD_H;
  // body
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, el.b);
  g.addColorStop(1, "#050407");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // frame
  const pad = 22;
  ctx.lineWidth = c.tier >= 3 ? 10 : 6;
  const fg = ctx.createLinearGradient(0, 0, W, H);
  if (c.tier >= 3) {
    fg.addColorStop(0, "#7cf7e4");
    fg.addColorStop(0.5, tc);
    fg.addColorStop(1, "#ffd27a");
  } else {
    fg.addColorStop(0, tc);
    fg.addColorStop(1, "#ffffff22");
  }
  ctx.strokeStyle = fg;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 26);
  ctx.stroke();
  // art window
  const ax = 46;
  const ay = 112;
  const aw = W - 92;
  const ah = 360;
  ctx.save();
  roundRect(ctx, ax, ay, aw, ah, 18);
  ctx.clip();
  const ag = ctx.createRadialGradient(W / 2, ay + ah * 0.45, 10, W / 2, ay + ah * 0.5, ah * 0.75);
  ag.addColorStop(0, el.a + "66");
  ag.addColorStop(0.55, el.b);
  ag.addColorStop(1, "#000");
  ctx.fillStyle = ag;
  ctx.fillRect(ax, ay, aw, ah);
  // starfield + geometry
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + R() * 0.5})`;
    ctx.beginPath();
    ctx.arc(ax + R() * aw, ay + R() * ah, R() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = el.a + "33";
  ctx.lineWidth = 2;
  const rings = 3 + Math.floor(R() * 3);
  for (let i = 0; i < rings; i++) {
    poly(ctx, W / 2, ay + ah / 2, 60 + i * 34, 3 + Math.floor(R() * 5), R() * Math.PI);
    ctx.stroke();
  }
  glyph(ctx, el.glyph, W / 2, ay + ah / 2, 110, el.a, R);
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  roundRect(ctx, ax, ay, aw, ah, 18);
  ctx.stroke();
  // header
  ctx.fillStyle = "#fff";
  ctx.font = "700 34px Unbounded, sans-serif";
  ctx.textBaseline = "middle";
  fitText(ctx, c.name.toUpperCase(), 48, 72, W - 150);
  // tier gem
  ctx.save();
  ctx.translate(W - 74, 72);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = tc;
  ctx.shadowColor = tc;
  ctx.shadowBlur = 18;
  ctx.fillRect(-14, -14, 28, 28);
  ctx.restore();
  // footer
  ctx.fillStyle = tc;
  ctx.font = "600 20px 'JetBrains Mono', monospace";
  ctx.fillText(TIER_NAMES[c.tier] ?? "", 48, 512);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "500 18px 'JetBrains Mono', monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${(c.set || "GENESIS").toUpperCase()} · ${el.key.toUpperCase()}`, W - 48, 512);
  ctx.textAlign = "left";
  // flavor lines
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 3; i++) ctx.fillRect(48, 552 + i * 22, (W - 96) * (0.55 + R() * 0.45), 8);
  // grade band
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, 46, 628, W - 92, 50, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "700 22px 'JetBrains Mono', monospace";
  ctx.fillText(`GRADE ${(c.grade / 10).toFixed(1)}`, 64, 653);
  if (c.value !== undefined) {
    ctx.textAlign = "right";
    ctx.fillStyle = tc;
    ctx.fillText(`$${(Number(c.value) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, W - 64, 653);
    ctx.textAlign = "left";
  }
  return canvas;
}

/** The back of every card. */
export function drawBack(canvas: HTMLCanvasElement) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  g.addColorStop(0, "#1a1424");
  g.addColorStop(1, "#07060a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = "#b58cff55";
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    poly(ctx, CARD_W / 2, CARD_H / 2, 40 + i * 30, 6, i * 0.12);
    ctx.stroke();
  }
  ctx.fillStyle = "#f3eff6";
  ctx.font = "900 46px Unbounded, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("BREAK", CARD_W / 2, CARD_H / 2 - 26);
  ctx.fillText("ROOM", CARD_W / 2, CARD_H / 2 + 28);
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, max: number) {
  let size = 34;
  while (size > 16 && ctx.measureText(t).width > max) {
    size -= 2;
    ctx.font = `700 ${size}px Unbounded, sans-serif`;
  }
  ctx.fillText(t, x, y);
}

const urlCache = new Map<string, string>();
/** A data URL of the card face for <img> use (cached). */
export function cardImage(c: CardFace): string {
  const key = `${c.name}|${c.tier}|${c.grade}|${c.art}|${c.value ?? ""}`;
  let u = urlCache.get(key);
  if (!u) {
    u = drawCard(document.createElement("canvas"), c).toDataURL("image/webp", 0.88);
    urlCache.set(key, u);
  }
  return u;
}
