// Marketplace tile for a break: the chase card is the picture, the facts sit underneath.
import { useMemo } from "react";
import type { BreakState } from "../chain/layout";
import { ST } from "../chain/layout";
import { isProvisional, useCards, useNames } from "../lib/useBreaks";
import { cardImage, faceOf, TIER_COLORS, TIER_NAMES } from "../lib/art";
import { usd } from "../state/store";
import "./tile.css";

export function BreakTile({ b, verified = 0 }: { b: BreakState; verified?: number }) {
  const cards = useCards(b.cards);
  const name = useNames([b.host]);
  const sorted = useMemo(() => cards.filter((c): c is NonNullable<typeof c> => !!c).sort((x, y) => Number(y.value - x.value)), [cards]);
  const chase = sorted[0];
  const back = sorted[1];
  const live = b.status === ST.LIVE || b.status === ST.SHUFFLING;
  const ended = b.status >= ST.ENDED;
  const left = b.nSpots - b.sold;
  const k = ended ? 1 : live ? b.cursor / Math.max(1, b.nCards) : b.sold / Math.max(1, b.nSpots);
  const tint = chase ? TIER_COLORS[chase.tier] : "#b58cff";
  const stale = isProvisional(b); // live numbers not in yet
  return (
    <a href={`#/break/${b.breakId}`} className={`tile ${live ? "is-live" : ""} ${chase && chase.tier >= 4 ? "is-chase" : ""}`} style={{ ["--tint" as any]: tint, ["--d" as any]: `${(Number(b.breakId % 7n) * 0.9).toFixed(1)}s` }}>
      <div className="tile-art">
        <div className="tile-bg" />
        {back && <img className="tile-card back" src={cardImage(faceOf(back))} alt="" />}
        {chase ? (
          <div className="tile-card">
            <img src={cardImage(faceOf(chase))} alt={chase.name} />
            <span className="tile-sheen" />
          </div>
        ) : (
          <div className="tile-card skeleton" />
        )}
        {chase && chase.tier >= 4 && (
          <span className="tile-stars" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
        <span className={`tile-status ${live ? "live" : ended ? "ended" : "sale"}`}>
          {live ? (
            <>
              <i /> LIVE
            </>
          ) : ended ? (
            "Ended"
          ) : b.sale === 1 ? (
            "Auction"
          ) : (
            "On sale"
          )}
        </span>
        {!ended && !live && <span className="tile-left">{stale ? "—" : left > 0 ? `${left} left` : "Sold out"}</span>}
        {live && (
          <span className="tile-left">
            {b.cursor}/{b.nCards} out
          </span>
        )}
      </div>
      <div className="tile-body">
        <div className="tile-title">{b.title || "Untitled break"}</div>
        <div className="tile-host">
          {name(b.host)}
          {verified > 0 && <span className="tile-ver"> ✓ {verified}</span>}
          {b.mode === 1 && <span className="tile-tag">Teams</span>}
        </div>
        {chase && (
          <div className="tile-chase">
            <span style={{ color: TIER_COLORS[chase.tier] }}>{TIER_NAMES[chase.tier].toLowerCase()}</span> {chase.name}
          </div>
        )}
        <div className="tile-foot">
          <div>
            <span>Spot</span>
            <b>{usd(b.spotPrice, 0)}</b>
          </div>
          <div>
            <span>Box</span>
            <b>{usd(b.boxValue, 0)}</b>
          </div>
          <div>
            <span>Spots</span>
            <b>{b.nSpots}</b>
          </div>
        </div>
        <div className="tile-bar">
          <div className={live ? "live" : ended ? "ended" : ""} style={{ width: stale ? "0%" : `${Math.max(2, k * 100)}%` }} />
        </div>
      </div>
    </a>
  );
}
