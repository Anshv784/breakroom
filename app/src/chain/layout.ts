// Decoders for the zero-copy accounts. Offsets come from the Rust structs themselves
// (cargo test print_layout -> layout.gen.json), so they can't drift.
import { PublicKey } from "@solana/web3.js";
import L from "./layout.gen.json";

export const MAX_SPOTS = 16;
export const MAX_CARDS = 64;
export const TRADE_LOG = 48;

export const ST = { DRAFT: 0, SELLING: 1, SHUFFLING: 2, LIVE: 3, ENDED: 4, SETTLED: 5, CANCELLED: 6 } as const;
export const STATUS_LABEL = ["Draft", "On sale", "Shuffling", "Live", "Ended", "Settled", "Cancelled"];
export const TIER = { BASE: 0, RARE: 1, EPIC: 2, LEGEND: 3, CHASE: 4 } as const;
export const TIER_LABEL = ["Base", "Rare", "Epic", "Legendary", "Chase"];
export const TRADE_KIND = ["Spot sale", "Bought", "Bid hit", "Unsold to host"];

const ZERO = PublicKey.default.toBase58();

class R {
  dv: DataView;
  constructor(public b: Uint8Array, public base = 8) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  u8 = (o: number) => this.b[this.base + o];
  u32 = (o: number) => this.dv.getUint32(this.base + o, true);
  u64 = (o: number) => this.dv.getBigUint64(this.base + o, true);
  i64 = (o: number) => Number(this.dv.getBigInt64(this.base + o, true));
  key = (o: number) => new PublicKey(this.b.subarray(this.base + o, this.base + o + 32));
  bytes = (o: number, n: number) => this.b.slice(this.base + o, this.base + o + n);
  keys = (o: number, n: number) => Array.from({ length: n }, (_, i) => this.key(o + i * 32));
  u64s = (o: number, n: number) => Array.from({ length: n }, (_, i) => this.u64(o + i * 8));
  str = (o: number, n: number) => {
    const raw = this.bytes(o, n);
    const end = raw.indexOf(0);
    return new TextDecoder().decode(end < 0 ? raw : raw.subarray(0, end));
  };
}

export interface Trade {
  price: bigint;
  ts: number;
  buyer: PublicKey;
  seller: PublicKey;
  spot: number;
  kind: number;
}

export interface BreakState {
  breakId: bigint;
  spotPrice: bigint;
  createdAt: number;
  soldOutAt: number;
  shuffleRequestedAt: number;
  nextRevealMs: number;
  endedAt: number;
  hostRevenue: bigint;
  secondaryVolume: bigint;
  volume: bigint;
  fees: bigint;
  boxValue: bigint;
  host: PublicKey;
  mint: PublicKey;
  commitment: Uint8Array;
  cards: PublicKey[];
  cardValue: bigint[];
  cardTier: number[];
  /** position -> card index, or -1 while sealed */
  revealed: number[];
  spotOwner: (PublicKey | null)[];
  spotCost: bigint[];
  ask: bigint[];
  bid: bigint[];
  bidder: (PublicKey | null)[];
  reserved: (PublicKey | null)[];
  reserveUntil: number[];
  lastPrice: bigint[];
  openOrder: number[];
  trades: Trade[];
  title: string;
  nSpots: number;
  perSpot: number;
  nCards: number;
  deposited: number;
  status: number;
  sold: number;
  cursor: number;
  nTrades: number;
  revealMs: number;
  /** 1 = VRF, 2 = TEE fallback, 0 = not yet */
  seedSource: number;
}

const orNull = (k: PublicKey) => (k.toBase58() === ZERO ? null : k);

export const BREAK_LEN = 8 + L.Break.__size;

