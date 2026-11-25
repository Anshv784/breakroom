// Host-only: put this break on your stream. One link for an OBS browser source.
import { useState } from "react";

export function StreamButton({ id }: { id: bigint }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}#/overlay/${id}`;
  return (
    <>
      <button className="btn sm ghost" onClick={() => setOpen(true)} title="Put this break on your stream">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <path d="M16 10l6-3v10l-6-3" />
        </svg>
        Stream overlay
      </button>
      {open && (
        <div className="scrim" onClick={() => setOpen(false)}>
          <div className="panel modal" style={{ width: "min(560px,100%)", borderRadius: 24, position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ all: "unset", cursor: "pointer", position: "absolute", top: 16, right: 18, color: "var(--text-3)", fontSize: 20 }}>
              ×
            </button>
            <h2 className="display" style={{ margin: "2px 0 6px", fontSize: 22 }}>
              Put this break on your stream
            </h2>
            <p className="muted" style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.5 }}>
              Viewers see the sealed box, every spot's chase odds and each card the moment it comes out, with a QR code to grab a spot or check the proof. Works with OBS, Streamlabs and anything that takes a browser source.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 12.5 }} />
              <button
                className="btn primary"
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <ol style={{ margin: "18px 0 0", paddingLeft: 20, display: "grid", gap: 8, fontSize: 14, color: "var(--text-2)" }}>
              <li>In OBS, add a <b style={{ color: "var(--text)" }}>Browser</b> source.</li>
              <li>Paste the link, set width 1920 and height 1080.</li>
              <li>Put it above your camera. The background is transparent.</li>
            </ol>
            <a href={link} target="_blank" rel="noreferrer" className="btn sm ghost" style={{ marginTop: 18 }}>
              Preview the overlay ↗
            </a>
          </div>
        </div>
      )}
    </>
  );
}
