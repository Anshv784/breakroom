// Create a real-looking break on devnet: mint + appraise a Genesis box, lock it, open the sale.
//   npx tsx scripts/seed.ts --title "Genesis Night #1" --spots 8 --per 3 --price 12 [--fill 6] [--start]
import { admin, clientFor, testKey, fund, sleep } from "./lib";
import { mintCard } from "./cards";
import { boxSpecs } from "./genesis";
import { readyBot, BOT_NAMES } from "./bots";
import { breakPda } from "../app/src/chain/client";
import { ST } from "../app/src/chain/layout";

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const title = arg("title", "Genesis Night")!;
const spots = Number(arg("spots", "8"));
const per = Number(arg("per", "3"));
const price = BigInt(Math.round(Number(arg("price", "12")) * 1e6));
const fill = Number(arg("fill", "0"));
const revealMs = Number(arg("reveal", "2600"));
const start = process.argv.includes("--start");

const A = admin();
const H = clientFor(testKey("host"));
H.session = testKey("host-session");
await fund(A, H.me, 0.6);
if ((await H.fetchProfile())?.agent.equals(H.session.publicKey) !== true) await H.startSession(1_000_000_000n);

const specs = boxSpecs(spots * per);
console.log(`minting ${specs.length} cards…`);
const mints = [];
for (const s of specs) mints.push(await mintCard(A, H.me, s));
// shuffle slot order so the box list isn't sorted by rarity
const order = mints.map((m, i) => ({ m, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.m);

const id = BigInt(Date.now());
await H.sendBase([H.createBreakIx(id, spots, per, price, revealMs, title)]);
for (let i = 0; i < order.length; i += 4) await H.sendBase(order.slice(i, i + 4).map((m, k) => H.depositCardIx(id, i + k, m)));
await H.sendBase(H.sealBreakIxs(id));
await A.waitInTee(breakPda(id));
await A.sendSession([A.openSaleIx(id, A.session.publicKey)]);
console.log(`break ${id} on sale: http://localhost:5181/#/break/${id}`);

if (fill > 0) {
  for (let k = 0; k < Math.min(fill, spots); k++) {
    const bot = await readyBot(BOT_NAMES[k % BOT_NAMES.length]);
    const b = (await A.fetchBreak(id))!;
    const free = b.spotOwner.findIndex((o) => !o);
    if (free < 0) break;
    await bot.sendSession(bot.buySpotIxs(b, free));
    console.log(`  ${BOT_NAMES[k % BOT_NAMES.length]} bought spot #${free + 1}`);
    await sleep(800);
  }
}
if (start) {
  await sleep(1500);
  console.log("start", await H.sendSession([H.startBreakIx(id)]));
}
console.log(id.toString());
