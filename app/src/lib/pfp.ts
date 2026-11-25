// Custom profile pictures: stored by the breakroom-avatars Cloudflare worker, keyed by wallet,
// and only settable with a signature from that wallet.
import { useSyncExternalStore } from "react";
import { sha256 } from "@noble/hashes/sha256";
import bs58 from "bs58";
import type { WalletLike } from "../chain/client";

export const PFP_API = "https://breakroom-avatars.anshv784.workers.dev";
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

// per-wallet cache-buster so a new upload shows up straight away, everywhere
const ver = new Map<string, number>();
const subs = new Set<() => void>();
let tick = 0;
const bump = (k: string) => {
  ver.set(k, Date.now());
  tick++;
  subs.forEach((f) => f());
};
export const usePfpTick = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => tick);
export const pfpUrl = (k: string) => `${PFP_API}/a/${k}${ver.has(k) ? `?v=${ver.get(k)}` : ""}`;

/** Centre-crop to a square and shrink to 256px WebP, so uploads stay small. */
export async function squareImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 256, 256);
  return c.toDataURL("image/webp", 0.85);
}

export async function uploadPfp(wallet: WalletLike, img: string) {
  const me = wallet.publicKey.toBase58();
  const ts = Date.now();
  const msg = `BREAKROOM profile picture\n${me}\n${ts}\n${hex(sha256(new TextEncoder().encode(img)))}`;
  const sig = bs58.encode(await wallet.signMessage(new TextEncoder().encode(msg)));
  const r = await fetch(`${PFP_API}/a/${me}`, { method: "PUT", body: JSON.stringify({ img, ts, sig }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `upload failed (${r.status})`);
  bump(me);
}

export async function removePfp(wallet: WalletLike) {
  const me = wallet.publicKey.toBase58();
  const ts = Date.now();
  const sig = bs58.encode(await wallet.signMessage(new TextEncoder().encode(`BREAKROOM remove picture\n${me}\n${ts}`)));
  const r = await fetch(`${PFP_API}/a/${me}`, { method: "DELETE", body: JSON.stringify({ ts, sig }) });
  if (!r.ok) throw new Error(`remove failed (${r.status})`);
  bump(me);
}
