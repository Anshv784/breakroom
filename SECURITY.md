# Security

BREAKROOM keeps the card order and auction bids sealed inside a TEE, and moves people's USDC and cards. If you find a way to break any of that, please tell me privately first so it can be fixed before anyone uses it.

## Reporting

Use GitHub's private report: **[Report a vulnerability](../../security/advisories/new)** (the Security tab of this repository). Please include:

- what an attacker can do, and what it costs them
- the instruction(s) and file(s) involved
- steps or a script to reproduce it, ideally against devnet

You'll get a reply within a few days, and credit once it's fixed unless you'd rather not.

Please don't test against other people's breaks. Seed your own with `scripts/seed.ts` against your own devnet program (see [CONTRIBUTING.md](CONTRIBUTING.md#running-your-own-program)).

## What's in scope

- **Money:** paying less than the price, taking a spot without paying, or paying the wrong party. That covers `buy_spot`, `buy_listed`, `accept_offer`, `place_bid`, `close_auction` and `sell_back` (`pay.rs` checks every payment).
- **Cards:** moving a card out of the vault other than to the wallet the Receipt names, changing the box after `seal_break`, or a host taking cards back after the sale opens.
- **Hidden information:** reading the Deck before `finish` or the Bids before `close_auction`, or predicting the shuffle.
- **Fairness:** choosing or influencing which card a spot gets, starting a break early, or blocking a stalled break from being started.
- **The website and the avatar worker:** acting as another wallet, changing someone else's profile picture, or running script in another user's browser.

## Known and accepted

- MagicBlock's TEE validator is trusted to run the program honestly and to enforce read permissions.
- Card values come from the appraisal desk (the admin key), not from the host.
- Buyers pay the host at the moment of sale. The program never holds money, so it can't refund. A stalled break is started instead (after the host's start deadline), and buyers get their packs.
- A host with a second wallet can still bid in their own auction. Bids are sealed and the winner pays the second price, so it can't be used to bait a real bidder upward.
- Third-party dependency advisories inside the Solana and MagicBlock libraries.

## Status

The program is on devnet only, with test money and demo cards. It has had a self-review backed by on-chain end-to-end tests, not a professional audit.
