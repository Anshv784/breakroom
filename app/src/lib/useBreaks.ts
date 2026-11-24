// Live break data. Reads go through the TEE (where breaks run) with a throwaway reader key, so
// anyone can watch without a wallet. A room subscribes to its Break account over the rollup's
// websocket and also polls, so a dropped socket never freezes the table.
import { useEffect, useRef, useState } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BreakroomClient, breakPda, keypairWallet } from "../chain/client";
import { decodeBreak, type BreakState, type CardInfo } from "../chain/layout";
import { useApp } from "../state/store";

let reader: BreakroomClient | null = null;
export function readerClient() {
  return useApp.getState().client ?? (reader ??= new BreakroomClient(keypairWallet(Keypair.generate())));
}

const LIST_CACHE = "br-list-cache-v1";
const keep = (b: BreakState) => (b.status !== 0 || b.deposited > 0) && !/^(probe|e2e|rip test|\[test\])/i.test(b.title);
function cachedList(): BreakState[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST_CACHE) || "[]") as string[];
    return raw.map((b64) => decodeBreak(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)))).filter(keep);
  } catch {
    return [];
  }
}

// One shared break list for the whole app: every page that shows breaks subscribes to the same
// store, so moving between pages never reloads it. Polls at the fastest rate any page asks for.
const IDS_CACHE = "br-ids-cache-v1";
const store = {
  list: cachedList(),
  loaded: false,
  subs: new Set<() => void>(),
  rates: new Map<number, number>(),
  timer: 0 as any,
  ids: (() => {
    try {
      return (JSON.parse(localStorage.getItem(IDS_CACHE) || "[]") as string[]).map((x) => BigInt(x));
    } catch {
      return [] as bigint[];
    }
  })(),
  idsAt: 0,
  running: false,
};
const emit = () => store.subs.forEach((f) => f());

async function refreshList() {
  if (store.running) return;
  store.running = true;
  try {
    const c = readerClient();
    const fresh = Date.now() - store.idsAt > 20_000 || store.ids.length === 0;
    // sign in to the TEE and list ids at the same time; with cached ids, don't wait for the listing
    const listing = fresh
      ? c.listBreakIds().then((ids) => {
          store.ids = ids;
          store.idsAt = Date.now();
          try {
            localStorage.setItem(IDS_CACHE, JSON.stringify(ids.map(String)));
          } catch {
            /* ignore */
          }
        })
      : Promise.resolve();
    const auth = c.teeSession();
    if (store.ids.length === 0) await listing;
    // nothing on screen yet: paint Solana's copies first, then the live state from the TEE
    if (store.list.length === 0) {
      const quick = await c.fetchBreaksBase(store.ids.slice(0, 60)).catch(() => []);
      if (store.list.length === 0 && quick.length) {
        store.list = quick.filter(keep);
        store.loaded = true;
        emit();
      }
    }
    await auth;
    const bs = await c.fetchBreaks(store.ids.slice(0, 60));
    store.list = bs.filter(keep);
    store.loaded = true;
    emit();
    try {
      localStorage.setItem(LIST_CACHE, JSON.stringify(c.lastBreaksRaw.map((d) => btoa(Array.from(d, (x) => String.fromCharCode(x)).join("")))));
    } catch {
      /* storage full or blocked: just no cache */
    }
    await listing; // new ids get picked up on the next tick
  } catch (e) {
    console.warn("break list", e);
  } finally {
    store.running = false;
  }
}
function schedule() {
  clearInterval(store.timer);
  if (store.subs.size === 0) return;
  const ms = Math.min(...store.rates.keys());
  store.timer = setInterval(refreshList, ms);
}
// start fetching as soon as the app loads, before any page asks
if (typeof window !== "undefined") setTimeout(refreshList, 0);

export function useBreakList(pollMs = 5_000) {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    store.subs.add(f);
    store.rates.set(pollMs, (store.rates.get(pollMs) ?? 0) + 1);
    schedule();
    if (!store.loaded) refreshList();
    return () => {
      store.subs.delete(f);
      const n = (store.rates.get(pollMs) ?? 1) - 1;
      if (n <= 0) store.rates.delete(pollMs);
      else store.rates.set(pollMs, n);
      schedule();
    };
  }, [pollMs]);
  return { list: store.list, loading: !store.loaded && store.list.length === 0 };
}

