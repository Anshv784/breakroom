//! MagicBlock Ephemeral SPL Token (the program behind the Private Payments API): addresses only.
//! A wallet has a private USDC balance in the TEE once its ephemeral ATA (EATA) is delegated.
use anchor_lang::prelude::*;

use crate::constants::*;

pub fn eata_pda(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), mint.as_ref()], &ESPL_PROGRAM).0
}
