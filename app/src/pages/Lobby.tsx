// Every break: a featured one up top, live numbers, filters, and the grid.
import { useEffect, useMemo, useState } from "react";
import { useBreakList, useCards, useNames } from "../lib/useBreaks";
import { BreakCard, SpotBar, StatusChip } from "../ui/BreakCard";
import { hostRep } from "../lib/rep";
import { ST, type BreakState } from "../chain/layout";
import { cardImage, faceOf, TIER_NAMES } from "../lib/art";
import { usd } from "../state/store";
import "./lobby.css";

const FILTERS: { key: string; label: string; match: (b: BreakState) => boolean }[] = [
  { key: "all", label: "All open", match: (b) => b.status >= ST.SELLING && b.status <= ST.LIVE },
  { key: "live", label: "Live now", match: (b) => b.status === ST.LIVE || b.status === ST.SHUFFLING },
  { key: "sale", label: "On sale", match: (b) => b.status === ST.SELLING },
  { key: "auction", label: "Auctions", match: (b) => b.status === ST.SELLING && b.sale === 1 },
  { key: "teams", label: "Random teams", match: (b) => b.status >= ST.SELLING && b.status <= ST.LIVE && b.mode === 1 },
  { key: "finished", label: "Finished", match: (b) => b.status >= ST.ENDED && b.status !== ST.CANCELLED },
];
const SORTS = [
  { key: "new", label: "Newest", f: (a: BreakState, b: BreakState) => Number(b.createdAt - a.createdAt) },
  { key: "value", label: "Box value", f: (a: BreakState, b: BreakState) => Number(b.boxValue - a.boxValue) },
  { key: "left", label: "Fewest spots left", f: (a: BreakState, b: BreakState) => a.nSpots - a.sold - (b.nSpots - b.sold) },
];

function Featured({ b, list }: { b: BreakState; list: BreakState[] }) {
  const cards = useCards(b.cards);
  const name = useNames([b.host]);
  const rep = hostRep(list, b.host);
  const chase = useMemo(() => {
    let best: (typeof cards)[number] = null;
    for (const c of cards) if (c && (!best || c.value > best.value)) best = c;
    return best;
  }, [cards]);
  const second = useMemo(() => cards.filter((c) => c && c !== chase).sort((x, y) => Number(y!.value - x!.value))[0] ?? null, [cards, chase]);
  const live = b.status === ST.LIVE || b.status === ST.SHUFFLING;
  return (
    <a href={`#/break/${b.breakId}`} className="feat panel">
      <div className="feat-art">
        <div className="feat-glow" />
        {second && <img className="feat-card back" src={cardImage(faceOf(second))} alt="" />}
        {chase ? <img className="feat-card" src={cardImage(faceOf(chase))} alt={chase.name} /> : <div className="feat-card skeleton" />}
      </div>
      <div className="feat-body">
        <div className="feat-top">
          <StatusChip status={b.status} />
          {b.sale === 1 && <span className="chip sale">Sealed auction</span>}
          {b.mode === 1 && <span className="chip">Random teams</span>}
          <span className="faint" style={{ fontSize: 13 }}>
            hosted by <b style={{ color: "var(--text)" }}>{name(b.host)}</b>
            {rep.verified > 0 && <span className="up"> ✓ {rep.verified} verified</span>}
          </span>
        </div>
        <h2 className="display feat-title">{b.title || "Untitled break"}</h2>
        {chase && (
          <p className="muted" style={{ margin: 0 }}>
            Chase: <span className={`tier-${chase.tier}`}>{TIER_NAMES[chase.tier].toLowerCase()}</span> {chase.name}, grade {(chase.grade / 10).toFixed(1)}, appraised at {usd(chase.value, 0)}
          </p>
        )}
        <div className="feat-stats">
          <div>
            <span className="eyebrow">Box value</span>
            <b className="mono">{usd(b.boxValue, 0)}</b>
          </div>
          <div>
            <span className="eyebrow">{b.sale === 1 ? "Reserve" : "Spot"}</span>
            <b className="mono">{usd(b.spotPrice, 0)}</b>
          </div>
          <div>
            <span className="eyebrow">Format</span>
            <b className="mono">
              {b.nSpots} × {b.mode === 1 ? "team" : `${b.perSpot} card${b.perSpot > 1 ? "s" : ""}`}
            </b>
          </div>
        </div>
        <SpotBar b={b} big />
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <span className="btn primary">{live ? "Watch it live" : b.sale === 1 ? "Place a sealed bid" : "Take a spot"}</span>
          <span className="faint" style={{ fontSize: 13, alignSelf: "center" }}>✓ box committed on chain before the sale</span>
        </div>
      </div>
    </a>
  );
}

