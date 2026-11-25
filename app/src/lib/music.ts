// Background music: one looping track, on by default. Browsers only allow sound after the first
// click or key press, so it starts on the first interaction. Fades in and out, pauses in
// background tabs, and dips under big moments (rips, chase pulls).
import { settings } from "./settings";

let el: HTMLAudioElement | null = null;
let unlocked = false;
let level = 1; // duck multiplier
let fadeTimer = 0 as any;

function target() {
  // never play over a stream overlay (OBS captures page audio)
  if (location.hash.startsWith("#/overlay")) return 0;
  const s = settings.get();
  return s.music && !document.hidden ? s.volume * 0.6 * level : 0;
}
function ensure() {
  if (el) return el;
  el = new Audio();
  el.loop = true;
  el.preload = "auto";
  el.volume = 0;
  return el;
}
function sync() {
  const s = settings.get();
  const a = ensure();
  const src = `/audio/${s.track}.mp3`;
  if (!a.src.endsWith(src)) {
    a.src = src;
    a.currentTime = 0;
  }
  const want = target();
  if (want > 0 && unlocked && a.paused) a.play().catch(() => {});
  clearInterval(fadeTimer);
  fadeTimer = setInterval(() => {
    const v = a.volume + Math.sign(want - a.volume) * 0.02;
    a.volume = Math.max(0, Math.min(1, Math.abs(want - a.volume) < 0.02 ? want : v));
    if (a.volume === want) {
      clearInterval(fadeTimer);
      if (want === 0) a.pause();
    }
  }, 40);
}

export const music = {
  /** dip the music for a moment (a rip, a big pull) */
  duck(ms = 2200, to = 0.35) {
    level = to;
    sync();
    setTimeout(() => {
      level = 1;
      sync();
    }, ms);
  },
};

if (typeof window !== "undefined") {
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    sync();
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, unlock, { once: false, passive: true });
  document.addEventListener("visibilitychange", sync);
  settings.subscribe(sync);
}
