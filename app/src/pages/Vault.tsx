// Your money and your cards: private balance, spots you hold, cards waiting for delivery, and the
// collection itself (click a card to inspect the graded slab in 3D).
import { Avatar } from "../ui/Avatar";
import { PfpModal } from "../ui/PfpModal";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { readiness, shortKey, usd, useApp } from "../state/store";
import { readerClient, useBreakList } from "../lib/useBreaks";
import type { CardInfo, ReceiptState } from "../chain/layout";
import { ST } from "../chain/layout";
import { cardImage, faceOf, TIER_NAMES } from "../lib/art";
import { oddsFor } from "../lib/breakmath";
import { shareCard } from "../lib/share";

import { ConnectGate } from "../ui/ConnectGate";
import { ActivityList, Empty, HistoryList, HostingList, SpotsList, useVaultData } from "./VaultSections";
import "./vault.css";

const SlabViewer = lazy(() => import("../scene/SlabViewer"));

export default function Vault() {
  const s = useApp();
  const c = s.client;
  const r = readiness(s);
  const { list } = useBreakList(8_000);
  const [cards, setCards] = useState<CardInfo[] | null>(null);
  const [open, setOpen] = useState<CardInfo | null>(null);
  const [owed, setOwed] = useState<{ id: bigint; title: string; receipt: ReceiptState; idx: number[] }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!c) return;
    c.walletCards().then(setCards).catch(() => setCards([]));
  }, [c?.me.toBase58()]);

  // settled breaks with cards still sitting in the vault for me
  useEffect(() => {
    if (!c) return;
    let alive = true;
    (async () => {
      const ended = list.filter((b) => b.status >= ST.ENDED && b.spotOwner.some((o) => o?.equals(c.me)));
      const out = [];
      for (const b of ended) {
        const rc = await readerClient().fetchReceipt(b.breakId);
        if (!rc?.settled) continue;
        const idx = rc.recipient.map((x, i) => (x?.equals(c.me) && (rc.claimed & (1n << BigInt(i))) === 0n ? i : -1)).filter((i) => i >= 0);
        if (idx.length) out.push({ id: b.breakId, title: b.title, receipt: rc, idx });
      }
      if (alive) setOwed(out);
    })();
    return () => {
      alive = false;
    };
  }, [list.length, c?.me.toBase58()]);


  const data = useVaultData(list, c?.me);
  const [tab, setTab] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pfp, setPfp] = useState(false);

  if (!c)
    return (
      <ConnectGate title="Your vault" sub="Connect a wallet to see your balance, spots and cards." />
    );

  const deliver = async (id: bigint, rc: ReceiptState, idx: number[]) => {
    setBusy(true);
    const ok = await s.run("Delivery", async () => {
      for (let i = 0; i < idx.length; i += 4) await c.sendBase(idx.slice(i, i + 4).map((k) => c.claimIx(id, k, rc.cards[k], rc.recipient[k]!)));
      return true;
    });
    setBusy(false);
    if (ok) {
      s.toast("ok", `${idx.length} card${idx.length === 1 ? "" : "s"} delivered to your wallet`);
      setOwed(owed.filter((o) => o.id !== id));
      c.walletCards().then(setCards);
    }
  };

  const total = (cards ?? []).reduce((a, x) => a + x.value, 0n);
  const name = s.profile?.name ?? shortKey(c.me);
  const lockedValue = (data?.locked ?? []).reduce((a, b) => a + b.boxValue, 0n);
  const pnl = data?.mine ? data.mine.profit : 0;
  const best = data?.mine?.best;
  const tabs = [
    { key: "spots", label: "Open spots", n: data?.spots.length ?? 0 },
    { key: "cards", label: "Collection", n: cards?.length ?? 0 },
    { key: "hosting", label: "Hosting", n: data?.hosted.length ?? 0 },
    { key: "history", label: "History", n: data?.history.length ?? 0 },
    { key: "activity", label: "Activity", n: data?.activity.length ?? 0 },
  ];
  const active = tab ?? (data && data.spots.length > 0 ? "spots" : "cards");
  return (
    <div className="wrap vault">
      <header className="v-head-block">
        <button className="v-avatar" onClick={() => setPfp(true)} title="Change profile picture">
          <Avatar k={c.me} size={76} />
          <span className="v-avatar-edit">Edit</span>
        </button>
        {pfp && <PfpModal onClose={() => setPfp(false)} />}
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Your vault</div>
          <h1 className="display">{name}</h1>
          <div className="v-meta">
            <button
              className="v-addr mono"
              onClick={() => {
                navigator.clipboard?.writeText(c.me.toBase58());
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              title="Copy address"
            >
              {shortKey(c.me)} {copied ? "· copied" : "⧉"}
            </button>
            <a href={`https://explorer.solana.com/address/${c.me.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer">
              Explorer ↗
            </a>
            <span>{data?.history.length ?? 0} breaks finished</span>
            <span>{data?.hosted.length ?? 0} hosted</span>
            {best && (
              <span>
                best pull <b className={`tier-${data?.myPulls.find((p) => p.card === best.card && p.breakId === best.breakId)?.tier ?? 0}`}>{usd(best.value, 0)}</b>
              </span>
            )}
          </div>
        </div>
        {!r.ready && (
          <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => s.setOnboard(true)}>
            Finish setup
          </button>
        )}
      </header>

      <div className="v-stats">
        <div className="panel v-stat">
          <div className="eyebrow">Private balance</div>
          <b className="mono">{s.locked ? "••••" : usd(s.privateUsdc)}</b>
          <span className="faint">Inside MagicBlock's TEE. Only you can read it.</span>
          <button className="btn sm" onClick={() => (s.locked ? s.unlock() : s.setOnboard(true))}>{s.locked ? "Show balance" : "Deposit / withdraw"}</button>
        </div>
        <div className="panel v-stat">
          <div className="eyebrow">Wallet on Solana</div>
          <b className="mono">{usd(s.baseUsdc)}</b>
          <span className="faint">{s.sol.toFixed(3)} SOL for fees</span>
        </div>
        <div className="panel v-stat">
          <div className="eyebrow">Collection</div>
          <b className="mono">{usd(total, 0)}</b>
          <span className="faint">
            {cards?.length ?? 0} card{cards?.length === 1 ? "" : "s"} in your wallet
            {lockedValue > 0n ? ` · ${usd(lockedValue, 0)} locked in your breaks` : ""}
          </span>
        </div>
        <div className="panel v-stat">
          <div className="eyebrow">All-time result</div>
          <b className={`mono ${pnl >= 0 ? "up" : "down"}`}>
            {pnl >= 0 ? "+" : "−"}
            {usd(Math.abs(pnl), 0)}
          </b>
          <span className="faint">
            pulled {usd(data?.mine?.pulled ?? 0, 0)} · sold {usd(data?.mine?.earned ?? 0, 0)} · spent {usd(data?.mine?.spent ?? 0, 0)}
          </span>
        </div>
      </div>

      {owed.length > 0 && (
        <section className="v-owed">
          {owed.map((o) => (
            <div key={o.id.toString()} className="panel v-owed-row">
              <div>
                <div className="eyebrow" style={{ color: "var(--up)" }}>Ready to deliver</div>
                <b>{o.title}</b>
                <div className="faint" style={{ fontSize: 13 }}>
                  {o.idx.length} card{o.idx.length === 1 ? "" : "s"} settled to you on Solana, waiting in the break's vault
                </div>
              </div>
              <button className="btn primary" disabled={busy} onClick={() => deliver(o.id, o.receipt, o.idx)}>
                Send to my wallet
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="v-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={active === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
            {t.label}
            <span className="mono">{t.n}</span>
          </button>
        ))}
      </div>

      {active === "spots" && data && <SpotsList spots={data.spots} />}
      {active === "hosting" && data && <HostingList hosted={data.hosted} />}
      {active === "history" && data && <HistoryList history={data.history} />}
      {active === "activity" && data && <ActivityList activity={data.activity} me={c.me} />}
      {active === "cards" &&
        (cards === null ? (
          <div className="skeleton" style={{ height: 240, borderRadius: 18 }} />
        ) : cards.length === 0 ? (
          <Empty
            title="No cards in your wallet"
            body={
              lockedValue > 0n
                ? `Your cards are locked in ${data!.locked.length === 1 ? "a break" : "breaks"} you're hosting (${usd(lockedValue, 0)}). They go to spot holders when the break ends; unsold spots come back to you.`
                : "Pull some in a break, or grab 12 free Genesis test cards in the host studio."
            }
            cta={lockedValue > 0n ? ["See your breaks", () => setTab("hosting")] : ["Find a break", "#/breaks"]}
          />
        ) : (
          <div className="v-cards">
            {[...cards].sort((a, b) => Number(b.value - a.value)).map((x) => (
              <button key={x.mint.toBase58()} className="v-card" onClick={() => setOpen(x)}>
                <img src={cardImage(faceOf(x))} alt={x.name} />
                <span className="v-card-meta">
                  <span className={`tier-${x.tier} mono`}>{TIER_NAMES[x.tier]}</span>
                  <span className="mono">{usd(x.value, 0)}</span>
                </span>
                <span className="v-card-name">{x.name}</span>
              </button>
            ))}
          </div>
        ))}

      {open && (
        <div className="scrim" onClick={() => setOpen(null)}>
          <div className="panel" style={{ width: "min(860px,100%)", height: "min(620px,90vh)", display: "grid", gridTemplateColumns: "1.3fr 1fr", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: "#07060a" }}>
              <Suspense fallback={<div className="skeleton" style={{ height: "100%" }} />}>
                <SlabViewer card={open} />
              </Suspense>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="eyebrow">{open.set} · cert {open.cert.toString()}</div>
              <h2 className="display" style={{ margin: 0, fontSize: 26 }}>{open.name}</h2>
              <div className={`tier-${open.tier} mono`}>{TIER_NAMES[open.tier]} · grade {(open.grade / 10).toFixed(1)}</div>
              <div className="mono" style={{ fontSize: 30, fontWeight: 600 }}>{usd(open.value)}</div>
              <div className="faint" style={{ fontSize: 13 }}>Appraised value from the BREAKROOM desk. Drag to turn the slab.</div>
              <button
                className="btn primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const ok = await s.run("Buyback", async () => {
                    await c.sendBase([c.sellBackIx(open.mint)]);
                    return true;
                  });
                  setBusy(false);
                  if (ok) {
                    s.toast("ok", `Sold back for ${usd((open.value * 8500n) / 10000n)} — paid to your wallet`);
                    setOpen(null);
                    c.walletCards().then(setCards);
                    s.refresh();
                  }
                }}
              >
                Instant buyback · {usd((open.value * 8500n) / 10000n)}
              </button>
              <span className="faint" style={{ fontSize: 12 }}>85% of appraised value, paid in USDC on Solana in one transaction.</span>
              <button className="btn ghost sm" style={{ alignSelf: "start" }} onClick={() => shareCard(open, "my BREAKROOM vault", 0n)}>Share this card</button>
              <a className="btn ghost sm" style={{ alignSelf: "start", marginTop: "auto" }} href={`https://explorer.solana.com/address/${open.mint.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer">
                View NFT on explorer ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
