//! TEE: the live spot market. Owners list, anyone buys; offers are free to post and, once the
//! owner accepts one, the spot is held a few seconds for the bidder's session to fill it.
//! Every fill is paid buyer -> seller directly in the same transaction (see `pay.rs`).
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::BreakError;
use crate::pay::*;
use crate::state::*;

fn spot_check(b: &Break, spot: u8) -> Result<usize> {
    let s = spot as usize;
    require!(s < b.n_spots as usize, BreakError::BadSpot);
    require!(!b.spot_locked(s), BreakError::SpotLocked);
    Ok(s)
}

/// Owner (or their session) lists a spot. `ask` = 0 takes it off the market.
pub fn handle_list_spot(ctx: Context<OwnerAction>, spot: u8, ask: u64) -> Result<()> {
    let p = &ctx.accounts.profile;
    require!(p.acts(&ctx.accounts.signer.key()), BreakError::NotYourProfile);
    let mut b = ctx.accounts.brk.load_mut()?;
    let s = spot_check(&b, spot)?;
    require_keys_eq!(b.spot_owner[s], p.owner, BreakError::NotSpotOwner);
    require!(ask == 0 || ask >= MIN_SPOT_PRICE, BreakError::PriceTooLow);
    b.ask[s] = ask;
    b.reserved[s] = Pubkey::default();
    b.reserve_until[s] = 0;
    Ok(())
}

/// Owner accepts the standing offer: the spot is reserved for the bidder at that price.
pub fn handle_accept_offer(ctx: Context<OwnerAction>, spot: u8, price: u64) -> Result<()> {
    let p = &ctx.accounts.profile;
    require!(p.acts(&ctx.accounts.signer.key()), BreakError::NotYourProfile);
    let now = Clock::get()?.unix_timestamp;
    let mut b = ctx.accounts.brk.load_mut()?;
    let s = spot_check(&b, spot)?;
    require_keys_eq!(b.spot_owner[s], p.owner, BreakError::NotSpotOwner);
    require!(b.bid[s] > 0, BreakError::NoBid);
    require!(b.bid[s] == price, BreakError::PriceMoved);
    b.ask[s] = price;
    b.reserved[s] = b.bidder[s];
    b.reserve_until[s] = now + RESERVE_SECS;
    Ok(())
}

#[derive(Accounts)]
pub struct OwnerAction<'info> {
    pub signer: Signer<'info>,
    #[account(seeds = [PROFILE_SEED, profile.owner.as_ref()], bump = profile.bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
}

/// Post an offer on someone's spot (must beat the standing one by 1%). `price` = 0 withdraws
/// your own standing offer.
pub fn handle_make_offer(ctx: Context<OwnerAction>, spot: u8, price: u64) -> Result<()> {
    let p = &ctx.accounts.profile;
    require!(p.acts(&ctx.accounts.signer.key()), BreakError::NotYourProfile);
    let mut b = ctx.accounts.brk.load_mut()?;
    let s = spot_check(&b, spot)?;
    require!(b.spot_owner[s] != Pubkey::default(), BreakError::BadSpot);
    require!(b.spot_owner[s] != p.owner, BreakError::SelfTrade);
    if price == 0 {
        require_keys_eq!(b.bidder[s], p.owner, BreakError::NoBid);
        b.bid[s] = 0;
        b.bidder[s] = Pubkey::default();
        return Ok(());
    }
    require!(price >= MIN_SPOT_PRICE, BreakError::PriceTooLow);
    let floor = b.bid[s] + bps(b.bid[s], MIN_RAISE_BPS);
    require!(b.bid[s] == 0 || price > floor.max(b.bid[s]), BreakError::BidTooLow);
    b.bid[s] = price;
    b.bidder[s] = p.owner;
    Ok(())
}

/// Buy a listed spot. The transaction pays the seller (ask - 2%) and the treasury (2%) right
/// in front of this instruction.
pub fn handle_buy_listed(ctx: Context<BuyListed>, spot: u8, max_price: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let buyer_p = &mut ctx.accounts.buyer;
    require!(buyer_p.acts(&ctx.accounts.signer.key()), BreakError::NotYourProfile);
    let buyer = buyer_p.owner;
    let mut b = ctx.accounts.brk.load_mut()?;
    let s = spot_check(&b, spot)?;
    let seller = b.spot_owner[s];
    require_keys_eq!(ctx.accounts.seller.owner, seller, BreakError::BadAccount);
    require!(seller != buyer, BreakError::SelfTrade);
    let ask = b.ask[s];
    require!(ask > 0, BreakError::NotListed);
    require!(ask <= max_price, BreakError::PriceMoved);
    if b.reserved[s] != Pubkey::default() && now < b.reserve_until[s] {
        require_keys_eq!(b.reserved[s], buyer, BreakError::Reserved);
    }
    let fee = bps(ask, TRADE_FEE_BPS);
    expect_payment(&ctx.accounts.instructions.to_account_info(), &buyer, &b.mint, &seller, ask - fee, fee)?;

    let kind = if b.reserved[s] == buyer { TR_BID_HIT } else { TR_BUY_NOW };
    b.spot_owner[s] = buyer;
    b.spot_cost[s] = ask;
    b.last_price[s] = ask;
    b.ask[s] = 0;
    b.reserved[s] = Pubkey::default();
    b.reserve_until[s] = 0;
    if b.bidder[s] == buyer {
        b.bid[s] = 0;
        b.bidder[s] = Pubkey::default();
    }
    b.fees = b.fees.saturating_add(fee);
    b.volume = b.volume.saturating_add(ask);
    b.secondary_volume = b.secondary_volume.saturating_add(ask);
    b.log(spot, kind, ask, buyer, seller, now);
    drop(b);

    buyer_p.trades += 1;
    buyer_p.spent = buyer_p.spent.saturating_add(ask);
    let seller_p = &mut ctx.accounts.seller;
    seller_p.trades += 1;
    seller_p.earned = seller_p.earned.saturating_add(ask - fee);
    Ok(())
}

#[derive(Accounts)]
pub struct BuyListed<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [PROFILE_SEED, buyer.owner.as_ref()], bump = buyer.bump)]
    pub buyer: Account<'info, Profile>,
    #[account(mut, seeds = [PROFILE_SEED, seller.owner.as_ref()], bump = seller.bump)]
    pub seller: Account<'info, Profile>,
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: the instructions sysvar (address checked in expect_payment)
    pub instructions: UncheckedAccount<'info>,
}
