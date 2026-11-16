// What a spot is worth right now. Every sealed position is equally likely to hold any card still
// in the box (the order is sealed in the TEE), so:
//   EV(spot)    = value already out of its pack + sealed positions x average sealed card value
//   chase odds  = sealed positions in the spot / sealed positions overall (while the chase is in)
import type { BreakState, CardInfo } from "../chain/layout";

export interface SpotOdds {
  spot: number;
  sealed: number;
  outValue: bigint;
  ev: number; // USD
  chaseOdds: number; // 0..1, 0 if the chase is already out
  hasChase: boolean; // the chase came out of this spot
}

export function chaseIndex(b: BreakState) {
  let best = 0;
  b.cardValue.forEach((v, i) => {
    if (v > b.cardValue[best]) best = i;
  });
  return best;
}

export function spotOdds(b: BreakState): SpotOdds[] {
  const per = b.perSpot;
  const out = new Set(b.revealed.filter((c) => c >= 0));
  const sealedTotal = b.nCards - out.size;
  let sealedValue = 0n;
  b.cardValue.forEach((v, i) => {
    if (!out.has(i)) sealedValue += v;
  });
  const avg = sealedTotal > 0 ? Number(sealedValue) / 1e6 / sealedTotal : 0;
  const chase = chaseIndex(b);
  const chaseIn = !out.has(chase);
  return Array.from({ length: b.nSpots }, (_, s) => {
    let sealed = 0;
    let outValue = 0n;
    let hasChase = false;
    for (let k = 0; k < per; k++) {
      const c = b.revealed[s * per + k];
      if (c < 0) sealed++;
      else {
        outValue += b.cardValue[c];
        if (c === chase) hasChase = true;
      }
    }
    return { spot: s, sealed, outValue, ev: Number(outValue) / 1e6 + sealed * avg, chaseOdds: chaseIn && sealedTotal > 0 ? sealed / sealedTotal : 0, hasChase };
  });
}

export const pct = (x: number) => (x === 0 ? "—" : x >= 0.995 ? "100%" : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);

export function chaseCard(b: BreakState, cards: (CardInfo | null)[]) {
  return cards[chaseIndex(b)] ?? null;
}
