//! Solana: the post-commit Magic Action records who receives each card, and anyone can then
//! deliver the cards out of the vault.
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::BreakError;
use crate::state::*;

/// Runs only as the Magic Action of `finish`: reads the committed Break and writes the Receipt.
pub fn handle_settle<'info>(ctx: Context<'info, Settle<'info>>) -> Result<()> {
    // Only the delegation program can sign for the break's action escrow, which limits this to
    // the post-commit path. The executor appends [program, escrow_auth, escrow] after the action
    // accounts, so scan everything past the named ones.
    let expected = ephemeral_rollups_sdk::pda::ephemeral_balance_pda_from_payer(&ctx.accounts.brk.key(), ACTION_ESCROW_INDEX);
    let signed = [ctx.accounts.escrow_auth.as_ref(), ctx.accounts.escrow.as_ref()]
        .into_iter()
        .chain(ctx.remaining_accounts.iter())
        .any(|a| a.key() == expected && a.is_signer);
    require!(signed, BreakError::BadAccount);

    // Read the committed bytes in place: Break is ~9 KB, more than twice the SBF stack.
    let data = ctx.accounts.brk.try_borrow_data()?;
    require!(data.len() >= 8 + core::mem::size_of::<Break>(), BreakError::BadAccount);
    let b: &Break = bytemuck::from_bytes(&data[8..8 + core::mem::size_of::<Break>()]);
    let mut r = ctx.accounts.receipt.load_mut()?;
    require!(r.break_id == b.break_id, BreakError::BadAccount);
    if r.settled == 1 || b.status != ST_ENDED {
        return Ok(());
    }
    let per = b.per_spot as usize;
    for pos in 0..b.cards_total() {
        let card = b.revealed[pos];
        require!(card > 0, BreakError::WrongStage);
        let c = (card - 1) as usize;
        let spot = if b.teams() { b.spot_of_elem(b.card_elem[c]).unwrap_or(0) } else { pos / per };
        r.recipient[c] = b.spot_owner[spot];
    }
    r.host_paid = b.host_revenue;
    r.settled = 1;
    r.settled_at = Clock::get()?.unix_timestamp;

    let st = &mut ctx.accounts.stats;
    st.breaks += 1;
    st.cards += b.cards_total() as u64;
    st.primary_volume += b.volume.saturating_sub(b.secondary_volume);
    st.secondary_volume += b.secondary_volume;
    st.trades += b.n_trades as u64;
    st.fees += b.fees;
    Ok(())
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub receipt: AccountLoader<'info, Receipt>,
    /// CHECK: the committed Break (owned by the delegation program while delegated); read raw
    #[account(seeds = [BREAK_SEED, &receipt.load()?.break_id.to_le_bytes()], bump)]
    pub brk: UncheckedAccount<'info>,
    #[account(mut, seeds = [STATS_SEED], bump = stats.bump)]
    pub stats: Account<'info, Stats>,
    /// CHECK: escrow authority / escrow pair appended by the executor (verified in the handler)
    pub escrow_auth: UncheckedAccount<'info>,
    /// CHECK: see above
    pub escrow: UncheckedAccount<'info>,
}

