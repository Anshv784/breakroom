import { Suspense, lazy, useEffect, useState } from "react";
import { useApp, usd } from "../state/store";
import { BreakroomClient, keypairWallet, statsPda } from "../chain/client";
import { Keypair } from "@solana/web3.js";
import { useBreakList } from "../lib/useBreaks";
import { BreakCard } from "../ui/BreakCard";
import "./home.css";

const HeroScene = lazy(() => import("../scene/HeroScene"));

interface Stats {
  breaks: bigint;
  cards: bigint;
  primary: bigint;
  secondary: bigint;
  trades: bigint;
}

function useStats() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    const c = useApp.getState().client ?? new BreakroomClient(keypairWallet(Keypair.generate()));
    c.base.getAccountInfo(statsPda()).then((i) => {
      if (!i) return;
      const d = Buffer.from(i.data);
      setS({ breaks: d.readBigUInt64LE(8), cards: d.readBigUInt64LE(16), primary: d.readBigUInt64LE(24), secondary: d.readBigUInt64LE(32), trades: d.readBigUInt64LE(40) });
    });
  }, []);
  return s;
}

const STEPS = [
  {
    n: "01",
    title: "The box is locked",
    body: "The host deposits every card NFT into a program vault and the card list is hashed into a commitment before a single spot sells. Prices come from the appraisal desk, never from the host.",
    tech: "Solana program vault · sha256 commitment",
  },
  {
    n: "02",
    title: "Nobody sees the shuffle",
    body: "When the sale closes, MagicBlock VRF seeds a shuffle that lands straight inside a sealed account in an Intel TDX enclave. Not the host, not us — no one can read it until the last card is out.",
    tech: "MagicBlock VRF · Private Ephemeral Rollup (TEE)",
  },
  {
    n: "03",
    title: "Packs open live. Spots trade.",
    body: "A crank inside the rollup reveals one card at a time. While it runs, every unopened spot is a live market: list it, hit an offer, or buy the one still holding the chase — instant, zero fees.",
    tech: "On-chain crank · 10 ms rollup blocks",
  },
  {
    n: "04",
    title: "Verified, settled, delivered",
    body: "The seed goes public so anyone can re-run the shuffle. A Magic Action writes who gets each card to Solana in the same commit, and the cards land in winners' wallets.",
    tech: "Magic Action · open verification",
  },
];

const STACK = [
  { name: "Private Ephemeral Rollup", what: "The sealed Deck and every private USDC balance live in an Intel TDX enclave." },
  { name: "VRF", what: "Unbiasable shuffle seed, delivered by callback straight into the sealed Deck." },
  { name: "Crank", what: "The validator itself reveals each card on schedule. No server, no host button." },
  { name: "Private Payments API", what: "Deposits into the TEE. Buyers pay hosts and sellers directly — the protocol never holds USDC." },
  { name: "Magic Actions", what: "One commit unseals the result and records every card's new owner on Solana." },
  { name: "Session keys", what: "One signature per session. Every buy, list and offer after that is silent and free." },
];

export default function Home() {
  const stats = useStats();
  const { list } = useBreakList(8_000);
  const live = list.filter((b) => b.status === 1 || b.status === 2 || b.status === 3).slice(0, 3);
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-canvas">
          <Suspense fallback={null}>
            <HeroScene />
          </Suspense>
        </div>
        <div className="wrap hero-copy">
          <div className="eyebrow">Live card breaks · Solana · MagicBlock</div>
          <h1 className="display">
            Card breaks
            <br />
            <span className="foil-text">you can verify.</span>
          </h1>
          <p className="lede">
            Group breaks where the shuffle is sealed in hardware nobody can read — not even the host — and every spot trades live while the packs open.
          </p>
          <div className="hero-cta">
            <a href="#/breaks" className="btn primary lg">
              Join a live break
            </a>
            <a href="#/host" className="btn lg">
              Host a break
            </a>
          </div>
          <div className="hero-stats">
            <div>
              <b className="mono num">{stats ? stats.breaks.toString() : "—"}</b>
              <span>breaks settled</span>
            </div>
            <div>
              <b className="mono num">{stats ? stats.cards.toString() : "—"}</b>
              <span>cards delivered</span>
            </div>
            <div>
              <b className="mono num">{stats ? usd(stats.primary + stats.secondary, 0) : "—"}</b>
              <span>spot volume</span>
            </div>
            <div>
              <b className="mono num">$0</b>
              <span>held by BREAKROOM</span>
            </div>
          </div>
        </div>
      </section>

      {live.length > 0 && (
        <section className="wrap section">
          <div className="sec-head">
            <h2 className="display">Happening now</h2>
            <a href="#/breaks" className="btn sm ghost">
              All breaks →
            </a>
          </div>
          <div className="break-grid">
            {live.map((b) => (
              <BreakCard key={b.breakId.toString()} b={b} />
            ))}
          </div>
        </section>
      )}

      <section className="wrap section problem">
        <div className="eyebrow">The problem</div>
        <h2 className="display">A multi-billion-dollar hobby that runs on "trust me".</h2>
        <div className="problem-grid">
          <div className="panel q">
            <p>Shill bidding. Pack contents leaked to favoured buyers in DMs. Faked pulls.</p>
            <span className="faint">Accusations against some of the biggest breakers — MagicBlock Research, State of Onchain Collectibles</span>
          </div>
          <div className="panel q">
            <p>Once you buy a spot you're stuck with it. Platforms ban reselling spots, and none let you trade one mid-break.</p>
            <span className="faint">Whatnot, Fanatics Live spot rules</span>
          </div>
          <div className="panel q">
            <p>Every outcome depends on one person with a camera and the box in their hands.</p>
            <span className="faint">How breaks work today</span>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="eyebrow">How a break works</div>
        <h2 className="display">Four steps, none of them on trust.</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div key={s.n} className="panel step">
              <div className="step-n mono foil-text">{s.n}</div>
              <h3>{s.title}</h3>
              <p className="muted">{s.body}</p>
              <span className="chip">{s.tech}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <div className="eyebrow">Under the hood</div>
        <h2 className="display">Every piece of MagicBlock, doing a real job.</h2>
        <div className="stack">
          {STACK.map((s) => (
            <div key={s.name} className="stack-item">
              <span className="dotf" />
              <div>
                <b>{s.name}</b>
                <p className="muted">{s.what}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap section final">
        <div className="panel final-in">
          <h2 className="display">Rip something you can prove.</h2>
          <p className="muted">Devnet is open: get test USDC from the faucet and join a break in under a minute.</p>
          <div className="hero-cta" style={{ justifyContent: "center" }}>
            <a href="#/breaks" className="btn primary lg">
              Browse breaks
            </a>
            <a href="#/how" className="btn lg ghost">
              How the fairness works
            </a>
          </div>
        </div>
      </section>
      <footer className="wrap foot faint">
        <span>BREAKROOM · built on Solana + MagicBlock</span>
        <span className="mono">devnet</span>
      </footer>
    </div>
  );
}
