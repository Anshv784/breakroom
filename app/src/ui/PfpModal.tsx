// Change your profile picture: pick an image, see it cropped, sign once, done.
import { useRef, useState } from "react";
import { useApp } from "../state/store";
import { removePfp, squareImage, uploadPfp } from "../lib/pfp";
import { Avatar } from "./Avatar";

export function PfpModal({ onClose }: { onClose: () => void }) {
  const s = useApp();
  const c = s.client;
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  if (!c) return null;
  const pick = async (f?: File) => {
    setErr(null);
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return setErr("Use a PNG, JPEG, WebP or GIF image.");
    if (f.size > 15_000_000) return setErr("That file is too big.");
    setImg(await squareImage(f));
  };
  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      await uploadPfp(c.wallet, img);
      s.toast("ok", "Profile picture updated");
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try {
      await removePfp(c.wallet);
      s.toast("ok", "Back to your generated avatar");
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't remove it");
    }
    setBusy(false);
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="panel modal" style={{ width: "min(420px,100%)", borderRadius: 24, position: "relative", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" style={{ all: "unset", cursor: "pointer", position: "absolute", top: 16, right: 18, color: "var(--text-3)", fontSize: 20 }}>
          ×
        </button>
        <h2 className="display" style={{ margin: "2px 0 18px", fontSize: 22 }}>
          Profile picture
        </h2>
        <div
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0]);
          }}
          style={{ cursor: "pointer", width: 140, height: 140, margin: "0 auto", borderRadius: 140, overflow: "hidden", boxShadow: "0 0 0 2px var(--line-2), 0 20px 40px -16px rgba(0,0,0,0.9)" }}
          title="Choose an image"
        >
          {img ? <img src={img} alt="" style={{ width: 140, height: 140, objectFit: "cover", display: "block" }} /> : <Avatar k={c.me} size={140} />}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <p className="muted" style={{ fontSize: 13, margin: "16px 0 0" }}>
          Shown next to your name in rooms, chat and the leaderboard. You sign once with your wallet so nobody else can change it.
        </p>
        {err && <p style={{ color: "var(--down)", fontSize: 13, margin: "10px 0 0" }}>{err}</p>}
        <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
          {img ? (
            <button className="btn primary" disabled={busy} onClick={save}>
              {busy ? "Signing…" : "Save picture"}
            </button>
          ) : (
            <button className="btn primary" onClick={() => input.current?.click()}>
              Choose an image
            </button>
          )}
          <button className="btn ghost sm" disabled={busy} onClick={remove}>
            Use my generated avatar
          </button>
        </div>
      </div>
    </div>
  );
}
