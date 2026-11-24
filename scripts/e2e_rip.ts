// Rip-your-own-pack on devnet + the TEE: the crank opens a window before each pack, the owner
// rips it (a stranger can't), and a pack nobody rips is opened by the crank when the window ends.
//   npx tsx scripts/e2e_rip.ts <breakId>   (a sold-out packs break, not started yet)
import { clientFor, testKey, sleep, check } from "./lib";
import { readyBot, BOT_NAMES } from "./bots";
import { ST } from "../app/src/chain/layout";

const id = BigInt(process.argv[2]);
const H = clientFor(testKey("host"));
H.session = testKey("host-session");
const bots = await Promise.all(BOT_NAMES.slice(0, 8).map((n) => readyBot(n, 1_000_000n)));
const byKey = new Map(bots.map((c) => [c.me.toBase58(), c]));
console.log("start", await H.sendSession([H.startBreakIx(id)]));

const waitFor = async (what: string, f: (b: NonNullable<Awaited<ReturnType<typeof H.fetchBreak>>>) => boolean, ms = 60_000) => {
  const t0 = Date.now();
  for (;;) {
    const b = await H.fetchBreak(id, "tee");
    if (b && f(b)) return b;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(400);
  }
};

// pack 1: the owner rips it
let b = await waitFor("first rip window", (x) => x.status === ST.LIVE && x.ripArmed === 1 && x.cursor === 0);
const spot = b.openOrder[0];
const owner = byKey.get(b.spotOwner[spot]!.toBase58())!;
const stranger = bots.find((c) => c !== owner)!;
check(b.nextRevealMs - Date.now() > 3000, `window open for spot #${spot + 1}, ${((b.nextRevealMs - Date.now()) / 1000).toFixed(1)}s left`);
const bad = await stranger.sendSession([stranger.ripIx(id)]).then(() => "ok").catch((e) => e.message);
check(bad !== "ok", `a stranger can't rip it (${String(bad).slice(0, 60)})`);
const t0 = Date.now();
await owner.sendSession([owner.ripIx(id)]);
b = await waitFor("rip to land", (x) => x.cursor === 1, 10_000);
check(Date.now() - t0 < 4000 && b.ripArmed === 0, `owner ripped it: card out in ${Date.now() - t0}ms, window closed`);
const again = await owner.sendSession([owner.ripIx(id)]).then(() => "ok").catch((e) => e.message);
check(again !== "ok", "can't rip twice");

// pack 2: nobody rips; the crank opens it when the window ends
b = await waitFor("second window", (x) => x.ripArmed === 1 && x.cursor === 2, 30_000);
const armedAt = Date.now();
b = await waitFor("crank to open pack 2", (x) => x.cursor === 3, 30_000);
const waited = Date.now() - armedAt;
check(waited > 5000, `crank opened the unripped pack after the window (${(waited / 1000).toFixed(1)}s)`);

// the rest runs itself to the end
b = await waitFor("break to end", (x) => x.status >= ST.ENDED, 120_000);
check(b.revealed.slice(0, b.nCards).every((c) => c >= 0), `all ${b.nCards} cards out, status ${b.status}`);
console.log("rip e2e passed");
