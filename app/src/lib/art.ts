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

export function glyph(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, r: number, color: string, R: () => number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
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

const FLAVOR = [
  "Born where the furnace sleeps, it wakes for anyone who pulls it.",
  "The tide keeps every promise it was never asked to make.",
  "Patient as bedrock. Older than the first box ever sealed.",
  "Nobody saw it in the deck. That was the point.",
  "It arrives a heartbeat before the thunder, and leaves after.",
  "Whatever you plant here grows back stranger.",
  "Cold enough to keep a secret for a thousand years.",
  "It only shines for the one who opened the pack.",
];

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = "";
  let yy = y;
  for (const w of text.split(" ")) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
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

const ABILITY: [string, string][] = [
  ["Kindle", "When this card is revealed, every other Ember card in its spot gains +1 power."],
  ["Undertow", "Once per break, this card's spot may swap one unopened card with the tide."],
  ["Bedrock", "This card can't lose power. Older than the box it came in."],
  ["Unseen", "Nobody can look at this card until it is pulled. Not even the host."],
  ["Static Rush", "Revealed first in its pack? Double its power for the rest of the break."],
  ["Overgrowth", "Grows +1 power for every card that came out before it."],
  ["Permafrost", "Locks one rival spot's market for a turn. Cold, but fair."],
  ["Zenith", "If this is the chase, the whole room sees the sun come up."],
];
const TIER_METAL: [string, string, string][] = [
  ["#c9ccd4", "#8d919c", "#eef0f4"], // base: silver
  ["#7fb7e6", "#3d6f9e", "#cfe6fb"], // rare: blue steel
  ["#b996f0", "#6a46a8", "#e6d8ff"], // epic: violet
  ["#f1cf7a", "#a87a22", "#fff1c4"], // legendary: gold
  ["#ff9ad1", "#7cf7e4", "#ffd27a"], // chase: foil
];
const RARITY_MARK = ["●", "◆", "◆◆", "★", "★★"];

/** Painted backdrop for each element, inside the art window. */
function scene(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, w: number, h: number, a: string, b: string, R: () => number) {
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  const skies: Record<string, [string, string, string]> = {
    ember: ["#2a0b06", "#7a2310", "#f08a3c"],
    tidal: ["#031a2c", "#0d4f78", "#59c6e6"],
    stone: ["#1c1812", "#4a3f2c", "#bfa979"],
    void: ["#07030f", "#26104a", "#7b4bd1"],
    storm: ["#070c1c", "#1d2f5e", "#7fa6e0"],
    bloom: ["#04160c", "#13512c", "#7fe0a0"],
    frost: ["#0a1622", "#2f5672", "#d6eefa"],
    solar: ["#2a1803", "#8a5410", "#ffd98a"],
  };
  const [s0, s1, s2] = skies[key] ?? ["#111", "#333", "#777"];
  sky.addColorStop(0, s0);
  sky.addColorStop(0.55, s1);
  sky.addColorStop(1, s2);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  // glow behind the subject
  const halo = ctx.createRadialGradient(x + w / 2, y + h * 0.46, 4, x + w / 2, y + h * 0.46, h * 0.6);
  halo.addColorStop(0, a + "cc");
  halo.addColorStop(0.35, a + "33");
  halo.addColorStop(1, "transparent");
  ctx.fillStyle = halo;
  ctx.fillRect(x, y, w, h);
  // distant layers (two ridgelines), shaped per element
  const ridge = (base: number, amp: number, col: string, jag: number) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    for (let i = 0; i <= 40; i++) {
      const px = x + (i / 40) * w;
      const n = Math.sin(i * 0.7 + R() * 0.6) * 0.5 + Math.sin(i * 1.9) * 0.3 + (R() - 0.5) * jag;
      ctx.lineTo(px, y + h * base - n * amp);
    }
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  };
  const dark = "rgba(0,0,0,0.55)";
  const darker = "rgba(0,0,0,0.78)";
  if (key === "tidal") {
    for (let k = 0; k < 7; k++) {
      ctx.strokeStyle = `rgba(200,240,255,${0.08 + k * 0.03})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= w; i += 6) ctx.lineTo(x + i, y + h * (0.62 + k * 0.05) + Math.sin(i / 22 + k) * 4);
      ctx.stroke();
    }
    ridge(0.86, 10, darker, 0.2);
  } else if (key === "void") {
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(255,255,255,${R() * 0.7})`;
      ctx.fillRect(x + R() * w, y + R() * h, R() * 1.6, R() * 1.6);
    }
    ctx.strokeStyle = a + "55";
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.46, 70 + k * 34, 22 + k * 10, -0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (key === "storm") {
    ridge(0.8, 26, dark, 0.4);
    ctx.strokeStyle = "rgba(220,235,255,0.55)";
    ctx.lineWidth = 2;
    for (const bx of [0.18, 0.82]) {
      let px = x + w * bx, py = y;
      ctx.beginPath();
      ctx.moveTo(px, py);
      while (py < y + h * 0.7) {
        px += (R() - 0.5) * 24;
        py += 18 + R() * 16;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ridge(0.9, 14, darker, 0.3);
  } else if (key === "bloom") {
    ridge(0.78, 30, dark, 0.2);
    for (let i = 0; i < 18; i++) {
      const tx = x + R() * w, th = 60 + R() * 90;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.moveTo(tx - 10, y + h);
      ctx.lineTo(tx, y + h - th);
      ctx.lineTo(tx + 10, y + h);
      ctx.fill();
    }
    ridge(0.93, 8, darker, 0.2);
  } else if (key === "frost" || key === "stone") {
    ridge(0.66, 60, dark, 1.4);
    ridge(0.84, 34, darker, 1.1);
  } else if (key === "ember") {
    ridge(0.74, 50, dark, 0.9);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,${150 + R() * 80},60,${R() * 0.8})`;
      ctx.beginPath();
      ctx.arc(x + R() * w, y + R() * h * 0.8, R() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ridge(0.9, 16, darker, 0.5);
  } else {
    // solar: dunes + rays
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.translate(x + w / 2, y + h * 0.46);
    for (let i = 0; i < 18; i++) {
      ctx.rotate(Math.PI / 9);
      ctx.fillStyle = "#fff3d0";
      ctx.fillRect(-3, 0, 6, h);
    }
    ctx.restore();
    ridge(0.8, 18, dark, 0.15);
    ridge(0.92, 10, darker, 0.1);
  }
  // atmosphere: soft haze at the bottom, vignette
  const haze = ctx.createLinearGradient(0, y + h * 0.6, 0, y + h);
  haze.addColorStop(0, "transparent");
  haze.addColorStop(1, b + "aa");
  ctx.fillStyle = haze;
  ctx.fillRect(x, y, w, h);
  const vig = ctx.createRadialGradient(x + w / 2, y + h / 2, h * 0.3, x + w / 2, y + h / 2, h * 0.85);
  vig.addColorStop(0, "transparent");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(x, y, w, h);
}

/** Draw a full card face (CARD_W x CARD_H), laid out like a real trading card. */
export function drawCard(canvas: HTMLCanvasElement, c: CardFace) {
  canvas.width = CARD_W * 2;
  canvas.height = CARD_H * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  const el = elementOf(c.art);
  const W = CARD_W;
  const H = CARD_H;
  const R = rng(c.art * 2654435761 + c.tier * 97 + c.name.length * 13);
  const [m0, m1, m2] = TIER_METAL[c.tier] ?? TIER_METAL[0];
  // 1. outer border: brushed metal, with a rainbow foil for the chase tier
  const border = ctx.createLinearGradient(0, 0, W, H);
  if (c.tier >= 4) {
    ["#ff9ad1", "#ffd27a", "#9ff5c8", "#7cf7e4", "#b58cff", "#ff9ad1"].forEach((col, i, arr) => border.addColorStop(i / (arr.length - 1), col));
  } else {
    border.addColorStop(0, m2);
    border.addColorStop(0.35, m0);
    border.addColorStop(0.65, m1);
    border.addColorStop(1, m0);
  }
  ctx.fillStyle = border;
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.fill();
  // brushed lines
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.clip();
  for (let i = 0; i < H; i += 3) {
    ctx.fillStyle = `rgba(255,255,255,${0.025 + R() * 0.04})`;
    ctx.fillRect(0, i, W, 1);
  }
  ctx.restore();
  // 2. card body inside the border: element-tinted with a fine linen texture
  const bx = 18, by = 18, bw = W - 36, bh = H - 36;
  const body = ctx.createLinearGradient(0, by, 0, by + bh);
  body.addColorStop(0, el.a);
  body.addColorStop(0.5, el.b);
  body.addColorStop(1, el.b);
  ctx.fillStyle = body;
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.fill();
  ctx.save();
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(bx, by, bw, bh);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(255,255,255,${R() * 0.05})`;
    ctx.fillRect(bx + R() * bw, by + R() * bh, 1, 1);
  }
  ctx.restore();
  // 3. name bar
  const nx = 30, ny = 30, nw = W - 60, nh = 52;
  const bar = ctx.createLinearGradient(0, ny, 0, ny + nh);
  bar.addColorStop(0, "rgba(255,255,255,0.92)");
  bar.addColorStop(1, "rgba(225,222,232,0.92)");
  ctx.fillStyle = bar;
  roundRect(ctx, nx, ny, nw, nh, 10);
  ctx.fill();
  ctx.strokeStyle = m1;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#16121b";
  ctx.textBaseline = "middle";
  ctx.font = "800 26px Unbounded, sans-serif";
  fitTextFont(ctx, c.name, nx + 16, ny + nh / 2 + 1, nw - 150, 26, "800", "Unbounded, sans-serif");
  const power = 40 + c.tier * 40 + Math.round(c.grade / 10) * 2;
  ctx.textAlign = "right";
  ctx.font = "800 24px 'Inter Tight', sans-serif";
  ctx.fillStyle = "#16121b";
  ctx.fillText(String(power), nx + nw - 42, ny + nh / 2 + 1);
  const pw = ctx.measureText(String(power)).width;
  ctx.font = "600 12px 'Inter Tight', sans-serif";
  ctx.fillStyle = "#5c5566";
  ctx.fillText("PWR", nx + nw - 48 - pw, ny + nh / 2 + 2);
  ctx.textAlign = "left";
  // element symbol
  ctx.save();
  ctx.translate(nx + nw - 20, ny + nh / 2);
  const sym = ctx.createRadialGradient(-4, -4, 2, 0, 0, 15);
  sym.addColorStop(0, "#fff");
  sym.addColorStop(0.3, el.a);
  sym.addColorStop(1, el.b);
  ctx.fillStyle = sym;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  glyph(ctx, el.glyph, nx + nw - 20, ny + nh / 2, 8, "#ffffff", R);
  // 4. art window with a thin metal rule
  const ax = 34, ay = 92, aw = W - 68, ah = 330;
  ctx.fillStyle = m1;
  roundRect(ctx, ax - 4, ay - 4, aw + 8, ah + 8, 6);
  ctx.fill();
  ctx.save();
  roundRect(ctx, ax, ay, aw, ah, 4);
  ctx.clip();
  scene(ctx, el.key, ax, ay, aw, ah, el.a, el.b, R);
  // the creature: a big luminous emblem, rim-lit, standing in the scene
  ctx.save();
  ctx.globalAlpha = 0.35;
  glyph(ctx, el.glyph, W / 2 + 6, ay + ah * 0.5 + 8, 118, "#000000", R);
  ctx.restore();
  glyph(ctx, el.glyph, W / 2, ay + ah * 0.48, 116, el.a, rng(c.art * 7 + 1));
  glyph(ctx, el.glyph, W / 2, ay + ah * 0.48, 116, "rgba(255,255,255,0.55)", rng(c.art * 7 + 1));
  // light dust
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(255,255,255,${R() * 0.6})`;
    ctx.beginPath();
    ctx.arc(ax + R() * aw, ay + R() * ah, R() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 5. type line
  const tx = 30, ty = 432, tw = W - 60, th = 34;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundRect(ctx, tx, ty, tw, th, 8);
  ctx.fill();
  ctx.fillStyle = "#2a2430";
  ctx.font = "700 15px 'Inter Tight', sans-serif";
  const elName = el.key[0].toUpperCase() + el.key.slice(1);
  ctx.fillText(`${(c.set || "Genesis")} Creature — ${elName}`, tx + 12, ty + th / 2 + 1);
  ctx.textAlign = "right";
  ctx.fillStyle = TIER_COLORS[c.tier] ?? "#888";
  ctx.font = "700 16px 'Inter Tight', sans-serif";
  ctx.fillText(RARITY_MARK[c.tier] ?? "●", tx + tw - 12, ty + th / 2 + 1);
  ctx.textAlign = "left";
  // 6. text box: ability + flavor
  const xx = 30, xy = 474, xw = W - 60, xh = 150;
  const tb = ctx.createLinearGradient(0, xy, 0, xy + xh);
  tb.addColorStop(0, "rgba(250,248,244,0.95)");
  tb.addColorStop(1, "rgba(232,228,222,0.95)");
  ctx.fillStyle = tb;
  roundRect(ctx, xx, xy, xw, xh, 8);
  ctx.fill();
  const [abName, abText] = ABILITY[c.art % 8];
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#16121b";
  ctx.font = "800 17px 'Inter Tight', sans-serif";
  ctx.fillText(abName, xx + 14, xy + 26);
  ctx.font = "500 14.5px 'Inter Tight', sans-serif";
  ctx.fillStyle = "#2a2430";
  wrapText(ctx, abText, xx + 14, xy + 48, xw - 28, 19);
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xx + 14, xy + 94);
  ctx.lineTo(xx + xw - 14, xy + 94);
  ctx.stroke();
  ctx.fillStyle = "#5c5566";
  ctx.font = "italic 400 13.5px 'Inter Tight', sans-serif";
  wrapText(ctx, FLAVOR[c.art % 8], xx + 14, xy + 114, xw - 28, 17);
  // 7. stats
  ctx.textBaseline = "middle";
  const atk = 1 + ((c.art * 3 + c.tier) % 5) + c.tier;
  const def = 1 + ((c.art * 5 + 2) % 5) + Math.floor(c.tier / 2);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, 30, 634, 150, 30, 15);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "700 14px 'Inter Tight', sans-serif";
  ctx.fillText(`ATK ${atk}   ·   DEF ${def}`, 46, 649);
  // 8. footer: number, illustrator, copyright
  const num = String((c.art % 120) + 1).padStart(3, "0");
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "600 11px 'Inter Tight', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${num}/120 ${RARITY_MARK[c.tier] ?? ""}`, W - 34, 642);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "500 9.5px 'Inter Tight', sans-serif";
  ctx.fillText("Illus. BREAKROOM Studio · © 2026 BREAKROOM", W - 34, 658);
  ctx.textAlign = "left";
  return canvas;
}

function fitTextFont(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, max: number, start: number, weight: string, family: string) {
  let size = start;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 12 && ctx.measureText(t).width > max) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.fillText(t, x, y);
}

/** The back of every card. */
export function drawBack(canvas: HTMLCanvasElement) {
  canvas.width = CARD_W * 2;
  canvas.height = CARD_H * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
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
  const key = `v3|${c.name}|${c.tier}|${c.grade}|${c.art}|${c.value ?? ""}`;
  let u = urlCache.get(key);
  if (!u) {
    u = drawCard(document.createElement("canvas"), c).toDataURL("image/webp", 0.88);
    urlCache.set(key, u);
  }
  return u;
}
