// Shared bits for the node scripts.
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { BreakroomClient, keypairWallet } from "../app/src/chain/client";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const loadKey = (path: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path.replace("~", homedir()), "utf8"))));
export const ADMIN_KEY = "~/.config/solana/breakroom-devnet.json";
export const admin = () => new BreakroomClient(keypairWallet(loadKey(ADMIN_KEY)));

const TMP = new URL("./.tmp/", import.meta.url).pathname;
/** A named test wallet kept in scripts/.tmp (gitignored), so reruns reuse it. */
export function testKey(name: string): Keypair {
  if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
  const p = `${TMP}${name}.json`;
  if (existsSync(p)) return loadKey(p);
  const kp = Keypair.generate();
  writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

export const clientFor = (kp: Keypair) => new BreakroomClient(keypairWallet(kp));

/** Top up `to` with SOL from the admin when it runs low. */
export async function fund(adminC: BreakroomClient, to: PublicKey, sol = 0.2) {
  const bal = await adminC.base.getBalance(to);
  if (bal >= sol * LAMPORTS_PER_SOL * 0.5) return;
  await adminC.sendBase([SystemProgram.transfer({ fromPubkey: adminC.me, toPubkey: to, lamports: Math.round(sol * LAMPORTS_PER_SOL) })]);
}

export const usd = (v: bigint) => `$${(Number(v) / 1e6).toFixed(2)}`;
export function check(cond: unknown, msg: string) {
  if (!cond) throw new Error(`CHECK FAILED: ${msg}`);
  console.log(`  ok  ${msg}`);
}
