import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useApp, usd } from "../state/store";
import { BreakroomClient, keypairWallet, statsPda } from "../chain/client";
import { Keypair, PublicKey } from "@solana/web3.js";
import { useBreakList, useCards, useNames } from "../lib/useBreaks";
import { leaderboard } from "../lib/rep";
import { cardImage, faceOf, TIER_NAMES } from "../lib/art";
import { BreakCard } from "../ui/BreakCard";
import { hostRep } from "../lib/rep";
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

const HOW = [
  { icon: "◎", title: "Take a spot", body: "Pick a live box and grab a spot in seconds. No wallet popups once you're set up." },
  { icon: "✦", title: "Watch it rip", body: "Packs open live with the whole room. When it's your pack, you rip it yourself." },
  { icon: "◆", title: "Keep what you pull", body: "Every card lands in your vault. Keep it, show it off, or sell it back instantly." },
];

function FreshPulls({ list }: { list: ReturnType<typeof useBreakList>["list"] }) {
  const pulls = useMemo(() => leaderboard(list).pulls.slice(0, 8), [list]);
  const keys = useMemo(() => pulls.map((p) => new PublicKey(p.owner)), [pulls]);
  const names = useNames(keys);
  if (pulls.length === 0) return null;
  return (
    <section className="wrap section">
      <div className="sec-head">
        <h2 className="display">Fresh pulls</h2>
        <a href="#/leaders" className="btn sm ghost">
          Leaderboard →
        </a>
      </div>
      <div className="pulls">
        {pulls.map((p, i) => (
          <a key={i} href={`#/break/${p.breakId}`} className="pull">
            <PullImg b={list.find((x) => x.breakId === p.breakId)} card={p.card} />
            <div className="pull-meta">
              <span className={`tier-${p.tier}`}>{TIER_NAMES[p.tier]}</span>
              <b className="mono">{usd(p.value, 0)}</b>
            </div>
            <div className="pull-who">pulled by {names(new PublicKey(p.owner))}</div>
          </a>
        ))}
      </div>
    </section>
  );
}

function PullImg({ b, card }: { b?: ReturnType<typeof useBreakList>["list"][number]; card: number }) {
  const cards = useCards(b?.cards);
  const c = cards[card];
  return c ? <img src={cardImage(faceOf(c))} alt={c.name} /> : <div className="skeleton" style={{ aspectRatio: "512/716", borderRadius: 10 }} />;
}

export default function Home() {
  const stats = useStats();
  const { list } = useBreakList(8_000);
  const live = list.filter((b) => b.status === 1 || b.status === 2 || b.status === 3).sort((a, b) => (b.status === 3 ? 1 : 0) - (a.status === 3 ? 1 : 0)).slice(0, 6);
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-canvas">
          <Suspense fallback={null}>
            <HeroScene />
          </Suspense>
        </div>
        <div className="wrap hero-copy">
          <div className="eyebrow">Live card breaks</div>
          <h1 className="display">
            Card breaks
            <br />
            <span className="foil-text">you can verify.</span>
          </h1>
          <p className="lede">
            Grab a spot in a box, watch it rip live with the room, and keep every card you pull. Changed your mind? Sell your spot before your pack opens.
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
          </div>
        </div>
      </section>

      {live.length > 0 && (
        <section className="wrap section">
          <div className="sec-head">
            <h2 className="display">Live right now</h2>
            <a href="#/breaks" className="btn sm ghost">
              All breaks →
            </a>
          </div>
          <div className="break-grid">
            {live.map((b) => (
              <BreakCard key={b.breakId.toString()} b={b} rep={hostRep(list, b.host)} />
            ))}
          </div>
        </section>
      )}

      <FreshPulls list={list} />

      <section className="wrap section">
        <h2 className="display">How it works</h2>
        <div className="how3">
          {HOW.map((h, i) => (
            <div key={h.title} className="panel how3-item">
              <span className="how3-n mono">{i + 1}</span>
              <span className="how3-ico">{h.icon}</span>
              <h3>{h.title}</h3>
              <p className="muted">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <a href="#/how" className="panel fair-band">
          <span className="fair-ico">✓</span>
          <div>
            <b>Fair, every single time</b>
            <p className="muted">The box is locked before anyone buys, the shuffle is sealed so nobody can peek, and you can check any break after it ends.</p>
          </div>
          <span className="fair-go">How it's fair →</span>
        </a>
      </section>

      <section className="wrap section final">
        <div className="panel final-in">
          <h2 className="display">Your next pull is one spot away.</h2>
          <p className="muted">Free to try in the public test: test cards, test USDC, real excitement.</p>
          <div className="hero-cta" style={{ justifyContent: "center" }}>
            <a href="#/breaks" className="btn primary lg">
              Find a break
            </a>
            <a href="#/host" className="btn lg ghost">
              Host your own
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
