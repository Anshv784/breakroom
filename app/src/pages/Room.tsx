// The break room: the live table plus the spot market.
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useBreak, useCards, useNames } from "../lib/useBreaks";
import { readiness, usd, useApp } from "../state/store";
import { ST, TRADE_KIND, type BreakState, type ReceiptState } from "../chain/layout";
import { pct, spotOdds, chaseIndex } from "../lib/odds";
import { cardImage, faceOf, TIER_NAMES, TIER_COLORS } from "../lib/art";
import { StatusChip } from "../ui/BreakCard";
import { sfx } from "../lib/sfx";
import { readerClient } from "../lib/useBreaks";
import "./room.css";

const Stage = lazy(() => import("../scene/Stage"));

function useNow(ms = 250) {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

export default function Room({ id }: { id: bigint }) {
  const { b, error } = useBreak(id);
  const cards = useCards(b?.cards);
  const allKeys = useMemo(() => (b ? [b.host, ...b.spotOwner, ...b.bidder, ...b.trades.flatMap((t) => [t.buyer, t.seller])] : []), [b?.nTrades, b?.spotOwner.map((k) => k?.toBase58()).join()]);
  const names = useNames(allKeys);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<"market" | "box" | "tape">("market");
  const [pull, setPull] = useState<{ card: number; spot: number; at: number } | null>(null);
  const [muted, setMuted] = useState(sfx.muted);
  const me = useApp((s) => s.client?.me.toBase58());

  if (error) return <div className="wrap" style={{ padding: 64 }}><div className="panel" style={{ padding: 32 }}>{error}. <a href="#/breaks" className="muted">Back to breaks</a></div></div>;
  if (!b) return <div className="room"><div className="room-stage skeleton" style={{ borderRadius: 0 }} /><aside className="room-side" /></div>;

  const pulled = pull && cards[pull.card];
  return (
    <div className="room">
      <div className="room-stage">
        <Suspense fallback={<div className="skeleton" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />}>
          <Stage
            b={b}
            cards={cards}
            names={names}
            selected={selected}
            onSelect={(s) => {
              setSelected(s);
              setTab("market");
            }}
            me={me}
            onPull={(p) => setPull({ card: p.card, spot: p.spot, at: Date.now() })}
          />
        </Suspense>
        <RoomHeader b={b} names={names} />
        <RevealClock b={b} />
        {pulled && Date.now() - pull!.at < 3200 && pulled.tier >= 2 && (
          <div className="pull-banner" key={pull!.at} style={{ ["--tc" as any]: TIER_COLORS[pulled.tier] }}>
            <div className="mono" style={{ color: "var(--tc)", fontSize: 12, letterSpacing: ".2em" }}>
              {TIER_NAMES[pulled.tier]} PULL
            </div>
            <div className="display" style={{ fontSize: 30 }}>{pulled.name}</div>
            <div className="muted">
              {usd(pulled.value, 0)} · spot #{pull!.spot + 1} · {names(b.spotOwner[pull!.spot])}
            </div>
          </div>
        )}
        <button className="btn sm ghost mute" onClick={() => { sfx.setMuted(!muted); setMuted(!muted); }} title={muted ? "Sound off" : "Sound on"}>
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      <aside className="room-side">
        <div className="side-tabs">
          {(["market", "box", "tape"] as const).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t === "market" ? "Spots" : t === "box" ? "The box" : "Activity"}
            </button>
          ))}
        </div>
        <div className="side-body">
          {tab === "market" && <Market b={b} names={names} selected={selected} setSelected={setSelected} cards={cards} />}
          {tab === "box" && <BoxView b={b} cards={cards} names={names} />}
          {tab === "tape" && <Tape b={b} names={names} />}
        </div>
        <Controls b={b} />
      </aside>
    </div>
  );
}

