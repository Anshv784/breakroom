# Contributing to BREAKROOM

Thanks for taking a look. BREAKROOM is a small project, so there's no process to learn. This page covers the things that aren't obvious from the code.

## Ways to help

- **Try it and tell me what's wrong.** Confusing screens, a slow lobby, a rip that feels off: [open an issue](../../issues/new) with your browser, device and the break id from the URL.
- **Fix something.** Small, focused pull requests are easiest to review. For bigger changes (a new format, new fees, rule changes), open an issue first.
- **Security problems** (rigging a break, reading the sealed Deck, moving someone's money or cards) go through [SECURITY.md](SECURITY.md), not public issues.

## Getting set up

The app runs against the live devnet program, so most work needs only Node 22 or newer:

```bash
npm install
npm run dev        # http://localhost:5173
```

Program work also needs Rust, the Solana CLI and Anchor:

```bash
cargo test --lib
```

## How the code fits together

| Where | What |
|---|---|
| `programs/breakroom/src/instructions/` | `host.rs` builds and seals a box; `sale.rs` opens the sale (Deck, Bids, Chat) and sells spots; `market.rs` is the spot market; `live.rs` runs the shuffle, the crank, the rip and `finish`; `settle.rs` writes the Receipt, delivers cards and runs buyback. |
| `programs/breakroom/src/pay.rs` | The one place payments are checked. Every paid instruction reads the instructions sysvar and checks the buyer's own SPL transfers right before it. |
| `programs/breakroom/src/state.rs` | Account layouts. `Break` is zero-copy (9,488 bytes). |
| `app/src/chain/` | Instruction builders and account decoders. `layout.gen.json` must match `state.rs` byte for byte. |
| `app/src/scene/`, `app/src/pages/`, `app/src/ui/` | The 3D table and the screens. |
| `scripts/` | Devnet tooling and the end-to-end suites. |

The [README](README.md#how-it-works) has a diagram of a break from lock to delivery.

## The rules that matter

**1. Keep the layout in sync.** After changing a field in `Break` (or any account the app decodes), regenerate the offsets and copy them into `app/src/chain/layout.gen.json`:

```bash
cargo test -p breakroom print_layout -- --nocapture   # prints LAYOUT{...}
```

Don't change the size of `Break`: existing breaks on devnet would stop decoding. Use the spare bytes at the end instead (that's how `rip_armed` and `start_by` were added).

**2. The program never holds USDC.** The TEE refuses transactions that hand a private token account to any program but SPL Token. New paid actions must follow `pay.rs`: the buyer's transfers first, then an instruction that checks them.

**3. The shuffle has two copies.** The Rust shuffle in `live.rs` and the browser verifier in `app/src/chain/` must agree bit for bit. After touching either one, run:

```bash
npx tsx scripts/check_shuffle.ts
```

**4. Deploy with the script.** `scripts/deploy.sh` runs `cargo build-sbf` and `anchor idl build` (not `anchor build`), copies the IDL into the app, deploys, and checks that the deployed bytes match the build.

## Running your own program

1. Make a new program keypair and put its address in `declare_id!` (`lib.rs`), `Anchor.toml`, `app/src/chain/config.ts` and `scripts/deploy.sh`.
2. Set `ADMIN` in `constants.rs` to your own key (it runs the appraisal desk and the faucet).
3. `./scripts/deploy.sh`, then `npx tsx scripts/setup.ts` once (stats, test USDC, the Payments API mint on the TEE).
4. `npx tsx scripts/seed.ts --title "My first break" --fill 3` to list a box with bot buyers.

## Tests to run before a pull request

```bash
cargo test --lib
npx tsx scripts/check_shuffle.ts
npx tsx scripts/e2e.ts            # full lifecycle on devnet + TEE
npx tsx scripts/e2e_modes.ts      # auction, random teams, chat, buyback
npx tsx scripts/e2e_rip.ts <id>   # rip windows (needs a sold-out packs break)
npx tsx scripts/e2e_deadline.ts   # host start deadline
npm run build                     # typecheck + production build
```
