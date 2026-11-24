// Background music options for BREAKROOM: original, synthesised, seamless loops (tails wrap
// around to the start so the loop never clicks). Writes music/out/<style>.wav
import fs from "fs";
const SR = 44100;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
function svf() { let lp = 0, bp = 0; return (x, fc, q = 0.7) => { const f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR); lp += f * bp; const hp = x - lp - q * bp; bp += f * hp; return lp; }; }
const saw = (p) => 2 * (p - Math.floor(p + 0.5));

function make(name, bpm, bars, build) {
  const BEAT = 60 / bpm, BAR = BEAT * 4, N = Math.round(BAR * bars * SR);
  const L = new Float32Array(N), R = new Float32Array(N), VL = new Float32Array(N), VR = new Float32Array(N), duck = new Float32Array(N).fill(1);
  const put = (i, v, pan = 0.5, wet = 0.25) => { const j = ((i % N) + N) % N; L[j] += v * (1 - pan) * 1.4; R[j] += v * pan * 1.4; VL[j] += v * wet * (1 - pan); VR[j] += v * wet * pan; };
  const T = (bar, beat = 0) => bar * BAR + beat * BEAT;
  const S = (t) => Math.round(t * SR);
  const api = {
    BEAT, BAR, T,
    keys(t0, notes, dur, g = 1, bright = 1) { // electric-piano: sine + bell partial, tremolo
      for (const n of notes) { const f = hz(n); for (let i = 0; i < S(dur + 1.2); i++) { const t = i / SR; const env = Math.min(1, t / 0.004) * Math.exp(-t * (t < dur ? 1.6 : 6)); const v = (Math.sin(2 * Math.PI * f * t) + 0.25 * bright * Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t * 6)) * env * (1 + 0.12 * Math.sin(2 * Math.PI * 4.5 * t)) * g * 0.05; put(S(t0) + i, v, 0.5 + (n % 5 - 2) * 0.08, 0.4); } }
    },
    pad(t0, notes, dur, g = 1, fc = 1200) {
      for (const n of notes) for (const d of [-0.07, 0.07]) { const f = hz(n + d), fl = svf(); let ph = Math.random(); for (let i = 0; i < S(dur + 1.5); i++) { const t = i / SR; const env = Math.min(1, t / 1.2) * (t > dur ? Math.max(0, 1 - (t - dur) / 1.5) : 1); ph += f / SR; put(S(t0) + i, fl(saw(ph), fc, 0.9) * env * g * 0.016, d < 0 ? 0.35 : 0.65, 0.7); } }
    },
    pluck(t0, n, g = 1, pan = 0.5, bright = 1) {
      const f = hz(n), fl = svf(); let ph = 0;
      for (let i = 0; i < S(0.9); i++) { const t = i / SR; ph += f / SR; put(S(t0) + i, fl(saw(ph), 300 + 3500 * bright * Math.exp(-t * 12), 0.6) * Math.exp(-t * 5) * Math.min(1, t / 0.002) * g * 0.09, pan, 0.45); }
    },
    bass(t0, n, dur, g = 1, kind = "sine") {
      const f = hz(n), fl = svf(); let ph = 0;
      for (let i = 0; i < S(dur); i++) { const t = i / SR; ph += f / SR; const x = kind === "sine" ? Math.sin(2 * Math.PI * ph) + 0.2 * Math.sin(4 * Math.PI * ph) : fl(saw(ph), 500 + 600 * Math.exp(-t * 8), 0.5) * 1.4; const env = Math.min(1, t / 0.01) * Math.min(1, (dur - t) / 0.04) * (kind === "pluck" ? Math.exp(-t * 3) : 1); put(S(t0) + i, x * env * g * 0.2, 0.5, 0); }
    },
    kick(t0, g = 1) { let ph = 0; for (let i = 0; i < S(0.35); i++) { const t = i / SR; ph += (48 + 110 * Math.exp(-t * 30)) / SR; put(S(t0) + i, Math.sin(2 * Math.PI * ph) * Math.exp(-t * 9) * g * 0.42, 0.5, 0); const j = S(t0) + i; if (t < 0.22) duck[((j % N) + N) % N] = Math.min(duck[((j % N) + N) % N], 0.55 + 0.45 * (t / 0.22)); } },
    snare(t0, g = 1, soft = false) { let a = 0, b = 0; for (let i = 0; i < S(0.25); i++) { const t = i / SR; const n = rnd(); a += 0.45 * (n - a); b += 0.06 * (a - b); put(S(t0) + i, (a - b) * Math.exp(-t * (soft ? 22 : 15)) * g * 0.28, 0.52, 0.5); } },
    hat(t0, g = 1, open = false, pan = 0.6) { let hp = 0, pr = 0; for (let i = 0; i < S(open ? 0.25 : 0.05); i++) { const t = i / SR; const n = rnd(); hp = 0.85 * (hp + n - pr); pr = n; put(S(t0) + i, hp * Math.exp(-t * (open ? 12 : 80)) * g * 0.05, pan, 0.2); } },
    brush(t0, dur, g = 1) { let lp = 0; for (let i = 0; i < S(dur); i++) { const t = i / SR; lp += 0.3 * (rnd() - lp); put(S(t0) + i, lp * Math.sin(Math.PI * t / dur) * g * 0.05, 0.55, 0.3); } },
    crackle(g = 1) { for (let i = 0; i < N; i++) if (Math.random() < 0.0009) { const v = rnd() * g * 0.04; put(i, v, Math.random(), 0); put(i + 1, -v * 0.6, 0.5, 0); } },
  };
  build(api);
  // reverb (circular so it wraps across the loop point)
  const rev = [VL, VR].map((x, ch) => {
    const y = new Float32Array(N);
    const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ b: new Float32Array(d + ch * 23), i: 0, lp: 0 }));
    for (let pass = 0; pass < 2; pass++) for (let n = 0; n < N; n++) { let s = 0; for (const c of combs) { const v = c.b[c.i]; c.lp = v * 0.7 + c.lp * 0.3; c.b[c.i] = x[n] * 0.12 + c.lp * 0.84; c.i = (c.i + 1) % c.b.length; s += v; } if (pass === 1) y[n] = s; }
    return y;
  });
  let pk = 0;
  for (let n = 0; n < N; n++) { L[n] = Math.tanh((L[n] * duck[n] + rev[0][n] * 0.45) * 1.1); R[n] = Math.tanh((R[n] * duck[n] + rev[1][n] * 0.45) * 1.1); pk = Math.max(pk, Math.abs(L[n]), Math.abs(R[n])); }
  const g = 0.8 / pk, buf = Buffer.alloc(44 + N * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) { buf.writeInt16LE(Math.round(L[n] * g * 32767), 44 + n * 4); buf.writeInt16LE(Math.round(R[n] * g * 32767), 46 + n * 4); }
  fs.mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
  fs.writeFileSync(new URL(`./out/${name}.wav`, import.meta.url), buf);
  console.log(name, (N / SR).toFixed(1) + "s");
}

