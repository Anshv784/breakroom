// Host start deadline on devnet + the TEE: the host picks how long they have to start; a buyer
// can't start early, but once the deadline passes (with a spot sold) any buyer can, and the
// unsold spots go to the host.
//   npx tsx scripts/e2e_deadline.ts
import { admin, clientFor, testKey, fund, sleep, check } from "./lib";
import { mintCard } from "./cards";
import { boxSpecs } from "./genesis";
import { readyBot, BOT_NAMES } from "./bots";
import { breakPda } from "../app/src/chain/client";
import { ST } from "../app/src/chain/layout";

const A = admin();
const H = clientFor(testKey("host"));
H.session = testKey("host-session");
await fund(A, H.me, 0.3);
if ((await H.fetchProfile())?.agent.equals(H.session.publicKey) !== true) await H.startSession(1_000_000_000n);

const bad = await H.sendBase([H.createBreakIx(BigInt(Date.now()), 3, 1, 1_000_000n, 1500, "[test] bad deadline", 0, 0, 0, 0)]).then(() => "ok").catch((e) => e.message);
check(bad !== "ok", "a break with no start deadline is rejected");

const mints = [];
for (const s of boxSpecs(3)) mints.push(await mintCard(A, H.me, s));
const id = BigInt(Date.now());
await H.sendBase([H.createBreakIx(id, 3, 1, 1_000_000n, 1500, "[test] start deadline", 0, 0, 0, 1)]);
let b = (await H.fetchBreak(id, "base"))!;
check(b.startBy === 1, `draft stores the host's pick (${b.startBy} min)`);
await H.sendBase(mints.map((m, k) => H.depositCardIx(id, k, m)));
const sealedAt = Math.floor(Date.now() / 1000);
await H.sendBase(H.sealBreakIxs(id));
await A.waitInTee(breakPda(id));
await A.sendSession([A.openSaleIx(id, A.session.publicKey)]);
b = (await H.fetchBreak(id, "tee"))!;
check(Math.abs(b.startBy - (sealedAt + 60)) < 30, `sealing turns it into a deadline: ${new Date(b.startBy * 1000).toISOString()}`);

const bot = await readyBot(BOT_NAMES[0]);
await bot.sendSession(bot.buySpotIxs(b, 0));
const early = await bot.sendSession([bot.startBreakIx(id)]).then(() => "ok").catch((e) => e.message);
check(early !== "ok", `a buyer can't start before the deadline (${String(early).slice(0, 50)})`);

const wait = b.startBy * 1000 - Date.now() + 3000;
console.log(`waiting ${(wait / 1000).toFixed(0)}s for the deadline…`);
await sleep(Math.max(0, wait));
await bot.sendSession([bot.startBreakIx(id)]);
const t0 = Date.now();
for (;;) {
  b = (await H.fetchBreak(id, "tee"))!;
  if (b.status >= ST.SHUFFLING) break;
  if (Date.now() - t0 > 20_000) throw new Error("break didn't start");
  await sleep(400);
}
check(b.status >= ST.SHUFFLING, `buyer started the overdue break (status ${b.status})`);
check(b.spotOwner[0]!.equals(bot.me) && b.spotOwner[1]!.equals(H.me) && b.spotOwner[2]!.equals(H.me), "buyer keeps their spot; unsold spots went to the host");
console.log("deadline e2e passed", id.toString());
