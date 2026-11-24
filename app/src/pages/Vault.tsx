// Your money and your cards: private balance, spots you hold, cards waiting for delivery, and the
// collection itself (click a card to inspect the graded slab in 3D).
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { readiness, shortKey, usd, useApp } from "../state/store";
import { readerClient, useBreakList } from "../lib/useBreaks";
import type { CardInfo, ReceiptState } from "../chain/layout";
import { ST } from "../chain/layout";
import { cardImage, faceOf, TIER_NAMES } from "../lib/art";
import { oddsFor } from "../lib/breakmath";
import { shareCard } from "../lib/share";

import { Intro } from "../ui/Intro";

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

  const mySpots = useMemo(() => {
    if (!c) return [];
    return list
      .filter((b) => b.status >= ST.SELLING && b.status <= ST.LIVE)
      .flatMap((b) => {
        const odds = oddsFor(b);
        return b.spotOwner.map((o, i) => (o?.equals(c.me) ? { b, i, ev: odds[i].ev, chase: odds[i].chaseOdds } : null)).filter(Boolean) as { b: typeof list[number]; i: number; ev: number; chase: number }[];
      });
  }, [list, c?.me.toBase58()]);

  if (!c)
    return (
      <Intro
        eyebrow="Your vault"
        title="Everything you pulled, in one place."
        sub="Your private balance, the spots you hold in running breaks, cards waiting for delivery and your whole collection, each card viewable as a graded slab in 3D."
        action={
          <>
            <button className="btn primary lg" onClick={() => s.setConnect(true)}>Connect your wallet</button>
            <a href="#/breaks" className="btn lg ghost">Browse breaks</a>
          </>
        }
        note="Public test: balances are test USDC and cards are Genesis test cards."
        points={[
          { title: "A balance only you can read", body: "Your USDC sits in a private balance inside MagicBlock's TEE. Deposit or withdraw to your wallet any time." },
          { title: "Spots with live odds", body: "Every spot you hold shows its chance at the chase and its expected value, updated with each card." },
          { title: "Cards you actually own", body: "Pulls are delivered to your wallet on Solana. Keep them, share the pull, or sell one back instantly for 85% of its appraisal." },
        ]}
      />
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
  return (
    <div className="wrap" style={{ padding: "40px 24px 80px" }}>
      <div className="eyebrow">Vault</div>
      <h1 className="display" style={{ fontSize: 34, margin: "8px 0 24px" }}>{s.profile?.name ?? shortKey(c.me)}</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        <div className="panel" style={{ padding: 20 }}>
          <div className="eyebrow">Private balance</div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 600, margin: "6px 0" }}>{usd(s.privateUsdc)}</div>
          <div className="faint" style={{ fontSize: 12 }}>Inside MagicBlock's TEE. Only you can read it.</div>
          <button className="btn sm" style={{ marginTop: 12 }} onClick={() => s.setOnboard(true)}>Deposit / withdraw</button>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <div className="eyebrow">Wallet</div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 600, margin: "6px 0" }}>{usd(s.baseUsdc)}</div>
          <div className="faint" style={{ fontSize: 12 }}>{s.sol.toFixed(3)} SOL on Solana</div>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <div className="eyebrow">Collection</div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 600, margin: "6px 0" }}>{usd(total, 0)}</div>
          <div className="faint" style={{ fontSize: 12 }}>{cards?.length ?? 0} appraised cards</div>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <div className="eyebrow">Trading</div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 600, margin: "6px 0" }}>{s.profile ? s.profile.spotsBought + s.profile.trades : 0}</div>
          <div className="faint" style={{ fontSize: 12 }}>
            spent {usd(s.profile?.spent ?? 0n, 0)} · earned {usd(s.profile?.earned ?? 0n, 0)}
          </div>
          {!r.ready && <button className="btn sm primary" style={{ marginTop: 12 }} onClick={() => s.setOnboard(true)}>Get ready</button>}
        </div>
      </div>

      {owed.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 className="display" style={{ fontSize: 22 }}>Waiting for delivery</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {owed.map((o) => (
              <div key={o.id.toString()} className="panel" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <b>{o.title}</b>
                  <div className="faint" style={{ fontSize: 13 }}>{o.idx.length} card{o.idx.length === 1 ? "" : "s"} settled to you on Solana, still in the vault</div>
                </div>
                <button className="btn primary" disabled={busy} onClick={() => deliver(o.id, o.receipt, o.idx)}>Send to my wallet</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {mySpots.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 className="display" style={{ fontSize: 22 }}>Your spots</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {mySpots.map(({ b, i, ev, chase }) => (
              <a key={`${b.breakId}-${i}`} href={`#/break/${b.breakId}`} className="panel" style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 18, alignItems: "center" }}>
                <span>
                  <b>{b.title}</b> <span className="faint">spot #{i + 1}</span>
                </span>
                <span className="mono">paid {usd(b.spotCost[i])}</span>
                <span className={`mono ${ev * 1e6 >= Number(b.spotCost[i]) ? "up" : "down"}`}>worth {usd(ev)}</span>
                <span className="mono faint">chase {chase ? `${(chase * 100).toFixed(0)}%` : "—"}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 className="display" style={{ fontSize: 22 }}>Your cards</h2>
        {cards === null ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : cards.length === 0 ? (
          <p className="faint">No cards yet. Win some in a break, or grab a demo box in the host studio.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 16 }}>
            {[...cards].sort((a, b) => Number(b.value - a.value)).map((x) => (
              <button key={x.mint.toBase58()} onClick={() => setOpen(x)} style={{ all: "unset", cursor: "pointer", display: "grid", gap: 6 }}>
                <img src={cardImage(faceOf(x))} alt={x.name} style={{ width: "100%", borderRadius: 8, boxShadow: "0 16px 40px -18px rgba(0,0,0,.9)" }} />
                <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span className={`tier-${x.tier} mono`}>{TIER_NAMES[x.tier]}</span>
                  <span className="mono">{usd(x.value, 0)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

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
