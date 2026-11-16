// Bot collectors for devnet: each has SOL, test USDC in a private TEE balance, a profile and a
// live session. Kept in scripts/.tmp so reruns reuse them.
import { admin, clientFor, testKey, fund, sleep } from "./lib";
import { profilePda, type BreakroomClient } from "../app/src/chain/client";
import { Keypair } from "@solana/web3.js";

export const BOT_NAMES = ["KAIROS", "VANTA", "MORROW", "SABLEJAY", "GHOSTLINE", "RAZORFANG", "PALEFOX", "NOVA_K", "TIDEBREAKER", "QUILL"];

export async function readyBot(name: string, minPrivate = 60_000_000n): Promise<BreakroomClient> {
  const A = admin();
  const kp = testKey(`bot-${name}`);
  const c = clientFor(kp);
  c.session = testKey(`bot-${name}-session`) as Keypair;
  await fund(A, c.me, 0.08);
  if ((await c.privateUsdc()) < minPrivate) {
    if ((await c.baseUsdc()) < 200_000_000n) await c.sendBase([c.faucetIx()]).catch(() => {});
    await c.deposit(200_000_000n);
    for (let i = 0; i < 40 && (await c.privateUsdc()) < minPrivate; i++) await sleep(600);
  }
  if (!(await c.base.getAccountInfo(profilePda(c.me)))) {
    await c.sendBase(c.createProfileIxs(name));
    await c.waitInTee(profilePda(c.me));
  }
  const p = await c.fetchProfile();
  if (!p?.agent.equals(c.session.publicKey) || (await c.sessionAllowance()) < 50_000_000n) await c.startSession(1_000_000_000n);
  return c;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] ?? 6);
  for (const name of BOT_NAMES.slice(0, n)) {
    const c = await readyBot(name);
    console.log(name, c.me.toBase58(), "private", Number(await c.privateUsdc()) / 1e6);
  }
}
