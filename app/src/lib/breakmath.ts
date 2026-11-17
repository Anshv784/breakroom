// Shared break math for both formats.
//  packs: spot s owns positions [s*per, (s+1)*per); spots open in openOrder, cards in order.
//  teams: VRF deals the 8 elements across the spots (revealed one spot at a time), then every
//         card goes to the spot holding its element; cards come out in the sealed order.
import type { BreakState } from "../chain/layout";

export const ELEMENTS = ["Ember", "Tidal", "Stone", "Void", "Storm", "Bloom", "Frost", "Solar"];
export const ELEMENT_COLORS = ["#ff7a3d", "#3ad7ff", "#c9b48a", "#b58cff", "#9fe3ff", "#6dffa8", "#e2f6ff", "#ffd27a"];

export const teamNames = (mask: number) => ELEMENTS.filter((_, e) => mask & (1 << e));

/** Positions in the order they are (or will be) revealed. */
export function revealSequence(b: BreakState): number[] {
  if (b.mode === 1) return Array.from({ length: b.nCards }, (_, k) => k);
  const per = b.perSpot;
  return Array.from({ length: b.nCards }, (_, k) => b.openOrder[Math.floor(k / per)] * per + (k % per));
}

/** Which spot ends up with the card revealed at `pos` (-1 if not decidable yet). */
export function spotOfPos(b: BreakState, pos: number): number {
  if (b.mode !== 1) return Math.floor(pos / b.perSpot);
  const c = b.revealed[pos];
  if (c < 0) return -1;
  return b.spotTeam.findIndex((t) => (t & (1 << b.cardElem[c])) !== 0);
}

/** How many cards each spot gets in total (team mode: known once its team is revealed). */
export function cardsPerSpot(b: BreakState): number[] {
  if (b.mode !== 1) return Array(b.nSpots).fill(b.perSpot);
  return Array.from({ length: b.nSpots }, (_, s) => b.cardElem.filter((e) => (b.spotTeam[s] & (1 << e)) !== 0).length);
}

/** For every revealed position: its spot and its index among that spot's cards. */
export function placements(b: BreakState) {
  const seen = Array(b.nSpots).fill(0);
  const out = new Map<number, { spot: number; k: number }>();
  for (const pos of revealSequence(b)) {
    if (b.revealed[pos] < 0) continue;
    const spot = spotOfPos(b, pos);
    if (spot < 0) continue;
    out.set(pos, { spot, k: seen[spot]++ });
  }
  return out;
}

/** Elements each spot will receive in team mode (round-robin over 8 shuffled elements). */
const elementsDealt = (n: number, s: number) => Math.floor(8 / n) + (s < 8 % n ? 1 : 0);

export interface SpotOddsT {
  spot: number;
  sealed: number;
  ev: number;
  chaseOdds: number;
  hasChase: boolean;
  /** packs: pack fully out; teams: team revealed */
  settledValue: boolean;
}

export function chaseIndex(b: BreakState) {
  let best = 0;
  b.cardValue.forEach((v, i) => {
    if (v > b.cardValue[best]) best = i;
  });
  return best;
}

/** Odds + expected value per spot for a (possibly partial) break state. */
export function oddsFor(b: BreakState): SpotOddsT[] {
  const chase = chaseIndex(b);
  if (b.mode === 1) {
    // value by element
    const elemValue = Array(8).fill(0);
    b.cardElem.forEach((e, c) => (elemValue[e] += Number(b.cardValue[c]) / 1e6));
    const assigned = b.spotTeam.slice(0, b.nSpots).reduce((a, t) => a | t, 0);
    const freeElems = [0, 1, 2, 3, 4, 5, 6, 7].filter((e) => !(assigned & (1 << e)));
    const freeValue = freeElems.reduce((a, e) => a + elemValue[e], 0);
    const freeCount = freeElems.length;
    const chaseElem = b.cardElem[chase];
    return Array.from({ length: b.nSpots }, (_, s) => {
      const t = b.spotTeam[s];
      if (t) {
        const ev = [0, 1, 2, 3, 4, 5, 6, 7].filter((e) => t & (1 << e)).reduce((a, e) => a + elemValue[e], 0);
        return { spot: s, sealed: 0, ev, chaseOdds: t & (1 << chaseElem) ? 1 : 0, hasChase: !!(t & (1 << chaseElem)), settledValue: true };
      }
      const k = elementsDealt(b.nSpots, s);
      const share = freeCount > 0 ? k / freeCount : 0;
      return { spot: s, sealed: k, ev: freeValue * share, chaseOdds: assigned & (1 << chaseElem) ? 0 : share, hasChase: false, settledValue: false };
    });
  }
  const per = b.perSpot;
  const out = new Set(b.revealed.filter((c) => c >= 0));
  const sealedTotal = b.nCards - out.size;
  let sealedValue = 0n;
  b.cardValue.forEach((v, i) => {
    if (!out.has(i)) sealedValue += v;
  });
  const avg = sealedTotal > 0 ? Number(sealedValue) / 1e6 / sealedTotal : 0;
  const chaseIn = !out.has(chase);
  return Array.from({ length: b.nSpots }, (_, s) => {
    let sealed = 0;
    let outValue = 0;
    let hasChase = false;
    for (let k = 0; k < per; k++) {
      const c = b.revealed[s * per + k];
      if (c < 0) sealed++;
      else {
        outValue += Number(b.cardValue[c]) / 1e6;
        if (c === chase) hasChase = true;
      }
    }
    return { spot: s, sealed, ev: outValue + sealed * avg, chaseOdds: chaseIn && sealedTotal > 0 ? sealed / sealedTotal : 0, hasChase, settledValue: sealed === 0 };
  });
}

/** The break as it looked after `steps` reveals (team reveals first in team mode). */
export function snapshot(b: BreakState, steps: number): BreakState {
  const seq = revealSequence(b);
  const teamSteps = b.mode === 1 ? b.nSpots : 0;
  const ts = Math.min(steps, teamSteps);
  const cs = Math.max(0, Math.min(b.nCards, steps - teamSteps));
  const revealed = Array(b.nCards).fill(-1);
  for (let k = 0; k < cs; k++) revealed[seq[k]] = b.revealed[seq[k]];
  const spotTeam = b.spotTeam.map((t, s) => (b.mode === 1 && b.openOrder.slice(0, ts).includes(s) ? t : 0));
  return { ...b, revealed, spotTeam, teamsOut: ts, cursor: cs, status: steps >= teamSteps + b.nCards ? 4 : 3 };
}

/** Total reveal steps of a break (team reveals + cards). */
export const totalSteps = (b: BreakState) => (b.mode === 1 ? b.nSpots : 0) + b.nCards;
export const stepsDone = (b: BreakState) => (b.mode === 1 ? b.teamsOut : 0) + b.cursor;

/** A spot's expected value after each reveal step, for the price chart. */
export function evHistory(b: BreakState, spot: number): number[] {
  const n = Math.min(stepsDone(b), totalSteps(b));
  return Array.from({ length: n + 1 }, (_, t) => oddsFor(snapshot(b, t))[spot].ev);
}
