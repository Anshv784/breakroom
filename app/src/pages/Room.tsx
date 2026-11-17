// The break room: the live table plus the spot market, chat, replay and sharing.
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useBreak, useBreakList, useCards, useNames } from "../lib/useBreaks";
import { readiness, usd, useApp } from "../state/store";
import { ST, TRADE_KIND, type BreakState, type ChatMsg, type ReceiptState } from "../chain/layout";
import { pct } from "../lib/odds";
import { chaseIndex, spotOfPos, evHistory, oddsFor, snapshot, stepsDone, teamNames, totalSteps, ELEMENT_COLORS } from "../lib/breakmath";
import { cardImage, faceOf, TIER_NAMES, TIER_COLORS } from "../lib/art";
import { StatusChip } from "../ui/BreakCard";
import { sfx } from "../lib/sfx";
import { readerClient } from "../lib/useBreaks";
import { shareCard } from "../lib/share";
import { hostRep } from "../lib/rep";
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

function useChat(id: bigint) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  useEffect(() => {
    let alive = true;
    const f = () => readerClient().fetchChat(id).then((m) => alive && setMsgs(m)).catch(() => {});
    f();
    const t = setInterval(f, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);
  return msgs;
}

export const REACTIONS = ["🔥", "😱", "💎", "👏", "🙏", "😭"];

export default function Room({ id }: { id: bigint }) {
  const { b: live, error } = useBreak(id);
  const [replay, setReplay] = useState<number | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const b = live && replay !== null ? snapshot(live, replay) : live;
  const cards = useCards(live?.cards);
  const allKeys = useMemo(() => (live ? [live.host, ...live.spotOwner, ...live.bidder, ...live.trades.flatMap((t) => [t.buyer, t.seller])] : []), [live?.nTrades, live?.spotOwner.map((k) => k?.toBase58()).join()]);
  const chat = useChat(id);
  const names = useNames([...allKeys, ...chat.map((m) => m.author)]);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<"market" | "chat" | "box" | "tape">("market");
  const [pull, setPull] = useState<{ card: number; spot: number; at: number } | null>(null);
  const [teamBanner, setTeamBanner] = useState<{ spot: number; mask: number; at: number } | null>(null);
  const [muted, setMuted] = useState(sfx.muted);
  const me = useApp((s) => s.client?.me.toBase58());
  const { list } = useBreakList(30_000);
  const rep = useMemo(() => (live ? hostRep(list, live.host) : null), [list.length, live?.host.toBase58()]);

  // replay: step through the finished break locally
  useEffect(() => {
    if (replay === null || !live) return;
    if (replay >= totalSteps(live)) {
      const t = setTimeout(() => setReplay(null), 2500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setReplay(replay + 1), Math.max(900, live.revealMs * 0.6));
    return () => clearTimeout(t);
  }, [replay, live?.breakId]);

  // team reveals get their own banner
  const lastTeams = useRef<number | null>(null);
  useEffect(() => {
    if (!b || b.mode !== 1) return;
    if (lastTeams.current !== null && b.teamsOut > lastTeams.current) {
      const s = b.openOrder[b.teamsOut - 1];
      setTeamBanner({ spot: s, mask: b.spotTeam[s], at: Date.now() });
      sfx.reveal(b.spotTeam[s] & (1 << b.cardElem[chaseIndex(b)]) ? 4 : 1);
    }
    lastTeams.current = b.teamsOut;
  }, [b?.teamsOut]);

  if (error) return <div className="wrap" style={{ padding: 64 }}><div className="panel" style={{ padding: 32 }}>{error}. <a href="#/breaks" className="muted">Back to breaks</a></div></div>;
  if (!b || !live) return <div className="room"><div className="room-stage skeleton" style={{ borderRadius: 0 }} /><aside className="room-side" /></div>;

  const pulled = pull && cards[pull.card];
  const pulledMine = pulled && b.spotOwner[pull!.spot]?.toBase58() === me;
  return (
    <div className="room">
      <div className="room-stage">
        <Suspense fallback={<div className="skeleton" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />}>
          <Stage
            key={replayKey}
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
        <RoomHeader b={live} names={names} rep={rep} />
        <RevealClock b={b} replaying={replay !== null} />
        <Reactions msgs={chat} />
        {teamBanner && Date.now() - teamBanner.at < 3000 && (
          <div className="pull-banner" key={teamBanner.at} style={{ ["--tc" as any]: ELEMENT_COLORS[Math.log2(teamBanner.mask & -teamBanner.mask)] }}>
            <div className="mono" style={{ color: "var(--tc)", fontSize: 12, letterSpacing: ".2em" }}>RANDOMIZER</div>
            <div className="display" style={{ fontSize: 26 }}>{teamNames(teamBanner.mask).join(" · ")}</div>
            <div className="muted">spot #{teamBanner.spot + 1} · {names(b.spotOwner[teamBanner.spot])}</div>
          </div>
        )}
        {pulled && Date.now() - pull!.at < 3600 && pulled.tier >= 2 && (
          <div className="pull-banner" key={pull!.at} style={{ ["--tc" as any]: TIER_COLORS[pulled.tier] }}>
            <div className="mono" style={{ color: "var(--tc)", fontSize: 12, letterSpacing: ".2em" }}>
              {TIER_NAMES[pulled.tier]} PULL
            </div>
            <div className="display" style={{ fontSize: 30 }}>{pulled.name}</div>
            <div className="muted">
              {usd(pulled.value, 0)} · spot #{pull!.spot + 1} · {names(b.spotOwner[pull!.spot])}
            </div>
            {pulledMine && (
              <button className="btn sm primary" style={{ marginTop: 8 }} onClick={() => shareCard(pulled, b.title, b.breakId)}>
                Share this pull
              </button>
            )}
          </div>
        )}
        <div className="stage-tools">
          <button className="btn sm ghost" onClick={() => { sfx.setMuted(!muted); setMuted(!muted); }} title={muted ? "Sound off" : "Sound on"}>
            {muted ? "🔇" : "🔊"}
          </button>
          {live.status >= ST.ENDED && (
            <button
              className="btn sm ghost"
              onClick={() => {
                if (replay !== null) setReplay(null);
                else {
                  setReplayKey((k) => k + 1);
                  setReplay(0);
                }
              }}
            >
              {replay !== null ? `■ Stop replay ${stepsDone(b)}/${totalSteps(b)}` : "▶ Replay"}
            </button>
          )}
        </div>
      </div>
      <aside className="room-side">
        <div className="side-tabs">
          {(["market", "chat", "box", "tape"] as const).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t === "market" ? "Spots" : t === "chat" ? `Chat${chat.length ? ` ${chat.filter((m) => m.kind === 0).length}` : ""}` : t === "box" ? "The box" : "Activity"}
            </button>
          ))}
        </div>
        <div className="side-body">
          {tab === "market" && <Market b={b} names={names} selected={selected} setSelected={setSelected} cards={cards} />}
          {tab === "chat" && <ChatPanel b={live} msgs={chat} names={names} />}
          {tab === "box" && <BoxView b={b} cards={cards} names={names} />}
          {tab === "tape" && <Tape b={live} names={names} />}
        </div>
        <Controls b={live} />
      </aside>
    </div>
  );
}

