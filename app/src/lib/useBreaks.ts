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

export function useBreakList(pollMs = 5_000) {
  const [list, setList] = useState<BreakState[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    let ids: bigint[] = [];
    let lastIds = 0;
    const tick = async () => {
      try {
        const c = readerClient();
        if (Date.now() - lastIds > 20_000 || ids.length === 0) {
          ids = await c.listBreakIds();
          lastIds = Date.now();
        }
        const bs = await c.fetchBreaks(ids.slice(0, 60));
        // test runs (scripts/e2e.ts, probes) stay on chain but out of the lobby
        if (alive) setList(bs.filter((b) => (b.status !== 0 || b.deposited > 0) && !/^(probe|e2e|\[test\])/i.test(b.title)));
      } catch (e) {
        console.warn("break list", e);
      } finally {
        if (alive) setLoading(false);
      }
    };
    tick();
    const t = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);
  return { list, loading };
}

export function useBreak(id: bigint) {
  const [b, setB] = useState<BreakState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<string>("");
  useEffect(() => {
    let alive = true;
    let sub: number | null = null;
    let conn: Awaited<ReturnType<BreakroomClient["teeSession"]>> | null = null;
    last.current = "";
    const apply = (data: Uint8Array) => {
      if (!alive) return;
      const next = decodeBreak(data);
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
        else if (alive) setB(fb);
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
