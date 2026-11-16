# BREAKROOM

**Live card breaks you can verify — and trade while the packs open.**

A *break* is how collectors share a sealed box: a host opens it live and each buyer owns a "spot" that receives some of the cards. It's a huge part of the hobby, and it runs on trust: buyers have to believe the host didn't swap cards, rig the spot assignment or leak what's in the packs. And once you've bought a spot, you're stuck with it until the end.

BREAKROOM puts the whole break on Solana and MagicBlock:

- **The box can't change.** Card NFTs go into a program vault and the card list is hashed into a commitment before a single spot sells. Values come from an appraisal desk, never from the host.
- **Nobody can see the shuffle — not even the host.** MagicBlock VRF seeds it, and the callback writes the order straight into a *sealed* account inside a Private Ephemeral Rollup (Intel TDX) whose permission has no members.
- **Packs open live, and every spot trades.** A crank inside the rollup reveals one card at a time. Meanwhile any unopened spot can be listed, offered on or bought — with live chase odds and expected value that move as cards come out.
- **Nobody holds your money.** USDC lives in each user's own private balance in the TEE (Private Payments API). Buyers pay hosts and sellers directly; the program only verifies the payment happened.
- **It settles itself.** After the last card the same crank unseals the Deck and commits with a **Magic Action** that writes every card's recipient to Solana. Anyone can then deliver the cards.
- **Anyone can verify it.** The verify page re-runs the shuffle in your browser from the public seed and checks every position, the opening order and the Solana receipt.

## MagicBlock, end to end

| Piece | What it does in BREAKROOM | Code |
|---|---|---|
| Ephemeral Rollup (TEE) | The break runs here: sale, 10 ms spot market, reveals | `programs/breakroom/src/instructions/{sale,market,live}.rs` |
| Private ER permissions | `Deck` is an ephemeral account with a private permission and **zero members**; flipped public only at the end | `sale.rs` `open_sale`, `live.rs` `finish` |
| VRF | Seed requested at start; callback shuffles into the sealed Deck | `live.rs` `start_break`, `on_shuffle` |
| Cranks | One scheduled task reveals every card **and** settles the break | `live.rs` `start_break` → `reveal` + `finish` |
| Magic Actions | Post-commit `settle` on Solana writes the Receipt + stats | `live.rs` `finish`, `settle.rs` `settle` |
| Private Payments API | Deposits/withdrawals into private USDC balances in the TEE | `app/src/chain/client.ts` `deposit` / `withdraw` |
| Session keys | SPL `approve` inside the TEE + `Profile.agent`: one signature, then silent trades | `profile.rs`, `client.ts` `startSession` |

### A finding that shaped the design

Inside the private rollup, the TEE gateway **refuses any transaction that hands a private token account to a program other than the SPL token program** — even when the owner signs it (`403 Access denied`). Plain SPL transfers between private balances are allowed, and a transaction may also contain a program instruction as long as that instruction doesn't list the private account.

So BREAKROOM is non-custodial by construction: every paid action is

```
[ SPL transfer  buyer → payee   (price − fee) ]
[ SPL transfer  buyer → treasury (fee)        ]
[ breakroom::buy_spot / buy_listed            ]   ← reads the instructions sysvar and checks both transfers
```

(`programs/breakroom/src/pay.rs`). Hosts are paid at the instant a spot sells; sellers at the instant a trade fills; balances are never revealed to the program.

## The life of a break

1. **Lock** — `create_break`, `deposit_card` ×N, `seal_break` (commitment + delegate to the TEE validator only).
2. **Sell** — `open_sale` creates the sealed Deck; buyers `buy_spot` with private USDC.
3. **Shuffle** — `start_break` requests VRF and schedules the crank; `on_shuffle` writes the order into the Deck. (`fallback_shuffle` seeds inside the TEE if VRF is late; the break is flagged.)
4. **Open** — the crank calls `reveal` every few seconds; spots trade with `list_spot`, `make_offer`, `accept_offer`, `buy_listed`.
5. **Settle** — the crank's `finish` unseals the Deck and commits with the `settle` Magic Action → `Receipt` on Solana.
6. **Deliver** — anyone calls `claim` to move each card from the vault to its owner.

## Run it

```bash
npm install
npm run dev                      # http://localhost:5173 (devnet)
```

Devnet program: `7hnz4i1zaz3UPW1eNzpTonN5GeLRCyVMSnpk5tTHKzTD` · test USDC mint (PDA, free on-chain faucet): `373bamXfJ14k3JvwRnnX6CpfSqjuWSY5cfMcuPBHrCzV`

The app needs no backend. On devnet a guest wallet can airdrop SOL, mint test USDC, deposit privately, and even mint an appraised **demo box** to host with (`demo_card`, on-chain, rate-limited).

### Scripts

| | |
|---|---|
| `scripts/deploy.sh` | build, extend program data if needed, deploy, verify deployed bytes |
| `scripts/setup.ts` | one-time: stats, test USDC, Payments API mint on the TEE, treasury balance |
| `scripts/e2e.ts` | full lifecycle on devnet + TEE: private deposits, paid buys, forged payment rejected, resale, accepted offer, VRF shuffle, crank reveals, unseal, in-browser re-verification, Magic Action settlement, delivery |
| `scripts/ui-flow.mjs` | clicks through the real UI as a new guest: onboarding → buy → list |
| `scripts/seed.ts` | mint + list a Genesis box (`--fill` bots buy, `--start` runs it) |
| `scripts/market.ts` | bot collectors trade a live break's spots off expected value |
| `scripts/check_shuffle.ts` | the browser verifier matches the program's shuffle bit for bit |

```bash
cargo test --lib                 # shuffle is a permutation + deterministic; layout + test vector
npx tsx scripts/check_shuffle.ts
npx tsx scripts/e2e.ts
```

## Trust model

- **You still trust** Intel TDX (MagicBlock's private rollup hardware) to keep the Deck sealed until the end, and the appraisal desk's prices.
- **You don't trust** the host (can't see or choose the order, can't change the box, can't hold buyers' money) or BREAKROOM (no members on the Deck, no custody, everything re-verifiable).
- On devnet the cards are original BREAKROOM *Genesis* NFTs. The program accepts any 1-of-1 card NFT the desk has appraised — that's where tokenized graded cards plug in on mainnet.

## Layout

```
programs/breakroom/src
  state.rs        Break (zero-copy), Deck (sealed), Receipt, Card, Profile, Stats
  pay.rs          non-custodial payment verification (instructions sysvar)
  instructions/   admin · host · profile · sale · market · live · settle
app/src
  chain/          client (base + TEE + Payments API), zero-copy decoders, shuffle verifier
  scene/          Three.js: the table, holo foil shader, packs, slabs
  pages/          Home · Lobby · Room · Host · Vault · Verify · How
```
