//! TEE: the live break. Start closes the sale and asks MagicBlock VRF for a seed; the callback
//! shuffles the box into the sealed Deck; a crank then reveals one card at a time. When the last
//! card is out the Deck is made public and a commit carries a Magic Action that records, on
//! Solana, which wallet receives each card.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use ephemeral_rollups_sdk::access_control::instructions::UpdateEphemeralPermissionCpi;
use ephemeral_rollups_sdk::access_control::structs::{EphemeralMembersArgs, EphemeralPermission};
use ephemeral_rollups_sdk::anchor::{vrf, vrf_callback};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::crank::{ScheduleCrankCpi, ScheduleTaskArgs};
use ephemeral_rollups_sdk::ephem::{CallHandler, FoldableIntentBuilder, MagicIntentBundleBuilder};
use ephemeral_rollups_sdk::vrf::instructions::{create_request_high_priority_scoped_randomness_ix, RequestRandomnessParams};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;
use ephemeral_rollups_sdk::{ActionArgs, ShortAccountMeta};
use solana_sha256_hasher::hashv;

use crate::constants::*;
use crate::error::BreakError;
use crate::state::*;

fn now_ms() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp * 1000)
}

fn deck_mut<'a>(d: &'a mut [u8], id: u64) -> Result<&'a mut Deck> {
    require!(d.len() >= DECK_LEN, BreakError::BadAccount);
    let deck: &mut Deck = bytemuck::from_bytes_mut(&mut d[..DECK_LEN]);
    require!(deck.magic == DECK_MAGIC && deck.break_id == id, BreakError::BadAccount);
    Ok(deck)
}

/// Close the sale and request the shuffle seed. The host may start once at least one spot has
/// sold (unsold spots go to the host); anyone may start a sold-out break after a short wait, so a
/// host can't sit on buyers' spots.
pub fn handle_start_break<'info>(ctx: Context<'info, StartBreak<'info>>, client_seed: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let caller = ctx.accounts.payer.key();
    let (id, n_cards, reveal_ms) = {
        let mut b = ctx.accounts.brk.load_mut()?;
        require!(b.status == ST_SELLING, BreakError::WrongStage);
        require!(b.sale != SALE_AUCTION, BreakError::AuctionRunning);
        require!(!ctx.accounts.deck.data_is_empty(), BreakError::WrongStage);
        // the host's wallet, or the session key bound to the host's profile
        let p = &ctx.accounts.profile;
        require!(p.acts(&caller), BreakError::NotYourProfile);
        let is_host = p.owner == b.host;
        let host_start = is_host && b.sold > 0;
        let auto_start = b.sold == b.n_spots && now >= b.sold_out_at + AUTO_START_SECS;
        require!(host_start || auto_start, BreakError::TooEarly);
        let host = b.host;
        for s in 0..b.n_spots as usize {
            if b.spot_owner[s] == Pubkey::default() {
                b.spot_owner[s] = host;
                b.log(s as u8, TR_HOST_UNSOLD, 0, host, host, now);
            }
            b.ask[s] = 0;
            b.reserved[s] = Pubkey::default();
        }
        b.status = ST_SHUFFLING;
        b.shuffle_requested_at = now;
        b.crank_task = (b.break_id % 1_000_000) * 1_000 + (now as u64 % 1_000);
        (b.break_id, b.n_cards, b.reveal_ms)
    };

    // 1. VRF: the only source of the shuffle. The callback lands inside the TEE, straight into
    //    the sealed Deck.
    let ix = create_request_high_priority_scoped_randomness_ix(RequestRandomnessParams {
        payer: caller,
        oracle_queue: ctx.accounts.oracle_queue.key(),
        callback_program_id: crate::ID,
        callback_discriminator: crate::instruction::OnShuffle::DISCRIMINATOR.to_vec(),
        caller_seed: hashv(&[&id.to_le_bytes(), &[client_seed], &now.to_le_bytes()]).to_bytes(),
        accounts_metas: Some(vec![
            SerializableAccountMeta { pubkey: ctx.accounts.brk.key(), is_signer: false, is_writable: true },
            SerializableAccountMeta { pubkey: ctx.accounts.deck.key(), is_signer: false, is_writable: true },
        ]),
        ..Default::default()
    });
    ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix).map_err(|_| error!(BreakError::VrfRequestFailed))?;

    // 2. Crank: one reveal every `reveal_ms`, run by the validator itself. No server anywhere.
    let task_id = ctx.accounts.brk.load()?.crank_task;
    let reveal_ix = Instruction {
        program_id: crate::ID,
        accounts: vec![AccountMeta::new(ctx.accounts.brk.key(), false), AccountMeta::new_readonly(ctx.accounts.deck.key(), false)],
        data: anchor_lang::InstructionData::data(&crate::instruction::Reveal {}),
    };
    // ...and right behind it, the settle: a no-op until the last card is out, then it unseals the
    // Deck and commits with the Magic Action, once. The whole break runs itself.
    let r = &ctx.remaining_accounts;
    require!(r.len() >= 7, BreakError::BadAccount);
    let finish_ix = Instruction {
        program_id: crate::ID,
        accounts: vec![
            AccountMeta::new(ctx.accounts.brk.key(), false),
            AccountMeta::new(ctx.accounts.deck.key(), false),
            AccountMeta::new(r[0].key(), false),
            AccountMeta::new_readonly(r[1].key(), false),
            AccountMeta::new_readonly(r[2].key(), false),
            AccountMeta::new_readonly(PERMISSION_PROGRAM_ID, false),
            AccountMeta::new(EPHEMERAL_VAULT_ID, false),
            AccountMeta::new_readonly(MAGIC_PROGRAM_ID, false),
            AccountMeta::new(MAGIC_CONTEXT_ID, false),
            AccountMeta::new(r[3].key(), false),
        ],
        data: anchor_lang::InstructionData::data(&crate::instruction::Finish {}),
    };
    // remaining: deck_permission, receipt, stats, magic_fee_vault, permission program, ephemeral vault, magic context
    let mut accs = vec![ctx.accounts.brk.to_account_info(), ctx.accounts.deck.to_account_info(), ctx.accounts.magic_program.to_account_info()];
    accs.extend(r.iter().take(7).cloned());
    ScheduleCrankCpi {
        payer: &ctx.accounts.payer,
        magic_program: &ctx.accounts.magic_program,
        instruction_accounts: &accs,
        args: ScheduleTaskArgs {
            task_id: task_id as i64,
            execution_interval_millis: reveal_ms as i64,
            // the shuffle wait + intro, then one run per card, with slack for late runs
            iterations: n_cards as i64 + MAX_SPOTS as i64 + 40,
            instructions: vec![reveal_ix, finish_ix],
        },
    }
    .invoke()
    .map_err(|_| error!(BreakError::CrankFailed))?;
    Ok(())
}

