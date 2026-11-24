// Nav, wallet connect, toasts and the "get ready" onboarding that takes a wallet from nothing to
// a live session: test USDC -> private balance (Private Payments API) -> profile -> session key.
import { useEffect, useState } from "react";
import { readiness, shortKey, usd, useApp } from "../state/store";
import { detectWallets, onWalletsChanged, type Detected } from "../state/wallet";
import { IS_MAINNET } from "../chain/config";
import { Logo } from "./Logo";
import { TestBadge } from "./Footer";
import { MusicButton, SettingsButton } from "./Settings";
import { settings } from "../lib/settings";
import "./gate.css";
import { CLUSTER } from "../chain/config";

export function Nav({ route }: { route: string[] }) {
  const s = useApp();
  const r = readiness(s);
  const at = route[0] ?? "";
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <a href="#/" className="brand">
          <Logo size={26} />
          BREAKROOM
        </a>
        <nav className="nav-links">
          <a href="#/breaks" className={at === "breaks" || at === "break" ? "on" : ""}>
            Live breaks
          </a>
          <a href="#/host" className={at === "host" ? "on" : ""}>
            Host a break
          </a>
          <a href="#/leaders" className={at === "leaders" ? "on" : ""}>
            Leaderboard
          </a>
          <a href="#/vault" className={at === "vault" ? "on" : ""}>
            Vault
          </a>
          <a href="#/how" className={at === "how" ? "on" : ""}>
            How it's fair
          </a>
        </nav>
        <div className="nav-right">
          <TestBadge />
          <MusicButton />
          <SettingsButton />
          {s.client ? (
            <>
              <button className="btn sm ghost" onClick={() => (s.locked ? s.unlock() : s.setOnboard(true))} title={s.locked ? "Sign once to read your private balance" : "Private balance inside the TEE"}>
                {s.locked ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                    Show balance
                  </span>
                ) : (
                  <span className="mono num">{usd(s.privateUsdc)}</span>
                )}
                {!r.ready && <span className="chip sale" style={{ height: 20 }}>Set up</span>}
              </button>
              <AccountMenu />
            </>
          ) : (
            <button className="btn sm primary" onClick={() => s.setConnect(true)}>
              Connect
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function AccountMenu() {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const t = setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", close);
    };
  }, [open]);
  if (!s.client) return null;
  const me = s.client.me.toBase58();
  const label = s.profile?.name || shortKey(s.client.me);
  return (
    <div className="acct">
      <button className="btn sm" onClick={(e) => (e.stopPropagation(), setOpen(!open))} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{label.slice(0, 1).toUpperCase()}</span>
        {label}
        <span className="faint" style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div className="acct-menu" role="menu" onClick={(e) => e.stopPropagation()}>
          <div className="acct-head">
            <div style={{ fontWeight: 600 }}>{label}</div>
            <div className="faint mono" style={{ fontSize: 12, marginTop: 2 }}>{shortKey(s.client.me)} · {s.walletName}</div>
          </div>
          <a href="#/vault" onClick={() => setOpen(false)}>Your vault <span className="faint">→</span></a>
          <button onClick={() => (s.setOnboard(true), setOpen(false))}>Balance & setup</button>
          <button onClick={() => (settings.setOpen(true), setOpen(false))}>Settings</button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(me);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? "Copied" : "Copy address"}
          </button>
          <a href={`https://explorer.solana.com/address/${me}${CLUSTER === "mainnet" ? "" : "?cluster=devnet"}`} target="_blank" rel="noreferrer">
            View on explorer <span className="faint">↗</span>
          </a>
          <button onClick={() => (s.disconnect(), setOpen(false))} style={{ color: "var(--down)" }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          <span style={{ color: t.kind === "err" ? "var(--down)" : t.kind === "ok" ? "var(--up)" : "var(--foil-b)" }}>●</span>
          <span>
            {t.text}
            {t.link && (
              <>
                {" "}
                <a href={t.link} target="_blank" rel="noreferrer">
                  view
                </a>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ConnectModal() {
  const s = useApp();
  const [wallets, setWallets] = useState<Detected[]>(detectWallets);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => onWalletsChanged(() => setWallets(detectWallets())), []);
  if (!s.connectOpen) return null;
  const pick = async (d: Detected | "guest") => {
    setBusy(d === "guest" ? "guest" : d.name);
    await s.run("Connect", () => s.connect(d));
    setBusy(null);
    if (useApp.getState().client && !readiness(useApp.getState()).ready) s.setOnboard(true);
  };
  return (
    <div className="scrim" onClick={() => s.setConnect(false)}>
      <div className="panel modal" style={{ width: "min(420px,100%)", borderRadius: 24, position: "relative" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => s.setConnect(false)} aria-label="Close" style={{ all: "unset", cursor: "pointer", position: "absolute", top: 16, right: 18, color: "var(--text-3)", fontSize: 20, lineHeight: 1 }}>
          ×
        </button>
        <h2 className="display" style={{ margin: "2px 0 6px", fontSize: 22 }}>
          Connect a wallet
        </h2>
        <p className="muted" style={{ margin: "0 0 18px", fontSize: 14 }}>Pick how you want to sign in to BREAKROOM.</p>
        <div className="gate-list">
          {wallets.map((w) => (
            <button key={w.name} className="gate-row" onClick={() => pick(w)} disabled={!!busy}>
              <img src={w.icon} alt="" width={26} height={26} />
              {w.name}
              <span className="gate-go">{busy === w.name ? "approve in wallet…" : "Detected"}</span>
            </button>
          ))}
          {!IS_MAINNET && (
            <button className="gate-row" onClick={() => pick("guest")} disabled={!!busy}>
              <span className="gate-ico">✦</span>
              Guest wallet
              <span className="gate-go">{busy === "guest" ? "creating…" : "instant · no extension"}</span>
            </button>
          )}
          {wallets.length === 0 && (
            <a className="gate-hint" href="https://phantom.com" target="_blank" rel="noreferrer" style={{ textAlign: "center" }}>
              No wallet extension found · get Phantom ↗
            </a>
          )}
        </div>
        <p className="faint" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
          {IS_MAINNET ? "Make sure your wallet is on mainnet." : "Public test: switch your wallet to Solana devnet, or use a guest wallet that lives in this browser."}
        </p>
      </div>
    </div>
  );
}

const SESSION_LIMIT = 500_000_000n; // the session key may spend up to $500 without asking again

export function OnboardModal() {
  const s = useApp();
  const r = readiness(s);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("250");
  if (!s.onboardOpen || !s.client) return null;
  const c = s.client;
  const step = async (key: string, label: string, f: () => Promise<unknown>) => {
    setBusy(key);
    const ok = await s.run(label, async () => {
      await f();
      return true;
    });
    await s.refresh();
    setBusy(null);
    if (ok) s.toast("ok", `${label}: done`);
  };
  const wait = async (cond: () => Promise<boolean>, ms = 25_000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await cond()) return;
      await new Promise((res) => setTimeout(res, 700));
    }
  };
  const nameOk = /^[A-Za-z0-9_-]{2,20}$/.test(name);
  const rows: { key: string; title: string; detail: string; done: boolean; action?: JSX.Element }[] = [
    {
      key: "sol",
      title: "Test SOL for fees",
      detail: `Covers Solana account rent. You have ${s.sol.toFixed(3)} SOL.`,
      done: r.sol,
      action: (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn sm"
            disabled={!!busy}
            onClick={() =>
              step("sol", "Airdrop", async () => {
                const sig = await c.base.requestAirdrop(c.me, 1_000_000_000);
                await wait(async () => (await c.base.getBalance(c.me)) > 10_000_000);
                return sig;
              })
            }
          >
            {busy === "sol" ? "Airdropping…" : "Airdrop 1 SOL"}
          </button>
          <a className="btn sm ghost" href={`https://faucet.solana.com/?address=${c.me.toBase58()}`} target="_blank" rel="noreferrer" title="If the airdrop is rate-limited">
            ↗
          </a>
        </div>
      ),
    },
    {
      key: "usdc",
      title: "Test USDC",
      detail: "1,000 test USDC from the BREAKROOM faucet. Not real money.",
      done: r.usdc,
      action: (
        <button className="btn sm" disabled={!r.sol || !!busy} onClick={() => step("usdc", "Faucet", () => c.sendBase([c.faucetIx()]))}>
          {busy === "usdc" ? "Minting…" : "Get 1,000"}
        </button>
      ),
    },
    {
      key: "private",
      title: "Private balance",
      detail: "Move USDC into MagicBlock's TEE with the Private Payments API. Only you can see this balance — not other players, not BREAKROOM.",
      done: r.private,
      action: (
        <div style={{ display: "flex", gap: 6 }}>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} style={{ width: 80, height: 32 }} aria-label="Amount" />
          <button
            className="btn sm"
            disabled={!r.usdc || !!busy || !(Number(amount) > 0)}
            onClick={() =>
              step("private", "Deposit", async () => {
                await c.deposit(BigInt(Math.round(Number(amount) * 1e6)));
                await wait(async () => (await c.privateUsdc()) > 0n);
              })
            }
          >
            {busy === "private" ? "Depositing…" : "Deposit"}
          </button>
        </div>
      ),
    },
    {
      key: "profile",
      title: "Collector name",
      detail: s.profile ? `You're ${s.profile.name}.` : "Shown on spots, trades and pulls. Lives in the rollup so it updates instantly.",
      done: r.profile,
      action: (
        <div style={{ display: "flex", gap: 6 }}>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder="name" style={{ width: 120, height: 32 }} aria-label="Name" />
          <button
            className="btn sm"
            disabled={!r.sol || !nameOk || !!busy}
            onClick={() =>
              step("profile", "Profile", async () => {
                await c.sendBase(c.createProfileIxs(name));
                await c.waitInTee((await import("../chain/client")).profilePda(c.me));
              })
            }
          >
            {busy === "profile" ? "Creating…" : "Create"}
          </button>
        </div>
      ),
    },
    {
      key: "session",
      title: "One-tap trading",
      detail: `One signature lets this browser's session key spend up to ${usd(SESSION_LIMIT, 0)} of your private balance. Every buy and trade after that is instant and free.`,
      done: r.session,
      action: (
        <button className="btn sm" disabled={!r.profile || !s.hasPrivate || !!busy} onClick={() => step("session", "Session", () => c.startSession(SESSION_LIMIT))}>
          {busy === "session" ? "Signing…" : "Start session"}
        </button>
      ),
    },
  ];
  return (
    <div className="scrim" onClick={() => s.setOnboard(false)}>
      <div className="panel modal" style={{ width: "min(560px,100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">{r.ready ? "You're all set" : "Account setup · about a minute"}</div>
        <h2 className="display" style={{ margin: "6px 0 4px", fontSize: 24 }}>
          {r.ready ? "Ready to break" : "Set up your account"}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 12px" }}>
          <div style={{ flex: 1, height: 5, borderRadius: 5, background: "rgba(255,255,255,.07)", overflow: "hidden" }}>
            <div style={{ width: `${(rows.filter((x) => x.done).length / rows.length) * 100}%`, height: "100%", background: "var(--foil)", transition: "width .5s var(--ease)" }} />
          </div>
          <span className="mono faint" style={{ fontSize: 12 }}>
            {rows.filter((x) => x.done).length}/{rows.length}
          </span>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          Private balance <b className="mono">{usd(s.privateUsdc)}</b> · On Solana <b className="mono">{usd(s.baseUsdc)}</b>
        </p>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {rows.map((row, i) => (
            <div key={row.key} className="panel" style={{ padding: 14, borderRadius: 16, display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "center", opacity: row.done ? 0.62 : 1 }}>
              <div
                className="mono"
                style={{ width: 28, height: 28, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 12, background: row.done ? "rgba(79,227,161,.15)" : "rgba(255,255,255,.06)", color: row.done ? "var(--up)" : "var(--text-2)" }}
              >
                {row.done ? "✓" : i + 1}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{row.title}</div>
                <div className="faint" style={{ fontSize: 12.5 }}>
                  {row.detail}
                </div>
              </div>
              <div>{!row.done && row.action}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "space-between", flexWrap: "wrap" }}>
          {s.hasPrivate ? (
            <button
              className="btn sm ghost"
              disabled={!!busy || s.privateUsdc === 0n}
              onClick={() => step("withdraw", "Withdraw", () => c.withdraw(s.privateUsdc))}
              title="Move your whole private balance back to your wallet on Solana"
            >
              {busy === "withdraw" ? "Withdrawing…" : "Withdraw all to wallet"}
            </button>
          ) : (
            <span />
          )}
          <button className="btn sm primary" onClick={() => s.setOnboard(false)}>
            {r.ready ? "Let's go" : "Finish later"}
          </button>
        </div>
      </div>
    </div>
  );
}
