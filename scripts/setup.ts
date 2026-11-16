// One-time protocol setup on devnet: stats, test USDC, the Payments API mint on the TEE, and a
// private USDC balance for the treasury (fees are paid straight into it).
import { PublicKey } from "@solana/web3.js";
import { admin, sleep } from "./lib";
import { ix, statsPda } from "../app/src/chain/client";
import { USDC_MINT } from "../app/src/chain/config";

const c = admin();
const exists = async (k: PublicKey) => !!(await c.base.getAccountInfo(k));

if (!(await exists(statsPda()))) console.log("init stats", await c.sendBase([ix("init_stats", {}, { admin: c.me, stats: statsPda() })]));
if (!(await exists(USDC_MINT))) console.log("init test USDC", await c.sendBase([ix("init_test_mint", {}, { admin: c.me, mint: USDC_MINT })]));
console.log("test USDC mint", USDC_MINT.toBase58());
console.log("payments mint on TEE", (await c.initializePaymentsMint()) ?? "already initialized");
if (!(await c.hasPrivateAccount())) {
  if ((await c.baseUsdc()) < 1_000_000n) await c.sendBase([c.faucetIx()]);
  console.log("treasury private balance", await c.deposit(1_000_000n));
  for (let i = 0; i < 40 && !(await c.hasPrivateAccount()); i++) await sleep(500);
}
console.log("treasury ready:", await c.hasPrivateAccount());