function RoomHeader({ b, names }: { b: BreakState; names: (k: any) => string }) {
  return (
    <div className="room-head">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <StatusChip status={b.status} />
        {b.seedSource === 1 && <span className="chip" title="Shuffle seeded by MagicBlock VRF">VRF seed</span>}
        {b.seedSource === 2 && <span className="chip" style={{ color: "var(--warn)" }} title="VRF was late; the TEE seeded the shuffle">TEE seed</span>}
        <a className="chip" href={`#/verify/${b.breakId}`}>Verify ↗</a>
      </div>
      <h1 className="display">{b.title || "Untitled break"}</h1>
      <div className="muted" style={{ fontSize: 13 }}>
        hosted by <b style={{ color: "var(--text)" }}>{names(b.host)}</b> · box {usd(b.boxValue, 0)} · {b.nSpots} spots × {b.perSpot} cards · {usd(b.spotPrice, 0)} a spot
      </div>
    </div>
  );
}

function RevealClock({ b }: { b: BreakState }) {
  const now = useNow(200);
  if (b.status !== ST.LIVE) {
    const label = b.status === ST.SELLING ? `${b.sold}/${b.nSpots} spots sold` : b.status === ST.SHUFFLING ? "VRF shuffling inside the TEE…" : b.status >= ST.ENDED ? "All cards out" : "";
    return label ? <div className="room-clock mono">{label}</div> : null;
  }
  const left = Math.max(0, b.nextRevealMs - now);
  return (
    <div className="room-clock">
      <div className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>CARDS OUT</div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>
        {b.cursor}<span className="faint">/{b.nCards}</span>
      </div>
      <div className="clock-bar"><div style={{ width: `${Math.min(100, (1 - left / (b.revealMs + 1000)) * 100)}%` }} /></div>
    </div>
  );
}

// ----------------------------------------------------------------- market

