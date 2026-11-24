import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useApp, usd } from "../state/store";
import { BreakroomClient, keypairWallet, statsPda } from "../chain/client";
import { Keypair, PublicKey } from "@solana/web3.js";
import { useBreakList, useCards, useNames } from "../lib/useBreaks";
import { leaderboard } from "../lib/rep";
import { cardImage, faceOf, TIER_NAMES } from "../lib/art";
import { packTexture } from "../scene/textures";
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

/** A slow marquee of the latest big pulls across every break. */
function Ticker({ list }: { list: ReturnType<typeof useBreakList>["list"] }) {
  const pulls = useMemo(() => {
    const out = leaderboard(list).pulls.filter((p) => p.tier >= 2);
    return out.slice(0, 16);
  }, [list]);
  const names = useNames(useMemo(() => pulls.map((p) => new PublicKey(p.owner)), [pulls]));
  const mints = useMemo(() => pulls.map((p) => list.find((b) => b.breakId === p.breakId)?.cards[p.card]).filter((m): m is PublicKey => !!m), [pulls]);
  const infos = useCards(mints);
  const nameOf = new Map(infos.filter(Boolean).map((c) => [c!.mint.toBase58(), c!.name]));
  if (pulls.length < 4) return null;
  const row = pulls.map((p, i) => (
    <span key={i} className="tick">
      <i className={`tier-dot t${p.tier}`} />
      <b>{names(new PublicKey(p.owner))}</b> pulled <span className={`tier-${p.tier}`}>{TIER_NAMES[p.tier].toLowerCase()}</span> <b>{nameOf.get(list.find((b) => b.breakId === p.breakId)?.cards[p.card]?.toBase58() ?? "") ?? "a card"}</b>
      <span className="mono up">{usd(p.value, 0)}</span>
    </span>
  ));
  return (
    <div className="ticker" aria-label="Latest pulls">
      <div className="ticker-track">
        {row}
        {row}
      </div>
    </div>
  );
}

/** The best cards still sealed in open breaks: what you can still win, and your odds per spot. */
function Chases({ list }: { list: ReturnType<typeof useBreakList>["list"] }) {
  const open = useMemo(() => list.filter((b) => b.status === 1 || b.status === 2 || b.status === 3).slice(0, 6), [list]);
  if (open.length === 0) return null;
  return (
    <section className="wrap section">
      <div className="sec-head">
        <h2 className="display">Chases still in the box</h2>
        <a href="#/breaks" className="btn sm ghost">
          All breaks →
        </a>
      </div>
      <div className="chases">
        {open.map((b) => (
          <ChaseTile key={b.breakId.toString()} b={b} />
        ))}
      </div>
    </section>
  );
}
function ChaseTile({ b }: { b: ReturnType<typeof useBreakList>["list"][number] }) {
  const cards = useCards(b.cards);
  const chase = useMemo(() => {
    let best: (typeof cards)[number] = null;
    cards.forEach((c) => {
      if (c && (!best || c.value > best.value)) best = c;
    });
    return best as (typeof cards)[number];
  }, [cards]);
  const left = b.nSpots - b.sold;
  return (
    <a href={`#/break/${b.breakId}`} className="chase-tile">
      <div className="chase-img">{chase ? <img src={cardImage(faceOf(chase))} alt={chase.name} /> : <div className="skeleton" style={{ height: "100%" }} />}</div>
      <div className="chase-info">
        <b>{chase?.name ?? "…"}</b>
        <span className="mono up">{chase ? usd(chase.value, 0) : ""}</span>
      </div>
      <div className="chase-sub">
        <span>
          {usd(b.spotPrice, 0)} a spot · 1 in {b.nSpots}
        </span>
        <span>{b.status === 3 ? "live" : left > 0 ? `${left} left` : "sold out"}</span>
      </div>
    </a>
  );
}

/** "Rip it yourself": a pack that peels open on a loop. */
function RipShowcase() {
  const pack = useMemo(() => (packTexture(3, 7).image as HTMLCanvasElement).toDataURL(), []);
  const card = useMemo(() => cardImage({ name: "Solar Lion", set: "Genesis", tier: 4, grade: 100, art: 7, value: 547_000_000n }), []);
  return (
    <section className="wrap section">
      <div className="panel ripshow">
        <div className="ripshow-copy">
          <div className="eyebrow">New</div>
          <h2 className="display">Rip your own pack.</h2>
          <p className="muted">When your pack comes up, it's in your hands. Swipe across the seal and the card is yours, live in front of the whole room.</p>
          <a href="#/breaks" className="btn primary">
            Find your pack
          </a>
        </div>
        <div className="ripshow-art" aria-hidden>
          <div className="rs-pack">
            <div className="rs-body" style={{ backgroundImage: `url(${pack})` }} />
            <div className="rs-top" style={{ backgroundImage: `url(${pack})` }} />
            <div className="rs-card" style={{ backgroundImage: `url(${card})` }} />
            <div className="rs-hand">☝</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Who's winning: top collectors by profit and top hosts by verified breaks. */
function Boards({ list }: { list: ReturnType<typeof useBreakList>["list"] }) {
  const { collectors } = useMemo(() => leaderboard(list), [list]);
  const hosts = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((b) => b.status >= 4 && m.set(b.host.toBase58(), (m.get(b.host.toBase58()) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [list]);
  const top = collectors.slice(0, 5);
  const names = useNames(useMemo(() => [...top.map((c) => new PublicKey(c.key)), ...hosts.map(([k]) => new PublicKey(k))], [top.length, hosts.length]));
  if (top.length === 0) return null;
  return (
    <section className="wrap section">
      <div className="boards">
        <div className="panel board">
          <div className="sec-head">
            <h3>Top collectors</h3>
            <a href="#/leaders" className="faint">
              See all →
            </a>
          </div>
          {top.map((c, i) => (
            <div key={c.key} className="board-row">
              <span className="board-n mono">{i + 1}</span>
              <span className="avatar">{names(new PublicKey(c.key)).slice(0, 1)}</span>
              <b>{names(new PublicKey(c.key))}</b>
              <span className={`mono ${c.profit >= 0 ? "up" : "down"}`}>
                {c.profit >= 0 ? "+" : "−"}
                {usd(Math.abs(c.profit), 0)}
              </span>
            </div>
          ))}
        </div>
        <div className="panel board">
          <div className="sec-head">
            <h3>Top hosts</h3>
            <a href="#/host" className="faint">
              Host one →
            </a>
          </div>
          {hosts.map(([k, n], i) => (
            <div key={k} className="board-row">
              <span className="board-n mono">{i + 1}</span>
              <span className="avatar">{names(new PublicKey(k)).slice(0, 1)}</span>
              <b>{names(new PublicKey(k))}</b>
              <span className="up">✓ {n} verified</span>
            </div>
          ))}
        </div>
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

      <Ticker list={list} />

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

      <Chases list={list} />

      <FreshPulls list={list} />

      <RipShowcase />

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

      <Boards list={list} />

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