export function useBreak(id: bigint) {
  const [b, setB] = useState<BreakState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<string>("");
  const latest = useRef<BreakState | null>(null);
  useEffect(() => {
    let alive = true;
    latest.current = null;
    let sub: number | null = null;
    let conn: Awaited<ReturnType<BreakroomClient["teeSession"]>> | null = null;
    last.current = "";
    const apply = (data: Uint8Array) => {
      if (!alive) return;
      const next = decodeBreak(data);
      // the subscription and the poll can land out of order: never step a viewer backwards
      const cur = latest.current;
      if (cur && (next.status < cur.status || (next.status === cur.status && (next.cursor < cur.cursor || next.teamsOut < cur.teamsOut || next.nTrades < cur.nTrades || next.sold < cur.sold)))) return;
      latest.current = next;
      // skip re-renders when nothing a viewer can see has changed
      const sig = `${next.status}|${next.cursor}|${next.nTrades}|${next.sold}|${next.ask.join(",")}|${next.bid.join(",")}|${next.spotOwner.map((x) => x?.toBase58() ?? "").join(",")}|${next.reserveUntil.join(",")}|${next.nextRevealMs}`;
      if (sig === last.current) return;
      last.current = sig;
      setB(next);
    };
    const poll = async () => {
      try {
        const c = readerClient();
        const s = await c.fetchBreak(id, "tee");
        const fb = s ?? (await c.fetchBreak(id, "base"));
        if (!fb) {
          if (alive) setError("No break with this id");
          return;
        }
        const info = await (await c.teeSession()).getAccountInfo(breakPda(id)).catch(() => null);
        if (info) apply(info.data);
        else if (alive && !latest.current) setB(fb);
      } catch (e: any) {
        console.warn("break poll", e?.message);
      }
    };
    (async () => {
      await poll();
      try {
        conn = await readerClient().teeSession();
        sub = conn.onAccountChange(breakPda(id), (info) => apply(info.data), "processed");
      } catch {
        /* polling covers it */
      }
    })();
    const t = setInterval(poll, 1200);
    return () => {
      alive = false;
      clearInterval(t);
      if (conn && sub !== null) conn.removeAccountChangeListener(sub).catch(() => {});
    };
  }, [id]);
  return { b, error };
}

/** Appraisal records for a break's cards (fetched once per set of mints). */
export function useCards(mints: PublicKey[] | undefined) {
  const [cards, setCards] = useState<(CardInfo | null)[]>([]);
  const key = mints?.map((m) => m.toBase58()).join(",") ?? "";
  useEffect(() => {
    if (!mints || mints.length === 0) return;
    let alive = true;
    readerClient()
      .fetchCards(mints)
      .then((c) => alive && setCards(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  return cards;
}

/** Profiles (names) for a set of wallets, cached for the session. */
const nameCache = new Map<string, string>();
export function useNames(keys: (PublicKey | null)[]) {
  const [, force] = useState(0);
  const want = keys.filter((k): k is PublicKey => !!k).map((k) => k.toBase58());
  const missing = [...new Set(want)].filter((k) => !nameCache.has(k));
  const sig = missing.join(",");
  useEffect(() => {
    if (!missing.length) return;
    let alive = true;
    (async () => {
      const c = readerClient();
      const conn = await c.teeSession();
      const { profilePda } = await import("../chain/client");
      const { decodeProfile } = await import("../chain/layout");
      const infos = await conn.getMultipleAccountsInfo(missing.map((k) => profilePda(new PublicKey(k)))).catch(() => []);
      missing.forEach((k, i) => {
        const info = infos[i];
        nameCache.set(k, info ? decodeProfile(info.data).name : `${k.slice(0, 4)}…${k.slice(-4)}`);
      });
      if (alive) force((x) => x + 1);
    })();
    return () => {
      alive = false;
    };
  }, [sig]);
  return (k: PublicKey | null | undefined) => (k ? nameCache.get(k.toBase58()) ?? `${k.toBase58().slice(0, 4)}…` : "—");
}