function Market({ b, names, selected, setSelected, cards }: { b: BreakState; names: (k: any) => string; selected: number | null; setSelected: (s: number | null) => void; cards: any[] }) {
  const odds = useMemo(() => spotOdds(b), [b.revealed.join(), b.status]);
  const me = useApp((s) => s.client?.me.toBase58());
  const chase = cards[chaseIndex(b)];
  return (
    <div className="market">
      {chase && (
        <div className="chase-row">
          <img src={cardImage(faceOf(chase))} alt="" />
          <div>
            <div className="eyebrow">Chase card</div>
            <div style={{ fontWeight: 700 }}>{chase.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              <span className={`tier-${chase.tier}`}>{TIER_NAMES[chase.tier]}</span> · grade {(chase.grade / 10).toFixed(1)} · {usd(chase.value, 0)}
            </div>
          </div>
          <div className="mono" style={{ marginLeft: "auto", textAlign: "right", fontSize: 12 }}>
            {b.revealed.includes(chaseIndex(b)) ? <span className="up">PULLED</span> : <span className="muted">still in the box</span>}
          </div>
        </div>
      )}
      {selected !== null && <SpotDetail b={b} s={selected} names={names} odds={odds[selected]} onClose={() => setSelected(null)} />}
      <div className="spot-table">
        <div className="spot-row head mono">
          <span>#</span>
          <span>Owner</span>
          <span title="Chance this spot holds the chase card">Chase</span>
          <span title="Expected value from what's still sealed">Value</span>
          <span>Ask / Bid</span>
        </div>
        {odds.map((o) => {
          const s = o.spot;
          const owner = b.spotOwner[s];
          const mine = owner?.toBase58() === me;
          const evDelta = o.ev - Number(b.spotPrice) / 1e6;
          return (
            <button key={s} className={`spot-row ${selected === s ? "sel" : ""} ${mine ? "mine" : ""}`} onClick={() => setSelected(selected === s ? null : s)}>
              <span className="mono faint">{s + 1}</span>
              <span className="owner">
                {owner ? names(owner) : <span className="up">open</span>}
                {o.hasChase && <span title="Pulled the chase" style={{ marginLeft: 6, color: "var(--tier-4)" }}>★</span>}
              </span>
              <span className="mono">{o.sealed === 0 ? <span className="faint">opened</span> : pct(o.chaseOdds)}</span>
              <span className={`mono ${evDelta >= 0 ? "up" : "down"}`}>{usd(o.ev, 0)}</span>
              <span className="mono">
                {b.ask[s] > 0n ? <span className="up">{usd(b.ask[s], 0)}</span> : <span className="faint">—</span>}
                <span className="faint"> / </span>
                {b.bid[s] > 0n ? <span>{usd(b.bid[s], 0)}</span> : <span className="faint">—</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpotDetail({ b, s, names, odds, onClose }: { b: BreakState; s: number; names: (k: any) => string; odds: ReturnType<typeof spotOdds>[number]; onClose: () => void }) {
  const st = useApp();
  const r = readiness(st);
  const c = st.client;
  const me = c?.me.toBase58();
  const owner = b.spotOwner[s];
  const mine = !!owner && owner.toBase58() === me;
  const locked = b.status === ST.LIVE ? odds.sealed < b.perSpot : b.status >= ST.ENDED;
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const now = useNow(500);
  const reservedForOther = !!b.reserved[s] && b.reserved[s]!.toBase58() !== me && b.reserveUntil[s] * 1000 > now;
  const reservedForMe = !!b.reserved[s] && b.reserved[s]!.toBase58() === me && b.reserveUntil[s] * 1000 > now;
  const act = async (label: string, f: () => Promise<unknown>) => {
    if (!c) return st.setConnect(true);
    if (!r.ready) return st.setOnboard(true);
    setBusy(true);
    const ok = await st.run(label, async () => {
      await f();
      return true;
    });
    setBusy(false);
    if (ok) {
      st.toast("ok", label);
      st.refresh();
    }
  };
  // an accepted offer: our session fills it straight away
  const filled = useRef(false);
  useEffect(() => {
    if (reservedForMe && !filled.current && c && r.ready) {
      filled.current = true;
      act("Offer accepted — bought", () => c.sendSession(c.buyListedIxs(b, s)));
    }
  }, [reservedForMe]);
  const usdIn = (v: string) => BigInt(Math.round(Number(v || 0) * 1e6));
  return (
    <div className="panel spot-detail">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">Spot #{s + 1}</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{owner ? names(owner) : "Open spot"}{mine && <span className="up" style={{ fontSize: 13 }}> · yours</span>}</div>
        </div>
        <button className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="kv">
        <div><span>Expected value</span><b className="mono">{usd(odds.ev)}</b></div>
        <div><span>Chase odds</span><b className="mono">{pct(odds.chaseOdds)}</b></div>
        <div><span>Paid</span><b className="mono">{owner ? usd(b.spotCost[s]) : "—"}</b></div>
        <div><span>Last trade</span><b className="mono">{b.lastPrice[s] > 0n ? usd(b.lastPrice[s]) : "—"}</b></div>
      </div>
      {locked && <p className="faint" style={{ margin: "10px 0 0", fontSize: 13 }}>{odds.sealed === 0 ? "Opened." : "This pack is opening — trading is closed for it."}</p>}
      {!locked && b.status === ST.SELLING && !owner && (
        <button className="btn primary lg" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={() => act(`Bought spot #${s + 1}`, () => c!.sendSession(c!.buySpotIxs(b, s)))}>
          {busy ? "Buying…" : `Buy spot · ${usd(b.spotPrice)}`}
        </button>
      )}
      {!locked && owner && !mine && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {b.ask[s] > 0n && (
            <button className="btn up lg" disabled={busy || reservedForOther} onClick={() => act(`Bought spot #${s + 1}`, () => c!.sendSession(c!.buyListedIxs(b, s)))}>
              {reservedForOther ? "Reserved for an accepted offer" : `Buy now · ${usd(b.ask[s])}`}
            </button>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder={b.bid[s] > 0n ? `beat ${usd(b.bid[s])}` : "your offer, USD"} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" />
            <button className="btn" disabled={busy || !(Number(price) >= 1)} onClick={() => act("Offer placed", () => c!.sendSession([c!.makeOfferIx(b.breakId, s, usdIn(price))]))}>
              Offer
            </button>
          </div>
          {b.bidder[s]?.toBase58() === me && (
            <button className="btn sm ghost" disabled={busy} onClick={() => act("Offer withdrawn", () => c!.sendSession([c!.makeOfferIx(b.breakId, s, 0n)]))}>
              Withdraw my {usd(b.bid[s])} offer
            </button>
          )}
        </div>
      )}
      {!locked && mine && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {b.bid[s] > 0n && (
            <button className="btn up lg" disabled={busy} onClick={() => act("Offer accepted", () => c!.sendSession([c!.acceptOfferIx(b.breakId, s, b.bid[s])]))}>
              Accept {usd(b.bid[s])} from {names(b.bidder[s])}
            </button>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder={b.ask[s] > 0n ? `listed at ${usd(b.ask[s])}` : "list price, USD"} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" />
            <button className="btn" disabled={busy || !(Number(price) >= 1)} onClick={() => act("Listed", () => c!.sendSession([c!.listSpotIx(b.breakId, s, usdIn(price))]))}>
              List
            </button>
          </div>
          {b.ask[s] > 0n && (
            <button className="btn sm ghost" disabled={busy} onClick={() => act("Delisted", () => c!.sendSession([c!.listSpotIx(b.breakId, s, 0n)]))}>
              Take off the market
            </button>
          )}
          <p className="faint" style={{ fontSize: 12, margin: 0 }}>Sales pay you instantly into your private balance (2% fee).</p>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- box + tape

function BoxView({ b, cards, names }: { b: BreakState; cards: any[]; names: (k: any) => string }) {
  const where = new Map<number, number>();
  b.revealed.forEach((c, pos) => c >= 0 && where.set(c, pos));
  const order = Array.from({ length: b.nCards }, (_, i) => i).sort((x, y) => Number(b.cardValue[y] - b.cardValue[x]));
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Every card below was locked in the vault and hashed into the box commitment before the first spot sold. Values come from the appraisal desk.
      </p>
      <div className="box-grid">
        {order.map((i) => {
          const c = cards[i];
          const pos = where.get(i);
          return (
            <div key={i} className={`box-card ${pos !== undefined ? "out" : ""}`}>
              {c ? <img src={cardImage(faceOf(c))} alt={c.name} /> : <div className="skeleton" style={{ aspectRatio: "512/716" }} />}
              <div className="mono" style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: TIER_COLORS[b.cardTier[i]] }}>{usd(b.cardValue[i], 0)}</span>
                <span className="faint">{pos !== undefined ? `#${Math.floor(pos / b.perSpot) + 1}` : "sealed"}</span>
              </div>
              {pos !== undefined && <div className="faint" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>→ {names(b.spotOwner[Math.floor(pos / b.perSpot)])}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tape({ b, names }: { b: BreakState; names: (k: any) => string }) {
  if (b.trades.length === 0) return <p className="faint">No trades yet.</p>;
  return (
    <div className="tape">
      {b.trades.map((t, i) => (
        <div key={i} className="tape-row">
          <span className="mono faint">{new Date(t.ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          <span>
            <b>{names(t.buyer)}</b> <span className="muted">{t.kind === 3 ? "keeps unsold" : t.kind === 0 ? "bought" : "bought from"}</span>{" "}
            {t.kind === 1 || t.kind === 2 ? <b>{names(t.seller)}</b> : null} <span className="muted">spot #{t.spot + 1}</span>
          </span>
          <span className="mono">{t.kind === 3 ? "—" : usd(t.price)}</span>
          <span className="faint" style={{ fontSize: 11 }}>{TRADE_KIND[t.kind]}</span>
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- host / anyone controls

function Controls({ b }: { b: BreakState }) {
  const st = useApp();
  const c = st.client;
  const r = readiness(st);
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const isHost = !!c && c.me.equals(b.host);
  useEffect(() => {
    if (b.status < ST.ENDED) return;
    let alive = true;
    const f = () => readerClient().fetchReceipt(b.breakId).then((x) => alive && setReceipt(x));
    f();
    const t = setInterval(f, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [b.status, b.breakId]);
  const act = async (label: string, f: () => Promise<unknown>) => {
    if (!c) return st.setConnect(true);
    setBusy(true);
    const ok = await st.run(label, async () => {
      await f();
      return true;
    });
    setBusy(false);
    if (ok) st.toast("ok", label);
  };
  const soldOutWait = b.status === ST.SELLING && b.sold === b.nSpots && now / 1000 > b.soldOutAt + 300;
  const vrfLate = b.status === ST.SHUFFLING && now / 1000 > b.shuffleRequestedAt + 45;
  const revealLate = b.status === ST.LIVE && now > b.nextRevealMs + 5000;
  const mine = receipt?.settled && c ? receipt.recipient.map((x, i) => (x?.equals(c.me) ? i : -1)).filter((i) => i >= 0) : [];
  const undelivered = receipt?.settled ? receipt.recipient.map((_, i) => i).filter((i) => (receipt.claimed & (1n << BigInt(i))) === 0n) : [];
  const myUndelivered = mine.filter((i) => undelivered.includes(i));
  const deliver = (idx: number[]) =>
    act(`Delivered ${idx.length} card${idx.length === 1 ? "" : "s"}`, async () => {
      for (let i = 0; i < idx.length; i += 4) await c!.sendBase(idx.slice(i, i + 4).map((k) => c!.claimIx(b.breakId, k, receipt!.cards[k], receipt!.recipient[k]!)));
    });
  let body: JSX.Element | null = null;
  if (b.status === ST.SELLING && isHost)
    body = (
      <button className="btn primary lg" style={{ width: "100%" }} disabled={busy || b.sold === 0 || !r.ready} onClick={() => act("Break started — VRF shuffling", () => c!.sendSession([c!.startBreakIx(b.breakId)]))}>
        {b.sold === 0 ? "Start once a spot sells" : `Start the break (${b.nSpots - b.sold} unsold → you)`}
      </button>
    );
  else if (soldOutWait)
    body = <button className="btn primary lg" style={{ width: "100%" }} disabled={busy || !r.ready} onClick={() => act("Break started", () => c!.sendSession([c!.startBreakIx(b.breakId)]))}>Sold out — start it</button>;
  else if (vrfLate)
    body = <button className="btn lg" style={{ width: "100%" }} disabled={busy || !c} onClick={() => act("Seeded inside the TEE", () => c!.sendSession([c!.fallbackShuffleIx(b.breakId)]))}>VRF is late — seed inside the TEE</button>;
  else if (revealLate)
    body = <button className="btn lg" style={{ width: "100%" }} disabled={busy || !c} onClick={() => act("Next card", () => c!.sendSession([c!.revealIx(b.breakId)]))}>Crank is slow — reveal next card</button>;
  else if (b.status === ST.ENDED && !receipt?.settled) {
    const stuck = now / 1000 > b.endedAt + 60;
    body = (
      <div style={{ display: "grid", gap: 8 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          <span className="chip live" style={{ marginRight: 8 }}><span className="dot" />settling</span>
          The crank unsealed the Deck and is committing the result to Solana.
        </div>
        {stuck && (
          <button className="btn" disabled={busy} onClick={() => act("Settlement re-sent", async () => {
            const k = c ?? readerClient();
            if (b.settleSent) await k.sendSession([k.rearmSettleIx(b.breakId)]);
            await k.sendSession([k.finishIx(b.breakId)]);
          })}>
            Re-send settlement
          </button>
        )}
      </div>
    );
  }
  else if (receipt?.settled)
    body = (
      <div style={{ display: "grid", gap: 8 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Settled on Solana by Magic Action. {undelivered.length === 0 ? "Every card delivered." : `${undelivered.length} card${undelivered.length === 1 ? "" : "s"} waiting.`}
        </div>
        {myUndelivered.length > 0 && <button className="btn primary" disabled={busy} onClick={() => deliver(myUndelivered)}>Send my {myUndelivered.length} card{myUndelivered.length === 1 ? "" : "s"} to my wallet</button>}
        {undelivered.length > 0 && myUndelivered.length === 0 && <button className="btn" disabled={busy || !c} onClick={() => deliver(undelivered)}>Deliver everyone's cards</button>}
        <a href={`#/verify/${b.breakId}`} className="btn ghost">Verify this break</a>
      </div>
    );
  if (!body && !(c && !r.ready)) return null;
  return (
    <div className="side-foot">
      {c && !r.ready && b.status < ST.ENDED && (
        <button className="btn" style={{ width: "100%", marginBottom: body ? 8 : 0 }} onClick={() => st.setOnboard(true)}>
          Get ready to trade (private balance + session)
        </button>
      )}
      {body}
    </div>
  );
}

export { PublicKey };
