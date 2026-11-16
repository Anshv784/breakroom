// Nav, wallet connect, toasts and the "get ready" onboarding that takes a wallet from nothing to
// a live session: test USDC -> private balance (Private Payments API) -> profile -> session key.
import { useEffect, useState } from "react";
import { readiness, shortKey, usd, useApp } from "../state/store";
import { detectWallets, onWalletsChanged, type Detected } from "../state/wallet";
import { IS_MAINNET } from "../chain/config";
import { Logo } from "./Logo";

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
          <a href="#/vault" className={at === "vault" ? "on" : ""}>
            Vault
          </a>
          <a href="#/how" className={at === "how" ? "on" : ""}>
            How it's fair
          </a>
        </nav>
        <div className="nav-right">
          {!IS_MAINNET && <span className="chip faint">devnet</span>}
          {s.client ? (
            <>
              <button className="btn sm ghost" onClick={() => s.setOnboard(true)} title="Private balance inside the TEE">
                <span className="mono num">{usd(s.privateUsdc)}</span>
                {!r.ready && <span className="chip sale" style={{ height: 20 }}>Get ready</span>}
              </button>
              <button className="btn sm" onClick={() => s.disconnect()} title="Disconnect">
                {s.profile?.name || shortKey(s.client.me)}
              </button>
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
      <div className="panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Connect</div>
        <h2 className="display" style={{ margin: "6px 0 18px", fontSize: 24 }}>
          Pick a wallet
        </h2>
        <div style={{ display: "grid", gap: 8 }}>
          {wallets.map((w) => (
            <button key={w.name} className="btn lg" style={{ justifyContent: "flex-start", borderRadius: 14 }} onClick={() => pick(w)} disabled={!!busy}>
              <img src={w.icon} alt="" width={24} height={24} style={{ borderRadius: 6 }} />
              {w.name}
              {busy === w.name && <span className="faint" style={{ marginLeft: "auto" }}>approve in wallet…</span>}
            </button>
          ))}
          {wallets.length === 0 && <p className="muted" style={{ margin: 0 }}>No Solana wallet found in this browser.</p>}
          {!IS_MAINNET && (
            <button className="btn lg ghost" style={{ justifyContent: "flex-start", borderRadius: 14 }} onClick={() => pick("guest")} disabled={!!busy}>
              <span style={{ width: 24, textAlign: "center" }}>✦</span>
              Guest wallet <span className="faint" style={{ marginLeft: "auto", fontSize: 12 }}>devnet, kept in this browser</span>
            </button>
          )}
        </div>
        <p className="faint" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
          Make sure your wallet is set to {IS_MAINNET ? "mainnet" : "devnet"}.
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
      title: "A little devnet SOL",
      detail: `For account rent on Solana. You have ${s.sol.toFixed(3)} SOL.`,
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
      detail: "1,000 devnet USDC from BREAKROOM's on-chain faucet.",
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
      title: "Trade without popups",
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
        <div className="eyebrow">{r.ready ? "You're set" : "Get ready to break"}</div>
        <h2 className="display" style={{ margin: "6px 0 4px", fontSize: 24 }}>
          {r.ready ? "Ready" : "Five quick steps"}
        </h2>
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
            {r.ready ? "Let's go" : "Later"}
          </button>
        </div>
      </div>
    </div>
  );
}
