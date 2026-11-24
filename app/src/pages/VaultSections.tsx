// The parts of the vault that read across every break: spots you hold, breaks you host, your
// history (what you pulled, profit or loss) and an activity feed. All computed from chain state.
import { useMemo } from "react";
import type { PublicKey } from "@solana/web3.js";
import { ST, type BreakState } from "../chain/layout";
import { oddsFor } from "../lib/breakmath";
import { leaderboard } from "../lib/rep";
import { useCards, useNames } from "../lib/useBreaks";
import { cardImage, faceOf, TIER_NAMES } from "../lib/art";
import { shortKey, usd } from "../state/store";
import { SpotBar, StatusChip } from "../ui/BreakCard";

const ago = (ts: number) => {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function useVaultData(list: BreakState[], me: PublicKey | undefined) {
  return useMemo(() => {
    if (!me) return null;
    const k = me.toBase58();
    const is = (x: PublicKey | null | undefined) => !!x && x.toBase58() === k;
    const open = list.filter((b) => b.status >= ST.SELLING && b.status <= ST.LIVE);
    const spots = open.flatMap((b) => {
      const odds = oddsFor(b);
      return b.spotOwner.map((o, i) => (is(o) ? { b, i, ev: odds[i].ev, chase: odds[i].chaseOdds, hasChase: odds[i].hasChase } : null)).filter((x): x is NonNullable<typeof x> => !!x);
    });
    const hosted = list.filter((b) => is(b.host) && b.status !== ST.CANCELLED).sort((a, b) => b.createdAt - a.createdAt);
    const { pulls, collectors } = leaderboard(list);
    const mine = collectors.find((c) => c.key === k);
    const myPulls = pulls.filter((p) => p.owner === k);
    const history = list
      .filter((b) => b.status >= ST.ENDED && b.status !== ST.CANCELLED && (b.spotOwner.some(is) || b.trades.some((t) => is(t.buyer) || is(t.seller))))
      .sort((a, b) => b.endedAt - a.endedAt)
      .map((b) => {
        let spent = 0;
        let earned = 0;
        for (const t of b.trades) {
          const p = Number(t.price) / 1e6;
          if (t.kind === 3) continue;
          if (is(t.buyer)) spent += p;
          if (is(t.seller)) earned += p * (t.kind === 0 ? 0.95 : 0.98);
        }
        const got = myPulls.filter((p) => p.breakId === b.breakId);
        const pulled = got.reduce((a, p) => a + p.value, 0);
        return { b, spent, earned, pulled, got, pnl: pulled + earned - spent, hosted: is(b.host) };
      });
    const activity = list
      .flatMap((b) => b.trades.filter((t) => is(t.buyer) || is(t.seller)).map((t) => ({ t, b })))
      .sort((x, y) => y.t.ts - x.t.ts)
      .slice(0, 40);
    const locked = hosted.filter((b) => b.status >= ST.SELLING && b.status <= ST.LIVE);
    return { spots, hosted, history, activity, locked, mine, myPulls };
  }, [list, me?.toBase58()]);
}

export function SpotsList({ spots }: { spots: NonNullable<ReturnType<typeof useVaultData>>["spots"] }) {
  if (spots.length === 0) return <Empty title="No open spots" body="Spots you hold in breaks that haven't finished show up here with their live odds." cta={["Find a break", "#/breaks"]} />;
  return (
    <div className="v-spots">
      {spots.map(({ b, i, ev, chase, hasChase }) => {
        const cost = Number(b.spotCost[i]) / 1e6;
        const up = ev >= cost;
        return (
          <a key={`${b.breakId}-${i}`} href={`#/break/${b.breakId}`} className="panel v-spot">
            <div className="v-spot-top">
              <StatusChip status={b.status} />
              <span className="faint mono">spot #{String(i + 1).padStart(2, "0")}</span>
            </div>
            <div className="v-spot-title">{b.title || "Untitled break"}</div>
            <div className="v-spot-nums">
              <div>
                <span>Paid</span>
                <b className="mono">{usd(cost)}</b>
              </div>
              <div>
                <span>Worth now</span>
                <b className={`mono ${up ? "up" : "down"}`}>{usd(ev)}</b>
              </div>
              <div>
                <span>Chase</span>
                <b className="mono">{hasChase ? "yours" : chase ? `${(chase * 100).toFixed(0)}%` : "gone"}</b>
              </div>
            </div>
            <div className="v-odds">
              <div style={{ width: `${hasChase ? 100 : Math.max(2, chase * 100)}%` }} />
            </div>
            <SpotBar b={b} />
            <span className="v-open">Open the room →</span>
          </a>
        );
      })}
    </div>
  );
}

export function HostingList({ hosted }: { hosted: BreakState[] }) {
  if (hosted.length === 0) return <Empty title="You haven't hosted yet" body="Lock a box, sell spots, get paid on every sale. In the public test you can start with 12 free Genesis test cards." cta={["Host a break", "#/host"]} />;
  return (
    <div className="panel v-table">
      <div className="v-row v-head">
        <span>Break</span>
        <span>Status</span>
        <span>Spots sold</span>
        <span>Box</span>
        <span>You earned</span>
      </div>
      {hosted.map((b) => (
        <a key={b.breakId.toString()} href={`#/break/${b.breakId}`} className="v-row">
          <span className="v-name">
            <b>{b.title || "Untitled break"}</b>
            <i className="faint">
              {b.nCards} cards{b.status >= ST.SELLING && b.status <= ST.LIVE ? " locked in the vault" : ""} · {b.sale === 1 ? "sealed auction, bidding" : b.sale === 2 ? "auction closed" : "fixed price"}
            </i>
          </span>
          <span>
            <StatusChip status={b.status} />
          </span>
          <span className="mono">
            {b.sold}/{b.nSpots}
          </span>
          <span className="mono">{usd(b.boxValue, 0)}</span>
          <span className="mono up">{usd(b.hostRevenue)}</span>
        </a>
      ))}
    </div>
  );
}

function PullThumbs({ b, idx }: { b: BreakState; idx: number[] }) {
  const cards = useCards(b.cards);
  return (
    <span className="v-thumbs">
      {idx.slice(0, 6).map((c) => {
        const info = cards[c];
        return info ? <img key={c} src={cardImage(faceOf(info))} alt={info.name} title={`${info.name} · ${TIER_NAMES[info.tier]} · ${usd(info.value, 0)}`} /> : <i key={c} />;
      })}
      {idx.length > 6 && <em className="faint mono">+{idx.length - 6}</em>}
    </span>
  );
}

export function HistoryList({ history }: { history: NonNullable<ReturnType<typeof useVaultData>>["history"] }) {
  if (history.length === 0) return <Empty title="No finished breaks yet" body="Once a break you're in ends, you'll see what you pulled, what it was worth and a link to verify it." cta={["Browse breaks", "#/breaks"]} />;
  return (
    <div className="panel v-table">
      <div className="v-row v-head hist">
        <span>Break</span>
        <span>You pulled</span>
        <span>Spent</span>
        <span>Value</span>
        <span>Result</span>
        <span />
      </div>
      {history.map((h) => (
        <div key={h.b.breakId.toString()} className="v-row hist">
          <span className="v-name">
            <b>{h.b.title || "Untitled break"}</b>
            <i className="faint">
              {ago(h.b.endedAt)}
              {h.hosted ? " · you hosted" : ""}
            </i>
          </span>
          <span>{h.got.length ? <PullThumbs b={h.b} idx={h.got.map((p) => p.card)} /> : <span className="faint">{h.hosted ? `hosted · ${h.b.sold}/${h.b.nSpots} spots sold` : "sold your spot before the rip"}</span>}</span>
          <span className="mono">{usd(h.spent, 0)}</span>
          <span className="mono">{usd(h.pulled + h.earned, 0)}</span>
          <span className={`mono ${h.pnl >= 0 ? "up" : "down"}`}>
            {h.pnl >= 0 ? "+" : "−"}
            {usd(Math.abs(h.pnl), 0)}
          </span>
          <span className="v-links">
            <a href={`#/break/${h.b.breakId}`}>Replay</a>
            <a href={`#/verify/${h.b.breakId}`}>Verify</a>
          </span>
        </div>
      ))}
    </div>
  );
}

export function ActivityList({ activity, me }: { activity: NonNullable<ReturnType<typeof useVaultData>>["activity"]; me: PublicKey }) {
  const names = useNames(activity.flatMap(({ t }) => [t.buyer, t.seller]));
  if (activity.length === 0) return <Empty title="No activity yet" body="Every spot you buy, sell or keep shows up here." cta={["Find a break", "#/breaks"]} />;
  const k = me.toBase58();
  return (
    <div className="panel v-feed">
      {activity.map(({ t, b }, n) => {
        const bought = t.buyer.toBase58() === k;
        const verb = t.kind === 3 ? "Kept unsold" : bought ? (t.kind === 0 ? "Bought" : "Bought from " + (names(t.seller) || shortKey(t.seller))) : t.kind === 0 ? "Sold to " + (names(t.buyer) || shortKey(t.buyer)) : "Resold to " + (names(t.buyer) || shortKey(t.buyer));
        const sign = t.kind === 3 ? "" : bought ? "−" : "+";
        return (
          <a key={n} href={`#/break/${b.breakId}`} className="v-act">
            <span className={`v-dot ${t.kind === 3 ? "" : bought ? "buy" : "sell"}`} />
            <span className="v-act-text">
              <b>{verb}</b> <span className="muted">spot #{t.spot + 1} in {b.title || "Untitled break"}</span>
            </span>
            <span className={`mono ${bought ? "" : "up"}`}>
              {t.kind === 3 ? "—" : `${sign}${usd(t.price)}`}
            </span>
            <span className="faint" style={{ fontSize: 12, minWidth: 64, textAlign: "right" }}>
              {ago(t.ts)}
            </span>
          </a>
        );
      })}
    </div>
  );
}

export function Empty({ title, body, cta }: { title: string; body: string; cta?: [string, string | (() => void)] }) {
  return (
    <div className="panel v-empty">
      <div className="v-empty-art">
        <span />
        <span />
        <span />
      </div>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {cta &&
        (typeof cta[1] === "string" ? (
          <a href={cta[1]} className="btn sm">
            {cta[0]}
          </a>
        ) : (
          <button className="btn sm" onClick={cta[1]}>
            {cta[0]}
          </button>
        ))}
    </div>
  );
}