#[vrf]
#[derive(Accounts)]
pub struct StartBreak<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The caller's profile (wallet or its session key): the host may start early.
    #[account(seeds = [PROFILE_SEED, profile.owner.as_ref()], bump = profile.bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: the sealed Deck PDA
    #[account(mut, seeds = [DECK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub deck: UncheckedAccount<'info>,
    /// CHECK: VRF ephemeral queue
    #[account(mut, address = ephemeral_rollups_sdk::vrf::consts::DEFAULT_EPHEMERAL_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
    /// CHECK: magic program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

/// Uniform index in 0..n from the seed stream (rejection sampling, no modulo bias).
struct Stream {
    seed: [u8; 32],
    counter: u32,
    buf: [u8; 32],
    at: usize,
}

impl Stream {
    fn new(seed: [u8; 32]) -> Self {
        Stream { seed, counter: 0, buf: [0; 32], at: 32 }
    }
    fn next_u32(&mut self) -> u32 {
        if self.at >= 32 {
            self.buf = hashv(&[&self.seed, &self.counter.to_le_bytes()]).to_bytes();
            self.counter += 1;
            self.at = 0;
        }
        let v = u32::from_le_bytes(self.buf[self.at..self.at + 4].try_into().unwrap());
        self.at += 4;
        v
    }
    fn below(&mut self, n: u32) -> u32 {
        let zone = u32::MAX - (u32::MAX % n);
        loop {
            let v = self.next_u32();
            if v < zone {
                return v % n;
            }
        }
    }
}

