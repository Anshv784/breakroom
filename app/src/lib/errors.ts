// Turn chain errors into sentences a person can act on.
import idl from "../idl/breakroom.json";

const PROGRAM_ERRORS: Record<number, string> = Object.fromEntries(((idl as any).errors ?? []).map((e: any) => [e.code, e.msg]));

const SPL: Record<number, string> = {
  1: "Not enough USDC in your private balance",
  4: "This session can't spend that much: raise your session limit",
};

export function explain(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const custom = msg.match(/"Custom":(\d+)/);
  if (custom) {
    const code = Number(custom[1]);
    if (PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code];
    // instruction index 0/1 are the SPL transfers in front of every paid instruction
    const idx = msg.match(/InstructionError":\[(\d+)/);
    if (idx && Number(idx[1]) < 2 && SPL[code]) return SPL[code];
    if (code === 3012) return "Account not ready yet: try again in a moment";
    return `Program error ${code}`;
  }
  if (/User rejected|rejected the request|declined/i.test(msg)) return "You cancelled in the wallet";
  if (/insufficient lamports|InsufficientFunds/i.test(msg)) return "Not enough SOL for fees (devnet: use the faucet)";
  if (/403/.test(msg)) return "The private rollup refused this request";
  if (/expired/i.test(msg)) return "Network was slow and the transaction expired: try again";
  if (/fetch failed|Failed to fetch|NetworkError/i.test(msg)) return "Network hiccup: try again";
  return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
}
