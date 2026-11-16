//! Player profiles. Created on Solana, delegated to the TEE; inside it the wallet binds a session
//! key (one signature) that then trades for it with no popups.
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::constants::*;
use crate::error::BreakError;
use crate::state::*;

fn check_name(name: &[u8; 20]) -> Result<()> {
    let n = name.iter().position(|&b| b == 0).unwrap_or(20);
    require!(n >= 2, BreakError::BadName);
    require!(name[..n].iter().all(|&c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-'), BreakError::BadName);
    require!(name[n..].iter().all(|&c| c == 0), BreakError::BadName);
    Ok(())
}

pub fn handle_create_profile(ctx: Context<CreateProfile>, name: [u8; 20]) -> Result<()> {
    check_name(&name)?;
    let p = &mut ctx.accounts.profile;
    p.owner = ctx.accounts.owner.key();
    p.name = name;
    p.created_at = Clock::get()?.unix_timestamp;
    p.bump = ctx.bumps.profile;
    Ok(())
}

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(init, payer = owner, space = 8 + Profile::INIT_SPACE, seeds = [PROFILE_SEED, owner.key().as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    pub system_program: Program<'info, System>,
}

/// Hand the profile to the TEE validator (same transaction as `create_profile`).
pub fn handle_delegate_profile(ctx: Context<DelegateProfile>) -> Result<()> {
    let owner = ctx.accounts.owner.key();
    let (pda, _) = Pubkey::find_program_address(&[PROFILE_SEED, owner.as_ref()], &crate::ID);
    require_keys_eq!(ctx.accounts.profile.key(), pda, BreakError::BadAccount);
    require_keys_eq!(ctx.accounts.validator.key(), TEE_VALIDATOR, BreakError::NotTee);
    ctx.accounts.delegate_profile(&ctx.accounts.owner, &[PROFILE_SEED, owner.as_ref()], DelegateConfig { validator: Some(TEE_VALIDATOR), ..Default::default() })?;
    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateProfile<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: the owner's profile PDA (checked in the handler)
    #[account(mut, del)]
    pub profile: UncheckedAccount<'info>,
    /// CHECK: TEE validator identity
    pub validator: UncheckedAccount<'info>,
}

/// TEE, signed by the wallet: bind a new session key (and optionally rename).
pub fn handle_set_agent(ctx: Context<SetAgent>, agent: Pubkey, name: Option<[u8; 20]>) -> Result<()> {
    let p = &mut ctx.accounts.profile;
    require_keys_eq!(p.owner, ctx.accounts.owner.key(), BreakError::NotYourProfile);
    p.agent = agent;
    if let Some(n) = name {
        check_name(&n)?;
        p.name = n;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct SetAgent<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [PROFILE_SEED, owner.key().as_ref()], bump = profile.bump)]
    pub profile: Account<'info, Profile>,
}