export default function Lobby() {
  const { list, loading } = useBreakList(4_000);
  const initial = location.hash.includes("finished") ? "finished" : "all";
  const [filter, setFilter] = useState(initial);
  const [sort, setSort] = useState("new");
  useEffect(() => setFilter(location.hash.includes("finished") ? "finished" : filter), []);
  const f = FILTERS.find((x) => x.key === filter)!;
  const shown = useMemo(() => {
    const s = SORTS.find((x) => x.key === sort)!;
    return list.filter(f.match).sort((a, b) => (b.status === ST.LIVE ? 1 : 0) - (a.status === ST.LIVE ? 1 : 0) || s.f(a, b));
  }, [list, filter, sort]);
  const featured = useMemo(() => {
    const open = list.filter((b) => b.status >= ST.SELLING && b.status <= ST.LIVE);
    return open.find((b) => b.status === ST.LIVE) ?? open.sort((a, b) => Number(b.boxValue - a.boxValue))[0] ?? null;
  }, [list]);
  const stats = useMemo(() => {
    const live = list.filter((b) => b.status === ST.LIVE || b.status === ST.SHUFFLING).length;
    const sale = list.filter((b) => b.status === ST.SELLING).length;
    const settled = list.filter((b) => b.status >= ST.ENDED && b.status !== ST.CANCELLED).length;
    const volume = list.reduce((a, b) => a + b.volume, 0n);
    const cards = list.filter((b) => b.status >= ST.ENDED).reduce((a, b) => a + b.nCards, 0);
    return { live, sale, settled, volume, cards };
  }, [list]);

  return (
    <div className="wrap lobby">
      <div className="lobby-head">
        <div>
          <div className="eyebrow">Breaks</div>
          <h1 className="display">Pull up a chair.</h1>
          <p className="muted">Every box here is locked on chain before the sale and shuffled inside a sealed TEE. Take a spot, trade it while the packs open, check it after.</p>
        </div>
        <a href="#/host" className="btn primary">
          Host a break
        </a>
      </div>

      <div className="lobby-stats">
        <div>
          <b className="mono">{stats.live}</b>
          <span>
            <i className="live-dot" /> live now
          </span>
        </div>
        <div>
          <b className="mono">{stats.sale}</b>
          <span>on sale</span>
        </div>
        <div>
          <b className="mono">{stats.settled}</b>
          <span>breaks settled</span>
        </div>
        <div>
          <b className="mono">{stats.cards}</b>
          <span>cards delivered</span>
        </div>
        <div>
          <b className="mono">{usd(stats.volume, 0)}</b>
          <span>spot volume</span>
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 340, borderRadius: 22, marginBottom: 32 }} />
      ) : (
        featured && filter !== "finished" && <Featured b={featured} list={list} />
      )}

      <div className="lobby-bar">
        <div className="lobby-filters">
          {FILTERS.map((x) => {
            const n = list.filter(x.match).length;
            return (
              <button key={x.key} className={`fchip ${filter === x.key ? "on" : ""}`} onClick={() => setFilter(x.key)}>
                {x.label}
                <span className="mono">{n}</span>
              </button>
            );
          })}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          {SORTS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="lobby-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 190, borderRadius: 18 }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="panel lobby-empty">
          <div className="empty-packs">
            <span />
            <span />
            <span />
          </div>
          <h3 className="display">{filter === "finished" ? "Nothing finished yet" : "Nothing here right now"}</h3>
          <p className="muted">{filter === "finished" ? "Finished breaks show up here with their proofs." : "Be the one who opens the next box."}</p>
          <a href="#/host" className="btn primary">
            Host a break
          </a>
        </div>
      ) : (
        <div className="lobby-grid">
          {shown.map((b) => (
            <BreakCard key={b.breakId.toString()} b={b} rep={hostRep(list, b.host)} />
          ))}
        </div>
      )}
    </div>
  );
}
