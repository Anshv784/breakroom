// Stream overlay for breakers: a transparent page for OBS ("browser source", 1920x1080) that puts
// a provably fair break on top of any Twitch / YouTube / Whatnot stream. Everything on it comes
// from the chain: the sealed box, the spots and their live chase odds, each card the moment it's
// revealed, and a QR code viewers can scan to take a spot or check the proof.
import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { useBreak, useCards, useNames } from "../lib/useBreaks";
import { ST } from "../chain/layout";
import { chaseIndex, oddsFor, revealSequence, spotOfPos } from "../lib/breakmath";
import { cardImage, faceOf, TIER_COLORS, TIER_NAMES } from "../lib/art";
import { usd } from "../state/store";
import { Logo } from "../ui/Logo";
import "./overlay.css";

function Qr({ text, size = 132 }: { text: string; size?: number }) {
  const svg = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [text]);
  return <div className="ov-qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

const hex = (b: Uint8Array, n = 6) => Array.from(b.slice(0, n), (x) => x.toString(16).padStart(2, "0")).join("");

export default function Overlay({ id }: { id: bigint }) {
  const { b } = useBreak(id);
  const cards = useCards(b?.cards);
  const names = useNames(b ? [b.host, ...b.spotOwner] : []);
  const seen = useRef<Set<number> | null>(null);
  const [pop, setPop] = useState<{ pos: number; at: number } | null>(null);
  const queue = useRef<number[]>([]);

  // transparent page for OBS
  useEffect(() => {
    document.documentElement.classList.add("ov-mode");
    return () => document.documentElement.classList.remove("ov-mode");
  }, []);

  // new reveals -> one big pop-up each, in order
  useEffect(() => {
    if (!b) return;
    const out = b.revealed.map((c, pos) => (c >= 0 ? pos : -1)).filter((p) => p >= 0);
    if (!seen.current) {
      seen.current = new Set(out); // already out when the overlay loaded: don't replay them
      return;
    }
    for (const pos of revealSequence(b)) if (b.revealed[pos] >= 0 && !seen.current.has(pos)) {
      seen.current.add(pos);
      queue.current.push(pos);
    }
  }, [b?.cursor]);
  useEffect(() => {
    const t = setInterval(() => {
      if (pop && Date.now() - pop.at < 3800) return;
      const next = queue.current.shift();
      setPop(next !== undefined ? { pos: next, at: Date.now() } : null);
    }, 250);
    return () => clearInterval(t);
  }, [pop]);

  if (!b) return null;
  const odds = oddsFor(b);
  const chase = cards[chaseIndex(b)];
  const live = b.status === ST.LIVE || b.status === ST.SHUFFLING;
  const ended = b.status >= ST.ENDED;
  const link = `${location.origin}${location.pathname}#/${ended ? "verify" : "break"}/${b.breakId}`;
  const ripSpot = live && b.mode !== 1 && b.ripArmed === 1 ? b.openOrder[Math.floor(b.cursor / b.perSpot)] : -1;
  const popCard = pop ? cards[b.revealed[pop.pos]] : null;
  const popSpot = pop ? spotOfPos(b, pop.pos) : -1;
  const n = Math.min(b.nSpots, 12);

  return (
    <div className="ov">
      {/* top-left: what this is + the proof */}
      <div className="ov-head">
        <div className="ov-brand">
          <Logo size={26} />
          BREAKROOM
        </div>
        <div className="ov-title">{b.title || "Live break"}</div>
        <div className="ov-proof">
          <span className="ov-lock">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {ended ? "Verified on Solana" : "Shuffle sealed in a TEE · MagicBlock VRF"}
          </span>
          <span className="ov-hash">box {hex(b.commitment)}…</span>
        </div>
      </div>

      {/* top-right: progress */}
      <div className="ov-progress">
        <span>{ended ? "All cards out" : live ? "Cards out" : `${b.nSpots - b.sold} spots left`}</span>
        <b>
          {b.cursor}
          <i>/{b.nCards}</i>
        </b>
        {chase && (
          <em style={{ color: TIER_COLORS[chase.tier] }}>
            chase {chase.name} · {usd(chase.value, 0)} {b.revealed.includes(chaseIndex(b)) ? "· PULLED" : ""}
          </em>
        )}
      </div>

      {/* centre: the card that just came out */}
      {pop && popCard && (
        <div className={`ov-pop ${popCard.tier >= 3 ? "big" : ""}`} key={pop.at} style={{ ["--tc" as any]: TIER_COLORS[popCard.tier] }}>
          <img src={cardImage(faceOf(popCard))} alt={popCard.name} />
          <div className="ov-pop-info">
            <span className="ov-tier">{TIER_NAMES[popCard.tier]}</span>
            <b>{popCard.name}</b>
            <span className="ov-val">{usd(popCard.value, 0)}</span>
            <span className="ov-owner">to {popSpot >= 0 && b.spotOwner[popSpot] ? names(b.spotOwner[popSpot]) : "spot #" + (popSpot + 1)}</span>
          </div>
        </div>
      )}
      {ripSpot >= 0 && !pop && (
        <div className="ov-ripping">
          <i />
          {b.spotOwner[ripSpot] ? names(b.spotOwner[ripSpot]) : `Spot #${ripSpot + 1}`} is ripping their pack…
        </div>
      )}

      {/* bottom: spots + live chase odds */}
      <div className="ov-spots" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {Array.from({ length: n }, (_, s) => {
          const o = odds[s];
          const owner = b.spotOwner[s];
          const pct = o.hasChase ? 100 : Math.round(o.chaseOdds * 100);
          return (
            <div key={s} className={`ov-spot ${ripSpot === s ? "up" : ""} ${o.hasChase ? "won" : ""}`}>
              <span className="ov-n">{String(s + 1).padStart(2, "0")}</span>
              <b>{owner ? names(owner) : "open"}</b>
              <span className="ov-odds">{o.hasChase ? "CHASE" : o.sealed === 0 && b.mode !== 1 ? "done" : `${pct}% chase`}</span>
              <div className="ov-bar">
                <div style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* bottom-right: scan to join or verify */}
      <div className="ov-join">
        <Qr text={link} />
        <div>
          <b>{ended ? "Verify this break" : "Grab a spot"}</b>
          <span>scan, or visit</span>
          <code>{location.host}</code>
        </div>
      </div>
    </div>
  );
}
