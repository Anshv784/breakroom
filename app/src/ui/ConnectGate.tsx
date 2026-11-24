// App-style connect screen for pages that need a wallet: one focused panel, the wallets right there.
import { useEffect, useMemo, useState } from "react";
import { readiness, useApp } from "../state/store";
import { detectWallets, onWalletsChanged, type Detected } from "../state/wallet";
import { IS_MAINNET } from "../chain/config";
import { cardImage, type CardFace } from "../lib/art";
import "./gate.css";

const FACES: CardFace[] = [
  { name: "Glacier Maw", set: "Genesis", tier: 3, grade: 95, art: 6, value: 176_000_000n },
  { name: "Solar Lion", set: "Genesis", tier: 4, grade: 100, art: 7, value: 547_000_000n },
  { name: "Void Seraph", set: "Genesis", tier: 4, grade: 95, art: 3, value: 484_000_000n },
];

export function ConnectGate({ title, sub }: { title: string; sub: string }) {
  const s = useApp();
  const [wallets, setWallets] = useState<Detected[]>(detectWallets);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => onWalletsChanged(() => setWallets(detectWallets())), []);
  const imgs = useMemo(() => FACES.map(cardImage), []);
  const pick = async (d: Detected | "guest") => {
    setBusy(d === "guest" ? "guest" : d.name);
    await s.run("Connect", () => s.connect(d));
    setBusy(null);
    if (useApp.getState().client && !readiness(useApp.getState()).ready) s.setOnboard(true);
  };
  const connected = !!s.client;
  return (
    <div className="gate">
      <div className="gate-panel">
        <div className="gate-art" aria-hidden>
          {imgs.map((src, i) => (
            <img key={i} src={src} alt="" className={`g${i}`} />
          ))}
        </div>
        <h1 className="display">{title}</h1>
        <p className="muted">{connected ? "One minute of setup and you're in." : sub}</p>
        {connected ? (
          <button className="gate-row primary" onClick={() => s.setOnboard(true)}>
            <span className="gate-ico">✦</span>
            Finish account setup
            <span className="gate-go">→</span>
          </button>
        ) : (
          <div className="gate-list">
            {wallets.map((w, i) => (
              <button key={w.name} className={`gate-row ${i === 0 ? "primary" : ""}`} onClick={() => pick(w)} disabled={!!busy}>
                <img src={w.icon} alt="" width={26} height={26} />
                {w.name}
                <span className="gate-go">{busy === w.name ? "approve in wallet…" : "→"}</span>
              </button>
            ))}
            {!IS_MAINNET && (
              <button className={`gate-row ${wallets.length === 0 ? "primary" : ""}`} onClick={() => pick("guest")} disabled={!!busy}>
                <span className="gate-ico">✦</span>
                Guest wallet
                <span className="gate-go">{busy === "guest" ? "creating…" : <i>instant · no extension</i>}</span>
              </button>
            )}
            {wallets.length === 0 && (
              <a className="gate-hint" href="https://phantom.com" target="_blank" rel="noreferrer">
                No wallet extension found · get Phantom ↗
              </a>
            )}
          </div>
        )}
        {!IS_MAINNET && (
          <div className="gate-foot">
            <span className="dot" /> Public test on devnet · test cards and test USDC
          </div>
        )}
      </div>
    </div>
  );
}
