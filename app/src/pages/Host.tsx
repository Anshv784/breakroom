// Host studio: pick appraised cards, shape the break, lock it in the vault and open the sale.
import { useEffect, useMemo, useState } from "react";
import { readiness, usd, useApp } from "../state/store";
import { breakPda, type BreakroomClient } from "../chain/client";
import type { CardInfo } from "../chain/layout";
import { cardImage, faceOf, TIER_NAMES } from "../lib/art";
import { go } from "../lib/router";
import "./host.css";
import { ConnectGate } from "../ui/ConnectGate";

const SPEEDS = [
  { ms: 2000, label: "Fast", hint: "2s a card" },
  { ms: 3200, label: "Show", hint: "3s a card" },
  { ms: 6000, label: "Slow burn", hint: "6s a card" },
];

function shapesFor(n: number) {
  const out: { spots: number; per: number }[] = [];
  for (let per = 1; per <= 8; per++) if (n % per === 0 && n / per >= 2 && n / per <= 16) out.push({ spots: n / per, per });
  return out;
}

export default function Host() {
  const s = useApp();
  const r = readiness(s);
  const c = s.client;
  const [cards, setCards] = useState<CardInfo[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [shape, setShape] = useState<{ spots: number; per: number } | null>(null);
  const [price, setPrice] = useState("");
  const [speed, setSpeed] = useState(SPEEDS[1].ms);
  const [format, setFormat] = useState<0 | 1>(0);
  const [auction, setAuction] = useState(0); // seconds; 0 = fixed price
  const [progress, setProgress] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  const [requesting, setRequesting] = useState(false);

  const load = async (cl: BreakroomClient) => setCards(await cl.walletCards().catch(() => []));
  useEffect(() => {
    if (c) load(c);
  }, [c?.me.toBase58()]);

  const chosen = useMemo(() => (cards ?? []).filter((x) => picked.has(x.mint.toBase58())), [cards, picked]);
  const boxValue = chosen.reduce((a, x) => a + x.value, 0n);
  const shapes = shapesFor(chosen.length).filter((x) => format === 0 || x.spots <= 8);
  useEffect(() => {
    if (!shape || shape.spots * shape.per !== chosen.length) setShape(shapes.find((x) => x.per >= 2 && x.per <= 4) ?? shapes[0] ?? null);
  }, [chosen.length]);
  const fair = shape ? Number(boxValue) / 1e6 / shape.spots : 0;
  const suggested = Math.max(1, Math.round(fair * 0.9));
  const priceN = Number(price || suggested);

  const toggle = (k: string) => {
    const n = new Set(picked);
    n.has(k) ? n.delete(k) : n.add(k);
    setPicked(n);
  };

  const requestDemoBox = async () => {
    if (!c) return;
    setRequesting(true);
    const ok = await s.run("Demo box", async () => {
      await c.sendBaseMany(c.demoBoxIxs(12));
      return true;
    });
    setRequesting(false);
    if (ok) {
      s.toast("ok", "12 appraised Genesis cards are in your wallet");
      await load(c);
      s.refresh();
    }
  };

  const launch = async () => {
    if (!c || !shape) return;
    const id = BigInt(Date.now());
    const mints = [...chosen].sort(() => Math.random() - 0.5).map((x) => x.mint);
    const steps = ["Create the break", ...Array.from({ length: Math.ceil(mints.length / 4) }, (_, i) => `Lock cards ${i * 4 + 1}–${Math.min(mints.length, i * 4 + 4)} in the vault`), "Seal the box + hand it to the TEE", "Open the sale"];
    setProgress(steps);
    setStep(0);
    const ok = await s.run("Launch", async () => {
      const groups = [[c.createBreakIx(id, shape.spots, shape.per, BigInt(Math.round(priceN * 1e6)), speed, title || "Untitled break", format, auction > 0 ? 1 : 0, auction)]];
      for (let i = 0; i < mints.length; i += 4) groups.push(mints.slice(i, i + 4).map((m, k) => c.depositCardIx(id, i + k, m)));
      groups.push(c.sealBreakIxs(id));
      await c.sendBaseMany(groups, (i) => setStep(i + 1));
      await c.waitInTee(breakPda(id));
      await c.sendSession([c.openSaleIx(id, c.session.publicKey)]);
      setStep(steps.length);
      return true;
    });
    if (ok) {
      s.toast("ok", "Your break is on sale");
      go(`/break/${id}`);
    } else setProgress(null);
  };

  if (!c || !r.ready)
    return (
      <ConnectGate title="Host a break" sub="Connect a wallet to lock a box and open the sale." />
    );

  return (
    <div className="wrap host">
      <div className="eyebrow">Host studio</div>
      <h1 className="display">Build your break.</h1>
      <div className="host-grid">
        <section className="panel host-cards">
          <div className="host-sec-head">
            <div>
              <h3>1 · Your cards</h3>
              <p className="faint">Only cards with an appraisal can go in a box: the price buyers see comes from the desk, not from you.</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {cards && cards.length > 0 && (
                <button className="btn sm ghost" onClick={() => setPicked(picked.size === cards.length ? new Set() : new Set(cards.map((x) => x.mint.toBase58())))}>
                  {picked.size === cards.length ? "Clear" : "Select all"}
                </button>
              )}
              <button className="btn sm" onClick={requestDemoBox} disabled={requesting}>
                {requesting ? "Minting…" : "Get 12 test cards"}
              </button>
            </div>
          </div>
          {cards === null ? (
            <div className="skeleton" style={{ height: 240 }} />
          ) : cards.length === 0 ? (
            <div className="empty">
              <p>No appraised cards in this wallet yet.</p>
              <p className="faint">On devnet, the desk will mint you a 12-card Genesis box to break.</p>
            </div>
          ) : (
            <div className="card-pick">
              {[...cards].sort((a, b) => Number(b.value - a.value)).map((x) => {
                const k = x.mint.toBase58();
                return (
                  <button key={k} className={`pick ${picked.has(k) ? "on" : ""}`} onClick={() => toggle(k)}>
                    <img src={cardImage(faceOf(x))} alt={x.name} />
                    <span className={`tier-${x.tier} mono`}>{TIER_NAMES[x.tier]}</span>
                    <span className="mono">{usd(x.value, 0)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
        <section className="panel host-form">
          <h3>2 · Shape it</h3>
          <label className="field">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 48))} placeholder="Genesis Night #7" />
          </label>
          <div className="field">
            Format
            <div className="seg">
              <button className={format === 0 ? "on" : ""} onClick={() => setFormat(0)} title="Each spot owns a sealed pack">Packs</button>
              <button className={format === 1 ? "on" : ""} onClick={() => setFormat(1)} title="VRF deals the 8 elements across the spots; every card of your element is yours">Random teams</button>
            </div>
            <span className="faint" style={{ fontSize: 12 }}>
              {format === 0 ? "Every spot owns a sealed pack; packs open one by one." : "The randomizer deals the 8 elements across the spots, live. Every card of your element is yours (max 8 spots)."}
            </span>
          </div>
          <div className="field">
            Sale
            <div className="seg">
              {[
                [0, "Fixed price"],
                [120, "Auction · 2 min"],
                [600, "Auction · 10 min"],
                [3600, "Auction · 1 h"],
              ].map(([secs, label]) => (
                <button key={secs} className={auction === secs ? "on" : ""} onClick={() => setAuction(secs as number)}>{label}</button>
              ))}
            </div>
            {auction > 0 && <span className="faint" style={{ fontSize: 12 }}>Bids are sealed inside the TEE — nobody, you included, sees an amount until the close. Winners pay the second-highest bid; your price below is the reserve.</span>}
          </div>
          <div className="field">
            Spots × cards per spot
            <div className="seg">
              {shapes.length === 0 && <span className="faint" style={{ fontSize: 13 }}>Pick at least 2 cards</span>}
              {shapes.map((x) => (
                <button key={`${x.spots}x${x.per}`} className={shape?.spots === x.spots ? "on" : ""} onClick={() => setShape(x)}>
                  {x.spots} × {x.per}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            {auction > 0 ? "Reserve price (USD)" : "Spot price (USD)"}
            <input value={price} placeholder={String(suggested)} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" />
            <span className="faint" style={{ fontSize: 12 }}>
              Box {usd(boxValue, 0)} ÷ {shape?.spots ?? "—"} spots = {usd(fair)} fair value per spot.
              {priceN > fair * 1.15 && fair > 0 && <span className="down"> Priced well above value — buyers will see that.</span>}
            </span>
          </label>
          <div className="field">
            Reveal speed
            <div className="seg">
              {SPEEDS.map((x) => (
                <button key={x.ms} className={speed === x.ms ? "on" : ""} onClick={() => setSpeed(x.ms)} title={x.hint}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <div className="summary">
            <div><span>You receive per spot</span><b className="mono">{usd(priceN * 0.95)}</b></div>
            <div><span>If every spot sells</span><b className="mono up">{usd(priceN * 0.95 * (shape?.spots ?? 0))}</b></div>
            <div><span>Unsold spots</span><b>stay yours</b></div>
          </div>
          <h3 style={{ marginTop: 18 }}>3 · Lock + list</h3>
          {progress ? (
            <ol className="progress">
              {progress.map((p, i) => (
                <li key={i} className={i < step ? "done" : i === step ? "now" : ""}>{p}</li>
              ))}
            </ol>
          ) : (
            <button className="btn primary lg" style={{ width: "100%" }} disabled={!shape || chosen.length < 2 || !(priceN >= 1)} onClick={launch}>
              Lock {chosen.length} cards + open the sale
            </button>
          )}
          <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
            Cards go into a program vault and the list is hashed before anyone buys. From then on only the break's result can move them.
          </p>
        </section>
      </div>
    </div>
  );
}

