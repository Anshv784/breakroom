// BREAKROOM profile pictures. A wallet uploads a small image, signed by that wallet, and anyone can
// read it back. Stored in KV keyed by the wallet address. No accounts, no passwords: the signature
// is the auth, so nobody can set someone else's picture.
//   PUT /a/<wallet>   body: { img: "data:image/webp;base64,...", ts: <ms>, sig: <base58 ed25519 sig> }
//        signed message: "BREAKROOM profile picture\n<wallet>\n<ts>\n<sha256 hex of img>"
//   GET /a/<wallet>   -> the image (404 if none)
//   DELETE /a/<wallet> body: { ts, sig } over "BREAKROOM remove picture\n<wallet>\n<ts>"
export interface Env {
  AVATARS: KVNamespace;
}
const MAX = 200_000;
const EMPTY = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(s: string): Uint8Array {
  let n = 0n;
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(i);
  }
  const out: number[] = [];
  while (n > 0n) {
    out.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const ch of s) {
    if (ch !== "1") break;
    out.unshift(0);
  }
  return Uint8Array.from(out);
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS", "access-control-allow-headers": "content-type" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });

async function verify(wallet: string, msg: string, sig: string) {
  const pk = b58(wallet);
  if (pk.length !== 32) return false;
  const key = await crypto.subtle.importKey("raw", pk, { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, b58(sig), new TextEncoder().encode(msg));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const m = new URL(req.url).pathname.match(/^\/a\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (!m) return json(404, { error: "not found" });
    const wallet = m[1];
    if (req.method === "GET") {
      const v = await env.AVATARS.getWithMetadata<{ type: string }>(wallet, "arrayBuffer");
      // no picture: a transparent pixel, so the app's generated avatar shows through (no 404 noise)
      if (!v.value) return new Response(EMPTY, { headers: { "content-type": "image/png", ...cors, "cache-control": "public, max-age=60" } });
      return new Response(v.value, { headers: { "content-type": v.metadata?.type ?? "image/webp", "cache-control": "public, max-age=300", ...cors } });
    }
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "bad json" });
    }
    const ts = Number(body.ts);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) return json(400, { error: "stale signature" });
    if (req.method === "DELETE") {
      if (!(await verify(wallet, `BREAKROOM remove picture\n${wallet}\n${ts}`, String(body.sig)).catch(() => false))) return json(401, { error: "bad signature" });
      await env.AVATARS.delete(wallet);
      return json(200, { ok: true });
    }
    if (req.method !== "PUT") return json(405, { error: "method" });
    const mm = String(body.img ?? "").match(/^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
    if (!mm) return json(400, { error: "image must be a webp, png or jpeg data url" });
    const bytes = Uint8Array.from(atob(mm[2]), (c) => c.charCodeAt(0));
    if (bytes.length > MAX) return json(413, { error: "image too large" });
    const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.img)));
    const ok = await verify(wallet, `BREAKROOM profile picture\n${wallet}\n${ts}\n${digest}`, String(body.sig)).catch(() => false);
    if (!ok) return json(401, { error: "bad signature" });
    await env.AVATARS.put(wallet, bytes, { metadata: { type: mm[1] } });
    return json(200, { ok: true });
  },
};
