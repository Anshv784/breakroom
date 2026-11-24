// App-style connect screen for pages that need a wallet: one focused panel, the wallets right there.
import { useMemo } from "react";
import { useApp } from "../state/store";
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
  const imgs = useMemo(() => FACES.map(cardImage), []);
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
          <button className="gate-row primary gate-connect" onClick={() => s.setConnect(true)}>
            <span className="gate-ico">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h13v4" />
                <path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z" />
              </svg>
            </span>
            Connect wallet
            <span className="gate-go">→</span>
          </button>
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
