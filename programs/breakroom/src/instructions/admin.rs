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

// ---------------------------------------------------------------------------------------------
// Devnet only: anyone can mint themselves appraised Genesis cards to host a break with. The mint
// is a PDA (no extra signer), its authority is revoked after the single token is minted, and the
// appraisal is written in the same instruction. Rate-limited per wallet.

pub const DEMO_SEED: &[u8] = b"demo";
pub const DEMO_DAILY: u32 = 48;
const GENESIS: [&str; 32] = [
    "Ember Wyrm", "Tidal Sprite", "Stone Golem", "Void Seraph", "Storm Roc", "Bloom Dryad", "Frost Lynx", "Solar Lion",
    "Cinder Fox", "Abyss Leviathan", "Quartz Tortoise", "Null Wisp", "Static Hare", "Thorn Stag", "Rime Owl", "Dawn Moth",
    "Ashen Drake", "Reef Herald", "Basalt Titan", "Eclipse Oracle", "Thunder Djinn", "Moss Warden", "Glacier Maw", "Halo Phoenix",
    "Pyre Monk", "Brine Siren", "Geode Mole", "Hollow Knight", "Gale Courier", "Petal Imp", "Snowglass Fae", "Gilded Scarab",
];

pub fn handle_demo_card(ctx: Context<DemoCard>, nonce: u32, tier: u8, art: u16) -> Result<()> {
    #[cfg(feature = "mainnet")]
    return err!(BreakError::WrongStage);
    #[allow(unreachable_code)]
    {
        require!(tier <= TIER_CHASE, BreakError::BadShape);
        let clock = Clock::get()?;
        let q = &mut ctx.accounts.quota;
        let day = clock.unix_timestamp / 86_400;
        if q.last / 86_400 != day {
            q.last = clock.unix_timestamp;
            q.bump = ctx.bumps.quota;
            q.count = 0;
        }
        require!(q.count < DEMO_DAILY, BreakError::FaucetCooldown);
        q.count += 1;

        let user = ctx.accounts.user.key();
        let nb = nonce.to_le_bytes();
        let seeds: &[&[u8]] = &[DEMO_SEED, user.as_ref(), &nb, &[ctx.bumps.mint]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo { mint: ctx.accounts.mint.to_account_info(), to: ctx.accounts.ata.to_account_info(), authority: ctx.accounts.mint.to_account_info() },
                &[seeds],
            ),
            1,
        )?;
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                token::SetAuthority { current_authority: ctx.accounts.mint.to_account_info(), account_or_mint: ctx.accounts.mint.to_account_info() },
                &[seeds],
            ),
            anchor_spl::token::spl_token::instruction::AuthorityType::MintTokens,
            None,
        )?;
        // price inside the tier's band, from a hash of the mint and the slot
        let h = solana_sha256_hasher::hashv(&[ctx.accounts.mint.key().as_ref(), &clock.slot.to_le_bytes()]).to_bytes();
        let r = u64::from_le_bytes(h[0..8].try_into().unwrap()) % 1000;
        let (lo, span) = [(2u64, 5u64), (11, 14), (32, 38), (110, 90), (420, 160)][tier as usize];
        let value = (lo * 1000 + span * r) * 1000; // USDC base units
        let c = &mut ctx.accounts.card;
        c.mint = ctx.accounts.mint.key();
        c.value = value;
        c.tier = tier;
        c.grade = if tier >= 3 { 95 + (h[8] % 2) * 5 } else { 80 + (h[8] % 4) * 5 };
        c.cert = u64::from_le_bytes(h[16..24].try_into().unwrap()) % 9_000_000_000 + 1_000_000_000;
        let mut name = [0u8; 32];
        let nm = GENESIS[(art as usize) % 32].as_bytes();
        name[..nm.len()].copy_from_slice(nm);
        c.name = name;
        let mut set = [0u8; 24];
        set[..7].copy_from_slice(b"Genesis");
        c.set = set;
        // art % 8 picks the element; keep the name's element
        c.art = ((art as u32) % 32 % 8) + 8 * (h[9] as u32);
        c.appraised_at = clock.unix_timestamp;
        c.bump = ctx.bumps.card;
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct DemoQuota {
    pub last: i64,
    pub count: u32,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(nonce: u32)]
pub struct DemoCard<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(init, payer = user, seeds = [DEMO_SEED, user.key().as_ref(), &nonce.to_le_bytes()], bump, mint::decimals = 0, mint::authority = mint)]
    pub mint: Account<'info, Mint>,
    #[account(init, payer = user, associated_token::mint = mint, associated_token::authority = user)]
    pub ata: Account<'info, TokenAccount>,
    #[account(init, payer = user, space = 8 + Card::INIT_SPACE, seeds = [CARD_SEED, mint.key().as_ref()], bump)]
    pub card: Account<'info, Card>,
    #[account(init_if_needed, payer = user, space = 8 + DemoQuota::INIT_SPACE, seeds = [b"demoq", user.key().as_ref()], bump)]
    pub quota: Account<'info, DemoQuota>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
