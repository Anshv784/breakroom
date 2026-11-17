//! Solana: a host builds a break. Cards go into a program vault one by one, then the box is
//! sealed (its card list hashed into a commitment) and handed to the TEE validator.
use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::constants::*;
use crate::error::BreakError;
use crate::espl::*;
use crate::state::*;

/// Lamports a break carries into the rollup to pay rent for its sealed Deck and permissions.
pub const BREAK_PREFUND: u64 = 10_000_000;

pub fn handle_create_break(
    ctx: Context<CreateBreak>,
    break_id: u64,
    n_spots: u8,
    per_spot: u8,
    spot_price: u64,
    reveal_ms: u32,
    title: [u8; 48],
    mode: u8,
    sale: u8,
    auction_secs: u32,
) -> Result<()> {
    require!(mode <= MODE_TEAMS && sale <= SALE_AUCTION, BreakError::BadShape);
    // team mode deals the 8 elements across the spots
    require!(mode == MODE_PACKS || n_spots <= 8, BreakError::BadShape);
    require!(sale == SALE_FIXED || (MIN_AUCTION_SECS..=MAX_AUCTION_SECS).contains(&auction_secs), BreakError::BadShape);
    require!((2..=MAX_SPOTS as u8).contains(&n_spots), BreakError::BadShape);
    require!((1..=MAX_CARDS_PER_SPOT as u8).contains(&per_spot), BreakError::BadShape);
    require!(n_spots as usize * per_spot as usize <= MAX_CARDS, BreakError::BadShape);
    require!(spot_price >= MIN_SPOT_PRICE, BreakError::PriceTooLow);
    require!((MIN_REVEAL_MS..=MAX_REVEAL_MS).contains(&reveal_ms), BreakError::BadShape);
    // The host is paid inside the rollup, so they need a private USDC balance there already.
    let host = ctx.accounts.host.key();
    let mint = ctx.accounts.mint.key();
    require_keys_eq!(ctx.accounts.host_eata.key(), eata_pda(&host, &mint), BreakError::BadAccount);
    require!(!ctx.accounts.host_eata.data_is_empty(), BreakError::HostNotReady);

    let now = Clock::get()?.unix_timestamp;
    {
        let mut b = ctx.accounts.brk.load_init()?;
        b.break_id = break_id;
        b.host = host;
        b.mint = mint;
        b.n_spots = n_spots;
        b.per_spot = per_spot;
        b.n_cards = n_spots * per_spot;
        b.spot_price = spot_price;
        b.reveal_ms = reveal_ms;
        b.title = title;
        b.created_at = now;
        b.status = ST_DRAFT;
        b.bump = ctx.bumps.brk;
        b.vault_bump = ctx.bumps.vault;
        b.mode = mode;
        b.sale = sale;
        b.auction_secs = auction_secs;
    }
    {
        let mut r = ctx.accounts.receipt.load_init()?;
        r.break_id = break_id;
        r.host = host;
        r.n_cards = n_spots * per_spot;
        r.bump = ctx.bumps.receipt;
    }
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            anchor_lang::system_program::Transfer { from: ctx.accounts.host.to_account_info(), to: ctx.accounts.brk.to_account_info() },
        ),
        BREAK_PREFUND,
    )?;
    Ok(())
}

#[derive(Accounts)]
#[instruction(break_id: u64)]
pub struct CreateBreak<'info> {
    #[account(mut)]
    pub host: Signer<'info>,
    pub mint: Account<'info, Mint>,
    /// CHECK: must be the host's ephemeral USDC account (checked in the handler)
    pub host_eata: UncheckedAccount<'info>,
    #[account(init, payer = host, space = 8 + core::mem::size_of::<Break>(), seeds = [BREAK_SEED, &break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    #[account(init, payer = host, space = 8 + core::mem::size_of::<Receipt>(), seeds = [RECEIPT_SEED, &break_id.to_le_bytes()], bump)]
    pub receipt: AccountLoader<'info, Receipt>,
    /// CHECK: PDA that owns the card vault; never holds data
    #[account(seeds = [VAULT_SEED, &break_id.to_le_bytes()], bump)]
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Lock one card NFT into the break's vault, at `slot` of the box. The price shown for it comes
/// from the appraisal desk, not from the host.
pub fn handle_deposit_card(ctx: Context<DepositCard>, slot: u8) -> Result<()> {
    let card = &ctx.accounts.card;
    let mint = &ctx.accounts.card_mint;
    require_keys_eq!(card.mint, mint.key(), BreakError::NotAppraised);
    require!(mint.decimals == 0 && mint.supply == 1, BreakError::NotACard);
    {
        let mut b = ctx.accounts.brk.load_mut()?;
        require!(b.status == ST_DRAFT, BreakError::WrongStage);
        require_keys_eq!(b.host, ctx.accounts.host.key(), BreakError::NotHost);
        let s = slot as usize;
        require!(s < b.cards_total(), BreakError::BadShape);
        require!(b.cards[s] == Pubkey::default(), BreakError::SlotFilled);
        b.cards[s] = mint.key();
        b.card_value[s] = card.value;
        b.card_tier[s] = card.tier;
        b.card_elem[s] = (card.art % 8) as u8;
        b.box_value = b.box_value.checked_add(card.value).ok_or(BreakError::Overflow)?;
        b.deposited += 1;
    }
    {
        let mut r = ctx.accounts.receipt.load_mut()?;
        r.cards[slot as usize] = mint.key();
    }
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer { from: ctx.accounts.host_card.to_account_info(), to: ctx.accounts.vault_card.to_account_info(), authority: ctx.accounts.host.to_account_info() },
        ),
        1,
    )
}