function RoomHeader({ b, names, rep }: { b: BreakState; names: (k: any) => string; rep: ReturnType<typeof hostRep> | null }) {
  const now = useNow(1000);
  const left = Math.max(0, b.auctionEnd - Math.floor(now / 1000));
  return (
    <div className="room-head">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <StatusChip status={b.status} />
        {b.mode === 1 && <span className="chip" title="VRF deals the 8 elements across the spots">Random teams</span>}
        {b.sale === 1 && <span className="chip sale" title="Bids are sealed inside the TEE until the close">Sealed auction · {left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "closing"}</span>}
        {b.seedSource === 1 && <span className="chip" title="Shuffle seeded by MagicBlock VRF">VRF seed</span>}
        {b.seedSource === 2 && <span className="chip" style={{ color: "var(--warn)" }} title="VRF was late; the TEE seeded the shuffle">TEE seed</span>}
        <a className="chip" href={`#/verify/${b.breakId}`}>Verify ↗</a>
      </div>
      <h1 className="display">{b.title || "Untitled break"}</h1>
      <div className="muted" style={{ fontSize: 13 }}>
        hosted by <b style={{ color: "var(--text)" }}>{names(b.host)}</b>
        {rep && rep.verified > 0 && <span className="up"> ✓ {rep.verified} verified break{rep.verified === 1 ? "" : "s"}</span>} · box {usd(b.boxValue, 0)} · {b.nSpots} spots ×{" "}
        {b.perSpot} cards · {b.sale ? "reserve" : ""} {usd(b.spotPrice, 0)} a spot
      </div>
    </div>
  );
}

