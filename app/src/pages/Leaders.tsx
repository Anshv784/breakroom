// Leaderboard: collectors by profit, biggest pulls, and host reputation — all computed from the
// breaks on chain (no indexer).
import { Avatar } from "../ui/Avatar";
import "./leaders.css";
import { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useBreakList, useCards, useNames } from "../lib/useBreaks";
import { hostRep, leaderboard } from "../lib/rep";
import { cardImage, faceOf, TIER_COLORS, TIER_NAMES } from "../lib/art";
import { usd } from "../state/store";
import { useApp } from "../state/store";

const COLORS = ["#7cf7e4", "#b58cff", "#ffd27a", "#ff8fb8", "#8fd3ff", "#9ff5c8", "#ffb38a", "#c9b8ff"];
const colorOf = (k: string) => COLORS[[...k].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % COLORS.length];

export default function Leaders() {
  const { list, loading } = useBreakList(15_000);
  const { collectors, pulls } = useMemo(() => leaderboard(list), [list]);
  const [sort, setSort] = useState<"profit" | "pulled" | "spots">("profit");
  const top = pulls.slice(0, 9);
  const topCards = useCards(top.map((p) => p.mint));
  const hosts = useMemo(() => {
    const keys = [...new Set(list.map((b) => b.host.toBase58()))];
    return keys.map((k) => ({ k, ...hostRep(list, new PublicKey(k)) })).sort((a, b) => b.verified - a.verified || b.hosted - a.hosted);
  }, [list]);
  const ranked = useMemo(() => [...collectors].sort((a, b) => (sort === "profit" ? b.profit - a.profit : sort === "pulled" ? b.pulled - a.pulled : b.spots - a.spots)), [collectors, sort]);
  const names = useNames([...collectors.slice(0, 30).map((c) => new PublicKey(c.key)), ...hosts.map((h) => new PublicKey(h.k)), ...top.map((p) => new PublicKey(p.owner))]);
  const me = useApp((s) => s.client?.me.toBase58());
  const n = (k: string) => names(new PublicKey(k));
  const podium = ranked.slice(0, 3);
  const best = top[0];
  const bestCard = topCards[0];
  const totals = useMemo(() => ({ pulled: collectors.reduce((a, c) => a + c.pulled, 0), cards: pulls.length, collectors: collectors.length }), [collectors, pulls]);

  return (
    <div className="wrap lb">
      <div className="lb-head">
        <div>
          <h1 className="display">Leaderboard</h1>
          <p className="muted">Live from every break on chain: spots bought, spots sold, cards pulled.</p>
        </div>
        <div className="lb-totals">
          <div>
            <b className="mono">{totals.collectors}</b>
            <span>collectors</span>
          </div>
          <div>
            <b className="mono">{totals.cards}</b>
            <span>cards pulled</span>
          </div>
          <div>
            <b className="mono">{usd(totals.pulled, 0)}</b>
            <span>value pulled</span>
          </div>
        </div>
      </div>

      {loading && collectors.length === 0 ? (
        <div className="skeleton" style={{ height: 420, borderRadius: 22 }} />
      ) : (
        <>
          {/* the biggest pull, and the top three */}
          <section className="lb-hero">
            {best && (
              <a href={`#/break/${best.breakId}`} className="lb-best" style={{ ["--tc" as any]: TIER_COLORS[best.tier] }}>
                <div className="lb-best-art">{bestCard ? <img src={cardImage(faceOf(bestCard))} alt={bestCard.name} /> : <div className="skeleton" />}</div>
                <div className="lb-best-info">
                  <span className="eyebrow">Biggest pull</span>
                  <b className="display">{bestCard?.name ?? "…"}</b>
                  <span className="lb-best-val mono">{usd(best.value, 0)}</span>
                  <span className="muted">
                    <span style={{ color: TIER_COLORS[best.tier] }}>{TIER_NAMES[best.tier].toLowerCase()}</span> · pulled by <b style={{ color: colorOf(best.owner) }}>{n(best.owner)}</b>
                  </span>
                  <span className="faint">{best.title}</span>
                </div>
              </a>
            )}
            <div className="lb-podium">
              {[1, 0, 2].map((i) => {
                const c = podium[i];
                if (!c) return <div key={i} />;
                return (
                  <div key={c.key} className={`pod pod${i + 1}`}>
                    <span className="pod-av"><Avatar k={c.key} size={i === 0 ? 60 : 48} ring={i === 0 ? "#f1cf7a" : i === 1 ? "#c9ccd4" : "#d79a6a"} /></span>
                    <b className="pod-name">{n(c.key)}</b>
                    <span className={`pod-val mono ${c.profit >= 0 ? "up" : "down"}`}>
                      {c.profit >= 0 ? "+" : "−"}
                      {usd(Math.abs(c.profit), 0)}
                    </span>
                    <div className="pod-step">
                      <span className="pod-rank">{i + 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* biggest pulls strip */}
          <section className="lb-sec">
            <h2 className="display">Biggest pulls</h2>
            <div className="lb-pulls">
              {top.slice(1).map((p, i) => {
                const c = topCards[i + 1];
                return (
                  <a key={`${p.breakId}-${p.card}`} href={`#/break/${p.breakId}`} className="lb-pull">
                    {c ? <img src={cardImage(faceOf(c))} alt={c.name} /> : <div className="skeleton" style={{ aspectRatio: "512/716" }} />}
                    <div className="lb-pull-meta">
                      <b className="mono">{usd(p.value, 0)}</b>
                      <span style={{ color: colorOf(p.owner) }}>{n(p.owner)}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>

          <div className="lb-grid">
            <section>
              <div className="lb-sec-head">
                <h2 className="display">Collectors</h2>
                <div className="lb-sort">
                  {(["profit", "pulled", "spots"] as const).map((k) => (
                    <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>
                      {k === "profit" ? "Profit" : k === "pulled" ? "Pulled" : "Spots"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel lb-table">
                <div className="lb-row lb-th">
                  <span>#</span>
                  <span>Collector</span>
                  <span>Spots</span>
                  <span>Spent</span>
                  <span>Pulled</span>
                  <span>Profit</span>
                </div>
                {ranked.slice(0, 25).map((c, i) => (
                  <div key={c.key} className={`lb-row ${c.key === me ? "me" : ""}`}>
                    <span className="lb-rank mono">{i + 1}</span>
                    <span className="lb-who">
                      <Avatar k={c.key} size={24} />
                      <b>{n(c.key)}</b>
                      {c.key === me && <em>you</em>}
                    </span>
                    <span className="mono">{c.spots}</span>
                    <span className="mono">{usd(c.spent, 0)}</span>
                    <span className="mono">{usd(c.pulled, 0)}</span>
                    <span className={`mono ${c.profit >= 0 ? "up" : "down"}`}>
                      {c.profit >= 0 ? "+" : "−"}
                      {usd(Math.abs(c.profit), 0)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <div className="lb-sec-head">
                <h2 className="display">Hosts</h2>
              </div>
              <div className="lb-hosts">
                {hosts.map((h) => {
                  const fair = h.priceToValue;
                  return (
                    <div key={h.k} className="panel lb-host">
                      <div className="lb-host-top">
                        <Avatar k={h.k} size={26} />
                        <b>{n(h.k)}</b>
                        {h.verified > 0 && <span className="lb-ver">✓ {h.verified} verified</span>}
                      </div>
                      <div className="lb-host-stats">
                        <div>
                          <b className="mono">{h.hosted}</b>
                          <span>hosted</span>
                        </div>
                        <div>
                          <b className="mono">{h.completed}</b>
                          <span>completed</span>
                        </div>
                        <div>
                          <b className={`mono ${fair <= 1.05 ? "up" : ""}`}>{(fair * 100).toFixed(0)}%</b>
                          <span>of fair value</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
