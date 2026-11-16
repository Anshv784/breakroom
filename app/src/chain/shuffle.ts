// Re-run a break's shuffle in the browser, exactly as the program does inside the TEE
// (programs/breakroom/src/instructions/live.rs `shuffle`). Once a break has ended its Deck is
// public: anyone can take the VRF seed, re-derive every card's position and check the commitment.
import { sha256 } from "@noble/hashes/sha256";
import type { PublicKey } from "@solana/web3.js";

class Stream {
  private counter = 0;
  private buf = new Uint8Array(32);
  private at = 32;
  constructor(private seed: Uint8Array) {}
  private nextU32() {
    if (this.at >= 32) {
      const c = new Uint8Array(4);
      new DataView(c.buffer).setUint32(0, this.counter, true);
      const m = new Uint8Array(36);
      m.set(this.seed);
      m.set(c, 32);
      this.buf = sha256(m);
      this.counter++;
      this.at = 0;
    }
    const v = new DataView(this.buf.buffer, this.buf.byteOffset).getUint32(this.at, true);
    this.at += 4;
    return v;
  }
  below(n: number) {
    const MAX = 0xffffffff;
    const zone = MAX - (MAX % n);
    for (;;) {
      const v = this.nextU32();
      if (v < zone) return v % n;
    }
  }
}

/** position -> card index, and the order the spots open in. */
export function shuffle(seed: Uint8Array, nCards: number, nSpots: number) {
  const st = new Stream(seed);
  const order = Array.from({ length: nCards }, (_, i) => i);
  for (let i = nCards - 1; i >= 1; i--) {
    const j = st.below(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const spots = Array.from({ length: nSpots }, (_, i) => i);
  for (let i = nSpots - 1; i >= 1; i--) {
    const j = st.below(i + 1);
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  return { order, spots };
}

/** sha256(break_id ‖ for each slot: mint ‖ value) — must equal the commitment sealed before the sale. */
export function commitment(breakId: bigint, cards: PublicKey[], values: bigint[]) {
  const parts: Uint8Array[] = [];
  const id = new Uint8Array(8);
  new DataView(id.buffer).setBigUint64(0, breakId, true);
  parts.push(id);
  cards.forEach((c, i) => {
    parts.push(c.toBytes());
    const v = new Uint8Array(8);
    new DataView(v.buffer).setBigUint64(0, values[i], true);
    parts.push(v);
  });
  const total = parts.reduce((n, p) => n + p.length, 0);
  const all = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return sha256(all);
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
