// User settings, saved in this browser. Music and sounds are on by default.
import { useSyncExternalStore } from "react";

export const TRACKS = [
  { id: "B-ambient-night", name: "Ambient night", mood: "Calm pads and a soft arpeggio" },
  { id: "A-lofi-lounge", name: "Lo-fi lounge", mood: "Warm keys, vinyl, lazy beat" },
  { id: "C-cardroom-jazz", name: "Card-room jazz", mood: "Walking bass and brushes" },
  { id: "D-deep-house", name: "Deep house", mood: "Steady groove, more energy" },
] as const;

export interface Settings {
  music: boolean;
  track: string;
  volume: number; // 0..1
  sfx: boolean;
  alerts: boolean;
  reduceMotion: boolean;
  clips: boolean;
}
const KEY = "br-settings-v1";
const DEFAULTS: Settings = { music: true, track: TRACKS[0].id, volume: 0.35, sfx: true, alerts: true, reduceMotion: false, clips: true };

let state: Settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
})();
let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const settings = {
  get: () => state,
  set(patch: Partial<Settings>) {
    state = { ...state, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    applyMotion();
    emit();
  },
  isOpen: () => open,
  setOpen(v: boolean) {
    open = v;
    emit();
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
};

function applyMotion() {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("reduce-motion", state.reduceMotion);
}
applyMotion();

export function useSettings() {
  return useSyncExternalStore(settings.subscribe, settings.get);
}
export function useSettingsOpen() {
  return useSyncExternalStore(settings.subscribe, settings.isOpen);
}