function RevealClock({ b, replaying }: { b: BreakState; replaying: boolean }) {
  const now = useNow(200);
  if (b.status !== ST.LIVE) {
    const label = b.status === ST.SELLING ? (b.sale === 1 ? `${b.bidCount.reduce((a, x) => a + x, 0)} sealed bids` : `${b.sold}/${b.nSpots} spots sold`) : b.status === ST.SHUFFLING ? "VRF shuffling inside the TEE…" : b.status >= ST.ENDED ? "All cards out" : "";
    return label ? <div className="room-clock mono">{label}</div> : null;
  }
  const left = Math.max(0, b.nextRevealMs - now);
  const teamPhase = b.mode === 1 && b.teamsOut < b.nSpots;
  return (
    <div className="room-clock">
      <div className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>{replaying ? "REPLAY" : teamPhase ? "TEAMS DRAWN" : "CARDS OUT"}</div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>
        {teamPhase ? b.teamsOut : b.cursor}
        <span className="faint">/{teamPhase ? b.nSpots : b.nCards}</span>
      </div>
      {!replaying && <div className="clock-bar"><div style={{ width: `${Math.min(100, (1 - left / (b.revealMs + 1000)) * 100)}%` }} /></div>}
    </div>
  );
}

/** Reactions float up the stage as they arrive. */
function Reactions({ msgs }: { msgs: ChatMsg[] }) {
  const [live, setLive] = useState<{ id: number; e: string; x: number }[]>([]);
  const lastSeq = useRef<number | null>(null);
  useEffect(() => {
    const newest = msgs.at(-1)?.seq ?? -1;
    if (lastSeq.current === null) {
      lastSeq.current = newest;
      return;
    }
    const fresh = msgs.filter((m) => m.seq > lastSeq.current! && m.kind === 1);
    lastSeq.current = newest;
    if (!fresh.length) return;
    const add = fresh.map((m) => ({ id: m.seq * 1000 + Math.floor(Math.random() * 999), e: m.text, x: 10 + Math.random() * 80 }));
    setLive((l) => [...l, ...add]);
    setTimeout(() => setLive((l) => l.filter((r) => !add.includes(r))), 2600);
  }, [msgs.at(-1)?.seq]);
  return (
    <div className="reactions" aria-hidden>
      {live.map((r) => (
        <span key={r.id} style={{ left: `${r.x}%` }}>{r.e}</span>
      ))}
    </div>
  );
}

