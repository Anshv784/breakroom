//! Accounts.
//!
//! A break lives in two places:
//! * `Break` — public. Created on Solana, delegated to the TEE for the sale, the live opening and
//!   the spot market, then committed back. Everyone can read it.
//! * `Deck` — sealed. Created inside the TEE with a private permission and no members, it holds
//!   the VRF output and the shuffled order of the cards. Nobody can read it, not the host and not
//!   us, until the last card is out; then it is flipped public so anyone can re-run the shuffle.
//!
//! Base-layer only: `Card` (the appraisal desk's price + grade for one card NFT), `Receipt` (who
//! gets which card, written by the post-commit Magic Action) and `Stats`.
use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

use crate::constants::*;

// ---- break status ----
/// Host is depositing cards (base layer).
pub const ST_DRAFT: u8 = 0;
/// Every card is in the vault and the card list is committed; spots on sale in the TEE.
pub const ST_SELLING: u8 = 1;
/// Sale closed, waiting for the VRF shuffle.
pub const ST_SHUFFLING: u8 = 2;
/// Packs opening, spot market live.
pub const ST_LIVE: u8 = 3;
/// Every card revealed; the Deck is public.
pub const ST_ENDED: u8 = 4;
/// Committed to Solana, host paid, cards claimable.
pub const ST_SETTLED: u8 = 5;
/// Called off before the shuffle (VRF never answered): every buyer refunded.
pub const ST_CANCELLED: u8 = 6;

// ---- card tiers ----
pub const TIER_BASE: u8 = 0;
pub const TIER_RARE: u8 = 1;
pub const TIER_EPIC: u8 = 2;
pub const TIER_LEGEND: u8 = 3;
/// The box's headline card.
pub const TIER_CHASE: u8 = 4;

// ---- trade kinds (log) ----
pub const TR_PRIMARY: u8 = 0;
pub const TR_BUY_NOW: u8 = 1;
pub const TR_BID_HIT: u8 = 2;
pub const TR_HOST_UNSOLD: u8 = 3;

/// The appraisal desk's record for one card NFT. Hosts can't write it: the price a buyer sees
/// next to a card comes from here, not from the host's listing.
#[account]
#[derive(InitSpace)]
pub struct Card {
    pub mint: Pubkey,
    /// Market value in USDC base units (6 decimals).
    pub value: u64,
    pub tier: u8,
    /// Grade x10 (100 = gem mint 10).
    pub grade: u8,
    pub cert: u64,
    pub name: [u8; 32],
    pub set: [u8; 24],
    /// Seeds the card's artwork on the client.
    pub art: u32,
    pub appraised_at: i64,
    pub bump: u8,
}

#[zero_copy]
#[derive(Debug)]
pub struct Trade {
    pub price: u64,
    pub ts: i64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub spot: u8,
    pub kind: u8,
    pub _pad: [u8; 6],
}

#[account(zero_copy)]
pub struct Break {
    pub break_id: u64,
    pub spot_price: u64,
    pub created_at: i64,
    /// When the last spot sold (0 while some are left).
    pub sold_out_at: i64,
    /// Sale closed / VRF requested.
    pub shuffle_requested_at: i64,
    /// Earliest time the next card may be revealed.
    pub next_reveal_ms: i64,
    pub ended_at: i64,
    /// What the host has been paid for spots (net of the protocol fee). Paid instantly, buyer
    /// to host, at the moment of each sale: the protocol never holds anyone's USDC.
    pub host_revenue: u64,
    pub secondary_volume: u64,
    pub volume: u64,
    pub fees: u64,
    /// Total appraised value of the box.
    pub box_value: u64,
    pub crank_task: u64,
    /// Auction mode: bidding closes at this unix time (set when the sale opens).
    pub auction_end: i64,

    pub host: Pubkey,
    pub mint: Pubkey,
    /// sha256 over every card mint + appraised value, fixed before a single spot sells.
    pub commitment: [u8; 32],

    pub cards: [Pubkey; MAX_CARDS],
    pub card_value: [u64; MAX_CARDS],
    pub card_tier: [u8; MAX_CARDS],
    /// Position -> card index + 1 (0 = still sealed). Position p belongs to spot p / per_spot.
    pub revealed: [u8; MAX_CARDS],

    pub spot_owner: [Pubkey; MAX_SPOTS],
    /// What the current owner paid for the spot (for P&L in the UI).
    pub spot_cost: [u64; MAX_SPOTS],
    /// 0 = not listed.
    pub ask: [u64; MAX_SPOTS],
    /// Best standing offer. Offers aren't escrowed: when the owner accepts, the spot is reserved
    /// for the bidder at that price and the bidder's session fills it.
    pub bid: [u64; MAX_SPOTS],
    pub bidder: [Pubkey; MAX_SPOTS],
    /// Accepted offer: only this wallet may buy the spot at `ask` until `reserve_until`.
    pub reserved: [Pubkey; MAX_SPOTS],
    pub reserve_until: [i64; MAX_SPOTS],
    pub last_price: [u64; MAX_SPOTS],
    /// Order in which spots open (from the VRF output; public once the shuffle lands).
    pub open_order: [u8; MAX_SPOTS],
    /// Team mode: element bitmask each spot owns (0 = not revealed yet).
    pub spot_team: [u8; MAX_SPOTS],
    /// Auction mode: how many sealed bids each spot has (the amounts stay sealed).
    pub bid_count: [u8; MAX_SPOTS],
    /// Element of each card (Card.art % 8): decides its owner in team mode.
    pub card_elem: [u8; MAX_CARDS],