/// Fisher-Yates over the box, then over the spots' opening order. Public in the client
/// (app/src/chain/shuffle.ts) so anyone can re-run it once the seed is revealed.
pub fn shuffle(seed: [u8; 32], n_cards: usize, n_spots: usize) -> ([u8; MAX_CARDS], [u8; MAX_SPOTS]) {
    let mut st = Stream::new(seed);
    let mut order = [0u8; MAX_CARDS];
    for (i, o) in order.iter_mut().enumerate().take(n_cards) {
        *o = i as u8;
    }
    for i in (1..n_cards).rev() {
        let j = st.below(i as u32 + 1) as usize;
        order.swap(i, j);
    }
    let mut spots = [0u8; MAX_SPOTS];
    for (i, s) in spots.iter_mut().enumerate().take(n_spots) {
        *s = i as u8;
    }
    for i in (1..n_spots).rev() {
        let j = st.below(i as u32 + 1) as usize;
        spots.swap(i, j);
    }
    (order, spots)
}

/// Team mode: deal the 8 elements across the spots (shuffled, round-robin), as bitmasks.
pub fn deal_teams(seed: [u8; 32], n_spots: usize) -> [u8; MAX_SPOTS] {
    let mut st = Stream::new(hashv(&[&seed, b"teams"]).to_bytes());
    let mut elems = [0u8, 1, 2, 3, 4, 5, 6, 7];
    for i in (1..8).rev() {
        let j = st.below(i as u32 + 1) as usize;
        elems.swap(i, j);
    }
    let mut out = [0u8; MAX_SPOTS];
    for (i, e) in elems.iter().enumerate() {
        out[i % n_spots] |= 1 << e;
    }
    out
}

fn seed_break(b: &mut Break, deck: &mut Deck, seed: [u8; 32], source: u8) -> Result<()> {
    let (order, spots) = shuffle(seed, b.cards_total(), b.n_spots as usize);
    deck.randomness = seed;
    deck.order = order;
    if b.teams() {
        deck.spot_elems = deal_teams(seed, b.n_spots as usize);
    }
    deck.seeded = 1;
    b.open_order = spots;
    b.seed_source = source;
    b.status = ST_LIVE;
    b.next_reveal_ms = now_ms()? + INTRO_MS;
    Ok(())
}

/// VRF callback: the seed goes straight into the sealed Deck.
pub fn handle_on_shuffle(ctx: Context<OnShuffle>, randomness: [u8; 32]) -> Result<()> {
    let mut b = ctx.accounts.brk.load_mut()?;
    if b.status != ST_SHUFFLING {
        return Ok(());
    }
    let id = b.break_id;
    let mut d = ctx.accounts.deck.try_borrow_mut_data()?;
    let deck = deck_mut(&mut d, id)?;
    seed_break(&mut b, deck, randomness, 1)
}

#[vrf_callback]
#[derive(Accounts)]
pub struct OnShuffle<'info> {
    #[account(mut)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: sealed Deck, verified by magic + break id
    #[account(mut, owner = crate::ID)]
    pub deck: UncheckedAccount<'info>,
}

/// The VRF oracle didn't answer in time: seed from inside the TEE instead. The order is still
/// sealed from everyone (host included), and the break is flagged so the UI says so.
pub fn handle_fallback_shuffle(ctx: Context<FallbackShuffle>) -> Result<()> {
    let clock = Clock::get()?;
    let mut b = ctx.accounts.brk.load_mut()?;
    require!(b.status == ST_SHUFFLING, BreakError::WrongStage);
    require!(clock.unix_timestamp >= b.shuffle_requested_at + SHUFFLE_TIMEOUT_SECS, BreakError::TooEarly);
    let id = b.break_id;
    let seed = hashv(&[&id.to_le_bytes(), &clock.slot.to_le_bytes(), &clock.unix_timestamp.to_le_bytes(), &b.commitment, ctx.accounts.payer.key.as_ref()]).to_bytes();
    let mut d = ctx.accounts.deck.try_borrow_mut_data()?;
    let deck = deck_mut(&mut d, id)?;
    seed_break(&mut b, deck, seed, 2)
}

#[derive(Accounts)]
pub struct FallbackShuffle<'info> {
    pub payer: Signer<'info>,
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: the sealed Deck PDA
    #[account(mut, seeds = [DECK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub deck: UncheckedAccount<'info>,
}

