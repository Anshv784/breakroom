//! Fixed addresses and protocol numbers.
use anchor_lang::prelude::*;

/// Deploys the program, runs the appraisal desk and receives protocol fees.
pub const ADMIN: Pubkey = pubkey!("FwoAkqEeqdV5rpz9NbmN3ishH7a4DCLaCJGMDgHKLSJQ");

/// Receives protocol fees, straight from each buyer, in its private USDC balance.
pub const TREASURY: Pubkey = ADMIN;

/// Breaks may only run on MagicBlock's TEE validator (same identity on devnet and mainnet):
/// a break on any other validator could commit whatever shuffle it liked.
pub const TEE_VALIDATOR: Pubkey = pubkey!("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");

pub const ESPL_PROGRAM: Pubkey = pubkey!("SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2");
pub const DELEGATION_PROGRAM: Pubkey = pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
pub const COMPUTE_BUDGET_PROGRAM: Pubkey = pubkey!("ComputeBudget111111111111111111111111111111");

// ---- seeds ----
pub const PROFILE_SEED: &[u8] = b"profile";
pub const BREAK_SEED: &[u8] = b"break";
pub const RECEIPT_SEED: &[u8] = b"receipt";
pub const VAULT_SEED: &[u8] = b"vault";
pub const DECK_SEED: &[u8] = b"deck";
pub const BIDS_SEED: &[u8] = b"bids";
pub const CHAT_SEED: &[u8] = b"chat";
pub const POOL_SEED: &[u8] = b"pool";
pub const CARD_SEED: &[u8] = b"card";
pub const STATS_SEED: &[u8] = b"stats";
pub const FAUCET_SEED: &[u8] = b"faucet";
pub const MINT_SEED: &[u8] = b"usdc";

// ---- sizes ----
pub const MAX_SPOTS: usize = 16;
pub const MAX_CARDS: usize = 64;
pub const MAX_CARDS_PER_SPOT: usize = 8;
pub const TRADE_LOG: usize = 48;

// ---- money ----
/// Protocol fee on primary spot sales (5%). The host receives the rest.
pub const SALE_FEE_BPS: u64 = 500;
/// Fee on every secondary spot trade (2%), paid by the seller.
pub const TRADE_FEE_BPS: u64 = 200;
pub const BPS: u64 = 10_000;
/// A new offer must beat the standing one by at least this much (1%).
pub const MIN_RAISE_BPS: u64 = 100;
/// How long an accepted offer holds the spot for the bidder's session to fill it.
pub const RESERVE_SECS: i64 = 20;
/// Auction winner has this long to complete payment before the spot reopens at the box price.
pub const AUCTION_CLAIM_SECS: i64 = 90;
pub const MIN_AUCTION_SECS: u32 = 30;
pub const MAX_AUCTION_SECS: u32 = 86_400;
/// Instant buyback pays this share of the appraised value (85%).
pub const BUYBACK_BPS: u64 = 8_500;
/// Smallest spot price: 1 USDC.
pub const MIN_SPOT_PRICE: u64 = 1_000_000;

// ---- timing ----
/// Gap between two card reveals (the crank fires this often; anyone may push a late one).
pub const MIN_REVEAL_MS: u32 = 1_500;
pub const MAX_REVEAL_MS: u32 = 15_000;
/// If the VRF answer hasn't arrived after this long, anyone may seed the shuffle from inside the
/// TEE instead (still sealed from everyone; flagged as a fallback in the break's record).
pub const SHUFFLE_TIMEOUT_SECS: i64 = 45;
/// Pause between the shuffle landing and the first card, so everyone's camera is on the table.
pub const INTRO_MS: i64 = 4_000;
/// How long a spot's owner has to rip their own pack before the crank opens it for them.
pub const RIP_WINDOW_MS: i64 = 8_000;
/// Escrow index of the post-commit settle action.
pub const ACTION_ESCROW_INDEX: u8 = 255;
/// Anyone may start a fully sold break this long after the last spot sold, so a host can't
/// hold buyers' money hostage by never pressing start.
pub const AUTO_START_SECS: i64 = 300;

// ---- devnet faucet ----
pub const FAUCET_AMOUNT: u64 = 1_000_000_000; // 1,000 test USDC
pub const FAUCET_COOLDOWN_SECS: i64 = 6 * 60 * 60;
pub const USDC_DECIMALS: u8 = 6;
