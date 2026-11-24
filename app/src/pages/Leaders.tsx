// Leaderboard: collectors by profit, biggest pulls, and host reputation — all computed from the
// breaks on chain (no indexer).
import "./leaders.css";
import { useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import { useBreakList, useCards, useNames } from "../lib/useBreaks";
import { hostRep, leaderboard } from "../lib/rep";
import { cardImage, faceOf, TIER_COLORS, TIER_NAMES } from "../lib/art";
import { usd } from "../state/store";
import { useApp } from "../state/store";

export default function Leaders() {
  const { list, loading } = useBreakList(15_000);
  const { collectors, pulls } = useMemo(() => leaderboard(list), [list]);
  const top = pulls.slice(0, 8);
  const topCards = useCards(top.map((p) => p.mint));
  const hosts = useMemo(() => {
    const keys = [...new Set(list.map((b) => b.host.toBase58()))];
    return keys
      .map((k) => ({ k, ...hostRep(list, new PublicKey(k)) }))
      .sort((a, b) => b.verified - a.verified || b.hosted - a.hosted);
  }, [list]);
  const names = useNames([...collectors.slice(0, 25).map((c) => new PublicKey(c.key)), ...hosts.map((h) => new PublicKey(h.k)), ...top.map((p) => new PublicKey(p.owner))]);
  const me = useApp((s) => s.client?.me.toBase58());
  const n = (k: string) => names(new PublicKey(k));
  return (
    <div className="wrap" style={{ padding: "40px 24px 80px" }}>
      <div className="eyebrow">Leaderboard</div>
      <h1 className="display" style={{ fontSize: 36, margin: "8px 0 6px" }}>Who's ripping.</h1>
      <p className="muted" style={{ marginTop: 0 }}>Computed live from every break on chain: spots bought, spots sold, cards pulled.</p>

      <h2 className="display" style={{ fontSize: 22, margin: "32px 0 14px" }}>Biggest pulls</h2>
      {loading ? (
        <div className="skeleton" style={{ height: 220 }} />
      ) : top.length === 0 ? (
        <p className="faint">No finished breaks yet — the first big pull lands here.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(128px,1fr))", gap: 14 }}>
          {top.map((p, i) => {
            const c = topCards[i];
            return (
              <a key={`${p.breakId}-${p.card}`} href={`#/break/${p.breakId}`} className={`bp ${i === 0 ? "first" : ""}`} style={{ display: "grid", gap: 6, ["--tint" as any]: TIER_COLORS[p.tier], ["--d" as any]: `${i * 0.7}s` }}>
                <span className="bp-frame">
                  {c ? <img src={cardImage(faceOf(c))} alt={c.name} style={{ width: "100%", display: "block", borderRadius: 8, boxShadow: `0 16px 40px -18px ${TIER_COLORS[p.tier]}` }} /> : <div className="skeleton" style={{ aspectRatio: "512/716" }} />}
                  <i className="bp-sheen" />
                </span>
                <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                  <span className={`mono tier-${p.tier}`}>{TIER_NAMES[p.tier]}</span>
                  <span className="mono">{usd(p.value, 0)}</span>
                </div>
                <div className="faint" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {n(p.owner)} · {p.title}
                </div>
              </a>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 20, marginTop: 36 }} className="leaders-grid">
        <section>
          <h2 className="display" style={{ fontSize: 22, margin: "0 0 14px" }}>Collectors</h2>
          <div className="panel" style={{ padding: 8 }}>
            <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr className="faint" style={{ textAlign: "right", fontSize: 11 }}>
                  <th style={{ textAlign: "left", padding: 8 }}>#</th>
                  <th style={{ textAlign: "left" }}>Collector</th>
                  <th>Spent</th>
                  <th>Pulled</th>
                  <th>Sold</th>
                  <th style={{ paddingRight: 8 }}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {collectors.slice(0, 25).map((c, i) => (
                  <tr key={c.key} className={i < 3 ? `podium p${i + 1}` : undefined} style={{ borderTop: "1px solid var(--line)", textAlign: "right", background: c.key === me ? "rgba(79,227,161,.06)" : undefined }}>
                    <td style={{ textAlign: "left", padding: 8 }} className="faint">{i < 3 ? <span className="medal">{i + 1}</span> : i + 1}</td>
                    <td style={{ textAlign: "left", fontFamily: "var(--sans)", fontWeight: 600 }}>{n(c.key)}{c.key === me ? <span className="up"> · you</span> : null}</td>
                    <td>{usd(c.spent, 0)}</td>
                    <td>{usd(c.pulled, 0)}</td>
                    <td>{usd(c.earned, 0)}</td>
                    <td style={{ paddingRight: 8 }} className={c.profit >= 0 ? "up" : "down"}>{c.profit >= 0 ? "+" : "−"}{usd(Math.abs(c.profit), 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2 className="display" style={{ fontSize: 22, margin: "0 0 14px" }}>Hosts</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {hosts.map((h) => (
              <div key={h.k} className="panel" style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                <b>{n(h.k)}</b>
                <span className="chip" style={{ color: h.verified ? "var(--up)" : undefined }}>✓ {h.verified} verified</span>
                <span className="faint" style={{ fontSize: 12 }}>
                  {h.hosted} hosted · {h.completed} completed · priced at {(h.priceToValue * 100).toFixed(0)}% of fair value
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <style>{`@media (max-width: 900px){ .leaders-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
