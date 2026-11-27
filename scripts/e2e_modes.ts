// The newer features on devnet + TEE: sealed-bid auction, random-team mode, chat, buyback.
import { admin, clientFor, testKey, sleep, usd, check } from "./lib";
import { mintCard } from "./cards";
import { boxSpecs } from "./genesis";
import { readyBot } from "./bots";
import { breakPda, ata, type BreakroomClient } from "../app/src/chain/client";
import { ST } from "../app/src/chain/layout";
import { USDC_MINT } from "../app/src/chain/config";

const A = admin();
const H = clientFor(testKey("host"));
H.session = testKey("host-session");
if ((await H.fetchProfile())?.agent.equals(H.session.publicKey) !== true) await H.startSession(1_000_000_000n);
const B1 = await readyBot("KAIROS");
const B2 = await readyBot("VANTA");

async function makeBreak(n: number, per: number, price: bigint, mode: number, auction: number) {
  const mints = [];
  for (const s of boxSpecs(n * per)) mints.push(await mintCard(A, H.me, s));
  const id = BigInt(Date.now());
  await H.sendBase([H.createBreakIx(id, n, per, price, 1800, `[test] modes ${mode}/${auction}`, mode, auction ? 1 : 0, auction)]);
  for (let i = 0; i < mints.length; i += 4) await H.sendBase(mints.slice(i, i + 4).map((m, k) => H.depositCardIx(id, i + k, m)));
  await H.sendBase(H.sealBreakIxs(id));
  await A.waitInTee(breakPda(id));
  await A.sendSession([A.openSaleIx(id, A.session.publicKey)]);
  return id;
}
const waitStatus = async (id: bigint, st: number, ms = 90_000) => {
  const t0 = Date.now();
  let b;
  while (Date.now() - t0 < ms) {
    b = (await A.fetchBreak(id))!;
    if (b.status >= st) return b;
    await sleep(1000);
  }
  throw new Error(`status ${st} never reached`);
};

let aid: bigint = 0n;
let b: import("../app/src/chain/layout").BreakState;
if (!process.argv.includes("--skip-auction")) {
// ---- 1. sealed-bid auction
console.log("auction");
aid = await makeBreak(3, 1, 10_000_000n, 0, 30);
b = (await A.fetchBreak(aid))!;
check(b.sale === 1 && b.auctionEnd > 0, "auction is open");
await B1.sendSession([B1.placeBidIx(aid, 0, 12_000_000n)]);
await B2.sendSession([B2.placeBidIx(aid, 0, 20_000_000n)]);
await B2.sendSession([B2.placeBidIx(aid, 1, 15_000_000n)]);
b = (await A.fetchBreak(aid))!;
check(b.bidCount[0] === 2 && b.bidCount[1] === 1, "public sees only bid counts (2 on #1, 1 on #2)");
check((await A.fetchBids(aid, 3)) === null, "bid amounts sealed: unreadable");
const buyEarly = await B1.sendSession(B1.buySpotIxs(b, 2)).then(() => null, (e) => e.message);
check(!!buyEarly, "no direct buying while the auction runs");
while (Date.now() / 1000 < b.auctionEnd + 1) await sleep(1000);
await A.sendSession([A.closeAuctionIx(aid)]);
b = (await A.fetchBreak(aid))!;
check(b.sale === 2 && b.reserved[0]?.equals(B2.me) && b.ask[0] === 12_000_000n, "spot #1 → VANTA at the second price $12 (Vickrey)");
check(b.reserved[1]?.equals(B2.me) && b.ask[1] === 10_000_000n, "spot #2 → VANTA at the reserve $10");
const bids = await A.fetchBids(aid, 3);
check(!!bids && bids.bids[0].length === 2, "bids unsealed after close: anyone can check");
const steal = await B1.sendSession(B1.buySpotIxs(b, 0)).then(() => null, (e) => e.message);
check(!!steal, "loser can't take the winner's spot");
const hb = await H.privateUsdc();
await B2.sendSession(B2.buySpotIxs(b, 0));
b = (await A.fetchBreak(aid))!;
check(b.spotOwner[0]?.equals(B2.me) && (await H.privateUsdc()) === hb + 11_400_000n, "winner paid $12, host got $11.40");

}
// ---- 2. random-team mode
console.log("teams");
const tid = await makeBreak(4, 2, 5_000_000n, 1, 0);
b = (await A.fetchBreak(tid))!;
await B1.sendSession(B1.buySpotIxs(b, 0));
await B2.sendSession(B2.buySpotIxs(b, 1));
await H.sendSession([H.startBreakIx(tid)]);
b = await waitStatus(tid, ST.LIVE);
check(b.mode === 1, "team break live");
b = await waitStatus(tid, ST.ENDED, 120_000);
check(b.spotTeam.slice(0, 4).every((t) => t !== 0) && b.spotTeam.slice(0, 4).reduce((a, t) => a | t, 0) === 0xff, "all 8 elements dealt across 4 spots");
let r = await A.fetchReceipt(tid);
for (let i = 0; i < 60 && !r?.settled; i++) {
  await sleep(1000);
  r = await A.fetchReceipt(tid);
}
const ok = b.cardElem.every((e, c) => {
  const s = b!.spotTeam.findIndex((t) => (t & (1 << e)) !== 0);
  return r!.recipient[c]?.equals(b!.spotOwner[s]!);
});
check(!!r?.settled && ok, "every card went to the owner of its element's team");

// ---- 3. chat
console.log("chat");
await B1.sendSession([B1.sendChatIx(tid, "gl everyone")]);
await B2.sendSession([B2.sendChatIx(tid, "🔥", 1)]);
const msgs = await A.fetchChat(tid);
check(msgs.length >= 2 && msgs.at(-2)!.text === "gl everyone" && msgs.at(-1)!.kind === 1, "chat + reaction stored in the rollup");

// ---- 4. instant buyback
console.log("buyback");
await A.sendBase([A.fundPoolIx(5_000_000_000n)]);
const idx = r!.recipient.findIndex((x) => x?.equals(B1.me));
const mint = r!.cards[idx];
await A.sendBase([A.claimIx(tid, idx, mint, B1.me)]);
const card = (await A.fetchCard(mint))!;
const before = await B1.baseUsdc();
await B1.sendBase([B1.sellBackIx(mint)]);
const got = (await B1.baseUsdc()) - before;
check(got === (card.value * 8500n) / 10000n, `sold ${card.name} (${usd(card.value)}) back for ${usd(got)} (85%)`);
check((await A.base.getTokenAccountBalance(ata((await import("../app/src/chain/client")).poolPda(), mint))).value.amount === "1", "card is in the pool");
console.log("E2E MODES OK");