    pub trades: [Trade; TRADE_LOG],

    pub title: [u8; 48],
    pub n_spots: u8,
    pub per_spot: u8,
    pub n_cards: u8,
    pub deposited: u8,
    pub status: u8,
    pub sold: u8,
    /// Cards revealed so far.
    pub cursor: u8,
    pub trade_head: u8,
    pub n_trades: u32,
    pub reveal_ms: u32,
    pub bump: u8,
    pub vault_bump: u8,
    /// 1 = shuffled from VRF; 2 = the VRF never answered and the TEE seeded it (flagged in the UI).
    pub seed_source: u8,
    /// The settling commit has been sent (the crank tries every interval; only the first counts).
    pub settle_sent: u8,
    /// 0 = packs (each spot owns a sealed pack), 1 = random teams (each spot draws elements).
    pub mode: u8,
    /// Team mode: spots whose team has been revealed.
    pub teams_out: u8,
    /// Sale: 0 = fixed price, 1 = sealed-bid auction; 2 = auction closed.
    pub sale: u8,
    /// Packs mode: 1 while the next pack is up and its owner may rip it (until next_reveal_ms).
    pub rip_armed: u8,
    pub auction_secs: u32,
    pub _pad: [u8; 4],
}

impl Break {
    pub fn teams(&self) -> bool {
        self.mode == MODE_TEAMS
    }

    /// Team mode: the spot that owns cards of element `e`.
    pub fn spot_of_elem(&self, e: u8) -> Option<usize> {
        (0..self.n_spots as usize).find(|&s| self.spot_team[s] & (1 << e) != 0)
    }

    pub fn cards_total(&self) -> usize {
        self.n_spots as usize * self.per_spot as usize
    }

    /// Spot a sealed position belongs to.
    pub fn spot_of(&self, pos: usize) -> usize {
        pos / self.per_spot as usize
    }

    /// The position revealed at step `k` of the opening: spots open in `open_order`, cards
    /// inside a spot in order.
    pub fn position_at(&self, k: usize) -> usize {
        if self.teams() {
            return k;
        }
        let per = self.per_spot as usize;
        self.open_order[k / per] as usize * per + k % per
    }

    /// A spot stops trading as soon as its own pack starts opening.
    pub fn spot_locked(&self, spot: usize) -> bool {
        match self.status {
            ST_SELLING | ST_SHUFFLING => false,
            ST_LIVE if self.teams() => self.spot_team[spot] != 0,
            ST_LIVE => {
                let per = self.per_spot as usize;
                // pack i of the opening has started once its first card is out, or is up for its
                // owner to rip (no trading the spot out from under them mid-rip)
                let up = if self.rip_armed == 1 { self.cursor as usize / per + 1 } else { 0 };
                (0..self.n_spots as usize).any(|i| (i * per < self.cursor as usize || i < up) && self.open_order[i] as usize == spot)
            }
            _ => true,
        }
    }

    pub fn log(&mut self, spot: u8, kind: u8, price: u64, buyer: Pubkey, seller: Pubkey, ts: i64) {
        let i = self.trade_head as usize % TRADE_LOG;
        self.trades[i] = Trade { price, ts, buyer, seller, spot, kind, _pad: [0; 6] };
        self.trade_head = ((i + 1) % TRADE_LOG) as u8;
        self.n_trades = self.n_trades.saturating_add(1);
    }
}

pub const MODE_PACKS: u8 = 0;
pub const MODE_TEAMS: u8 = 1;
pub const SALE_FIXED: u8 = 0;
pub const SALE_AUCTION: u8 = 1;
pub const SALE_CLOSED: u8 = 2;

pub const DECK_MAGIC: u32 = 0x4b434544; // "DECK"

/// Sealed inside the TEE until the last card is out.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Deck {
    pub magic: u32,
    pub seeded: u32,
    pub break_id: u64,
    /// Raw VRF output.
    pub randomness: [u8; 32],
    /// Position -> card index (team mode: reveal order).
    pub order: [u8; MAX_CARDS],
    /// Team mode: element bitmask dealt to each spot.
    pub spot_elems: [u8; MAX_SPOTS],
}
pub const DECK_LEN: usize = core::mem::size_of::<Deck>();

pub const BIDS_MAGIC: u32 = 0x53444942; // "BIDS"
pub const MAX_BIDS: usize = 8;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct SealedBid {
    pub amount: u64,
    pub bidder: Pubkey,
}

