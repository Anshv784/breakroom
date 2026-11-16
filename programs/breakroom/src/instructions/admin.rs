//! Solana: protocol setup, the appraisal desk and the devnet test-USDC faucet.
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::constants::*;
use crate::error::BreakError;
use crate::state::*;

pub fn handle_init_stats(ctx: Context<InitStats>) -> Result<()> {
    require_keys_eq!(ctx.accounts.admin.key(), ADMIN, BreakError::NotAdmin);
    ctx.accounts.stats.bump = ctx.bumps.stats;
    Ok(())
}

#[derive(Accounts)]
pub struct InitStats<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Stats::INIT_SPACE, seeds = [STATS_SEED], bump)]
    pub stats: Account<'info, Stats>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------------------------
// Devnet test USDC: a mint whose authority is a PDA, so the faucet needs no server.

pub fn handle_init_test_mint(ctx: Context<InitTestMint>) -> Result<()> {
    require_keys_eq!(ctx.accounts.admin.key(), ADMIN, BreakError::NotAdmin);
    Ok(())
}

#[derive(Accounts)]
pub struct InitTestMint<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, seeds = [MINT_SEED], bump, mint::decimals = USDC_DECIMALS, mint::authority = mint)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_faucet(ctx: Context<UseFaucet>) -> Result<()> {
    #[cfg(feature = "mainnet")]
    return err!(BreakError::WrongStage);
    #[allow(unreachable_code)]
    {
        let now = Clock::get()?.unix_timestamp;
        let f = &mut ctx.accounts.faucet;
        require!(f.last == 0 || now >= f.last + FAUCET_COOLDOWN_SECS, BreakError::FaucetCooldown);
        f.last = now;
        f.bump = ctx.bumps.faucet;
        let seeds: &[&[u8]] = &[MINT_SEED, &[ctx.bumps.mint]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo { mint: ctx.accounts.mint.to_account_info(), to: ctx.accounts.ata.to_account_info(), authority: ctx.accounts.mint.to_account_info() },
                &[seeds],
            ),
            FAUCET_AMOUNT,
        )
    }
}

#[derive(Accounts)]
pub struct UseFaucet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [MINT_SEED], bump)]
    pub mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = user, associated_token::mint = mint, associated_token::authority = user)]
    pub ata: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = user, space = 8 + Faucet::INIT_SPACE, seeds = [FAUCET_SEED, user.key().as_ref()], bump)]
    pub faucet: Account<'info, Faucet>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------------------------
// Appraisal desk. One record per card NFT: market value, tier and grade. The admin is the
// appraiser here; on mainnet this is where a grader / tokenizer feed (PSA cert + market comps)
// plugs in. Hosts never set a card's price.

#[allow(clippy::too_many_arguments)]
pub fn handle_appraise(ctx: Context<Appraise>, value: u64, tier: u8, grade: u8, cert: u64, name: [u8; 32], set: [u8; 24], art: u32) -> Result<()> {
    require_keys_eq!(ctx.accounts.appraiser.key(), ADMIN, BreakError::NotAdmin);
    let m = &ctx.accounts.mint;
    require!(m.decimals == 0 && m.supply == 1, BreakError::NotACard);
    require!(tier <= TIER_CHASE && grade <= 100, BreakError::BadShape);
    let c = &mut ctx.accounts.card;
    c.mint = m.key();
    c.value = value;
    c.tier = tier;
    c.grade = grade;
    c.cert = cert;
    c.name = name;
    c.set = set;
    c.art = art;
    c.appraised_at = Clock::get()?.unix_timestamp;
    c.bump = ctx.bumps.card;
    Ok(())
}

#[derive(Accounts)]
pub struct Appraise<'info> {
    #[account(mut)]
    pub appraiser: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = appraiser, space = 8 + Card::INIT_SPACE, seeds = [CARD_SEED, mint.key().as_ref()], bump)]
    pub card: Account<'info, Card>,
    pub system_program: Program<'info, System>,
}
