// Pull Clips: records your own rip, in the browser, as a short vertical video for TikTok / Reels /
// X. A compositor draws the 3D room (cropped to 9:16 around the pack) plus a title, the card you
// pulled and a "provably fair" stamp onto an offscreen canvas, and MediaRecorder encodes that.
// Nothing is uploaded: the clip stays in the browser until you share or download it.
import type { CardInfo } from "../chain/layout";
import { cardImage, faceOf, TIER_COLORS, TIER_NAMES } from "./art";

export interface Clip {
  url: string;
  blob: Blob;
  type: string;
  card: CardInfo | null;
}
const W = 720;
const H = 1280;

export const clipsSupported = () => typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";

function pickType() {
  for (const t of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export class PullRecorder {
  private out = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private raf = 0;
  private t0 = 0;
  private pulledAt = 0;
  private card: CardInfo | null = null;
  private cardImg: HTMLImageElement | null = null;
  private done: ((c: Clip | null) => void) | null = null;
  private type = "";
  private timer = 0 as any;
  constructor(private src: HTMLCanvasElement, private meta: { title: string; who: string; link: string }) {
    this.out.width = W;
    this.out.height = H;
    this.ctx = this.out.getContext("2d")!;
  }
  start() {
    this.type = pickType();
    const stream = this.out.captureStream(30);
    try {
      this.rec = new MediaRecorder(stream, this.type ? { mimeType: this.type, videoBitsPerSecond: 5_000_000 } : undefined);
    } catch {
      return false;
    }
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = () => {
      cancelAnimationFrame(this.raf);
      const blob = new Blob(this.chunks, { type: this.rec?.mimeType || this.type || "video/webm" });
      this.done?.(blob.size > 0 ? { url: URL.createObjectURL(blob), blob, type: blob.type, card: this.card } : null);
    };
    this.t0 = performance.now();
    this.rec.start(250);
    const loop = () => {
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
    // never record forever (e.g. the tab went away before the card came out)
    this.timer = setTimeout(() => this.stop(), 22_000);
    return true;
  }
  /** your card is out: keep rolling a few seconds for the reveal, then the end card, then stop */
  pulled(card: CardInfo | null) {
    if (this.pulledAt) return;
    this.pulledAt = performance.now();
    this.card = card;
    if (card) {
      const img = new Image();
      img.src = cardImage(faceOf(card));
      this.cardImg = img;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.stop(), 6200);
  }
  stop() {
    clearTimeout(this.timer);
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
  }
  result(): Promise<Clip | null> {
    return new Promise((res) => (this.done = res));
  }
  private draw() {
    const x = this.ctx;
    const t = (performance.now() - this.t0) / 1000;
    const since = this.pulledAt ? (performance.now() - this.pulledAt) / 1000 : -1;
    x.fillStyle = "#09080b";
    x.fillRect(0, 0, W, H);
    // the room, cropped to 9:16 around the centre of the stage, a touch zoomed in
    const s = this.src;
    if (s.width && s.height) {
      const zoom = 1.15;
      const ch = s.height / zoom;
      const cw = (ch * 9) / 16;
      const cx = s.width / 2 - cw / 2;
      const cy = (s.height - ch) * 0.42;
      try {
        x.drawImage(s, cx, cy, cw, ch, 0, 0, W, H);
      } catch {
        /* canvas not readable this frame */
      }
    }
    // soft top and bottom fades for the text
    const g1 = x.createLinearGradient(0, 0, 0, 260);
    g1.addColorStop(0, "rgba(9,8,11,0.92)");
    g1.addColorStop(1, "rgba(9,8,11,0)");
    x.fillStyle = g1;
    x.fillRect(0, 0, W, 260);
    const g2 = x.createLinearGradient(0, H - 420, 0, H);
    g2.addColorStop(0, "rgba(9,8,11,0)");
    g2.addColorStop(1, "rgba(9,8,11,0.95)");
    x.fillStyle = g2;
    x.fillRect(0, H - 420, W, 420);
    x.textAlign = "left";
    x.fillStyle = "rgba(255,255,255,0.7)";
    x.font = "900 26px Unbounded, sans-serif";
    x.fillText("BREAKROOM", 44, 74);
    x.fillStyle = "#fff";
    x.font = "700 34px 'Inter Tight', sans-serif";
    x.fillText(this.meta.title.slice(0, 26), 44, 124);
    x.fillStyle = "rgba(255,255,255,0.65)";
    x.font = "500 24px 'Inter Tight', sans-serif";
    x.fillText(since < 0 ? `${this.meta.who} is ripping their pack…` : `${this.meta.who} pulled`, 44, 162);
    // the pull
    if (since >= 0 && this.card) {
      const a = Math.min(1, since / 0.5);
      x.globalAlpha = a;
      const tc = TIER_COLORS[this.card.tier] ?? "#fff";
      x.fillStyle = tc;
      x.font = "700 24px 'JetBrains Mono', monospace";
      x.fillText(`${TIER_NAMES[this.card.tier]} PULL`, 44, H - 210);
      x.fillStyle = "#fff";
      x.font = "800 54px Unbounded, sans-serif";
      x.fillText(this.card.name.slice(0, 16), 44, H - 148);
      x.fillStyle = "#4fe3a1";
      x.font = "700 44px 'JetBrains Mono', monospace";
      x.fillText(`$${(Number(this.card.value) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, 44, H - 90);
      x.globalAlpha = 1;
    }
    // end card: the card big, plus the proof stamp
    if (since > 3.6) {
      const a = Math.min(1, (since - 3.6) / 0.5);
      x.globalAlpha = a;
      x.fillStyle = "#09080b";
      x.fillRect(0, 0, W, H);
      x.globalAlpha = a;
      if (this.cardImg?.complete) {
        const cw = 380;
        const chh = cw * (716 / 512);
        x.save();
        x.translate(W / 2, 520);
        x.rotate(-0.04);
        x.shadowColor = TIER_COLORS[this.card?.tier ?? 0];
        x.shadowBlur = 60;
        x.drawImage(this.cardImg, -cw / 2, -chh / 2, cw, chh);
        x.restore();
      }
      x.textAlign = "center";
      x.fillStyle = "#4fe3a1";
      x.font = "700 26px 'Inter Tight', sans-serif";
      x.fillText("✓ Provably fair: nobody picked this card", W / 2, 950);
      x.fillStyle = "rgba(255,255,255,0.6)";
      x.font = "500 22px 'JetBrains Mono', monospace";
      x.fillText(this.meta.link, W / 2, 992);
      x.fillStyle = "#fff";
      x.font = "900 44px Unbounded, sans-serif";
      x.fillText("BREAKROOM", W / 2, 1120);
      x.fillStyle = "rgba(255,255,255,0.6)";
      x.font = "500 22px 'Inter Tight', sans-serif";
      x.fillText("live card breaks you can verify", W / 2, 1160);
      x.globalAlpha = 1;
      x.textAlign = "left";
    }
    void t;
  }
}