function ChatPanel({ b, msgs, names }: { b: BreakState; msgs: ChatMsg[]; names: (k: any) => string }) {
  const st = useApp();
  const r = readiness(st);
  const c = st.client;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs.length]);
  const send = async (t: string, kind = 0) => {
    if (!c) return st.setConnect(true);
    if (!r.ready) return st.setOnboard(true);
    setBusy(true);
    await st.run("Chat", () => c.sendSession([c.sendChatIx(b.breakId, t, kind)]));
    setBusy(false);
  };
  return (
    <div className="chat">
      <div className="chat-log">
        {msgs.filter((m) => m.kind === 0).length === 0 && <p className="faint" style={{ fontSize: 13 }}>No messages yet. Chat lives in the rollup: free and instant.</p>}
        {msgs.filter((m) => m.kind === 0).map((m) => (
          <div key={m.seq} className="chat-msg">
            <b style={{ color: m.author.equals(b.host) ? "var(--warn)" : undefined }}>{names(m.author)}</b> <span>{m.text}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="react-bar">
        {REACTIONS.map((e) => (
          <button key={e} onClick={() => send(e, 1)} disabled={busy} aria-label={`react ${e}`}>{e}</button>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const t = text.trim();
          setText("");
          await send(t);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 80))} placeholder={c ? "Say something" : "Connect to chat"} />
        <button className="btn sm" disabled={busy || !text.trim()}>Send</button>
      </form>
    </div>
  );
}

/** A spot's expected value through the break, with its trades marked. */
function SpotChart({ b, s }: { b: BreakState; s: number }) {
  const h = useMemo(() => evHistory(b, s), [b.revealed.join(), b.teamsOut, s]);
  if (h.length < 2) return null;
  const W = 340;
  const H = 70;
  const max = Math.max(...h, Number(b.spotPrice) / 1e6) * 1.08;
  const min = Math.min(...h, 0);
  const x = (i: number) => (i / (h.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const path = h.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = h.at(-1)! >= Number(b.spotPrice) / 1e6;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>Value as cards came out</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <line x1={0} x2={W} y1={y(Number(b.spotPrice) / 1e6)} y2={y(Number(b.spotPrice) / 1e6)} stroke="rgba(255,255,255,.18)" strokeDasharray="3 4" />
        <path d={`${path} L${W},${H} L0,${H} Z`} fill={up ? "rgba(79,227,161,.10)" : "rgba(255,107,107,.08)"} />
        <path d={path} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <circle cx={x(h.length - 1)} cy={y(h.at(-1)!)} r={3.5} fill={up ? "var(--up)" : "var(--down)"} />
      </svg>
      <div className="faint mono" style={{ fontSize: 10, display: "flex", justifyContent: "space-between" }}>
        <span>start {usd(h[0])}</span>
        <span>dashed = spot price</span>
        <span>now {usd(h.at(-1)!)}</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- market

function Market({ b, names, selected, setSelected, cards }: { b: BreakState; names: (k: any) => string; selected: number | null; setSelected: (s: number | null) => void; cards: any[] }) {
  const odds = useMemo(() => oddsFor(b), [b.revealed.join(), b.status, b.teamsOut]);
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
                {b.sale === 1 ? <span className="faint">🔒 {b.bidCount[s]} bid{b.bidCount[s] === 1 ? "" : "s"}</span> : <>
                {b.ask[s] > 0n ? <span className="up">{usd(b.ask[s], 0)}</span> : <span className="faint">—</span>}
                <span className="faint"> / </span>
                {b.bid[s] > 0n ? <span>{usd(b.bid[s], 0)}</span> : <span className="faint">—</span>}</>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpotDetail({ b, s, names, odds, onClose }: { b: BreakState; s: number; names: (k: any) => string; odds: ReturnType<typeof oddsFor>[number]; onClose: () => void }) {
  const st = useApp();
  const r = readiness(st);
  const c = st.client;
  const me = c?.me.toBase58();
  const owner = b.spotOwner[s];
  const mine = !!owner && owner.toBase58() === me;
  const locked = b.status === ST.LIVE ? (b.mode === 1 ? b.spotTeam[s] !== 0 : odds.sealed < b.perSpot) : b.status >= ST.ENDED;
  const bidKey = `br-bid-${b.breakId}-${s}-${me}`;
  const [myBid, setMyBid] = useState<string | null>(() => {
    try {
      return localStorage.getItem(bidKey);
    } catch {
      return null;
    }
  });
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
  // an accepted offer (or a won auction): our session pays straight away
  const filled = useRef(false);
  useEffect(() => {
    if (reservedForMe && !filled.current && c && r.ready) {
      filled.current = true;
      if (!owner && b.sale === 2) act(`Won spot #${s + 1} — paid ${usd(b.ask[s])}`, () => c.sendSession(c.buySpotIxs(b, s)));
      else if (owner) act("Offer accepted — bought", () => c.sendSession(c.buyListedIxs(b, s)));
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
        <div><span>{b.mode === 1 && b.spotTeam[s] ? "Team" : "Chase odds"}</span><b className="mono" style={b.mode === 1 && b.spotTeam[s] ? { color: ELEMENT_COLORS[Math.log2(b.spotTeam[s] & -b.spotTeam[s])], fontSize: 12 } : undefined}>{b.mode === 1 && b.spotTeam[s] ? teamNames(b.spotTeam[s]).join(" · ") : pct(odds.chaseOdds)}</b></div>
        <div><span>Paid</span><b className="mono">{owner ? usd(b.spotCost[s]) : "—"}</b></div>
        <div><span>Last trade</span><b className="mono">{b.lastPrice[s] > 0n ? usd(b.lastPrice[s]) : "—"}</b></div>
      </div>
      <SpotChart b={b} s={s} />
      {locked && <p className="faint" style={{ margin: "10px 0 0", fontSize: 13 }}>{b.mode === 1 ? "Team drawn — its cards are decided." : odds.sealed === 0 ? "Opened." : "This pack is opening — trading is closed for it."}</p>}
      {b.status === ST.SELLING && b.sale === 1 && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Sealed-bid auction: {b.bidCount[s]} bid{b.bidCount[s] === 1 ? "" : "s"} on this spot. Amounts stay inside the TEE until the close; the winner pays the second-highest bid.
            {myBid && <span className="up"> Your bid: {usd(Number(myBid))}</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder={`at least ${usd(b.spotPrice)}`} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" />
            <button
              className="btn primary"
              disabled={busy || !(Number(price) * 1e6 >= Number(b.spotPrice))}
              onClick={() =>
                act("Sealed bid placed", async () => {
                  await c!.sendSession([c!.placeBidIx(b.breakId, s, usdIn(price))]);
                  try {
                    localStorage.setItem(bidKey, price);
                  } catch {
                    /* ignore */
                  }
                  setMyBid(price);
                })
              }
            >
              {myBid ? "Update bid" : "Bid"}
            </button>
          </div>
        </div>
      )}
      {!locked && b.status === ST.SELLING && b.sale !== 1 && !owner && (
        <button className="btn primary lg" style={{ width: "100%", marginTop: 12 }} disabled={busy || reservedForOther} onClick={() => act(`Bought spot #${s + 1}`, () => c!.sendSession(c!.buySpotIxs(b, s)))}>
          {busy ? "Buying…" : reservedForOther ? "Reserved for the auction winner" : reservedForMe ? `Pay your winning bid · ${usd(b.ask[s])}` : `Buy spot · ${usd(b.spotPrice)}`}
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
                <span className="faint">{pos !== undefined ? `#${spotOfPos(b, pos) + 1}` : "sealed"}</span>
              </div>
              {pos !== undefined && <div className="faint" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>→ {names(b.spotOwner[spotOfPos(b, pos)])}</div>}
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
  const auctionOver = b.status === ST.SELLING && b.sale === 1 && now / 1000 >= b.auctionEnd;
  if (auctionOver)
    body = (
      <button className="btn primary lg" style={{ width: "100%" }} disabled={busy} onClick={() => act("Auction closed: bids unsealed", () => (c ?? readerClient()).sendSession([(c ?? readerClient()).closeAuctionIx(b.breakId)]))}>
        Close the auction + unseal bids
      </button>
    );
  else if (b.status === ST.SELLING && b.sale === 1)
    body = <div className="muted" style={{ fontSize: 13 }}>Bidding is open. Pick a spot and place a sealed bid.</div>;
  else if (b.status === ST.SELLING && isHost)
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
