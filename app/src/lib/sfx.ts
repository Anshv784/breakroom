// Synthesized sound: no audio files. A foil rip, a card flip, and a rising chime for big pulls.
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem("br-muted") === "1";
  } catch {
    return false;
  }
})();

function ac() {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(c: AudioContext, dur: number) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(c: AudioContext, f: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

export const sfx = {
  get muted() {
    return muted;
  },
  setMuted(v: boolean) {
    muted = v;
    try {
      localStorage.setItem("br-muted", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  },
  rip() {
    const c = ac();
    if (!c) return;
    const n = noise(c, 0.35);
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(5200, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.32);
    const g = c.createGain();
    g.gain.value = 0.22;
    n.connect(f).connect(g).connect(c.destination);
    n.start();
  },
  reveal(tier: number) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const n = noise(c, 0.06);
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 2400;
    const g = c.createGain();
    g.gain.value = 0.18;
    n.connect(f).connect(g).connect(c.destination);
    n.start(t);
    if (tier >= 1) tone(c, 660, t + 0.05, 0.25, 0.06);
    if (tier >= 2) tone(c, 880, t + 0.12, 0.3, 0.06);
    if (tier >= 3) {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((fq, i) => tone(c, fq, t + 0.15 + i * 0.09, 0.9, 0.07, "triangle"));
    }
    if (tier >= 4) tone(c, 130.8, t + 0.1, 1.4, 0.12, "sawtooth");
  },
  tick() {
    const c = ac();
    if (!c) return;
    tone(c, 1200, c.currentTime, 0.05, 0.04, "square");
  },
};