// Dm9 – Bbmaj7 – Gm9 – A7sus (shared harmony, different treatments)
const CH = [[50, 62, 65, 69, 72, 76], [46, 62, 65, 69, 70, 74], [43, 58, 62, 65, 69, 74], [45, 61, 64, 67, 69, 74]];

// A. Lo-fi lounge: warm keys, vinyl crackle, lazy boom-bap
make("A-lofi-lounge", 78, 8, (a) => {
  a.crackle(1);
  for (let b = 0; b < 8; b++) {
    const c = CH[b % 4];
    a.keys(a.T(b, 0), c.slice(1, 5), a.BAR * 0.9, 1, 0.8);
    a.keys(a.T(b, 2.5), c.slice(2, 5), a.BEAT * 0.8, 0.5, 0.8);
    a.bass(a.T(b, 0), c[0] - 12 + 12, a.BEAT * 1.5, 0.9);
    a.bass(a.T(b, 2.5), c[0] + 7 - 12 + 12, a.BEAT, 0.7);
    a.kick(a.T(b, 0)); a.kick(a.T(b, 1.75), 0.6); a.kick(a.T(b, 2.5), 0.8);
    a.snare(a.T(b, 1), 0.8, true); a.snare(a.T(b, 3), 0.8, true);
    for (let k = 0; k < 8; k++) a.hat(a.T(b, k / 2 + (k % 2 ? 0.08 : 0)), k % 2 ? 0.5 : 0.8);
    if (b % 2) a.pluck(a.T(b, 3.25), c[5] + 12, 0.35, 0.65, 0.5);
  }
});