/// Reveal the next card. Run by the crank; anyone may push one that's late. Before the shuffle
/// lands, and after the last card, it does nothing (so the crank can run a little long).
pub fn handle_reveal(ctx: Context<Reveal>) -> Result<()> {
    let now = now_ms()?;
    let mut b = ctx.accounts.brk.load_mut()?;
    if b.status != ST_LIVE {
        return Ok(());
    }
    // unix time is whole seconds inside the rollup: allow a second of slack
    if now + 1000 < b.next_reveal_ms {
        return Ok(());
    }
    let id = b.break_id;
    let total = b.cards_total();
    let k = b.cursor as usize;
    if k >= total {
        return Ok(());
    }
    let d = ctx.accounts.deck.try_borrow_data()?;
    require!(d.len() >= DECK_LEN, BreakError::BadAccount);
    let deck: &Deck = bytemuck::from_bytes(&d[..DECK_LEN]);
    require!(deck.magic == DECK_MAGIC && deck.break_id == id && deck.seeded == 1, BreakError::NotShuffled);
    if b.teams() && (b.teams_out as usize) < b.n_spots as usize {
        // randomizer first: one spot's team per tick, in the seeded order
        let s = b.open_order[b.teams_out as usize] as usize;
        b.spot_team[s] = deck.spot_elems[s];
        b.ask[s] = 0;
        b.bid[s] = 0;
        b.bidder[s] = Pubkey::default();
        b.reserved[s] = Pubkey::default();
        b.teams_out += 1;
        let gap = if b.teams_out as usize == b.n_spots as usize { b.reveal_ms as i64 * 2 } else { b.reveal_ms as i64 };
        b.next_reveal_ms = now + gap;
        return Ok(());
    }
    let pos = b.position_at(k);
    b.revealed[pos] = deck.order[pos] + 1;
    // a pack starting to open takes its spot off the market
    if !b.teams() {
        let spot = b.spot_of(pos);
        b.ask[spot] = 0;
        b.bid[spot] = 0;
        b.bidder[spot] = Pubkey::default();
        b.reserved[spot] = Pubkey::default();
    }
    b.cursor += 1;
    let per = b.per_spot as usize;
    // a short beat between packs
    let extra = if !b.teams() && (k + 1) % per == 0 { b.reveal_ms as i64 / 2 } else { 0 };
    b.next_reveal_ms = now + b.reveal_ms as i64 + extra;
    if b.cursor as usize == total {
        b.status = ST_ENDED;
        b.ended_at = now / 1000;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct Reveal<'info> {
    #[account(mut)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: the sealed Deck, verified by magic + break id
    #[account(owner = crate::ID)]
    pub deck: UncheckedAccount<'info>,
}

/// Every card is out: unseal the Deck (anyone can now re-run the shuffle from the VRF seed),
/// commit the break to Solana and record the result there through a Magic Action.
pub fn handle_finish(ctx: Context<Finish>) -> Result<()> {
    let id = {
        let mut b = ctx.accounts.brk.load_mut()?;
        // the crank calls this every interval: nothing to do until the end, and only once after
        if b.status != ST_ENDED || b.settle_sent == 1 {
            return Ok(());
        }
        b.settle_sent = 1;
        b.break_id
    };
    let idb = id.to_le_bytes();
    let brk_ai = ctx.accounts.brk.to_account_info();
    let brk_seeds: &[&[u8]] = &[BREAK_SEED, &idb, &[ctx.bumps.brk]];
    let deck_seeds: &[&[u8]] = &[DECK_SEED, &idb, &[ctx.bumps.deck]];
    let (perm, _) = EphemeralPermission::find_pda(ctx.accounts.deck.key);
    require_keys_eq!(ctx.accounts.deck_permission.key(), perm, BreakError::BadAccount);
    UpdateEphemeralPermissionCpi {
        payer: brk_ai.clone(),
        permissioned_account: ctx.accounts.deck.to_account_info(),
        permission: ctx.accounts.deck_permission.to_account_info(),
        vault: ctx.accounts.ephemeral_vault.to_account_info(),
        magic_program: ctx.accounts.magic_program.to_account_info(),
        permission_program: ctx.accounts.permission_program.to_account_info(),
        authority: ctx.accounts.deck.to_account_info(),
        authority_is_signer: false,
        args: EphemeralMembersArgs { is_private: false, members: vec![] },
    }
    .invoke_signed(&[brk_seeds, deck_seeds])?;

    let meta = |key: Pubkey, is_writable: bool| ShortAccountMeta { pubkey: key.to_bytes().into(), is_writable };
    let action = CallHandler {
        destination_program: crate::ID,
        accounts: vec![meta(ctx.accounts.receipt.key(), true), meta(brk_ai.key(), false), meta(ctx.accounts.stats.key(), true)],
        args: ActionArgs::new(anchor_lang::InstructionData::data(&crate::instruction::Settle {})),
        escrow_authority: brk_ai.clone(),
        compute_units: 200_000,
    };
    MagicIntentBundleBuilder::new(brk_ai.clone(), ctx.accounts.magic_context.to_account_info(), ctx.accounts.magic_program.to_account_info())
        .magic_fee_vault(ctx.accounts.magic_fee_vault.to_account_info())
        .commit(&[brk_ai.clone()])
        .add_post_commit_actions([action])
        .build_and_invoke_signed(&[brk_seeds])?;
    Ok(())
}

/// If the settling commit never reached Solana, anyone may re-arm it a minute after the end.
pub fn handle_rearm_settle(ctx: Context<Reveal>) -> Result<()> {
    let mut b = ctx.accounts.brk.load_mut()?;
    require!(b.status == ST_ENDED && b.settle_sent == 1, BreakError::WrongStage);
    require!(Clock::get()?.unix_timestamp >= b.ended_at + 60, BreakError::TooEarly);
    b.settle_sent = 0;
    Ok(())
}

#[derive(Accounts)]
pub struct Finish<'info> {
    #[account(mut, seeds = [BREAK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub brk: AccountLoader<'info, Break>,
    /// CHECK: the Deck PDA
    #[account(mut, seeds = [DECK_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub deck: UncheckedAccount<'info>,
    /// CHECK: checked against the Deck's permission PDA
    #[account(mut)]
    pub deck_permission: UncheckedAccount<'info>,
    /// CHECK: base-layer receipt (action target)
    #[account(seeds = [RECEIPT_SEED, &brk.load()?.break_id.to_le_bytes()], bump)]
    pub receipt: UncheckedAccount<'info>,
    /// CHECK: base-layer stats (action target)
    #[account(seeds = [STATS_SEED], bump)]
    pub stats: UncheckedAccount<'info>,
    /// CHECK: permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral rent vault
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
    /// CHECK: magic context
    #[account(mut, address = MAGIC_CONTEXT_ID)]
    pub magic_context: UncheckedAccount<'info>,
    /// CHECK: validator fee vault; the magic program checks it
    #[account(mut)]
    pub magic_fee_vault: UncheckedAccount<'info>,
}

