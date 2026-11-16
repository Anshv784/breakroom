//! Payments without custody.
//!
//! Inside MagicBlock's Private Ephemeral Rollup a wallet's USDC balance is private: the TEE
//! refuses any transaction that hands a private token account to a program other than the SPL
//! token program, even when the owner signs it. So BREAKROOM never touches a balance. Instead the
//! payer's own transaction carries plain SPL `transfer`s, straight to whoever is owed (the host,
//! the seller) and to the treasury, and the program's instruction right after them reads the
//! instructions sysvar and checks those transfers before it hands over the spot. Nobody's USDC
//! ever sits in a protocol account, and no balance is ever revealed to the program.
use anchor_lang::prelude::*;
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};

use crate::constants::*;
use crate::error::BreakError;

const TOKEN_PROGRAM: Pubkey = anchor_spl::token::ID;
const ATA_PROGRAM: Pubkey = anchor_spl::associated_token::ID;

pub fn usdc_account(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), TOKEN_PROGRAM.as_ref(), mint.as_ref()], &ATA_PROGRAM).0
}

/// (source, destination, amount) of an SPL Token `Transfer` / `TransferChecked`.
fn read_transfer(sysvar: &AccountInfo, index: usize) -> Result<(Pubkey, Pubkey, u64)> {
    let ix = load_instruction_at_checked(index, sysvar).map_err(|_| error!(BreakError::PaymentMissing))?;
    require_keys_eq!(ix.program_id, TOKEN_PROGRAM, BreakError::PaymentMissing);
    let d = &ix.data;
    require!(d.len() >= 9, BreakError::PaymentMissing);
    let amount = u64::from_le_bytes(d[1..9].try_into().unwrap());
    match d[0] {
        3 if ix.accounts.len() >= 3 => Ok((ix.accounts[0].pubkey, ix.accounts[1].pubkey, amount)),
        12 if ix.accounts.len() >= 4 => Ok((ix.accounts[0].pubkey, ix.accounts[2].pubkey, amount)),
        _ => err!(BreakError::PaymentMissing),
    }
}

/// The two instructions right before this one must move USDC out of `payer`'s account:
/// exactly `amount` to `payee` and exactly `fee` to the treasury. The token program already
/// checked that the transaction's signer may spend from that account (owner or approved
/// session key). Each payment is consumed by the instruction right after it, so one transfer
/// can never pay for two spots.
pub fn expect_payment(sysvar: &AccountInfo, payer: &Pubkey, mint: &Pubkey, payee: &Pubkey, amount: u64, fee: u64) -> Result<()> {
    require_keys_eq!(*sysvar.key, solana_instructions_sysvar::ID, BreakError::BadAccount);
    let here = load_current_index_checked(sysvar).map_err(|_| error!(BreakError::PaymentMissing))? as usize;
    require!(here >= 2, BreakError::PaymentMissing);
    let from = usdc_account(payer, mint);
    let (src, dst, amt) = read_transfer(sysvar, here - 2)?;
    require!(src == from && dst == usdc_account(payee, mint) && amt == amount, BreakError::PaymentMismatch);
    let (src, dst, amt) = read_transfer(sysvar, here - 1)?;
    require!(src == from && dst == usdc_account(&TREASURY, mint) && amt == fee, BreakError::PaymentMismatch);
    Ok(())
}

pub fn bps(amount: u64, b: u64) -> u64 {
    ((amount as u128 * b as u128) / BPS as u128) as u64
}
