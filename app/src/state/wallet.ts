// Wallet Standard (Phantom, Solflare, Backpack...) -> the client's WalletLike, plus a guest
// wallet kept in this browser for trying BREAKROOM without installing anything.
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { keypairWallet, type WalletLike } from "../chain/client";
import { IS_MAINNET } from "../chain/config";

const CHAIN = IS_MAINNET ? "solana:mainnet" : "solana:devnet";

export interface Detected {
  name: string;
  icon: string;
  wallet: Wallet;
}

export function detectWallets(): Detected[] {
  const { get } = getWallets();
  return get()
    .filter((w) => w.chains.some((c) => c.startsWith("solana:")) && "solana:signTransaction" in w.features && "solana:signMessage" in w.features)
    .map((w) => ({ name: w.name, icon: w.icon, wallet: w }));
}

export function onWalletsChanged(cb: () => void) {
  const { on } = getWallets();
  const off1 = on("register", cb);
  const off2 = on("unregister", cb);
  return () => {
    off1();
    off2();
  };
}

export async function connectStandard(w: Wallet): Promise<WalletLike> {
  const connect = (w.features as any)["standard:connect"];
  const res = connect ? await connect.connect() : { accounts: w.accounts };
  const account: WalletAccount | undefined = res.accounts[0] ?? w.accounts[0];
  if (!account) throw new Error("Wallet didn't share an account");
  const signTx = (w.features as any)["solana:signTransaction"];
  const signMsg = (w.features as any)["solana:signMessage"];
  return {
    publicKey: new PublicKey(account.address),
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      const bytes = tx instanceof VersionedTransaction ? tx.serialize() : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const [out] = await signTx.signTransaction({ account, transaction: bytes, chain: CHAIN });
      const signed = out.signedTransaction as Uint8Array;
      return (tx instanceof VersionedTransaction ? VersionedTransaction.deserialize(signed) : Transaction.from(signed)) as T;
    },
    async signMessage(m: Uint8Array) {
      const [out] = await signMsg.signMessage({ account, message: m });
      return out.signature as Uint8Array;
    },
  };
}

export async function disconnectStandard(w: Wallet) {
  const f = (w.features as any)["standard:disconnect"];
  if (f) await f.disconnect().catch(() => {});
}

// ---- guest wallet (devnet only): a keypair stored in this browser

const GUEST_KEY = "br-guest";
export function guestWallet(): WalletLike | null {
  if (IS_MAINNET) return null;
  let kp: Keypair;
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    kp = raw ? Keypair.fromSecretKey(bs58.decode(raw)) : Keypair.generate();
    if (!raw) localStorage.setItem(GUEST_KEY, bs58.encode(kp.secretKey));
  } catch {
    kp = Keypair.generate();
  }
  return keypairWallet(kp);
}

// ---- session key: one per wallet per browser, reused across visits

export function sessionKeyFor(owner: PublicKey): Keypair {
  const k = `br-session-${owner.toBase58()}`;
  try {
    const raw = localStorage.getItem(k);
    if (raw) return Keypair.fromSecretKey(bs58.decode(raw));
    const kp = Keypair.generate();
    localStorage.setItem(k, bs58.encode(kp.secretKey));
    return kp;
  } catch {
    return Keypair.generate();
  }
}
