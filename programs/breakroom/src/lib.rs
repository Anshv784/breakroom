//! BREAKROOM — provably fair live card breaks with a live spot market.
//!
//! A host locks a box of graded card NFTs in a program vault and sells spots. When the sale
//! closes, MagicBlock VRF shuffles the box inside a Private Ephemeral Rollup (Intel TDX): the
//! order lives in a sealed account nobody can read, not even the host. Packs open live, one card
//! at a time on a crank, while spots trade on a zero-fee market settled in private USDC balances
//! (Private Payments API). When the last card is out the shuffle is published for anyone to
//! verify, a Magic Action records who receives each card on Solana, and the cards are delivered.
#![allow(deprecated)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod constants;
pub mod error;
pub mod espl;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("7hnz4i1zaz3UPW1eNzpTonN5GeLRCyVMSnpk5tTHKzTD");

#[ephemeral]
#[program]
pub mod breakroom {
    use super::*;

    // ---- Solana: protocol setup

    pub fn init_stats(ctx: Context<InitStats>) -> Result<()> {
        instructions::admin::handle_init_stats(ctx)
    }

    pub fn init_test_mint(ctx: Context<InitTestMint>) -> Result<()> {
        instructions::admin::handle_init_test_mint(ctx)
    }

    pub fn faucet(ctx: Context<UseFaucet>) -> Result<()> {
        instructions::admin::handle_faucet(ctx)
    }

    pub fn init_desk(ctx: Context<InitDesk>) -> Result<()> {
        instructions::admin::handle_init_desk(ctx)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn appraise(ctx: Context<Appraise>, value: u64, tier: u8, grade: u8, cert: u64, name: [u8; 32], set: [u8; 24], art: u32) -> Result<()> {
        instructions::admin::handle_appraise(ctx, value, tier, grade, cert, name, set, art)
    }

    // ---- Solana: the host builds a break

    pub fn create_break(ctx: Context<CreateBreak>, break_id: u64, n_spots: u8, per_spot: u8, spot_price: u64, reveal_ms: u32, title: [u8; 48]) -> Result<()> {
        instructions::host::handle_create_break(ctx, break_id, n_spots, per_spot, spot_price, reveal_ms, title)
    }

    pub fn deposit_card(ctx: Context<DepositCard>, slot: u8) -> Result<()> {
        instructions::host::handle_deposit_card(ctx, slot)
    }

    pub fn withdraw_card(ctx: Context<WithdrawCard>, slot: u8) -> Result<()> {
        instructions::host::handle_withdraw_card(ctx, slot)
    }

    pub fn seal_break(ctx: Context<SealBreak>) -> Result<()> {
        instructions::host::handle_seal_break(ctx)
    }
}