export function decodeBreak(data: Uint8Array): BreakState {
  const r = new R(data);
  const o = L.Break;
  const T = L.Trade;
  const nSpots = r.u8(o.n_spots);
  const perSpot = r.u8(o.per_spot);
  const nCards = nSpots * perSpot;
  const head = r.u8(o.trade_head);
  const nTrades = r.u32(o.n_trades);
  const trades: Trade[] = [];
  for (let k = 1; k <= Math.min(nTrades, TRADE_LOG); k++) {
    const i = (head - k + TRADE_LOG) % TRADE_LOG; // newest first
    const at = o.trades + i * T.__size;
    trades.push({ price: r.u64(at + T.price), ts: r.i64(at + T.ts), buyer: r.key(at + T.buyer), seller: r.key(at + T.seller), spot: r.u8(at + T.spot), kind: r.u8(at + T.kind) });
  }
  return {
    breakId: r.u64(o.break_id),
    spotPrice: r.u64(o.spot_price),
    createdAt: r.i64(o.created_at),
    soldOutAt: r.i64(o.sold_out_at),
    shuffleRequestedAt: r.i64(o.shuffle_requested_at),
    nextRevealMs: r.i64(o.next_reveal_ms),
    endedAt: r.i64(o.ended_at),
    hostRevenue: r.u64(o.host_revenue),
    secondaryVolume: r.u64(o.secondary_volume),
    volume: r.u64(o.volume),
    fees: r.u64(o.fees),
    boxValue: r.u64(o.box_value),
    host: r.key(o.host),
    mint: r.key(o.mint),
    commitment: r.bytes(o.commitment, 32),
    cards: r.keys(o.cards, nCards),
    cardValue: r.u64s(o.card_value, nCards),
    cardTier: Array.from(r.bytes(o.card_tier, nCards)),
    revealed: Array.from(r.bytes(o.revealed, nCards)).map((v) => v - 1),
    spotOwner: r.keys(o.spot_owner, nSpots).map(orNull),
    spotCost: r.u64s(o.spot_cost, nSpots),
    ask: r.u64s(o.ask, nSpots),
    bid: r.u64s(o.bid, nSpots),
    bidder: r.keys(o.bidder, nSpots).map(orNull),
    reserved: r.keys(o.reserved, nSpots).map(orNull),
    reserveUntil: Array.from({ length: nSpots }, (_, i) => r.i64(o.reserve_until + i * 8)),
    lastPrice: r.u64s(o.last_price, nSpots),
    openOrder: Array.from(r.bytes(o.open_order, nSpots)),
    trades,
    title: r.str(o.title, 48),
    nSpots,
    perSpot,
    nCards,
    deposited: r.u8(o.deposited),
    status: r.u8(o.status),
    sold: r.u8(o.sold),
    cursor: r.u8(o.cursor),
    nTrades,
    revealMs: r.u32(o.reveal_ms),
    seedSource: r.u8(o.seed_source),
  };
}

export interface ReceiptState {
  breakId: bigint;
  hostPaid: bigint;
  settledAt: number;
  host: PublicKey;
  cards: PublicKey[];
  recipient: (PublicKey | null)[];
  claimed: bigint;
  nCards: number;
  settled: boolean;
}

export function decodeReceipt(data: Uint8Array): ReceiptState {
  const r = new R(data);
  const o = L.Receipt;
  const n = r.u8(o.n_cards);
  return {
    breakId: r.u64(o.break_id),
    hostPaid: r.u64(o.host_paid),
    settledAt: r.i64(o.settled_at),
    host: r.key(o.host),
    cards: r.keys(o.cards, n),
    recipient: r.keys(o.recipient, n).map(orNull),
    claimed: r.u64(o.claimed),
    nCards: n,
    settled: r.u8(o.settled) === 1,
  };
}

export interface DeckState {
  seeded: boolean;
  breakId: bigint;
  randomness: Uint8Array;
  order: number[];
}

/** The Deck is an ephemeral account: no discriminator. Readable only once the break has ended. */
export function decodeDeck(data: Uint8Array, nCards: number): DeckState {
  const r = new R(data, 0);
  const o = L.Deck;
  return { seeded: r.u32(o.seeded) !== 0, breakId: r.u64(o.break_id), randomness: r.bytes(o.randomness, 32), order: Array.from(r.bytes(o.order, nCards)) };
}

/** Card appraisal record (Borsh, Anchor account). */
export interface CardInfo {
  mint: PublicKey;
  value: bigint;
  tier: number;
  grade: number;
  cert: bigint;
  name: string;
  set: string;
  art: number;
}

export function decodeCard(data: Uint8Array): CardInfo {
  const r = new R(data);
  return { mint: r.key(0), value: r.u64(32), tier: r.u8(40), grade: r.u8(41), cert: r.u64(42), name: r.str(50, 32), set: r.str(82, 24), art: r.u32(106) };
}

/** Player profile (Borsh, Anchor account). */
export interface ProfileInfo {
  owner: PublicKey;
  agent: PublicKey;
  name: string;
  spotsBought: number;
  trades: number;
  spent: bigint;
  earned: bigint;
  createdAt: number;
}

export function decodeProfile(data: Uint8Array): ProfileInfo {
  const r = new R(data);
  return { owner: r.key(0), agent: r.key(32), name: r.str(64, 20), spotsBought: r.u32(84), trades: r.u32(88), spent: r.u64(92), earned: r.u64(100), createdAt: r.i64(108) };
}
