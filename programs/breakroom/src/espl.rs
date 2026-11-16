//! MagicBlock Ephemeral SPL Token helpers (the program behind the Private Payments API).
//!
//! A wallet's USDC enters the TEE when its ephemeral ATA (EATA) is delegated: inside the rollup
//! the wallet's normal associated token account then holds that balance, and a program can move it
//! with an ordinary SPL `transfer`. Users get there through the Private Payments API's deposit; the
//! desk, owned by a PDA, is set up here by CPI.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
    program_option::COption,
};
use anchor_spl::token::{self, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::BreakError;

pub fn eata_pda(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), mint.as_ref()], &ESPL_PROGRAM).0
}

pub fn eata_buffer(eata: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"buffer", eata.as_ref()], &ESPL_PROGRAM).0
}

pub fn delegation_record(acc: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"delegation", acc.as_ref()], &DELEGATION_PROGRAM).0
}

pub fn delegation_metadata(acc: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"delegation-metadata", acc.as_ref()], &DELEGATION_PROGRAM).0
}

/// ESPL ix 0: create the EATA for `owner`.
pub fn init_eata<'info>(
    espl: &AccountInfo<'info>,
    eata: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    system: &AccountInfo<'info>,
) -> Result<()> {
    let ix = Instruction {
        program_id: ESPL_PROGRAM,
        accounts: vec![
            AccountMeta::new(eata.key(), false),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(owner.key(), false),
            AccountMeta::new_readonly(mint.key(), false),
            AccountMeta::new_readonly(system.key(), false),
        ],
        data: vec![0],
    };
    invoke(&ix, &[eata.clone(), payer.clone(), owner.clone(), mint.clone(), system.clone(), espl.clone()])?;
    Ok(())
}

/// ESPL ix 4: delegate an EATA, pinned to `validator`.
#[allow(clippy::too_many_arguments)]
pub fn delegate_eata<'info>(
    espl: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    eata: &AccountInfo<'info>,
    buffer: &AccountInfo<'info>,
    record: &AccountInfo<'info>,
    metadata: &AccountInfo<'info>,
    delegation: &AccountInfo<'info>,
    system: &AccountInfo<'info>,
    validator: Pubkey,
) -> Result<()> {
    let mut data = vec![4];
    data.extend_from_slice(validator.as_ref());
    let ix = Instruction {
        program_id: ESPL_PROGRAM,
        accounts: vec![
            AccountMeta::new(payer.key(), true),
            AccountMeta::new(eata.key(), false),
            AccountMeta::new_readonly(ESPL_PROGRAM, false),
            AccountMeta::new(buffer.key(), false),
            AccountMeta::new(record.key(), false),
            AccountMeta::new(metadata.key(), false),
            AccountMeta::new_readonly(delegation.key(), false),
            AccountMeta::new_readonly(system.key(), false),
        ],
        data,
    };
    invoke(
        &ix,
        &[payer.clone(), eata.clone(), espl.clone(), buffer.clone(), record.clone(), metadata.clone(), delegation.clone(), system.clone()],
    )?;
    Ok(())
}

/// Who is allowed to spend `amount` from `acct`: its owner, or the session key the owner
/// approved as SPL delegate (one wallet popup per session instead of one per trade).
pub fn require_spender(acct: &TokenAccount, signer: &Pubkey, amount: u64) -> Result<()> {
    if acct.owner == *signer {
        return Ok(());
    }
    match acct.delegate {
        COption::Some(d) if d == *signer => {
            require!(acct.delegated_amount >= amount, BreakError::NotApproved);
            Ok(())
        }
        _ => err!(BreakError::NotApproved),
    }
}

/// Who may act for the wallet that owns `acct` without moving money (list, accept a bid).
pub fn require_actor(acct: &TokenAccount, signer: &Pubkey) -> Result<()> {
    if acct.owner == *signer {
        return Ok(());
    }
    match acct.delegate {
        COption::Some(d) if d == *signer => Ok(()),
        _ => err!(BreakError::NotSpotOwner),
    }
}

pub fn pay<'info>(from: &AccountInfo<'info>, to: &AccountInfo<'info>, authority: &AccountInfo<'info>, token_program: &AccountInfo<'info>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new(token_program.key(), Transfer { from: from.clone(), to: to.clone(), authority: authority.clone() }),
        amount,
    )
}

pub fn pay_signed<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    amount: u64,
    seeds: &[&[u8]],
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new_with_signer(token_program.key(), Transfer { from: from.clone(), to: to.clone(), authority: authority.clone() }, &[seeds]),
        amount,
    )
}

pub fn bps(amount: u64, b: u64) -> u64 {
    ((amount as u128 * b as u128) / BPS as u128) as u64
}
