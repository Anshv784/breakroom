//! TEE: open the sale (seal the Deck) and sell spots for private USDC.
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::access_control::instructions::{CreateEphemeralPermissionCpi, UpdateEphemeralPermissionCpi};
use ephemeral_rollups_sdk::access_control::structs::{EphemeralMembersArgs, EphemeralPermission};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::ephemeral_accounts::EphemeralAccount;

use crate::constants::*;
use crate::error::BreakError;
use crate::pay::*;
use crate::state::*;

/// Create an ephemeral account in the rollup (paid by the Break PDA) with a permission:
/// `private` = no members (sealed from everyone), otherwise public.
#[allow(clippy::too_many_arguments)]
fn ephemeral<'info>(
    brk: &AccountInfo<'info>,
    brk_seeds: &[&[u8]],
    target: &AccountInfo<'info>,
    target_seeds: &[&[u8]],
    perm: &AccountInfo<'info>,
    len: usize,
    private: bool,
    vault: &AccountInfo<'info>,
    magic: &AccountInfo<'info>,
    perm_program: &AccountInfo<'info>,
    init: impl FnOnce(&mut [u8]),
) -> Result<()> {
    if target.data_is_empty() {
        EphemeralAccount::new(brk, target, vault).with_signer_seeds(&[brk_seeds, target_seeds]).create(len as u32)?;
        init(&mut target.try_borrow_mut_data()?);
    }
    let (want, _) = EphemeralPermission::find_pda(target.key);
    require_keys_eq!(*perm.key, want, BreakError::BadAccount);
    if perm.data_is_empty() {
        CreateEphemeralPermissionCpi {
            payer: brk.clone(),
            permissioned_account: target.clone(),
            permission: perm.clone(),
            vault: vault.clone(),
            magic_program: magic.clone(),
            permission_program: perm_program.clone(),
            args: EphemeralMembersArgs { is_private: private, members: vec![] },
        }
        .invoke_signed(&[brk_seeds, target_seeds])?;
    }
    Ok(())
}

