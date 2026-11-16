// Lobby tile for one break: chase card, box value, spots, status.
import { useMemo } from "react";
import type { BreakState } from "../chain/layout";
import { STATUS_LABEL } from "../chain/layout";
import { useCards, useNames } from "../lib/useBreaks";
import { cardImage, faceOf, TIER_NAMES } from "../lib/art";
import { usd } from "../state/store";

export function StatusChip({ status }: { status: number }) {
  const cls = status === 3 || status === 2 ? "live" : status === 1 ? "sale" : "done";
  return (
    <span className={`chip ${cls}`}>
      <span className="dot" />
      {status === 3 ? "LIVE" : STATUS_LABEL[status]}
    </span>
  );
}

export function BreakCard({ b }: { b: BreakState }) {
  const cards = useCards(b.cards);
  const name = useNames([b.host]);
  const chase = useMemo(() => {
    let best = -1;
    cards.forEach((c, i) => {
      if (c && (best < 0 || c.value > (cards[best]?.value ?? 0n))) best = i;
    });
    return best >= 0 ? cards[best] : null;
  }, [cards]);
  const open = b.status === 1 ? b.nSpots - b.sold : 0;
  return (
    <a href={`#/break/${b.breakId}`} className="panel" style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 16, padding: 16, transition: "transform .2s var(--ease), border-color .2s" }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "")}>
      <div style={{ width: 96, aspectRatio: "512/716", borderRadius: 8, overflow: "hidden", background: "var(--bg-2)", boxShadow: "0 10px 30px -12px rgba(0,0,0,.8)" }}>
        {chase ? <img src={cardImage(faceOf(chase))} alt={chase.name} style={{ width: "100%", height: "100%", display: "block" }} /> : <div className="skeleton" style={{ height: "100%" }} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusChip status={b.status} />
          <span className="faint" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>by {name(b.host)}</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>{b.title || "Untitled break"}</div>
        {chase && (
          <div style={{ fontSize: 12 }}>
            <span className={`tier-${chase.tier}`}>{TIER_NAMES[chase.tier]}</span> <span className="muted">{chase.name}</span>
          </div>
        )}
        <div style={{ marginTop: "auto", display: "flex", gap: 14, fontSize: 12 }} className="muted">
          <span>
            Box <b className="mono" style={{ color: "var(--text)" }}>{usd(b.boxValue, 0)}</b>
          </span>
          <span>
            Spot <b className="mono" style={{ color: "var(--text)" }}>{usd(b.spotPrice, 0)}</b>
          </span>
          <span>{b.status === 1 ? `${open} of ${b.nSpots} left` : b.status === 3 ? `${b.cursor}/${b.nCards} out` : `${b.nSpots} spots`}</span>
        </div>
      </div>
    </a>
  );
}
