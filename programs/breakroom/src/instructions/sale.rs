//! TEE: open the sale (seal the Deck) and sell spots for private USDC.
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::access_control::instructions::CreateEphemeralPermissionCpi;
use ephemeral_rollups_sdk::access_control::structs::{EphemeralMembersArgs, EphemeralPermission};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::ephemeral_accounts::EphemeralAccount;

use crate::constants::*;
use crate::error::BreakError;
use crate::pay::*;
use crate::state::*;

/// Create the sealed Deck (private permission, zero members: nobody can read it, the host
/// included) and give the Break a public permission. Anyone may call it, once.
pub fn handle_open_sale(ctx: Context<OpenSale>) -> Result<()> {
    let a = &ctx.accounts;
    let (id, status) = {
        let b = a.brk.load()?;
        (b.break_id, b.status)
    };
    require!(status == ST_SELLING, BreakError::WrongStage);
    let idb = id.to_le_bytes();
    let brk_seeds: &[&[u8]] = &[BREAK_SEED, &idb, &[ctx.bumps.brk]];
    let deck_seeds: &[&[u8]] = &[DECK_SEED, &idb, &[ctx.bumps.deck]];
    let brk_ai = a.brk.to_account_info();
    let deck_ai = a.deck.to_account_info();
    let vault = a.ephemeral_vault.to_account_info();

    if deck_ai.data_is_empty() {
        EphemeralAccount::new(&brk_ai, &deck_ai, &vault).with_signer_seeds(&[brk_seeds, deck_seeds]).create(DECK_LEN as u32)?;
        let mut d = deck_ai.try_borrow_mut_data()?;
        let deck: &mut Deck = bytemuck::from_bytes_mut(&mut d[..DECK_LEN]);
        deck.magic = DECK_MAGIC;
        deck.break_id = id;
    }
    let (deck_perm, _) = EphemeralPermission::find_pda(deck_ai.key);
    require_keys_eq!(a.deck_permission.key(), deck_perm, BreakError::BadAccount);
    if a.deck_permission.data_is_empty() {
        CreateEphemeralPermissionCpi {
            payer: brk_ai.clone(),
            permissioned_account: deck_ai.clone(),
            permission: a.deck_permission.to_account_info(),
            vault: vault.clone(),
            magic_program: a.magic_program.to_account_info(),
            permission_program: a.permission_program.to_account_info(),
            args: EphemeralMembersArgs { is_private: true, members: vec![] },
        }
        .invoke_signed(&[brk_seeds, deck_seeds])?;
    }
    let (brk_perm, _) = EphemeralPermission::find_pda(brk_ai.key);
    require_keys_eq!(a.brk_permission.key(), brk_perm, BreakError::BadAccount);
    if a.brk_permission.data_is_empty() {
        CreateEphemeralPermissionCpi {
            payer: brk_ai.clone(),
            permissioned_account: brk_ai.clone(),
            permission: a.brk_permission.to_account_info(),
            vault,
            magic_program: a.magic_program.to_account_info(),
            permission_program: a.permission_program.to_account_info(),
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
    let price = b.spot_price;
    require!(price <= max_price, BreakError::PriceMoved);
    let fee = bps(price, SALE_FEE_BPS);
    let host = b.host;
    expect_payment(&ctx.accounts.instructions.to_account_info(), &buyer, &b.mint, &host, price - fee, fee)?;

    b.spot_owner[s] = buyer;
    b.spot_cost[s] = price;
    b.last_price[s] = price;
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