/// Open the sale inside the TEE: the sealed Deck (no members — nobody can read it, the host
/// included), the sealed Bids book for auctions, the public chat, and the Break's own public
/// permission. Anyone may call it; it's idempotent.
pub fn handle_open_sale(ctx: Context<OpenSale>) -> Result<()> {
    let a = &ctx.accounts;
    let (id, status, sale, secs) = {
        let b = a.brk.load()?;
        (b.break_id, b.status, b.sale, b.auction_secs)
    };
    require!(status == ST_SELLING, BreakError::WrongStage);
    let idb = id.to_le_bytes();
    let brk_seeds: &[&[u8]] = &[BREAK_SEED, &idb, &[ctx.bumps.brk]];
    let brk_ai = a.brk.to_account_info();
    let vault = a.ephemeral_vault.to_account_info();
    let magic = a.magic_program.to_account_info();
    let pp = a.permission_program.to_account_info();
    ephemeral(&brk_ai, brk_seeds, &a.deck, &[DECK_SEED, &idb, &[ctx.bumps.deck]], &a.deck_permission, DECK_LEN, true, &vault, &magic, &pp, |d| {
        let deck: &mut Deck = bytemuck::from_bytes_mut(&mut d[..DECK_LEN]);
        deck.magic = DECK_MAGIC;
        deck.break_id = id;
    })?;
    ephemeral(&brk_ai, brk_seeds, &a.chat, &[CHAT_SEED, &idb, &[ctx.bumps.chat]], &a.chat_permission, CHAT_LEN, false, &vault, &magic, &pp, |d| {
        let c: &mut Chat = bytemuck::from_bytes_mut(&mut d[..CHAT_LEN]);
        c.magic = CHAT_MAGIC;
        c.break_id = id;
    })?;
    if sale == SALE_AUCTION {
        ephemeral(&brk_ai, brk_seeds, &a.bids, &[BIDS_SEED, &idb, &[ctx.bumps.bids]], &a.bids_permission, BIDS_LEN, true, &vault, &magic, &pp, |d| {
            let bb: &mut Bids = bytemuck::from_bytes_mut(&mut d[..BIDS_LEN]);
            bb.magic = BIDS_MAGIC;
            bb.break_id = id;
        })?;
        let mut b = a.brk.load_mut()?;
        if b.auction_end == 0 {
            b.auction_end = Clock::get()?.unix_timestamp + secs as i64;
        }
    }
    let (brk_perm, _) = EphemeralPermission::find_pda(brk_ai.key);
    require_keys_eq!(a.brk_permission.key(), brk_perm, BreakError::BadAccount);
    if a.brk_permission.data_is_empty() {
        CreateEphemeralPermissionCpi {
            payer: brk_ai.clone(),
            permissioned_account: brk_ai.clone(),
            permission: a.brk_permission.to_account_info(),
            vault,
            magic_program: magic,
            permission_program: pp,
            args: EphemeralMembersArgs { is_private: false, members: vec![] },
        }
        .invoke_signed(&[brk_seeds])?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct OpenSale<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: ephemeral Deck PDA, created here
    #[account(mut, seeds = [DECK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub deck: UncheckedAccount<'info>,
    /// CHECK: checked against the permission PDA of `deck`
    #[account(mut)]
    pub deck_permission: UncheckedAccount<'info>,
    /// CHECK: ephemeral sealed Bids PDA (auction breaks only)
    #[account(mut, seeds = [BIDS_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub bids: UncheckedAccount<'info>,
    /// CHECK: checked against the permission PDA of `bids`
    #[account(mut)]
    pub bids_permission: UncheckedAccount<'info>,
    /// CHECK: ephemeral public Chat PDA
    #[account(mut, seeds = [CHAT_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub chat: UncheckedAccount<'info>,
    /// CHECK: checked against the permission PDA of `chat`
    #[account(mut)]
    pub chat_permission: UncheckedAccount<'info>,
    /// CHECK: checked against the permission PDA of `brk`
    #[account(mut)]
    pub brk_permission: UncheckedAccount<'info>,
    /// CHECK: permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral rent vault
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

/// Buy an open spot at the box price. The buyer's own transaction pays the host (95%) and the
/// treasury (5%) right in front of this instruction; see `pay.rs`.
pub fn handle_buy_spot(ctx: Context<BuySpot>, spot: u8, max_price: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let profile = &mut ctx.accounts.profile;
    require!(profile.acts(&ctx.accounts.signer.key()), BreakError::NotYourProfile);
    let buyer = profile.owner;
    let mut b = ctx.accounts.brk.load_mut()?;
    require!(b.status == ST_SELLING, BreakError::WrongStage);
    let s = spot as usize;
    require!(s < b.n_spots as usize, BreakError::BadSpot);
    require!(b.spot_owner[s] == Pubkey::default(), BreakError::SpotTaken);
    let mut price = b.spot_price;
    if b.sale == SALE_AUCTION {
        return err!(BreakError::AuctionOnly);
    }
    if b.sale == SALE_CLOSED && b.reserved[s] != Pubkey::default() && now < b.reserve_until[s] {
        // the auction's winner, at the price the auction set
        require_keys_eq!(b.reserved[s], buyer, BreakError::Reserved);
        price = b.ask[s];
    }
    require!(price <= max_price, BreakError::PriceMoved);
    let fee = bps(price, SALE_FEE_BPS);
    let host = b.host;
    expect_payment(&ctx.accounts.instructions.to_account_info(), &buyer, &b.mint, &host, price - fee, fee)?;

    b.spot_owner[s] = buyer;
    b.spot_cost[s] = price;
    b.last_price[s] = price;
    b.ask[s] = 0;
    b.reserved[s] = Pubkey::default();
    b.reserve_until[s] = 0;
    b.host_revenue = b.host_revenue.checked_add(price - fee).ok_or(BreakError::Overflow)?;
    b.fees = b.fees.checked_add(fee).ok_or(BreakError::Overflow)?;
    b.volume = b.volume.checked_add(price).ok_or(BreakError::Overflow)?;
    b.sold += 1;
    if b.sold == b.n_spots {
        b.sold_out_at = now;
    }
    b.log(spot, TR_PRIMARY, price, buyer, host, now);
    profile.spots_bought += 1;
    profile.spent = profile.spent.saturating_add(price);
    Ok(())
}

#[derive(Accounts)]
pub struct BuySpot<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [PROFILE_SEED, profile.owner.as_ref()], bump = profile.bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: the instructions sysvar (address checked in expect_payment)
    pub instructions: UncheckedAccount<'info>,
}


// ---------------------------------------------------------------------------------------------
// Sealed-bid auction. Bids go into the sealed Bids account: nobody (host included) can see an
// amount, only how many bids a spot has. When bidding ends the highest bidder wins and pays the
// second-highest bid (or the reserve): bidding your true value is the best strategy, and the host
// can't shill because there's nothing to bid against. The Bids account is then made public.

pub fn handle_place_bid(ctx: Context<PlaceBid>, spot: u8, amount: u64) -> Result<()> {
    let p = &ctx.accounts.profile;
    require!(p.acts(&ctx.accounts.signer.key()), BreakError::NotYourProfile);
    let now = Clock::get()?.unix_timestamp;
    let mut b = ctx.accounts.brk.load_mut()?;
    require!(b.status == ST_SELLING && b.sale == SALE_AUCTION, BreakError::WrongStage);
    require!(now < b.auction_end, BreakError::AuctionClosed);
    let s = spot as usize;
    require!(s < b.n_spots as usize, BreakError::BadSpot);
    require!(amount >= b.spot_price, BreakError::PriceTooLow);
    let id = b.break_id;
    let mut d = ctx.accounts.bids.try_borrow_mut_data()?;
    require!(d.len() >= BIDS_LEN, BreakError::BadAccount);
    let book: &mut Bids = bytemuck::from_bytes_mut(&mut d[..BIDS_LEN]);
    require!(book.magic == BIDS_MAGIC && book.break_id == id, BreakError::BadAccount);
    let row = &mut book.bids[s];
    let who = p.owner;
    if let Some(e) = row.iter_mut().find(|x| x.bidder == who) {
        e.amount = amount; // a bidder may change their sealed bid until the close
    } else if let Some(e) = row.iter_mut().find(|x| x.amount == 0) {
        *e = SealedBid { amount, bidder: who };
        b.bid_count[s] += 1;
    } else {
        // book full: replace the lowest bid if this one beats it
        let low = row.iter_mut().min_by_key(|x| x.amount).unwrap();
        require!(amount > low.amount, BreakError::BidTooLow);
        *low = SealedBid { amount, bidder: who };
    }
    Ok(())
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    pub signer: Signer<'info>,
    #[account(seeds = [PROFILE_SEED, profile.owner.as_ref()], bump = profile.bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: sealed Bids, verified by magic + break id
    #[account(mut, seeds = [BIDS_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub bids: UncheckedAccount<'info>,
}

/// After bidding ends (anyone may call): reserve each spot for its winner at the second price,
/// then unseal the book.
pub fn handle_close_auction(ctx: Context<CloseAuction>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let id = {
        let mut b = ctx.accounts.brk.load_mut()?;
        require!(b.status == ST_SELLING && b.sale == SALE_AUCTION, BreakError::WrongStage);
        require!(now >= b.auction_end, BreakError::AuctionRunning);
        let id = b.break_id;
        let d = ctx.accounts.bids.try_borrow_data()?;
        require!(d.len() >= BIDS_LEN, BreakError::BadAccount);
        let book: &Bids = bytemuck::from_bytes(&d[..BIDS_LEN]);
        require!(book.magic == BIDS_MAGIC && book.break_id == id, BreakError::BadAccount);
        for s in 0..b.n_spots as usize {
            let mut sorted = book.bids[s];
            sorted.sort_by(|x, y| y.amount.cmp(&x.amount));
            if sorted[0].amount > 0 {
                let second = sorted[1].amount.max(b.spot_price);
                b.reserved[s] = sorted[0].bidder;
                b.ask[s] = second.min(sorted[0].amount);
                b.reserve_until[s] = now + AUCTION_CLAIM_SECS;
            }
        }
        b.sale = SALE_CLOSED;
        id
    };
    let idb = id.to_le_bytes();
    let brk_seeds: &[&[u8]] = &[BREAK_SEED, &idb, &[ctx.bumps.brk]];
    let bids_seeds: &[&[u8]] = &[BIDS_SEED, &idb, &[ctx.bumps.bids]];
    let (perm, _) = EphemeralPermission::find_pda(ctx.accounts.bids.key);
    require_keys_eq!(ctx.accounts.bids_permission.key(), perm, BreakError::BadAccount);
    UpdateEphemeralPermissionCpi {
        payer: ctx.accounts.brk.to_account_info(),
        permissioned_account: ctx.accounts.bids.to_account_info(),
        permission: ctx.accounts.bids_permission.to_account_info(),
        vault: ctx.accounts.ephemeral_vault.to_account_info(),
        magic_program: ctx.accounts.magic_program.to_account_info(),
        permission_program: ctx.accounts.permission_program.to_account_info(),
        authority: ctx.accounts.bids.to_account_info(),
        authority_is_signer: false,
        args: EphemeralMembersArgs { is_private: false, members: vec![] },
    }
    .invoke_signed(&[brk_seeds, bids_seeds])?;
    Ok(())
}

#[derive(Accounts)]
pub struct CloseAuction<'info> {
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: sealed Bids
    #[account(mut, seeds = [BIDS_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub bids: UncheckedAccount<'info>,
    /// CHECK: checked against the Bids permission PDA
    #[account(mut)]
    pub bids_permission: UncheckedAccount<'info>,
    /// CHECK: permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral rent vault
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

// ---------------------------------------------------------------------------------------------
// Chat + reactions: free, instant messages in the rollup.

pub fn handle_send_chat(ctx: Context<SendChat>, kind: u8, text: Vec<u8>) -> Result<()> {
    let p = &ctx.accounts.profile;
    require!(p.acts(&ctx.accounts.signer.key()), BreakError::NotYourProfile);
    require!(!text.is_empty() && text.len() <= CHAT_TEXT && kind <= 1, BreakError::TooLong);
    let id = ctx.accounts.brk.load()?.break_id;
    let mut d = ctx.accounts.chat.try_borrow_mut_data()?;
    require!(d.len() >= CHAT_LEN, BreakError::BadAccount);
    let c: &mut Chat = bytemuck::from_bytes_mut(&mut d[..CHAT_LEN]);
    require!(c.magic == CHAT_MAGIC && c.break_id == id, BreakError::BadAccount);
    let i = c.head as usize % CHAT_LOG;
    let mut buf = [0u8; CHAT_TEXT];
    buf[..text.len()].copy_from_slice(&text);
    c.msgs[i] = ChatMsg { ts: Clock::get()?.unix_timestamp, author: p.owner, kind, len: text.len() as u8, text: buf };
    c.head = ((i + 1) % CHAT_LOG) as u32;
    c.count += 1;
    Ok(())
}

#[derive(Accounts)]
pub struct SendChat<'info> {
    pub signer: Signer<'info>,
    #[account(seeds = [PROFILE_SEED, profile.owner.as_ref()], bump = profile.bump)]
    pub profile: Account<'info, Profile>,
    #[account(seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: public Chat, verified by magic + break id
    #[account(mut, seeds = [CHAT_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub chat: UncheckedAccount<'info>,
}
