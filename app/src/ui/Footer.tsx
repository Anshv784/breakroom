// Site footer: product links, what it's built on, and an honest line about test mode.
import { IS_MAINNET } from "../chain/config";
import { Logo } from "./Logo";

const COLS: { title: string; links: [string, string][] }[] = [
  { title: "Product", links: [["Live breaks", "#/breaks"], ["Host a break", "#/host"], ["Leaderboard", "#/leaders"], ["Your vault", "#/vault"]] },
  { title: "Trust", links: [["How it's fair", "#/how"], ["Verify a break", "#/breaks/finished"], ["Questions", "#/how"]] },
  { title: "Built on", links: [["Solana", "https://solana.com"], ["MagicBlock", "https://www.magicblock.xyz"], ["Ephemeral Rollups", "https://docs.magicblock.gg"], ["Private Payments", "https://docs.magicblock.gg"]] },
];

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            <a href="#/" className="brand">
              <Logo size={24} />
              BREAKROOM
            </a>
            <p className="muted">Live card breaks with a shuffle nobody can see and everybody can check. Spots trade while the packs open.</p>
          </div>
          {COLS.map((c) => (
            <div key={c.title} className="footer-col">
              <div className="eyebrow">{c.title}</div>
              {c.links.map(([label, href]) => (
                <a key={label} href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                  {label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} BREAKROOM</span>
          {!IS_MAINNET && (
            <span className="footer-test">
              <span className="dot" /> Public test on Solana devnet · Genesis test cards and test USDC, no real money moves
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

/** Small status badge in the nav for the public test. */
export function TestBadge() {
  if (IS_MAINNET) return null;
  return (
    <span className="test-badge" title="BREAKROOM is in public test on Solana devnet. Cards are Genesis test cards and balances are test USDC.">
      <span className="dot" />
      Public test
    </span>
  );
}
