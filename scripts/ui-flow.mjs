// Click through the real UI as a brand-new guest: connect, onboard (faucet, private deposit,
// profile, session), then buy a spot on an on-sale break. Usage: node scripts/ui-flow.mjs <breakId>
import { chromium } from "/Users/anshverma/blackout/node_modules/playwright/index.mjs";
import { execFileSync } from "child_process";
const id = process.argv[2];
const URL = "http://localhost:5181";
const RUN = Date.now().toString(36).slice(-5);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const shot = (n) => p.screenshot({ path: `scripts/.tmp/shots/flow-${n}.png` });
const step = async (name, f) => { const t = Date.now(); await f(); console.log(`ok  ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`); };

await p.goto(`${URL}/#/`);
await step("connect guest", async () => {
  await p.getByRole("button", { name: "Connect" }).first().click();
  await p.getByRole("button", { name: /Guest wallet/ }).click();
  await p.getByText("Set up your account").waitFor({ timeout: 15000 });
});
const secret = await p.evaluate(() => localStorage.getItem("br-guest"));
const pub = execFileSync("npx", ["tsx", "-e", `import bs58 from "bs58"; import {Keypair} from "@solana/web3.js"; console.log(Keypair.fromSecretKey(bs58.decode("${secret}")).publicKey.toBase58())`], { encoding: "utf8" }).trim();
console.log("    guest", pub);
// devnet airdrops are rate-limited from CI: fund the guest from the admin key instead
execFileSync("solana", ["transfer", "-k", `${process.env.HOME}/.config/solana/breakroom-devnet.json`, "-u", "devnet", "--allow-unfunded-recipient", pub, "0.3"], { stdio: "ignore" });
await p.evaluate(() => (window).__refresh?.());
await step("SOL arrives", async () => { await p.getByText(/You have 0\.[1-9]/).waitFor({ timeout: 40000 }); });
await shot("1-onboard");
await step("faucet test USDC", async () => {
  await p.getByRole("button", { name: "Get 1,000" }).click();
  await p.getByText(/On Solana \$1,000\.00/).waitFor({ timeout: 40000 });
});
await step("deposit into the TEE (Private Payments API)", async () => {
  await p.getByRole("button", { name: "Deposit", exact: true }).click();
  await p.getByText(/Private balance \$250\.00/).waitFor({ timeout: 60000 });
});
await step("create profile", async () => {
  await p.getByPlaceholder("name").fill("GUEST_" + pub.slice(0, 4));
  await p.getByRole("button", { name: "Create" }).click();
  await p.getByText(/You're GUEST_/).waitFor({ timeout: 60000 });
});
await step("start session", async () => {
  await p.getByRole("button", { name: "Start session" }).click();
  await p.getByText("You're all set").waitFor({ timeout: 60000 });
});
await shot("2-ready");
await p.getByRole("button", { name: "Let's go" }).click();
await p.goto(`${URL}/#/break/${id}`);
await step("open break room", async () => { await p.locator(".room-head h1").waitFor({ timeout: 30000 });
  await p.locator(".spot-row").nth(1).waitFor({ timeout: 30000 }); });
await step("chat: send a message", async () => {
  await p.getByRole("button", { name: /^Chat/ }).click();
  await p.getByPlaceholder("Say something").fill(`hello from the ui test ${RUN}`);
  await p.getByRole("button", { name: "Send" }).click();
  await p.getByText(`hello from the ui test ${RUN}`).waitFor({ timeout: 20000 });
});
await shot("chat");
await step("chat: react", async () => {
  await p.getByRole("button", { name: "react 🔥" }).click();
  await p.waitForTimeout(2500);
});
await p.getByRole("button", { name: "Spots" }).click();
if (process.env.CHAT_ONLY) { console.log(errs.length ? "PAGE ERRORS:\n" + errs.join("\n") : "no page errors"); await b.close(); process.exit(0); }
await step("buy an open spot (no wallet popup)", async () => {
  await p.locator(".spot-row:not(.head)").filter({ hasText: "open" }).first().click();
  await p.getByRole("button", { name: /Buy spot/ }).click();
  await p.getByText(/Bought spot #/).waitFor({ timeout: 30000 });
});
await p.waitForTimeout(2500);
await shot("3-bought");
await step("list it for $25", async () => {
  await p.getByPlaceholder(/list price/).fill("25");
  await p.getByRole("button", { name: "List", exact: true }).click();
  await p.getByText("Listed").first().waitFor({ timeout: 30000 });
});
await p.waitForTimeout(2000);
await shot("4-listed");
console.log(errs.length ? "PAGE ERRORS:\n" + errs.join("\n") : "no page errors");
await b.close();
