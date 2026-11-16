// Verify a break in the browser, from chain data only. Nothing here trusts BREAKROOM's servers
// (there are none): it re-derives the commitment, re-runs the shuffle from the public VRF seed and
// checks every position, the opening order and the Solana Receipt.
import { useEffect, useMemo, useState } from "react";
import { readerClient, useCards, useNames } from "../lib/useBreaks";
import { ST, type BreakState, type DeckState, type ReceiptState } from "../chain/layout";
import { commitment, hex, shuffle } from "../chain/shuffle";
import { breakPda, deckPda, receiptPda } from "../chain/client";
import { cardImage, faceOf } from "../lib/art";
import { usd } from "../state/store";
import { IS_MAINNET, PROGRAM_ID } from "../chain/config";

const explorer = (k: string) => `https://explorer.solana.com/address/${k}${IS_MAINNET ? "" : "?cluster=devnet"}`;

interface Check {
  label: string;
  detail: string;
  ok: boolean | null; // null = not checkable yet
}

export default function Verify({ id }: { id: bigint }) {
  const [b, setB] = useState<BreakState | null>(null);
  const [deck, setDeck] = useState<DeckState | null>(null);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      const c = readerClient();
      const bb = (await c.fetchBreak(id, "tee").catch(() => null)) ?? (await c.fetchBreak(id, "base"));
      if (!alive) return;
      setB(bb);
      if (bb) {
        const [d, r] = await Promise.all([bb.status >= ST.ENDED ? c.fetchDeck(id, bb.nCards).catch(() => null) : null, c.fetchReceipt(id)]);
        if (!alive) return;
        setDeck(d);
        setReceipt(r);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [id]);
  const cards = useCards(b?.cards);
  const names = useNames(b ? [b.host, ...b.spotOwner] : []);

  const result = useMemo(() => {
    if (!b) return null;
    const checks: Check[] = [];
    const commitOk = hex(commitment(b.breakId, b.cards, b.cardValue)) === hex(b.commitment);
    checks.push({ label: "Box commitment", detail: `sha256 of all ${b.nCards} card mints + appraised values = ${hex(b.commitment).slice(0, 16)}…`, ok: commitOk });
    const firstSale = [...b.trades].filter((t) => t.kind === 0).sort((x, y) => x.ts - y.ts)[0];
    checks.push({
      label: "Sealed before the sale",
      detail: firstSale ? `Box committed at listing (${new Date(b.createdAt * 1000).toLocaleString()}); first spot sold ${new Date(firstSale.ts * 1000).toLocaleString()}` : "No spot sold yet",
      ok: firstSale ? b.createdAt <= firstSale.ts : null,
    });
    let order: number[] | null = null;
    let spots: number[] | null = null;
    if (deck?.seeded) {
      const re = shuffle(deck.randomness, b.nCards, b.nSpots);
      order = re.order;
      spots = re.spots;
      const posOk = b.revealed.every((c, pos) => c < 0 || re.order[pos] === c);
      const allOut = b.revealed.every((c) => c >= 0);
      checks.push({ label: "Shuffle re-run in your browser", detail: `Fisher-Yates over sha256(seed ‖ counter): ${b.revealed.filter((c) => c >= 0).length}/${b.nCards} revealed positions match`, ok: posOk && allOut });
      checks.push({ label: "Opening order", detail: `Spots opened in the order the seed dictates: ${re.spots.map((x) => x + 1).join(" → ")}`, ok: re.spots.every((x, i) => x === b.openOrder[i]) });
      checks.push({
        label: "Seed source",
        detail: b.seedSource === 1 ? `MagicBlock VRF, delivered by callback into the sealed Deck: ${hex(deck.randomness).slice(0, 24)}…` : "VRF didn't answer in time; seeded inside the TEE (still sealed from everyone, flagged here)",
        ok: b.seedSource === 1,
      });
    } else {
      checks.push({ label: "Shuffle", detail: b.status < ST.ENDED ? "Sealed inside the TEE while the break runs. Unlocks the moment the last card is out." : "Deck not published yet", ok: null });
    }
    if (receipt?.settled) {
      const per = b.perSpot;
      const ok = b.revealed.every((c, pos) => c >= 0 && receipt.recipient[c]?.equals(b.spotOwner[Math.floor(pos / per)]!));
      const delivered = receipt.recipient.filter((_, i) => (receipt.claimed & (1n << BigInt(i))) !== 0n).length;
      checks.push({ label: "Settled on Solana", detail: `Magic Action wrote every card's recipient to the Receipt; ${delivered}/${receipt.nCards} delivered to wallets`, ok });
    } else checks.push({ label: "Settled on Solana", detail: "Waiting for the post-commit Magic Action", ok: null });
    return { checks, order, spots };
  }, [b, deck, receipt]);

  if (loading) return <div className="wrap" style={{ padding: 48 }}><div className="skeleton" style={{ height: 400 }} /></div>;
  if (!b) return <div className="wrap" style={{ padding: 48 }}><div className="panel" style={{ padding: 32 }}>No break with id {id.toString()}.</div></div>;
  const allOk = result!.checks.every((c) => c.ok === true);
  const proof = {
    program: PROGRAM_ID.toBase58(),
    breakId: b.breakId.toString(),
    commitment: hex(b.commitment),
    cards: b.cards.map((m, i) => ({ mint: m.toBase58(), value: b.cardValue[i].toString() })),
    seed: deck ? hex(deck.randomness) : null,
    seedSource: b.seedSource === 1 ? "vrf" : b.seedSource === 2 ? "tee-fallback" : null,
    revealed: b.revealed,
    openOrder: b.openOrder,
    owners: b.spotOwner.map((o) => o?.toBase58() ?? null),
  };
  return (
    <div className="wrap" style={{ padding: "40px 24px 80px", maxWidth: 1000 }}>
      <div className="eyebrow">Verify</div>
      <h1 className="display" style={{ fontSize: 34, margin: "8px 0 6px" }}>{b.title || "Untitled break"}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Every check below runs in your browser on raw chain data. <a href={`#/break/${b.breakId}`} style={{ textDecoration: "underline" }}>Back to the table</a>
      </p>
      <div className="panel" style={{ padding: 20, margin: "20px 0", borderColor: allOk ? "rgba(79,227,161,.4)" : undefined, background: allOk ? "linear-gradient(90deg,rgba(79,227,161,.08),transparent), var(--panel)" : undefined }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{allOk ? "✓ This break was fair." : b.status < ST.ENDED ? "◐ Still running — partially verifiable" : "Some checks didn't pass"}</div>
        <div className="muted" style={{ fontSize: 14 }}>{allOk ? "The box didn't change after listing, nobody chose the shuffle, and every card went to the spot that pulled it." : "Checks that need the sealed shuffle unlock when the last card is out."}</div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {result!.checks.map((c) => (
          <div key={c.label} className="panel" style={{ padding: 16, display: "grid", gridTemplateColumns: "32px 1fr", gap: 12 }}>
            <div className="mono" style={{ width: 28, height: 28, borderRadius: 999, display: "grid", placeItems: "center", background: c.ok ? "rgba(79,227,161,.15)" : c.ok === false ? "rgba(255,107,107,.15)" : "rgba(255,255,255,.06)", color: c.ok ? "var(--up)" : c.ok === false ? "var(--down)" : "var(--text-3)" }}>
              {c.ok ? "✓" : c.ok === false ? "✗" : "…"}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{c.label}</div>
              <div className="muted" style={{ fontSize: 13, wordBreak: "break-word" }}>{c.detail}</div>
            </div>
          </div>
        ))}
      </div>
      {result!.order && (
        <>
          <h2 className="display" style={{ fontSize: 22, margin: "36px 0 12px" }}>Position by position</h2>
          <div className="panel" style={{ padding: 8, overflowX: "auto" }}>
            <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr className="faint" style={{ textAlign: "left" }}>
                  <th style={{ padding: 8 }}>Spot</th>
                  <th>Position</th>
                  <th>Re-run says</th>
                  <th>Revealed</th>
                  <th>Card</th>
                  <th style={{ textAlign: "right", paddingRight: 8 }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {b.revealed.map((c, pos) => {
                  const card = cards[c];
                  const ok = result!.order![pos] === c;
                  return (
                    <tr key={pos} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: 8 }}>#{Math.floor(pos / b.perSpot) + 1} <span className="faint">{names(b.spotOwner[Math.floor(pos / b.perSpot)])}</span></td>
                      <td>{pos}</td>
                      <td>{result!.order![pos]}</td>
                      <td className={ok ? "up" : "down"}>{c} {ok ? "✓" : "✗"}</td>
                      <td style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                        {card && <img src={cardImage(faceOf(card))} alt="" width={22} style={{ borderRadius: 3 }} />}
                        <span className="faint" style={{ fontFamily: "var(--sans)" }}>{card?.name ?? "…"}</span>
                      </td>
                      <td style={{ textAlign: "right", paddingRight: 8 }}>{usd(b.cardValue[c], 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <h2 className="display" style={{ fontSize: 22, margin: "36px 0 12px" }}>Accounts</h2>
      <div className="panel" style={{ padding: 16, display: "grid", gap: 8, fontSize: 13 }}>
        {[
          ["Program", PROGRAM_ID.toBase58()],
          ["Break (delegated to the TEE)", breakPda(b.breakId).toBase58()],
          ["Deck (sealed shuffle)", deckPda(b.breakId).toBase58()],
          ["Receipt (Solana)", receiptPda(b.breakId).toBase58()],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span className="muted">{k}</span>
            <a className="mono" href={explorer(v)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", wordBreak: "break-all" }}>{v}</a>
          </div>
        ))}
        <button
          className="btn sm"
          style={{ justifySelf: "start", marginTop: 8 }}
          onClick={() => {
            const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `breakroom-proof-${b.breakId}.json`;
            a.click();
          }}
        >
          Download proof JSON
        </button>
      </div>
    </div>
  );
}
