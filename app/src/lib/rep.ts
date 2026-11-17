// Reputation + leaderboard, computed from the breaks themselves (no indexer, no server).
import type { PublicKey } from "@solana/web3.js";
import { ST, type BreakState } from "../chain/layout";
import { spotOfPos } from "./breakmath";

export interface HostRep {
  hosted: number;
  completed: number;
  /** completed with a VRF seed and settled on Solana */
  verified: number;
  /** average spot price / fair value per spot */
  priceToValue: number;
}

export function hostRep(list: BreakState[], host: PublicKey): HostRep {
  const mine = list.filter((b) => b.host.equals(host));
  const completed = mine.filter((b) => b.status >= ST.ENDED);
  const verified = completed.filter((b) => b.seedSource === 1 && b.settleSent);
  const ratios = mine.filter((b) => b.boxValue > 0n).map((b) => Number(b.spotPrice) / (Number(b.boxValue) / b.nSpots));
  return {
    hosted: mine.length,
    completed: completed.length,
    verified: verified.length,
    priceToValue: ratios.length ? ratios.reduce((a, x) => a + x, 0) / ratios.length : 0,
  };
}

export interface Collector {
  key: string;
  spent: number;
  earned: number;
  pulled: number;
  profit: number;
  spots: number;
  best: { card: number; value: number; breakId: bigint; title: string } | null;
}

export interface Pull {
  owner: string;
  card: number;
  value: number;
  tier: number;
  breakId: bigint;
  title: string;
  mint: PublicKey;
}

/** Per wallet: what they paid for spots, what they earned selling them, what they pulled. */
export function leaderboard(list: BreakState[]) {
  const m = new Map<string, Collector>();
  const get = (k: string) => {
    let c = m.get(k);
    if (!c) m.set(k, (c = { key: k, spent: 0, earned: 0, pulled: 0, profit: 0, spots: 0, best: null }));
    return c;
  };
  const pulls: Pull[] = [];
  for (const b of list) {
    for (const t of b.trades) {
      const price = Number(t.price) / 1e6;
      if (t.kind === 3) continue; // unsold to host: nothing paid
      get(t.buyer.toBase58()).spent += price;
      get(t.buyer.toBase58()).spots += 1;
      // hosts get 95% of primary sales, sellers 98% of secondary
      get(t.seller.toBase58()).earned += price * (t.kind === 0 ? 0.95 : 0.98);
    }
    if (b.status < ST.ENDED) continue;
    b.revealed.forEach((c, pos) => {
      if (c < 0) return;
      const s = spotOfPos(b, pos);
      const owner = b.spotOwner[s];
      if (!owner) return;
      const v = Number(b.cardValue[c]) / 1e6;
      const col = get(owner.toBase58());
      col.pulled += v;
      if (!col.best || v > col.best.value) col.best = { card: c, value: v, breakId: b.breakId, title: b.title };
      pulls.push({ owner: owner.toBase58(), card: c, value: v, tier: b.cardTier[c], breakId: b.breakId, title: b.title, mint: b.cards[c] });
    });
  }
  const collectors = [...m.values()].map((c) => ({ ...c, profit: c.pulled + c.earned - c.spent }));
  collectors.sort((a, b) => b.profit - a.profit);
  pulls.sort((a, b) => b.value - a.value);
  return { collectors, pulls };
}
