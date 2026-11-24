// All breaks, marketplace-style: tabs, sort, and a grid of tiles.
import { useMemo, useState } from "react";
import { useBreakList } from "../lib/useBreaks";
import { BreakTile } from "../ui/BreakTile";
import { hostRep } from "../lib/rep";
import { ST, type BreakState } from "../chain/layout";
import "./lobby.css";

const TABS: { key: string; label: string; match: (b: BreakState) => boolean }[] = [
  { key: "all", label: "All", match: (b) => b.status >= ST.SELLING && b.status <= ST.LIVE },
  { key: "live", label: "Live", match: (b) => b.status === ST.LIVE || b.status === ST.SHUFFLING },
  { key: "sale", label: "On sale", match: (b) => b.status === ST.SELLING },
  { key: "auction", label: "Auctions", match: (b) => b.status === ST.SELLING && b.sale === 1 },
  { key: "teams", label: "Teams", match: (b) => b.status >= ST.SELLING && b.status <= ST.LIVE && b.mode === 1 },
  { key: "finished", label: "Ended", match: (b) => b.status >= ST.ENDED && b.status !== ST.CANCELLED },
];
const SORTS = [
  { key: "new", label: "Newest", f: (a: BreakState, b: BreakState) => Number(b.createdAt - a.createdAt) },
  { key: "value", label: "Biggest box", f: (a: BreakState, b: BreakState) => Number(b.boxValue - a.boxValue) },
  { key: "cheap", label: "Cheapest spot", f: (a: BreakState, b: BreakState) => Number(a.spotPrice - b.spotPrice) },
  { key: "left", label: "Almost full", f: (a: BreakState, b: BreakState) => a.nSpots - a.sold - (b.nSpots - b.sold) },
];

export default function Lobby() {
  const { list, loading } = useBreakList(4_000);
  const [tab, setTab] = useState(() => (location.hash.includes("finished") ? "finished" : "all"));
  const [sort, setSort] = useState("new");
  const t = TABS.find((x) => x.key === tab)!;
  const shown = useMemo(() => {
    const s = SORTS.find((x) => x.key === sort)!;
    return list.filter(t.match).sort((a, b) => (b.status === ST.LIVE ? 1 : 0) - (a.status === ST.LIVE ? 1 : 0) || s.f(a, b));
  }, [list, tab, sort]);
  return (
    <div className="wrap lobby2">
      <div className="l2-head">
        <h1>Breaks</h1>
        <a href="#/host" className="btn sm primary">
          + Host a break
        </a>
      </div>
      <div className="l2-bar">
        <div className="l2-tabs" role="tablist">
          {TABS.map((x) => {
            const n = list.filter(x.match).length;
            return (
              <button key={x.key} role="tab" aria-selected={tab === x.key} className={tab === x.key ? "on" : ""} onClick={() => setTab(x.key)}>
                {x.label}
                {n > 0 && <span>{n}</span>}
              </button>
            );
          })}
        </div>
        <label className="l2-sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <div className="l2-grid">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: "4/5.4", borderRadius: 18 }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="l2-empty">
          <b>{tab === "finished" ? "No finished breaks yet" : "Nothing here right now"}</b>
          <span>{tab === "finished" ? "Ended breaks show up here with their proofs." : "Check another tab, or open the next box yourself."}</span>
          <a href="#/host" className="btn sm">
            Host a break
          </a>
        </div>
      ) : (
        <div className="l2-grid">
          {shown.map((b) => (
            <BreakTile key={b.breakId.toString()} b={b} verified={hostRep(list, b.host).verified} />
          ))}
        </div>
      )}
    </div>
  );
}