#[derive(Accounts)]
pub struct DepositCard<'info> {
    #[account(mut)]
    pub host: Signer<'info>,
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    #[account(mut, seeds = [RECEIPT_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub receipt: AccountLoader<'info, Receipt>,
    pub card_mint: Account<'info, Mint>,
    #[account(seeds = [CARD_SEED, card_mint.key().as_ref()], bump = card.bump)]
    pub card: Account<'info, Card>,
    #[account(mut, token::mint = card_mint, token::authority = host)]
    pub host_card: Account<'info, TokenAccount>,
    /// CHECK: vault authority PDA
    #[account(seeds = [VAULT_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = host, associated_token::mint = card_mint, associated_token::authority = vault)]
    pub vault_card: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// While still a draft, the host can take a card back out.
pub fn handle_withdraw_card(ctx: Context<WithdrawCard>, slot: u8) -> Result<()> {
    let (id, vault_bump) = {
        let mut b = ctx.accounts.brk.load_mut()?;
        require!(b.status == ST_DRAFT, BreakError::WrongStage);
        require_keys_eq!(b.host, ctx.accounts.host.key(), BreakError::NotHost);
        let s = slot as usize;
        require!(s < b.cards_total() && b.cards[s] == ctx.accounts.card_mint.key(), BreakError::BadAccount);
        b.cards[s] = Pubkey::default();
        b.box_value = b.box_value.saturating_sub(b.card_value[s]);
        b.card_value[s] = 0;
        b.card_tier[s] = 0;
        b.deposited -= 1;
        (b.break_id, b.vault_bump)
    };
    ctx.accounts.receipt.load_mut()?.cards[slot as usize] = Pubkey::default();
    let idb = id.to_le_bytes();
    let seeds: &[&[u8]] = &[VAULT_SEED, &idb, &[vault_bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer { from: ctx.accounts.vault_card.to_account_info(), to: ctx.accounts.host_card.to_account_info(), authority: ctx.accounts.vault.to_account_info() },
            &[seeds],
        ),
        1,
    )
}

#[derive(Accounts)]
pub struct WithdrawCard<'info> {
    #[account(mut)]
    pub host: Signer<'info>,
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    #[account(mut, seeds = [RECEIPT_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub receipt: AccountLoader<'info, Receipt>,
    pub card_mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = host, associated_token::mint = card_mint, associated_token::authority = host)]
    pub host_card: Account<'info, TokenAccount>,
    /// CHECK: vault authority PDA
    #[account(seeds = [VAULT_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = card_mint, associated_token::authority = vault)]
    pub vault_card: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// sha256(break_id ‖ for each slot: mint ‖ value). Published before a single spot sells, so the
/// box can't change afterwards and anyone can re-check it.
pub fn commitment(b: &Break) -> [u8; 32] {
    let id = b.break_id.to_le_bytes();
    let n = b.cards_total();
    let mut vals = [[0u8; 8]; MAX_CARDS];
    for (i, v) in vals.iter_mut().enumerate().take(n) {
        *v = b.card_value[i].to_le_bytes();
    }
    let mut parts: Vec<&[u8]> = Vec::with_capacity(1 + 2 * n);
    parts.push(&id);
    for i in 0..n {
        parts.push(b.cards[i].as_ref());
        parts.push(&vals[i]);
    }
    hashv(&parts).to_bytes()
}

/// Seal the box (commit to its card list) and hand the break to the TEE validator. From here
/// on the host can't touch the cards: only settlement moves them.
pub fn handle_seal_break(ctx: Context<SealBreak>) -> Result<()> {
    let brk_ai = ctx.accounts.brk.to_account_info();
    require!(brk_ai.owner == &crate::ID, BreakError::WrongStage);
    let id = {
        let mut data = brk_ai.try_borrow_mut_data()?;
        require!(data.len() >= 8 + core::mem::size_of::<Break>() && data[..8] == *Break::DISCRIMINATOR, BreakError::BadAccount);
        let b: &mut Break = bytemuck::from_bytes_mut(&mut data[8..8 + core::mem::size_of::<Break>()]);
        let (pda, _) = Pubkey::find_program_address(&[BREAK_SEED, &b.break_id.to_le_bytes()], &crate::ID);
        require_keys_eq!(pda, brk_ai.key(), BreakError::BadAccount);
        require_keys_eq!(b.host, ctx.accounts.host.key(), BreakError::NotHost);
        require!(b.status == ST_DRAFT, BreakError::WrongStage);
        require!(b.deposited as usize == b.cards_total(), BreakError::BoxIncomplete);
        b.commitment = commitment(b);
        b.status = ST_SELLING;
        b.break_id
    };
    let validator = ctx.accounts.validator.key();
    require_keys_eq!(validator, TEE_VALIDATOR, BreakError::NotTee);
    let idb = id.to_le_bytes();
    ctx.accounts.delegate_brk(&ctx.accounts.host, &[BREAK_SEED, &idb], DelegateConfig { validator: Some(validator), ..Default::default() })?;
    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct SealBreak<'info> {
    #[account(mut)]
    pub host: Signer<'info>,
    /// CHECK: the Break PDA, checked and loaded in the handler, then delegated
    #[account(mut, del)]
    pub brk: UncheckedAccount<'info>,
    /// CHECK: TEE validator identity
    pub validator: UncheckedAccount<'info>,
}
