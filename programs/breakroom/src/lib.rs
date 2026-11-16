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

// No panic messages on chain: formatting them is dead weight in the binary.
#[cfg(all(target_os = "solana", feature = "custom-panic"))]
#[no_mangle]
fn custom_panic(_: &core::panic::PanicInfo<'_>) {}

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod constants;
pub mod error;
pub mod espl;
pub mod instructions;
pub mod pay;
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

    #[allow(clippy::too_many_arguments)]
    pub fn appraise(ctx: Context<Appraise>, value: u64, tier: u8, grade: u8, cert: u64, name: [u8; 32], set: [u8; 24], art: u32) -> Result<()> {
        instructions::admin::handle_appraise(ctx, value, tier, grade, cert, name, set, art)
    }

    // ---- players

    pub fn create_profile(ctx: Context<CreateProfile>, name: [u8; 20]) -> Result<()> {
        instructions::profile::handle_create_profile(ctx, name)
    }

    pub fn delegate_profile(ctx: Context<DelegateProfile>) -> Result<()> {
        instructions::profile::handle_delegate_profile(ctx)
    }

    pub fn set_agent(ctx: Context<SetAgent>, agent: Pubkey, name: Option<[u8; 20]>) -> Result<()> {
        instructions::profile::handle_set_agent(ctx, agent, name)
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

    // ---- TEE: the sale

    pub fn open_sale(ctx: Context<OpenSale>) -> Result<()> {
        instructions::sale::handle_open_sale(ctx)
    }

    pub fn buy_spot(ctx: Context<BuySpot>, spot: u8, max_price: u64) -> Result<()> {
        instructions::sale::handle_buy_spot(ctx, spot, max_price)
    }

    // ---- TEE: the live break

    pub fn start_break<'info>(ctx: Context<'info, StartBreak<'info>>, client_seed: u8) -> Result<()> {
        instructions::live::handle_start_break(ctx, client_seed)
    }

    pub fn on_shuffle(ctx: Context<OnShuffle>, randomness: [u8; 32]) -> Result<()> {
        instructions::live::handle_on_shuffle(ctx, randomness)
    }

    pub fn fallback_shuffle(ctx: Context<FallbackShuffle>) -> Result<()> {
        instructions::live::handle_fallback_shuffle(ctx)
    }

    pub fn reveal(ctx: Context<Reveal>) -> Result<()> {
        instructions::live::handle_reveal(ctx)
    }

    pub fn finish(ctx: Context<Finish>) -> Result<()> {
        instructions::live::handle_finish(ctx)
    }

    // ---- Solana: settlement (Magic Action) + delivery

    pub fn settle<'info>(ctx: Context<'info, Settle<'info>>) -> Result<()> {
        instructions::settle::handle_settle(ctx)
    }

    pub fn claim(ctx: Context<Claim>, index: u8) -> Result<()> {
        instructions::settle::handle_claim(ctx, index)
    }

    // ---- TEE: the spot market

    pub fn list_spot(ctx: Context<OwnerAction>, spot: u8, ask: u64) -> Result<()> {
        instructions::market::handle_list_spot(ctx, spot, ask)
    }

    pub fn make_offer(ctx: Context<OwnerAction>, spot: u8, price: u64) -> Result<()> {
        instructions::market::handle_make_offer(ctx, spot, price)
    }

    pub fn accept_offer(ctx: Context<OwnerAction>, spot: u8, price: u64) -> Result<()> {
        instructions::market::handle_accept_offer(ctx, spot, price)
    }

    pub fn buy_listed(ctx: Context<BuyListed>, spot: u8, max_price: u64) -> Result<()> {
        instructions::market::handle_buy_listed(ctx, spot, max_price)
    }
}
