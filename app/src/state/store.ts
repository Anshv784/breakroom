// App state: who's connected, their balances, and the onboarding steps to a ready session.
import { create } from "zustand";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BreakroomClient, profilePda, type WalletLike } from "../chain/client";
import type { ProfileInfo } from "../chain/layout";
import { connectStandard, disconnectStandard, guestWallet, sessionKeyFor, type Detected } from "./wallet";
import { explain } from "../lib/errors";

export interface Toast {
  id: number;
  kind: "ok" | "err" | "info";
  text: string;
  link?: string;
}

interface State {
  client: BreakroomClient | null;
  walletName: string | null;
  detected: Detected | null;
  sol: number;
  baseUsdc: bigint;
  privateUsdc: bigint;
  allowance: bigint;
  profile: ProfileInfo | null;
  hasPrivate: boolean;
  loading: boolean;
  onboardOpen: boolean;
  connectOpen: boolean;
  toasts: Toast[];
  connect: (d: Detected | "guest") => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  toast: (kind: Toast["kind"], text: string, link?: string) => void;
  dismiss: (id: number) => void;
  run: <T>(label: string, f: () => Promise<T>) => Promise<T | undefined>;
  setOnboard: (v: boolean) => void;
  setConnect: (v: boolean) => void;
}

let toastId = 0;
const LAST = "br-last-wallet";

export const useApp = create<State>((set, get) => ({
  client: null,
  walletName: null,
  detected: null,
  sol: 0,
  baseUsdc: 0n,
  privateUsdc: 0n,
  allowance: 0n,
  profile: null,
  hasPrivate: false,
  loading: false,
  onboardOpen: false,
  connectOpen: false,
  toasts: [],

  async connect(d) {
    let w: WalletLike | null;
    if (d === "guest") w = guestWallet();
    else w = await connectStandard(d.wallet);
    if (!w) return;
    const client = new BreakroomClient(w, sessionKeyFor(w.publicKey));
    set({ client, walletName: d === "guest" ? "Guest wallet" : d.name, detected: d === "guest" ? null : d, connectOpen: false });
    try {
      localStorage.setItem(LAST, d === "guest" ? "guest" : d.name);
    } catch {
      /* private mode */
    }
    await get().refresh();
  },

  async disconnect() {
    const d = get().detected;
    if (d) await disconnectStandard(d.wallet);
    try {
      localStorage.removeItem(LAST);
    } catch {
      /* ignore */
    }
    set({ client: null, walletName: null, detected: null, profile: null, sol: 0, baseUsdc: 0n, privateUsdc: 0n, allowance: 0n, hasPrivate: false });
  },

  async refresh() {
    const c = get().client;
    if (!c) return;
    set({ loading: true });
    try {
      const [lamports, baseUsdc, hasPrivate] = await Promise.all([c.base.getBalance(c.me), c.baseUsdc(), c.hasPrivateAccount()]);
      set({ sol: lamports / LAMPORTS_PER_SOL, baseUsdc, hasPrivate });
      const exists = await c.base.getAccountInfo(profilePda(c.me));
      const profile = exists ? await c.fetchProfile().catch(() => null) : null;
      set({ profile });
      if (hasPrivate) {
        const [privateUsdc, allowance] = await Promise.all([c.privateUsdc(), c.sessionAllowance()]);
        set({ privateUsdc, allowance });
      }
    } catch (e) {
      console.warn("refresh", e);
    } finally {
      set({ loading: false });
    }
  },

  toast(kind, text, link) {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, kind, text, link }] });
    setTimeout(() => get().dismiss(id), kind === "err" ? 8000 : 4500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  async run(label, f) {
    try {
      const r = await f();
      return r;
    } catch (e) {
      get().toast("err", `${label}: ${explain(e)}`);
      return undefined;
    }
  },

  setOnboard: (v) => set({ onboardOpen: v }),
  setConnect: (v) => set({ connectOpen: v }),
}));

/** Ready = can buy and trade right now without any wallet popup. */
export function readiness(s: Pick<State, "client" | "sol" | "baseUsdc" | "privateUsdc" | "profile" | "allowance" | "hasPrivate">) {
  const sessionOk = !!s.client && !!s.profile && s.profile.agent.equals(s.client.session.publicKey) && s.allowance > 0n;
  return {
    wallet: !!s.client,
    sol: s.sol >= 0.01,
    usdc: s.baseUsdc > 0n || s.privateUsdc > 0n,
    private: s.hasPrivate && s.privateUsdc > 0n,
    profile: !!s.profile,
    session: sessionOk,
    ready: !!s.client && !!s.profile && s.hasPrivate && sessionOk,
  };
}

export const shortKey = (k: PublicKey | string | null | undefined) => {
  if (!k) return "—";
  const s = typeof k === "string" ? k : k.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
};

export const usd = (v: bigint | number, d = 2) => {
  const n = typeof v === "bigint" ? Number(v) / 1e6 : v;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