/// Auction mode: every bid, sealed in the TEE (private permission, no members) until the
/// auction closes; then flipped public so anyone can check the winners and prices.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Bids {
    pub magic: u32,
    pub closed: u32,
    pub break_id: u64,
    pub bids: [[SealedBid; MAX_BIDS]; MAX_SPOTS],
}
pub const BIDS_LEN: usize = core::mem::size_of::<Bids>();

pub const CHAT_MAGIC: u32 = 0x54414843; // "CHAT"
pub const CHAT_LOG: usize = 48;
pub const CHAT_TEXT: usize = 86;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct ChatMsg {
    pub ts: i64,
    pub author: Pubkey,
    /// 0 = text, 1 = reaction (text[0] = emoji index)
    pub kind: u8,
    pub len: u8,
    pub text: [u8; CHAT_TEXT],
}

/// The room's chat + reactions: an ephemeral account in the rollup, public, free to write.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Chat {
    pub magic: u32,
    pub head: u32,
    pub break_id: u64,
    pub count: u64,
    pub msgs: [ChatMsg; CHAT_LOG],
}
pub const CHAT_LEN: usize = core::mem::size_of::<Chat>();

/// Base layer. Written by the post-commit Magic Action once the break has ended: which wallet
/// receives each card. `claim` reads only this, so cards can be delivered while the Break stays
/// delegated.
#[account(zero_copy)]
pub struct Receipt {
    pub break_id: u64,
    pub host_paid: u64,
    pub settled_at: i64,
    pub host: Pubkey,
    pub cards: [Pubkey; MAX_CARDS],
    /// Card index -> recipient.
    pub recipient: [Pubkey; MAX_CARDS],
    /// Bit i = card i delivered.
    pub claimed: u64,
    pub n_cards: u8,
    pub settled: u8,
    pub bump: u8,
    pub _pad: [u8; 5],
}

#[account]
#[derive(InitSpace)]
pub struct Stats {
    pub breaks: u64,
    pub cards: u64,
    pub primary_volume: u64,
    pub secondary_volume: u64,
    pub trades: u64,
    pub fees: u64,
    pub bump: u8,
}

/// A player: display name, the session key allowed to act for them inside the TEE, and stats.
/// Created on Solana and delegated, so binding a new session key is instant and free.
#[account]
#[derive(InitSpace)]
pub struct Profile {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub name: [u8; 20],
    pub spots_bought: u32,
    pub trades: u32,
    pub spent: u64,
    pub earned: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Profile {
    pub fn acts(&self, signer: &Pubkey) -> bool {
        self.owner == *signer || (self.agent == *signer && self.agent != Pubkey::default())
    }
}

/// Devnet only: when a wallet last used the test-USDC faucet.
#[account]
#[derive(InitSpace)]
pub struct Faucet {
    pub last: i64,
    pub bump: u8,
}

pub fn read_title(t: &[u8; 48]) -> &str {
    let n = t.iter().position(|&b| b == 0).unwrap_or(48);
    core::str::from_utf8(&t[..n]).unwrap_or("")
}

#[cfg(test)]
mod layout_tests {
    use super::*;
    use core::mem::{offset_of, size_of};

    /// Prints the zero-copy layouts the TypeScript decoder mirrors (app/src/chain/layout.gen.json).
    #[test]
    fn print_layout() {
        macro_rules! offs {
            ($t:ty; $($f:ident),*) => {{
                let mut s = String::from("{");
                $( s.push_str(&format!("\"{}\":{},", stringify!($f), offset_of!($t, $f))); )*
                s.push_str(&format!("\"__size\":{}}}", size_of::<$t>()));
                s
            }};
        }
        let brk = offs!(Break; break_id, spot_price, created_at, sold_out_at, shuffle_requested_at, next_reveal_ms, ended_at, host_revenue, secondary_volume, volume, fees, box_value, crank_task, host, mint, commitment, cards, card_value, card_tier, revealed, spot_owner, spot_cost, ask, bid, bidder, reserved, reserve_until, last_price, open_order, trades, title, n_spots, per_spot, n_cards, deposited, status, sold, cursor, trade_head, n_trades, reveal_ms, bump, vault_bump, seed_source, settle_sent, mode, teams_out, sale, rip_armed, auction_secs, auction_end, spot_team, bid_count, card_elem);
        let trade = offs!(Trade; price, ts, buyer, seller, spot, kind);
        let receipt = offs!(Receipt; break_id, host_paid, settled_at, host, cards, recipient, claimed, n_cards, settled, bump);
        let deck = offs!(Deck; magic, seeded, break_id, randomness, order, spot_elems);
        let bids = offs!(Bids; magic, closed, break_id, bids);
        let chat = offs!(Chat; magic, head, break_id, count, msgs);
        let msg = offs!(ChatMsg; ts, author, kind, len, text);
        println!("LAYOUT{{\"Break\":{},\"Trade\":{},\"Receipt\":{},\"Deck\":{},\"Bids\":{},\"Chat\":{},\"ChatMsg\":{}}}", brk, trade, receipt, deck, bids, chat, msg);
    }
}
