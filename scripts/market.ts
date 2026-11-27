// Bot collectors trade a break's spots off live expected value, so a devnet room has a real
// market: they list above EV, bid below it, buy underpriced asks and accept rich offers. Every
// trade is the same paid, verified instruction a person sends.
//   npx tsx scripts/market.ts <breakId> [--bots 6] [--buy-open]
import { readyBot, BOT_NAMES } from "./bots";
import { admin, sleep } from "./lib";
import { ST } from "../app/src/chain/layout";
import { spotOdds } from "../app/src/lib/odds";
import type { BreakroomClient } from "../app/src/chain/client";

const id = BigInt(process.argv[2]);
const nBots = Number(process.argv[process.argv.indexOf("--bots") + 1] || 6);
const buyOpen = process.argv.includes("--buy-open");
const A = admin();
const bots: { name: string; c: BreakroomClient }[] = [];
for (const name of BOT_NAMES.filter((x) => x !== process.env.SKIP).slice(0, nBots)) bots.push({ name, c: await readyBot(name, 30_000_000n) });
const byKey = new Map(bots.map((x) => [x.c.me.toBase58(), x]));
const usd = (n: number) => BigInt(Math.max(1_000_000, Math.round(n * 100) * 10_000)); // cents, >= $1
const jitter = (a: number, b: number) => a + Math.random() * (b - a);
console.log(`market on ${id} with ${bots.map((b) => b.name).join(", ")}`);

for (;;) {
  const b = await A.fetchBreak(id).catch(() => null);
  if (!b || b.status >= ST.ENDED) break;
  const odds = spotOdds(b);
  const bot = bots[Math.floor(Math.random() * bots.length)];
  const me = bot.c.me.toBase58();
  const s = Math.floor(Math.random() * b.nSpots);
  const owner = b.spotOwner[s]?.toBase58();
  const locked = b.status === ST.LIVE && odds[s].sealed < b.perSpot;
  const ev = odds[s].ev;
  try {
    if (b.status === ST.SELLING && !owner && buyOpen) {
      await bot.c.sendSession(bot.c.buySpotIxs(b, s));
      console.log(`${bot.name} bought open spot #${s + 1}`);
    } else if (!locked && owner) {
      if (owner === me) {
        if (b.bid[s] > 0n && Number(b.bid[s]) / 1e6 > ev * 1.02) {
          await bot.c.sendSession([bot.c.acceptOfferIx(id, s, b.bid[s])]);
          console.log(`${bot.name} accepted $${Number(b.bid[s]) / 1e6} on #${s + 1}`);
        } else if (Math.random() < 0.5) {
          const ask = usd(ev * jitter(1.04, 1.3));
          await bot.c.sendSession([bot.c.listSpotIx(id, s, ask)]);
          console.log(`${bot.name} listed #${s + 1} at $${Number(ask) / 1e6} (ev $${ev.toFixed(2)})`);
        }
      } else {
        const ask = Number(b.ask[s]) / 1e6;
        const reservedForOther = b.reserved[s] && b.reserved[s]!.toBase58() !== me && b.reserveUntil[s] * 1000 > Date.now();
        if (b.reserved[s]?.toBase58() === me && b.reserveUntil[s] * 1000 > Date.now()) {
          await bot.c.sendSession(bot.c.buyListedIxs(b, s));
          console.log(`${bot.name} filled accepted offer on #${s + 1}`);
        } else if (ask > 0 && !reservedForOther && ask < ev * jitter(0.98, 1.12)) {
          await bot.c.sendSession(bot.c.buyListedIxs(b, s));
          console.log(`${bot.name} bought #${s + 1} from ${byKey.get(owner)?.name ?? owner.slice(0, 4)} at $${ask}`);
        } else {
          const floor = Number(b.bid[s]) / 1e6 * 1.02;
          const bid = Math.max(floor + 0.05, ev * jitter(0.78, 0.97));
          if (bid < ev) {
            await bot.c.sendSession([bot.c.makeOfferIx(id, s, usd(bid))]);
            console.log(`${bot.name} offered $${bid.toFixed(2)} on #${s + 1}`);
          }
        }
      }
    }
  } catch (e: any) {
    console.log(`  ${bot.name}: ${e.message.slice(0, 90)}`);
  }
  await sleep(jitter(700, 1800));
}
console.log("break over");
