// BREAKROOM chain client: Solana (base) + the MagicBlock TEE + the Private Payments API.
// Shared by the web app and the node scripts. Instructions are built straight from the IDL, so
// account order always matches the program.
import * as anchorNs from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import nacl from "tweetnacl";
import bs58 from "bs58";
const bs58encode = (b: Uint8Array) => bs58.encode(b);
import {
  EPHEMERAL_VAULT_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  getAuthToken,
  magicFeeVaultPdaFromValidator,
  permissionPdaFromAccount,
  createTopUpEscrowInstruction,
  escrowPdaFromEscrowAuthority,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import idl from "../idl/breakroom.json";
import {
  ADMIN,
  BASE_RPC,
  SALE_FEE_BPS,
  TRADE_FEE_BPS,
  CLUSTER,
  DELEGATION_PROGRAM,
  ESPL_PROGRAM,
  PAYMENTS_API,
  PROGRAM_ID,
  SLOT_HASHES,
  TEE_RPC,
  TEE_VALIDATOR,
  TEE_WS,
  USDC_MINT,
  VRF_EPHEMERAL_QUEUE,
  VRF_PROGRAM,
  IS_MAINNET,
} from "./config";
import { BREAK_LEN, decodeBids, decodeChat, decodeBreak, decodeCard, decodeDeck, decodeProfile, decodeReceipt, type BreakState } from "./layout";

const ns: any = anchorNs;
const BorshCoder = ns.BorshCoder ?? ns["default"]?.BorshCoder;
const BN = ns.BN ?? ns["default"]?.BN;
const coder = new BorshCoder(idl as any);

export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// ------------------------------------------------------------------ addresses

export const u64le = (n: bigint | number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};
const pda = (seeds: (Buffer | Uint8Array)[], program = PROGRAM_ID) => PublicKey.findProgramAddressSync(seeds, program)[0];
export const ata = (owner: PublicKey, mint: PublicKey) => pda([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()], ATA_PROGRAM);
export const breakPda = (id: bigint) => pda([Buffer.from("break"), u64le(id)]);
export const receiptPda = (id: bigint) => pda([Buffer.from("receipt"), u64le(id)]);
export const vaultPda = (id: bigint) => pda([Buffer.from("vault"), u64le(id)]);
export const deckPda = (id: bigint) => pda([Buffer.from("deck"), u64le(id)]);
export const bidsPda = (id: bigint) => pda([Buffer.from("bids"), u64le(id)]);
export const chatPda = (id: bigint) => pda([Buffer.from("chat"), u64le(id)]);
let listConn: Connection | undefined;
export const poolPda = () => pda([Buffer.from("pool")]);
export const cardPda = (mint: PublicKey) => pda([Buffer.from("card"), mint.toBuffer()]);
export const profilePda = (owner: PublicKey) => pda([Buffer.from("profile"), owner.toBuffer()]);
export const INSTRUCTIONS_SYSVAR = new PublicKey("Sysvar1nstructions1111111111111111111111111");
export const statsPda = () => pda([Buffer.from("stats")]);
export const faucetPda = (user: PublicKey) => pda([Buffer.from("faucet"), user.toBuffer()]);
export const eataPda = (owner: PublicKey, mint = USDC_MINT) => pda([owner.toBuffer(), mint.toBuffer()], ESPL_PROGRAM);
export const eataBuffer = (eata: PublicKey) => pda([Buffer.from("buffer"), eata.toBuffer()], ESPL_PROGRAM);
export const delegationRecord = (acc: PublicKey) => pda([Buffer.from("delegation"), acc.toBuffer()], DELEGATION_PROGRAM);
export const delegationMetadata = (acc: PublicKey) => pda([Buffer.from("delegation-metadata"), acc.toBuffer()], DELEGATION_PROGRAM);
export const delegateBuffer = (acc: PublicKey) => pda([Buffer.from("buffer"), acc.toBuffer()], PROGRAM_ID);

// ------------------------------------------------------------------ instructions from the IDL

type Accs = Record<string, PublicKey | undefined>;
const IDL_IX: Record<string, any> = Object.fromEntries((idl as any).instructions.map((i: any) => [i.name, i]));

/** Fixed program addresses Anchor fills in by itself; we name them once here. */
const FIXED: Accs = {
  system_program: SystemProgram.programId,
  token_program: TOKEN_PROGRAM,
  associated_token_program: ATA_PROGRAM,
  rent: SYSVAR_RENT_PUBKEY,
  espl_program: ESPL_PROGRAM,
  delegation_program: DELEGATION_PROGRAM,
  permission_program: PERMISSION_PROGRAM_ID,
  ephemeral_vault: EPHEMERAL_VAULT_ID,
  magic_program: MAGIC_PROGRAM_ID,
  magic_context: MAGIC_CONTEXT_ID,
  oracle_queue: VRF_EPHEMERAL_QUEUE,
  program_identity: pda([Buffer.from("identity")]),
  vrf_program: VRF_PROGRAM,
  slot_hashes: SLOT_HASHES,
  owner_program: PROGRAM_ID,
  instructions: INSTRUCTIONS_SYSVAR,
};

export function ix(name: string, args: Record<string, unknown>, accounts: Accs, remaining: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = []) {
  const def = IDL_IX[name];
  if (!def) throw new Error(`no instruction ${name}`);
  const keys = def.accounts.map((a: any) => {
    const pubkey = accounts[a.name] ?? FIXED[a.name] ?? (a.address ? new PublicKey(a.address) : undefined) ?? (a.optional ? PROGRAM_ID : undefined);
    if (!pubkey) throw new Error(`${name}: missing account ${a.name}`);
    return { pubkey, isSigner: !!a.signer, isWritable: !!a.writable };
  });
  return new TransactionInstruction({ programId: PROGRAM_ID, keys: [...keys, ...remaining], data: coder.instruction.encode(name, args) });
}

const bn = (v: bigint | number) => new BN(v.toString());
export const titleBytes = (s: string) => {
  const b = new Uint8Array(48);
  b.set(new TextEncoder().encode(s).subarray(0, 48));
  return Array.from(b);
};
export const fixedBytes = (s: string, n: number) => {
  const b = new Uint8Array(n);
  b.set(new TextEncoder().encode(s).subarray(0, n));
  return Array.from(b);
};

// ------------------------------------------------------------------ wallet abstraction

export interface WalletLike {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signMessage(msg: Uint8Array): Promise<Uint8Array>;
  /** Sign several at once (one wallet popup). */
  signAllTransactions?<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

export const keypairWallet = (kp: Keypair): WalletLike => ({
  publicKey: kp.publicKey,
  async signTransaction(tx) {
    if (tx instanceof VersionedTransaction) tx.sign([kp]);
    else tx.partialSign(kp);
    return tx;
  },
  async signMessage(m) {
    return nacl.sign.detached(m, kp.secretKey);
  },
  async signAllTransactions(txs) {
    for (const tx of txs) {
      if (tx instanceof VersionedTransaction) tx.sign([kp]);
      else tx.partialSign(kp);
    }
    return txs;
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ client

export class BreakroomClient {
  readonly base: Connection;
  private teeConnCache: Connection | null = null;
  private teeExpiry = 0;
  private sessionTee: Connection | null = null;

  /**
   * `wallet` owns funds and spots. `session` is a throwaway key the wallet approves as SPL
   * delegate inside the TEE, so trades sign without a wallet popup.
   */
  constructor(public wallet: WalletLike, public session: Keypair = Keypair.generate()) {
    this.base = new Connection(BASE_RPC, "confirmed");
  }

  get me() {
    return this.wallet.publicKey;
  }

  /** TEE connection authenticated as the wallet (reads its private balance). */
  private teeLogin: Promise<Connection> | null = null;

  private useToken(token: string, exp: number) {
    this.teeConnCache = new Connection(`${TEE_RPC}?token=${token}`, { wsEndpoint: `${TEE_WS}?token=${token}`, commitment: "confirmed" });
    this.teeExpiry = exp;
    return this.teeConnCache;
  }

  private get tokenKey() {
    return `br-tee-${this.me.toBase58()}`;
  }

  /** A TEE login is already available (in memory or saved in this browser): no signature needed. */
  teeUnlocked(): boolean {
    if (this.teeConnCache && Date.now() < this.teeExpiry - 60_000) return true;
    try {
      const raw = (globalThis as any).localStorage?.getItem(this.tokenKey);
      if (!raw) return false;
      const { token, exp } = JSON.parse(raw);
      if (Date.now() < exp - 60_000) {
        this.useToken(token, exp);
        return true;
      }
    } catch {
      /* no storage */
    }
    return false;
  }

  /**
   * TEE connection authenticated as the wallet (reads its private balance). Asks the wallet to
   * sign at most once per token lifetime: concurrent callers share one login, and the token is
   * kept in this browser until it expires.
   */
  async tee(): Promise<Connection> {
    if (this.teeUnlocked()) return this.teeConnCache!;
    this.teeLogin ??= (async () => {
      try {
        const auth = await getAuthToken(TEE_RPC, this.me, (m: Uint8Array) => this.wallet.signMessage(m));
        const exp = auth.expiresAt > 1e12 ? auth.expiresAt : auth.expiresAt * 1000;
        try {
          (globalThis as any).localStorage?.setItem(this.tokenKey, JSON.stringify({ token: auth.token, exp }));
        } catch {
          /* no storage */
        }
        return this.useToken(auth.token, exp);
      } finally {
        this.teeLogin = null;
      }
    })();
    return this.teeLogin;
  }

  /** TEE connection authenticated as the session key: public reads + sending trades, no popups. */
  async teeSession(): Promise<Connection> {
    if (this.sessionTee) return this.sessionTee;
    const kp = this.session;
    const auth = await getAuthToken(TEE_RPC, kp.publicKey, (m: Uint8Array) => Promise.resolve(nacl.sign.detached(m, kp.secretKey)));
    this.sessionTee = new Connection(`${TEE_RPC}?token=${auth.token}`, { wsEndpoint: `${TEE_WS}?token=${auth.token}`, commitment: "confirmed" });
    return this.sessionTee;
  }

  // ---------------------------------------------------------------- sending

  private async confirm(conn: Connection, sig: string, raw: Buffer | Uint8Array, lastValid: number, rebroadcast: boolean) {
    while ((await conn.getBlockHeight("confirmed")) <= lastValid) {
      const st = (await conn.getSignatureStatuses([sig])).value[0];
      if (st?.err) throw new TxError(sig, st.err, conn === this.base ? "base" : "tee");
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
      if (rebroadcast) await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
      await sleep(rebroadcast ? 1500 : 250);
    }
    throw new Error(`transaction expired (${sig})`);
  }

  /** Base layer, signed by the wallet (+ any extra keypairs). */
  async sendBase(ixs: TransactionInstruction[], extra: Keypair[] = []): Promise<string> {
    const { blockhash, lastValidBlockHeight } = await this.base.getLatestBlockhash("confirmed");
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.me;
    tx.recentBlockhash = blockhash;
    if (extra.length) tx.partialSign(...extra);
    const signed = await this.wallet.signTransaction(tx);
    const raw = signed.serialize();
    const sig = await this.base.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
    return this.confirm(this.base, sig, raw, lastValidBlockHeight, true);
  }

  /**
   * Several base-layer transactions signed in one wallet popup, then sent in order (each waits
   * for the previous to confirm). `onStep` reports progress.
   */
  async sendBaseMany(groups: TransactionInstruction[][], onStep?: (i: number, sig: string) => void): Promise<string[]> {
    const { blockhash } = await this.base.getLatestBlockhash("confirmed");
    const txs = groups.map((ixs) => {
      const tx = new Transaction().add(...ixs);
      tx.feePayer = this.me;
      tx.recentBlockhash = blockhash;
      return tx;
    });
    const signed = this.wallet.signAllTransactions ? await this.wallet.signAllTransactions(txs) : await Promise.all(txs.map((t) => this.wallet.signTransaction(t)));
    const sigs: string[] = [];
    for (let i = 0; i < signed.length; i++) {
      const raw = signed[i].serialize();
      const sig = await this.base.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
      const { lastValidBlockHeight } = await this.base.getLatestBlockhash("confirmed");
      await this.confirm(this.base, sig, raw, lastValidBlockHeight, true);
      sigs.push(sig);
      onStep?.(i, sig);
    }
    return sigs;
  }

  /** TEE, signed by the session key: free, instant, no popup. */
  async sendSession(ixs: TransactionInstruction[]): Promise<string> {
    const conn = await this.teeSession();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.session.publicKey;
    tx.recentBlockhash = blockhash;
    tx.sign(this.session);
    const raw = tx.serialize();
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: true });
    return this.confirm(conn, sig, raw, lastValidBlockHeight, false);
  }

  /** TEE, signed by the wallet itself (once per session: the approval). */
  async sendTeeWallet(ixs: TransactionInstruction[]): Promise<string> {
    const conn = await this.tee();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.me;
    tx.recentBlockhash = blockhash;
    const signed = await this.wallet.signTransaction(tx);
    const raw = signed.serialize();
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: true });
    return this.confirm(conn, sig, raw, lastValidBlockHeight, false);
  }

  /** Sign + send a transaction the Payments API built, to the chain it names. */
  private async sendBuilt(b: { transactionBase64: string; sendTo: "base" | "ephemeral"; version?: string }): Promise<string> {
    const bytes = Buffer.from(b.transactionBase64, "base64");
    const conn = b.sendTo === "base" ? this.base : await this.tee();
    if (b.version === "v0") {
      const tx = VersionedTransaction.deserialize(bytes);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      tx.message.recentBlockhash = blockhash;
      const signed = await this.wallet.signTransaction(tx);
      const raw = signed.serialize();
      const sig = await conn.sendRawTransaction(raw, { skipPreflight: true });
      return this.confirm(conn, sig, raw, lastValidBlockHeight, b.sendTo === "base");
    }
    const tx = Transaction.from(bytes);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    const signed = await this.wallet.signTransaction(tx);
    const raw = signed.serialize();
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: true });
    return this.confirm(conn, sig, raw, lastValidBlockHeight, b.sendTo === "base");
  }

  // ---------------------------------------------------------------- Private Payments API

  private async payments(path: string, body?: unknown, token?: string) {
    const res = await fetch(`${PAYMENTS_API}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Payments API ${path}: ${json?.error?.message ?? res.status}`);
    return json;
  }

  /** Move USDC from the wallet on Solana into its private balance inside the TEE. */
  async deposit(amount: bigint): Promise<string> {
    const built = await this.payments("/v1/spl/deposit", {
      owner: this.me.toBase58(),
      amount: Number(amount),
      cluster: CLUSTER,
      mint: USDC_MINT.toBase58(),
      validator: TEE_VALIDATOR.toBase58(),
      initIfMissing: true,
      initVaultIfMissing: true,
      initAtasIfMissing: true,
      idempotent: true,
    });
    return this.sendBuilt(built);
  }

  /** Move USDC from the private balance back to the wallet on Solana. */
  async withdraw(amount: bigint): Promise<string> {
    const built = await this.payments("/v1/spl/withdraw", {
      owner: this.me.toBase58(),
      mint: USDC_MINT.toBase58(),
      amount: Number(amount),
      cluster: CLUSTER,
      validator: TEE_VALIDATOR.toBase58(),
      initIfMissing: true,
      initAtasIfMissing: true,
      idempotent: true,
    });
    return this.sendBuilt(built);
  }

  /** One-time per mint+validator: create the TEE transfer queue for our test USDC. */
  async initializePaymentsMint(): Promise<string | null> {
    const st = await this.payments(`/v1/spl/is-mint-initialized?mint=${USDC_MINT.toBase58()}&cluster=${CLUSTER}&validator=${TEE_VALIDATOR.toBase58()}`);
    if (st.initialized) return null;
    const built = await this.payments("/v1/spl/initialize-mint", { payer: this.me.toBase58(), mint: USDC_MINT.toBase58(), cluster: CLUSTER, validator: TEE_VALIDATOR.toBase58() });
    return this.sendBuilt(built);
  }

  // ---------------------------------------------------------------- balances

  async baseUsdc(owner = this.me): Promise<bigint> {
    const info = await this.base.getAccountInfo(ata(owner, USDC_MINT));
    return info ? Buffer.from(info.data).readBigUInt64LE(64) : 0n;
  }

  /** Has this wallet ever moved USDC into the TEE (its ephemeral ATA is delegated)? */
  async hasPrivateAccount(owner = this.me): Promise<boolean> {
    const info = await this.base.getAccountInfo(eataPda(owner));
    return !!info && info.owner.equals(DELEGATION_PROGRAM);
  }

  /**
   * The wallet's private USDC inside the TEE (only the owner can read it). Until the wallet's
   * EATA is delegated, the TEE only shows a read-only copy of the Solana account, so that
   * doesn't count.
   */
  async privateUsdc(): Promise<bigint> {
    if (!(await this.hasPrivateAccount())) return 0n;
    const info = await (await this.tee()).getAccountInfo(ata(this.me, USDC_MINT));
    return info ? Buffer.from(info.data).readBigUInt64LE(64) : 0n;
  }

  /** How much the session key may still spend from the private balance. */
  async sessionAllowance(): Promise<bigint> {
    if (!(await this.hasPrivateAccount())) return 0n;
    const info = await (await this.tee()).getAccountInfo(ata(this.me, USDC_MINT));
    if (!info) return 0n;
    const d = Buffer.from(info.data);
    if (d.readUInt32LE(72) !== 1) return 0n;
    const delegate = new PublicKey(d.subarray(76, 108));
    return delegate.equals(this.session.publicKey) ? d.readBigUInt64LE(121) : 0n;
  }

  // ---------------------------------------------------------------- reads

  async fetchBreak(id: bigint, where: "tee" | "base" = "tee"): Promise<BreakState | null> {
    const conn = where === "tee" ? await this.teeSession() : this.base;
    const info = await conn.getAccountInfo(breakPda(id));
    return info ? decodeBreak(info.data) : null;
  }

  /** Every break ever created: their Receipts stay on Solana, owned by the program. */
  async listBreakIds(): Promise<bigint[]> {
    const disc = (idl as any).accounts.find((a: any) => a.name === "Receipt").discriminator as number[];
    const query = (conn: Connection) =>
      conn.getProgramAccounts(PROGRAM_ID, {
        filters: [{ memcmp: { offset: 0, bytes: bs58encode(Uint8Array.from(disc)) } }],
        dataSlice: { offset: 8, length: 8 },
      });
    // this scan is slow on some RPCs: ask two and take whichever answers first
    const conns = [this.base, ...(IS_MAINNET ? [] : [(listConn ??= new Connection("https://api.devnet.solana.com", "confirmed"))])];
    const accs = await Promise.any(conns.map(query));
    return accs.map((a) => Buffer.from(a.account.data).readBigUInt64LE(0)).sort((a, b) => (a < b ? 1 : -1));
  }

  /** Many breaks at once from the TEE (live state); falls back to Solana for ones not delegated. */
  async fetchBreaks(ids: bigint[]): Promise<BreakState[]> {
    const tee = await this.teeSession();
    const out: BreakState[] = [];
    const raw: Uint8Array[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const keys = ids.slice(i, i + 50).map(breakPda);
      let ok = true;
      const [t, b] = await Promise.all([tee.getMultipleAccountsInfo(keys).catch(() => ((ok = false), keys.map(() => null))), this.base.getMultipleAccountsInfo(keys)]);
      this.lastTeeOk = ok;
      keys.forEach((_, j) => {
        const info = t[j] ?? b[j];
        if (info && info.data.length === BREAK_LEN) {
          out.push(decodeBreak(info.data));
          raw.push(info.data);
        }
      });
    }
    this.lastBreaksRaw = raw;
    return out;
  }
  /** Quick first paint: the copies on Solana (no TEE sign-in). Live breaks may lag a little here. */
  async fetchBreaksBase(ids: bigint[]): Promise<BreakState[]> {
    const out: BreakState[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const infos = await this.base.getMultipleAccountsInfo(ids.slice(i, i + 100).map(breakPda));
      infos.forEach((info) => info && info.data.length === BREAK_LEN && out.push(decodeBreak(info.data)));
    }
    return out;
  }
  /** Raw account data from the last fetchBreaks (lets the UI cache the lobby). */
  lastBreaksRaw: Uint8Array[] = [];
  /** whether the last fetchBreaks got live state from the TEE */
  lastTeeOk = true;

  async fetchReceipt(id: bigint) {
    const info = await this.base.getAccountInfo(receiptPda(id));
    return info ? decodeReceipt(info.data) : null;
  }

  async fetchDeck(id: bigint, nCards: number) {
    const info = await (await this.teeSession()).getAccountInfo(deckPda(id));
    return info ? decodeDeck(info.data, nCards) : null;
  }

  async fetchCard(mint: PublicKey) {
    const info = await this.base.getAccountInfo(cardPda(mint));
    return info ? decodeCard(info.data) : null;
  }

  /** Card NFTs in a wallet that the appraisal desk has priced. */
  async walletCards(owner = this.me) {
    const res = await this.base.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM });
    const mints = res.value
      .map((a) => a.account.data.parsed.info)
      .filter((i: any) => i.tokenAmount.decimals === 0 && i.tokenAmount.amount === "1")
      .map((i: any) => new PublicKey(i.mint));
    const infos = await this.fetchCards(mints);
    return infos.filter((x): x is NonNullable<typeof x> => !!x);
  }

  async fetchCards(mints: PublicKey[]) {
    const out = [];
    for (let i = 0; i < mints.length; i += 100) {
      const infos = await this.base.getMultipleAccountsInfo(mints.slice(i, i + 100).map(cardPda));
      out.push(...infos.map((x) => (x ? decodeCard(x.data) : null)));
    }
    return out;
  }

  // ---------------------------------------------------------------- base: setup + faucet

  faucetIx() {
    return ix("faucet", {}, { user: this.me, mint: USDC_MINT, ata: ata(this.me, USDC_MINT), faucet: faucetPda(this.me) });
  }

  // ---------------------------------------------------------------- base: devnet demo box

  /** Instruction groups minting a demo Genesis box with a real rarity curve (devnet only). */
  demoBoxIxs(n = 12): TransactionInstruction[][] {
    const tiers = [4, 3, 2, 2, ...Array(Math.round(n * 0.3)).fill(1)];
    while (tiers.length < n) tiers.push(0);
    tiers.length = n;
    const ixs = tiers.map((tier) => {
      const nonce = Math.floor(Math.random() * 0xffffffff);
      const nb = Buffer.alloc(4);
      nb.writeUInt32LE(nonce);
      const mint = pda([Buffer.from("demo"), this.me.toBuffer(), nb]);
      return ix("demo_card", { nonce, tier, art: Math.floor(Math.random() * 32) }, {
        user: this.me,
        mint,
        ata: ata(this.me, mint),
        card: cardPda(mint),
        quota: pda([Buffer.from("demoq"), this.me.toBuffer()]),
      });
    });
    const groups: TransactionInstruction[][] = [];
    for (let i = 0; i < ixs.length; i += 4) groups.push([budget(600_000), ...ixs.slice(i, i + 4)]);
    return groups;
  }

  // ---------------------------------------------------------------- base: host

  /** mode 0 = packs, 1 = random teams; sale 0 = fixed price, 1 = sealed-bid auction (auctionSecs long) */
  createBreakIx(id: bigint, nSpots: number, perSpot: number, spotPrice: bigint, revealMs: number, title: string, mode = 0, sale = 0, auctionSecs = 0) {
    return ix(
      "create_break",
      { break_id: bn(id), n_spots: nSpots, per_spot: perSpot, spot_price: bn(spotPrice), reveal_ms: revealMs, title: titleBytes(title), mode, sale, auction_secs: auctionSecs },
      { host: this.me, mint: USDC_MINT, host_eata: eataPda(this.me), brk: breakPda(id), receipt: receiptPda(id), vault: vaultPda(id) },
    );
  }

  depositCardIx(id: bigint, slot: number, cardMint: PublicKey) {
    return ix(
      "deposit_card",
      { slot },
      {
        host: this.me,
        brk: breakPda(id),
        receipt: receiptPda(id),
        card_mint: cardMint,
        card: cardPda(cardMint),
        host_card: ata(this.me, cardMint),
        vault: vaultPda(id),
        vault_card: ata(vaultPda(id), cardMint),
      },
    );
  }

  /** Seal + delegate, and fund the break's Magic Action escrow (1 lamport is enough). */
  sealBreakIxs(id: bigint) {
    const brk = breakPda(id);
    return [createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(brk, 255), brk, this.me, 1, 255), this.sealBreakIx(id)];
  }

  sealBreakIx(id: bigint) {
    const brk = breakPda(id);
    return ix("seal_break", {}, {
      host: this.me,
      brk,
      validator: TEE_VALIDATOR,
      buffer_brk: delegateBuffer(brk),
      delegation_record_brk: delegationRecord(brk),
      delegation_metadata_brk: delegationMetadata(brk),
    });
  }

  // ---------------------------------------------------------------- profiles

  async fetchProfile(owner = this.me, where: "tee" | "base" = "tee") {
    const conn = where === "tee" ? await this.teeSession() : this.base;
    const info = await conn.getAccountInfo(profilePda(owner));
    return info ? decodeProfile(info.data) : null;
  }

  /** Base: create + delegate the profile in one transaction. */
  createProfileIxs(name: string) {
    const profile = profilePda(this.me);
    return [
      ix("create_profile", { name: fixedBytes(name, 20) }, { owner: this.me, profile }),
      ix("delegate_profile", {}, {
        owner: this.me,
        profile,
        validator: TEE_VALIDATOR,
        buffer_profile: delegateBuffer(profile),
        delegation_record_profile: delegationRecord(profile),
        delegation_metadata_profile: delegationMetadata(profile),
      }),
    ];
  }

  /**
   * TEE, one wallet signature: approve the session key to spend up to `allowance` of the private
   * balance (SPL approve) and bind it to the profile, so every trade after this signs silently.
   */
  async startSession(allowance: bigint, rename?: string): Promise<string> {
    const data = Buffer.alloc(9);
    data[0] = 4; // SPL Token Approve
    data.writeBigUInt64LE(allowance, 1);
    const approve = new TransactionInstruction({
      programId: TOKEN_PROGRAM,
      keys: [
        { pubkey: ata(this.me, USDC_MINT), isSigner: false, isWritable: true },
        { pubkey: this.session.publicKey, isSigner: false, isWritable: false },
        { pubkey: this.me, isSigner: true, isWritable: false },
      ],
      data,
    });
    const bind = ix("set_agent", { agent: this.session.publicKey, name: rename ? fixedBytes(rename, 20) : null }, { owner: this.me, profile: profilePda(this.me) });
    return this.sendTeeWallet([approve, bind]);
  }

  // ---------------------------------------------------------------- TEE: sale + market

  openSaleIx(id: bigint, payer: PublicKey) {
    const brk = breakPda(id);
    const deck = deckPda(id);
    return ix("open_sale", {}, {
      payer,
      brk,
      deck,
      deck_permission: permissionPdaFromAccount(deck),
      bids: bidsPda(id),
      bids_permission: permissionPdaFromAccount(bidsPda(id)),
      chat: chatPda(id),
      chat_permission: permissionPdaFromAccount(chatPda(id)),
      brk_permission: permissionPdaFromAccount(brk),
    });
  }

  /** SPL transfer out of the wallet's private balance, signed by the session key (delegate). */
  private transferIx(to: PublicKey, amount: bigint, authority = this.session.publicKey) {
    const data = Buffer.alloc(9);
    data[0] = 3; // SPL Token Transfer
    data.writeBigUInt64LE(amount, 1);
    return new TransactionInstruction({
      programId: TOKEN_PROGRAM,
      keys: [
        { pubkey: ata(this.me, USDC_MINT), isSigner: false, isWritable: true },
        { pubkey: ata(to, USDC_MINT), isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: false },
      ],
      data,
    });
  }

  /** [pay payee][pay treasury][program ix]: the program checks the two transfers in front of it. */
  private paid(payee: PublicKey, price: bigint, feeBps: number, programIx: TransactionInstruction, authority = this.session.publicKey) {
    const fee = (price * BigInt(feeBps)) / 10_000n;
    return [this.transferIx(payee, price - fee, authority), this.transferIx(ADMIN, fee, authority), programIx];
  }

  /** The price this wallet pays for an open spot: the auction price if it won the spot. */
  spotPriceFor(b: BreakState, spot: number) {
    const won = b.sale === 2 && b.reserved[spot]?.equals(this.me) && b.reserveUntil[spot] * 1000 > Date.now();
    return won ? b.ask[spot] : b.spotPrice;
  }

  buySpotIxs(b: BreakState, spot: number, signer = this.session.publicKey) {
    const price = this.spotPriceFor(b, spot);
    const programIx = ix("buy_spot", { spot, max_price: bn(price) }, { signer, profile: profilePda(this.me), brk: breakPda(b.breakId) });
    return this.paid(b.host, price, SALE_FEE_BPS, programIx, signer);
  }

  buyListedIxs(b: BreakState, spot: number, signer = this.session.publicKey) {
    const seller = b.spotOwner[spot]!;
    const price = b.ask[spot];
    const programIx = ix("buy_listed", { spot, max_price: bn(price) }, { signer, buyer: profilePda(this.me), seller: profilePda(seller), brk: breakPda(b.breakId) });
    return this.paid(seller, price, TRADE_FEE_BPS, programIx, signer);
  }

  private ownerIx(name: string, id: bigint, spot: number, price: bigint, signer = this.session.publicKey) {
    const arg = name === "list_spot" ? { spot, ask: bn(price) } : { spot, price: bn(price) };
    return ix(name, arg, { signer, profile: profilePda(this.me), brk: breakPda(id) });
  }
  listSpotIx = (id: bigint, spot: number, ask: bigint) => this.ownerIx("list_spot", id, spot, ask);

  /** Sealed bid: only the TEE sees the amount until the auction closes. */
  placeBidIx(id: bigint, spot: number, amount: bigint, signer = this.session.publicKey) {
    return ix("place_bid", { spot, amount: bn(amount) }, { signer, profile: profilePda(this.me), brk: breakPda(id), bids: bidsPda(id) });
  }

  closeAuctionIx(id: bigint) {
    return ix("close_auction", {}, { brk: breakPda(id), bids: bidsPda(id), bids_permission: permissionPdaFromAccount(bidsPda(id)) });
  }

  /** Rip your own pack: inside the window the crank opens before each pack, its owner reveals it. */
  ripIx(id: bigint, signer = this.session.publicKey) {
    return ix("rip", {}, { signer, profile: profilePda(this.me), brk: breakPda(id), deck: deckPda(id) });
  }

  /** kind 0 = text, 1 = reaction (text = one emoji). */
  sendChatIx(id: bigint, text: string, kind = 0, signer = this.session.publicKey) {
    const bytes = Buffer.from(new TextEncoder().encode(text).slice(0, 86));
    return ix("send_chat", { kind, text: bytes }, { signer, profile: profilePda(this.me), brk: breakPda(id), chat: chatPda(id) });
  }

  async fetchBids(id: bigint, nSpots: number) {
    const info = await (await this.teeSession()).getAccountInfo(bidsPda(id)).catch(() => null);
    return info ? decodeBids(info.data, nSpots) : null;
  }

  async fetchChat(id: bigint) {
    const info = await (await this.teeSession()).getAccountInfo(chatPda(id)).catch(() => null);
    return info ? decodeChat(info.data) : [];
  }
  makeOfferIx = (id: bigint, spot: number, price: bigint) => this.ownerIx("make_offer", id, spot, price);
  acceptOfferIx = (id: bigint, spot: number, price: bigint) => this.ownerIx("accept_offer", id, spot, price);

  // ---------------------------------------------------------------- TEE: the live break

  /** Start + schedule the crank that reveals every card and then settles the break by itself. */
  startBreakIx(id: bigint, payer = this.session.publicKey) {
    const deck = deckPda(id);
    const w = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: true });
    const r = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false });
    return ix("start_break", { client_seed: Math.floor(Math.random() * 256) }, { payer, brk: breakPda(id), deck, profile: profilePda(this.me) }, [
      w(permissionPdaFromAccount(deck)),
      r(receiptPda(id)),
      r(statsPda()),
      w(magicFeeVaultPdaFromValidator(TEE_VALIDATOR)),
      r(PERMISSION_PROGRAM_ID),
      w(EPHEMERAL_VAULT_ID),
      w(MAGIC_CONTEXT_ID),
    ]);
  }

  rearmSettleIx(id: bigint) {
    return ix("rearm_settle", {}, { brk: breakPda(id), deck: deckPda(id) });
  }

  fallbackShuffleIx(id: bigint, payer = this.session.publicKey) {
    return ix("fallback_shuffle", {}, { payer, brk: breakPda(id), deck: deckPda(id) });
  }

  revealIx(id: bigint) {
    return ix("reveal", {}, { brk: breakPda(id), deck: deckPda(id) });
  }

  finishIx(id: bigint) {
    const deck = deckPda(id);
    return ix("finish", {}, {
      brk: breakPda(id),
      deck,
      deck_permission: permissionPdaFromAccount(deck),
      receipt: receiptPda(id),
      stats: statsPda(),
      magic_fee_vault: magicFeeVaultPdaFromValidator(TEE_VALIDATOR),
    });
  }

  // ---------------------------------------------------------------- base: delivery

  claimIx(id: bigint, index: number, cardMint: PublicKey, recipient: PublicKey) {
    return ix("claim", { index }, {
      payer: this.me,
      receipt: receiptPda(id),
      card_mint: cardMint,
      recipient,
      vault: vaultPda(id),
      vault_card: ata(vaultPda(id), cardMint),
      recipient_card: ata(recipient, cardMint),
    });
  }

  // ---------------------------------------------------------------- base: instant buyback

  sellBackIx(cardMint: PublicKey) {
    return ix("sell_back", {}, {
      user: this.me,
      card_mint: cardMint,
      card: cardPda(cardMint),
      user_card: ata(this.me, cardMint),
      pool: poolPda(),
      pool_card: ata(poolPda(), cardMint),
      usdc_mint: USDC_MINT,
      pool_usdc: ata(poolPda(), USDC_MINT),
      user_usdc: ata(this.me, USDC_MINT),
    });
  }

  fundPoolIx(amount: bigint) {
    return ix("fund_pool", { amount: bn(amount) }, { admin: this.me, pool: poolPda(), usdc_mint: USDC_MINT, pool_usdc: ata(poolPda(), USDC_MINT) });
  }

  /** Wait until an account delegated on Solana shows up in the TEE. */
  async waitInTee(acc: PublicKey, ms = 30_000) {
    const conn = await this.teeSession();
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await conn.getAccountInfo(acc)) return;
      await sleep(500);
    }
    throw new Error(`${acc.toBase58()} never reached the TEE`);
  }
}

export class TxError extends Error {
  constructor(public sig: string, public err: unknown, public where: "base" | "tee") {
    super(`${where} transaction failed: ${JSON.stringify(err)} (${sig})`);
  }
}

export const budget = (units = 1_400_000) => ComputeBudgetProgram.setComputeUnitLimit({ units });
export { magicFeeVaultPdaFromValidator };
