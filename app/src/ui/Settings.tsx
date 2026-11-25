// Settings: music, sound effects, pack alerts, motion. Everything saves in this browser.
import { useEffect, useState } from "react";
import { settings, TRACKS, useSettings, useSettingsOpen } from "../lib/settings";
import { sfx } from "../lib/sfx";
import "./settings.css";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`tgl ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function SettingsButton() {
  return (
    <button className="btn sm ghost icon-btn" onClick={() => settings.setOpen(true)} aria-label="Settings" title="Settings">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}

/** Quick music on/off in the nav. */
export function MusicButton() {
  const s = useSettings();
  return (
    <button className="btn sm ghost icon-btn" onClick={() => settings.set({ music: !s.music })} aria-label={s.music ? "Turn music off" : "Turn music on"} title={s.music ? "Music on" : "Music off"}>
      {s.music ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".55">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
          <path d="M3 3l18 18" />
        </svg>
      )}
    </button>
  );
}

export function SettingsPanel() {
  const open = useSettingsOpen();
  const s = useSettings();
  const [perm, setPerm] = useState<string>(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && settings.setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  if (!open) return null;
  const askNotify = async () => {
    if (typeof Notification === "undefined") return;
    setPerm(await Notification.requestPermission());
  };
  const testAlert = () => {
    sfx.yourTurn();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Your pack is up", { body: "Swipe across the seal to rip it open.", icon: "/favicon.svg" });
  };
  return (
    <div className="scrim" onClick={() => settings.setOpen(false)}>
      <div className="panel modal settings" onClick={(e) => e.stopPropagation()}>
        <button className="set-close" onClick={() => settings.setOpen(false)} aria-label="Close">
          ×
        </button>
        <h2 className="display">Settings</h2>

        <section>
          <div className="set-h">Sound</div>
          <div className="set-row">
            <div>
              <b>Background music</b>
              <span>Plays quietly while you browse and watch breaks</span>
            </div>
            <Toggle on={s.music} onChange={(v) => settings.set({ music: v })} label="Background music" />
          </div>
          <div className={`set-tracks ${s.music ? "" : "off"}`}>
            {TRACKS.map((t) => (
              <button key={t.id} className={`set-track ${s.track === t.id ? "on" : ""}`} onClick={() => settings.set({ track: t.id, music: true })}>
                <span className="set-eq" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <b>{t.name}</b>
                  <em>{t.mood}</em>
                </span>
              </button>
            ))}
          </div>
          <div className={`set-row ${s.music ? "" : "off"}`}>
            <div>
              <b>Music volume</b>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => settings.set({ volume: Number(e.target.value) })} aria-label="Music volume" />
          </div>
          <div className="set-row">
            <div>
              <b>Sound effects</b>
              <span>Rips, card reveals and the chase chime</span>
            </div>
            <Toggle on={s.sfx} onChange={(v) => settings.set({ sfx: v })} label="Sound effects" />
          </div>
        </section>

        <section>
          <div className="set-h">Alerts</div>
          <div className="set-row">
            <div>
              <b>"Your pack is up"</b>
              <span>A chime, and a notification if you're in another tab</span>
            </div>
            <Toggle on={s.alerts} onChange={(v) => settings.set({ alerts: v })} label="Pack alerts" />
          </div>
          {s.alerts && (
            <div className="set-actions">
              {perm === "default" && (
                <button className="btn sm" onClick={askNotify}>
                  Allow browser notifications
                </button>
              )}
              {perm === "denied" && <span className="faint">Notifications are blocked in your browser settings.</span>}
              {perm === "granted" && <span className="up">Browser notifications on</span>}
              <button className="btn sm ghost" onClick={testAlert}>
                Test alert
              </button>
            </div>
          )}
        </section>

        <section>
          <div className="set-h">Pull Clips</div>
          <div className="set-row">
            <div>
              <b>Record my rips</b>
              <span>A short video of your pack opening, made in your browser, ready to share</span>
            </div>
            <Toggle on={s.clips} onChange={(v) => settings.set({ clips: v })} label="Pull Clips" />
          </div>
        </section>

        <section>
          <div className="set-h">Display</div>
          <div className="set-row">
            <div>
              <b>Reduce motion</b>
              <span>Steadier camera and fewer animations</span>
            </div>
            <Toggle on={s.reduceMotion} onChange={(v) => settings.set({ reduceMotion: v })} label="Reduce motion" />
          </div>
        </section>
      </div>
    </div>
  );
}