/// Deliver card `index` to the wallet the Receipt names. Anyone may call it (and pay the ATA
/// rent), so cards arrive even if the winner never comes back.
pub fn handle_claim(ctx: Context<Claim>, index: u8) -> Result<()> {
    let (id, bit) = {
        let r = ctx.accounts.receipt.load()?;
        require!(r.settled == 1, BreakError::WrongStage);
        let i = index as usize;
        require!(i < r.n_cards as usize, BreakError::BadAccount);
        require_keys_eq!(r.cards[i], ctx.accounts.card_mint.key(), BreakError::BadAccount);
        require_keys_eq!(r.recipient[i], ctx.accounts.recipient.key(), BreakError::BadAccount);
        let bit = 1u64 << i;
        require!(r.claimed & bit == 0, BreakError::AlreadyClaimed);
        (r.break_id, bit)
    };
    ctx.accounts.receipt.load_mut()?.claimed |= bit;
    let idb = id.to_le_bytes();
    let seeds: &[&[u8]] = &[VAULT_SEED, &idb, &[ctx.bumps.vault]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer { from: ctx.accounts.vault_card.to_account_info(), to: ctx.accounts.recipient_card.to_account_info(), authority: ctx.accounts.vault.to_account_info() },
            &[seeds],
        ),
        1,
    )
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [RECEIPT_SEED, &receipt.load()?.break_id.to_le_bytes()], bump)]
    pub receipt: AccountLoader<'info, Receipt>,
    pub card_mint: Account<'info, Mint>,
    /// CHECK: must match the Receipt
    pub recipient: UncheckedAccount<'info>,
    /// CHECK: vault authority PDA
    #[account(seeds = [VAULT_SEED, &receipt.load()?.break_id.to_le_bytes()], bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = card_mint, associated_token::authority = vault)]
    pub vault_card: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = payer, associated_token::mint = card_mint, associated_token::authority = recipient)]
    pub recipient_card: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}


// ---------------------------------------------------------------------------------------------
// Instant buyback (Solana): sell a delivered card back to the desk's pool for 85% of its
// appraised value. The pool is a program-owned USDC account on Solana, so the program can pay
// out directly; the card joins the pool's inventory.

pub fn handle_sell_back(ctx: Context<SellBack>) -> Result<()> {
    let card = &ctx.accounts.card;
    require_keys_eq!(card.mint, ctx.accounts.card_mint.key(), BreakError::NotAppraised);
    let pay = (card.value as u128 * BUYBACK_BPS as u128 / BPS as u128) as u64;
    require!(ctx.accounts.pool_usdc.amount >= pay, BreakError::PoolEmpty);
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer { from: ctx.accounts.user_card.to_account_info(), to: ctx.accounts.pool_card.to_account_info(), authority: ctx.accounts.user.to_account_info() },
        ),
        1,
    )?;
    let seeds: &[&[u8]] = &[POOL_SEED, &[ctx.bumps.pool]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer { from: ctx.accounts.pool_usdc.to_account_info(), to: ctx.accounts.user_usdc.to_account_info(), authority: ctx.accounts.pool.to_account_info() },
            &[seeds],
        ),
        pay,
    )
}

#[derive(Accounts)]
pub struct SellBack<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub card_mint: Account<'info, Mint>,
    #[account(seeds = [CARD_SEED, card_mint.key().as_ref()], bump = card.bump)]
    pub card: Account<'info, Card>,
    #[account(mut, token::mint = card_mint, token::authority = user)]
    pub user_card: Account<'info, TokenAccount>,
    /// CHECK: pool authority PDA
    #[account(seeds = [POOL_SEED], bump)]
    pub pool: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = user, associated_token::mint = card_mint, associated_token::authority = pool)]
    pub pool_card: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = pool)]
    pub pool_usdc: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = user, associated_token::mint = usdc_mint, associated_token::authority = user)]
    pub user_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Admin: top up the buyback pool (devnet: mints test USDC into it).
pub fn handle_fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
    require_keys_eq!(ctx.accounts.admin.key(), ADMIN, BreakError::NotAdmin);
    let seeds: &[&[u8]] = &[MINT_SEED, &[ctx.bumps.usdc_mint]];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            token::MintTo { mint: ctx.accounts.usdc_mint.to_account_info(), to: ctx.accounts.pool_usdc.to_account_info(), authority: ctx.accounts.usdc_mint.to_account_info() },
            &[seeds],
        ),
        amount,
    )
}

#[derive(Accounts)]
pub struct FundPool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: pool authority PDA
    #[account(seeds = [POOL_SEED], bump)]
    pub pool: UncheckedAccount<'info>,
    #[account(mut, seeds = [MINT_SEED], bump)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = admin, associated_token::mint = usdc_mint, associated_token::authority = pool)]
    pub pool_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
