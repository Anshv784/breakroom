// End-to-end on devnet + the MagicBlock TEE. Grows with every feature.
import { admin, clientFor, testKey, fund, sleep, usd, check } from "./lib";
import { mintCard } from "./cards";
import { breakPda, profilePda, BreakroomClient } from "../app/src/chain/client";
import { ST } from "../app/src/chain/layout";

const A = admin();
const H = clientFor(testKey("host"));
const B1 = clientFor(testKey("buyer1"));
const B2 = clientFor(testKey("buyer2"));
console.log("host", H.me.toBase58(), "buyer1", B1.me.toBase58(), "buyer2", B2.me.toBase58());
await fund(A, H.me, 0.3);
await fund(A, B1.me, 0.1);
await fund(A, B2.me, 0.1);

const name = (c: BreakroomClient) => (c === H ? "host" : c === B1 ? "buyer1" : "buyer2");

// 1. test USDC -> private balances (Private Payments API), profiles, sessions
for (const c of [H, B1, B2]) {
  if ((await c.baseUsdc()) < 200_000_000n && !(await c.hasPrivateAccount())) await c.sendBase([c.faucetIx()]).catch((e) => console.log("  faucet:", e.message));
  if ((await c.privateUsdc()) < 50_000_000n) {
    console.log(`  ${name(c)} deposit 100 ->`, await c.deposit(100_000_000n));
    for (let i = 0; i < 40 && (await c.privateUsdc()) < 50_000_000n; i++) await sleep(500);
  }
  if (!(await c.base.getAccountInfo(profilePda(c.me)))) {
    await c.sendBase(c.createProfileIxs(name(c).toUpperCase()));
    await c.waitInTee(profilePda(c.me));
  }
  await c.startSession(100_000_000n);
  const p = (await c.fetchProfile())!;
  check(p.agent.equals(c.session.publicKey), `${name(c)}: session bound to profile, private ${usd(await c.privateUsdc())}`);
}

// 2. cards
const specs = [
  { name: "Ember Wyrm", set: "Genesis", value: 120, tier: 3, grade: 95, art: 11 },
  { name: "Tidal Sprite", set: "Genesis", value: 8, tier: 0, grade: 90, art: 22 },
  { name: "Stone Golem", set: "Genesis", value: 15, tier: 1, grade: 85, art: 33 },
  { name: "Void Seraph", set: "Genesis", value: 480, tier: 4, grade: 100, art: 44 },
];
const mints = [];
for (const s of specs) mints.push(await mintCard(A, H.me, s));
console.log("  minted", mints.length, "cards");

// 3. host builds + seals the break
const id = BigInt(Date.now());
await H.sendBase([H.createBreakIx(id, 2, 2, 5_000_000n, 2000, "E2E Genesis Break")]);
for (let i = 0; i < mints.length; i++) await H.sendBase([H.depositCardIx(id, i, mints[i])]);
await H.sendBase([H.sealBreakIx(id)]);
console.log("  sealed + delegated break", id.toString(), breakPda(id).toBase58());
await A.waitInTee(breakPda(id));
await A.sendSession([A.openSaleIx(id, A.session.publicKey)]);
let b = (await A.fetchBreak(id))!;
check(b.status === ST.SELLING, "break on sale in the TEE");
check((await A.fetchDeck(id, 4)) === null, "Deck sealed: unreadable");

// 4. buyer1 buys spot 0: pays the host 95% + treasury 5% directly, no wallet popup
const hostBefore = await H.privateUsdc();
const b1Before = await B1.privateUsdc();
console.log("  buy spot 0", await B1.sendSession(B1.buySpotIxs(b, 0)));
b = (await A.fetchBreak(id))!;
check(b.spotOwner[0]?.equals(B1.me), "spot 0 belongs to buyer1");
check((await B1.privateUsdc()) === b1Before - 5_000_000n, "buyer1 paid 5.00 from the private balance");
check((await H.privateUsdc()) === hostBefore + 4_750_000n, "host received 4.75 instantly");

// a forged payment is refused: pay the host 1 cent less
const forged = B2.buySpotIxs(b, 1);
(forged[0].data as Buffer).writeBigUInt64LE(4_740_000n, 1);
const err = await B2.sendSession(forged).then(() => null, (e) => e.message);
check(err && /6029|0x178d/.test(err), "underpaying the host is rejected (PaymentMismatch)");

// 5. the market: buyer1 lists spot 0, buyer2 buys it; buyer2 then accepts an offer from buyer1
await B1.sendSession([B1.listSpotIx(id, 0, 9_000_000n)]);
b = (await A.fetchBreak(id))!;
check(b.ask[0] === 9_000_000n, "spot 0 listed at 9.00");
const b1Mid = await B1.privateUsdc();
console.log("  buyer2 buys spot 0", await B2.sendSession(B2.buyListedIxs(b, 0)));
b = (await A.fetchBreak(id))!;
check(b.spotOwner[0]?.equals(B2.me), "spot 0 now belongs to buyer2");
check((await B1.privateUsdc()) === b1Mid + 8_820_000n, "seller got 8.82 (2% fee) instantly");
await B1.sendSession([B1.makeOfferIx(id, 0, 12_000_000n)]);
await B2.sendSession([B2.acceptOfferIx(id, 0, 12_000_000n)]);
b = (await A.fetchBreak(id))!;
check(b.reserved[0]?.equals(B1.me) && b.ask[0] === 12_000_000n, "offer accepted: spot reserved for buyer1 at 12.00");
const thief = await B2.sendSession(B2.buyListedIxs(b, 0)).then(() => null, (e) => e.message);
check(!!thief, "nobody else can take a reserved spot");
await B1.sendSession(B1.buyListedIxs(b, 0));
b = (await A.fetchBreak(id))!;
check(b.spotOwner[0]?.equals(B1.me) && b.trades[0].kind === 2, "buyer1 filled the accepted offer (bid hit)");
console.log(`  volume ${usd(b.volume)} secondary ${usd(b.secondaryVolume)} fees ${usd(b.fees)} host ${usd(b.hostRevenue)}`);
console.log("E2E OK", id.toString());