// B. Ambient night: slow pads, soft arpeggio, no drums
make("B-ambient-night", 92, 8, (a) => {
  for (let b = 0; b < 8; b++) {
    const c = CH[b % 4];
    a.pad(a.T(b), c.slice(1, 5), a.BAR, 1, 1000 + 400 * Math.sin(b));
    a.bass(a.T(b), c[0], a.BAR * 0.95, 0.6);
    const seq = [1, 3, 2, 4, 3, 5, 2, 4];
    for (let k = 0; k < 8; k++) a.pluck(a.T(b, k / 2), c[seq[k]] + 12, 0.45 * (k % 2 ? 0.7 : 1), k % 2 ? 0.7 : 0.3, 0.55);
  }
});

// C. Card-room jazz: walking bass, brushes, Rhodes comping (casino lounge, not cheesy)
make("C-cardroom-jazz", 112, 8, (a) => {
  const walk = [[50, 53, 55, 57], [46, 48, 50, 53], [43, 45, 46, 48], [45, 49, 52, 44]];
  for (let b = 0; b < 8; b++) {
    const c = CH[b % 4];
    walk[b % 4].forEach((n, k) => a.bass(a.T(b, k), n - 12 + 12, a.BEAT * 0.92, 0.85, "pluck"));
    a.keys(a.T(b, 0.5), c.slice(1, 5), a.BEAT * 0.6, 0.8, 1);
    a.keys(a.T(b, 2.66), c.slice(2, 6), a.BEAT * 0.7, 0.7, 1);
    for (let k = 0; k < 4; k++) { a.hat(a.T(b, k), 0.6, false, 0.7); a.hat(a.T(b, k + 0.66), 0.35, false, 0.7); }
    a.brush(a.T(b, 1), a.BEAT * 0.9, 0.9); a.brush(a.T(b, 3), a.BEAT * 0.9, 0.9);
    a.kick(a.T(b, 0), 0.35);
  }
});

// D. Deep house: steady four-on-the-floor, muted plucks, airy pad (more energy)
make("D-deep-house", 120, 8, (a) => {
  for (let b = 0; b < 8; b++) {
    const c = CH[b % 4];
    a.pad(a.T(b), c.slice(1, 4), a.BAR, 0.7, 800);
    for (let k = 0; k < 4; k++) a.kick(a.T(b, k), 0.9);
    a.snare(a.T(b, 1), 0.45); a.snare(a.T(b, 3), 0.45);
    for (let k = 0; k < 8; k++) a.hat(a.T(b, k / 2 + 0.5), 0.7, k === 7);
    for (let k = 0; k < 4; k++) a.bass(a.T(b, k + 0.5), c[0], a.BEAT * 0.4, 0.9, "saw");
    [0, 0.75, 1.5, 2.5, 3.25].forEach((x, i) => a.pluck(a.T(b, x), c[1 + (i % 4)] + 12, 0.5, i % 2 ? 0.65 : 0.35, 0.7));
  }
});