#[cfg(test)]
mod shuffle_tests {
    use super::*;

    #[test]
    fn is_a_permutation_and_deterministic() {
        for n in [1usize, 2, 7, 30, 64] {
            let seed = [n as u8; 32];
            let (a, sa) = shuffle(seed, n, 16);
            let (b, _) = shuffle(seed, n, 16);
            assert_eq!(a, b);
            let mut seen = [false; MAX_CARDS];
            for &c in &a[..n] {
                assert!(!seen[c as usize]);
                seen[c as usize] = true;
            }
            let mut ss = [false; MAX_SPOTS];
            for &s in &sa {
                ss[s as usize] = true;
            }
            assert!(ss.iter().all(|&x| x));
        }
    }

    /// Fixed vector the TypeScript verifier (app/src/chain/shuffle.ts) is checked against.
    #[test]
    fn print_vector() {
        let mut seed = [0u8; 32];
        for (i, b) in seed.iter_mut().enumerate() {
            *b = (i * 7 + 3) as u8;
        }
        let (order, spots) = shuffle(seed, 30, 10);
        println!("VECTOR{{\"order\":{:?},\"spots\":{:?}}}", &order[..30], &spots[..10]);
    }
}

#[cfg(test)]
mod team_tests {
    use super::*;

    #[test]
    fn every_element_goes_to_exactly_one_spot() {
        for n in 1..=8usize {
            let t = deal_teams([n as u8; 32], n);
            let mut all = 0u8;
            for s in 0..n {
                assert!(t[s] != 0, "spot {s} got no element with {n} spots");
                assert_eq!(all & t[s], 0);
                all |= t[s];
            }
            assert_eq!(all, 0xff);
        }
    }
}
