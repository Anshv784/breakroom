// Lobby tile for one break: chase card, box value, spots, status, progress.
import { useMemo } from "react";
import type { BreakState } from "../chain/layout";
import { ST, STATUS_LABEL } from "../chain/layout";
import { useCards, useNames } from "../lib/useBreaks";
import { cardImage, faceOf, TIER_NAMES } from "../lib/art";
import { usd } from "../state/store";
import "../pages/lobby.css";

export function StatusChip({ status }: { status: number }) {
  const cls = status === 3 || status === 2 ? "live" : status === 1 ? "sale" : "done";
  return (
    <span className={`chip ${cls}`}>
      <span className="dot" />
      {status === 3 ? "LIVE" : STATUS_LABEL[status]}
    </span>
  );
}

/** Spots sold while on sale; cards out while live; done after. */
export function SpotBar({ b, big = false }: { b: BreakState; big?: boolean }) {
  const live = b.status === ST.LIVE || b.status === ST.SHUFFLING;
  const done = b.status >= ST.ENDED;
  const bids = b.bidCount.slice(0, b.nSpots).reduce((a, x) => a + x, 0);
  const k = done ? 1 : live ? b.cursor / Math.max(1, b.nCards) : b.sold / Math.max(1, b.nSpots);
  const label = done ? `All ${b.nCards} cards out` : live ? `${b.cursor} of ${b.nCards} cards out` : b.sale === 1 ? `${bids} sealed bid${bids === 1 ? "" : "s"} · ${b.nSpots} spots` : `${b.sold} of ${b.nSpots} spots taken`;
  return (
    <div className={`spotbar ${big ? "big" : ""}`}>
      <div className="spotbar-track">
        <div className={`spotbar-fill ${live ? "live" : done ? "done" : ""}`} style={{ width: `${Math.max(3, k * 100)}%` }} />
      </div>
      <div className="spotbar-label">
        <span>{label}</span>
        {!done && !live && b.sale !== 1 && <span className="mono">{b.nSpots - b.sold} left</span>}
      </div>
    </div>
  );
}

export function BreakCard({ b, rep }: { b: BreakState; rep?: { verified: number } }) {
  const cards = useCards(b.cards);
  const name = useNames([b.host]);
  const chase = useMemo(() => {
    let best = -1;
    cards.forEach((c, i) => {
      if (c && (best < 0 || c.value > (cards[best]?.value ?? 0n))) best = i;
    });
    return best >= 0 ? cards[best] : null;
  }, [cards]);
  return (
    <a href={`#/break/${b.breakId}`} className="bcard panel">
      <div className="bcard-art">{chase ? <img src={cardImage(faceOf(chase))} alt={chase.name} /> : <div className="skeleton" style={{ height: "100%" }} />}</div>
      <div className="bcard-body">
        <div className="bcard-top">
          <StatusChip status={b.status} />
          {b.sale === 1 && <span className="chip sale mini">Auction</span>}
          {b.mode === 1 && <span className="chip mini">Teams</span>}
        </div>
        <div className="bcard-title">{b.title || "Untitled break"}</div>
        <div className="bcard-host faint">
          by {name(b.host)}
          {rep && rep.verified > 0 && <span className="up"> · ✓ {rep.verified} verified</span>}
        </div>
        {chase && (
          <div className="bcard-chase">
            <span className={`tier-${chase.tier}`}>{TIER_NAMES[chase.tier]}</span> <span className="muted">{chase.name}</span>
          </div>
        )}
        <div className="bcard-nums">
          <span>
            <i>Box</i> <b className="mono">{usd(b.boxValue, 0)}</b>
          </span>
          <span>
            <i>{b.sale === 1 ? "Reserve" : "Spot"}</i> <b className="mono">{usd(b.spotPrice, 0)}</b>
          </span>
        </div>
        <SpotBar b={b} />
      </div>
    </a>
  );
}
