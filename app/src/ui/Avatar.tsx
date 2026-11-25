import { useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import { avatarImage } from "../lib/art";
import { pfpUrl, usePfpTick } from "../lib/pfp";

// wallets we already know have no custom picture (skip the request next time this session)
const missing = new Set<string>();

/** Round avatar: the wallet's own picture if they set one, else a generated one in the cards' style. */
export function Avatar({ k, size = 24, ring }: { k: PublicKey | string; size?: number; ring?: string }) {
  const key = typeof k === "string" ? k : k.toBase58();
  usePfpTick();
  const [, setFailed] = useState(0);
  const url = pfpUrl(key);
  const tryCustom = !missing.has(url);
  return (
    <span style={{ position: "relative", width: size, height: size, flex: "none", display: "inline-block", borderRadius: size, overflow: "hidden", boxShadow: ring ? `0 0 0 2px ${ring}` : "0 0 0 1px rgba(255,255,255,0.12)" }}>
      <img src={avatarImage(key)} alt="" width={size} height={size} style={{ width: size, height: size, display: "block", objectFit: "cover" }} />
      {tryCustom && (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => {
            missing.add(url);
            setFailed((n) => n + 1);
          }}
          style={{ position: "absolute", inset: 0, width: size, height: size, objectFit: "cover" }}
        />
      )}
    </span>
  );
}
