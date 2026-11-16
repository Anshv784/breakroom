// How BREAKROOM is fair: the architecture, the life of a break, and an honest trust model.
const box = (x: number, y: number, w: number, h: number, title: string, lines: string[], color: string) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={14} fill="rgba(255,255,255,0.03)" stroke={color} strokeOpacity={0.55} />
    <text x={x + 16} y={y + 26} fill="#f3eff6" fontSize={14} fontWeight={700} fontFamily="Inter Tight">{title}</text>
    {lines.map((l, i) => (
      <text key={i} x={x + 16} y={y + 48 + i * 18} fill="#b9b1c2" fontSize={12} fontFamily="Inter Tight">{l}</text>
    ))}
  </g>
);

function Diagram() {
  return (
    <svg viewBox="0 0 1000 470" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="BREAKROOM architecture">
      <defs>
        <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#7d7586" />
        </marker>
      </defs>
      {/* zones */}
      <rect x={10} y={10} width={300} height={450} rx={20} fill="rgba(124,247,228,0.04)" stroke="#7cf7e4" strokeOpacity={0.25} />
      <text x={30} y={40} fill="#7cf7e4" fontSize={12} fontFamily="JetBrains Mono" letterSpacing="2">SOLANA</text>
      <rect x={350} y={10} width={400} height={450} rx={20} fill="rgba(181,140,255,0.05)" stroke="#b58cff" strokeOpacity={0.35} />
      <text x={370} y={40} fill="#b58cff" fontSize={12} fontFamily="JetBrains Mono" letterSpacing="2">MAGICBLOCK PRIVATE ER · INTEL TDX</text>
      <rect x={790} y={10} width={200} height={450} rx={20} fill="rgba(255,210,122,0.04)" stroke="#ffd27a" strokeOpacity={0.25} />
      <text x={810} y={40} fill="#ffd27a" fontSize={12} fontFamily="JetBrains Mono" letterSpacing="2">MAGICBLOCK</text>

      {box(30, 60, 260, 90, "Card vault", ["Every card NFT, locked before the sale", "Only the Receipt can move them out"], "#7cf7e4")}
      {box(30, 170, 260, 90, "Appraisal desk", ["Value + grade per card", "Hosts can't set prices"], "#7cf7e4")}
      {box(30, 280, 260, 80, "Receipt", ["Who gets each card,", "written by the Magic Action"], "#7cf7e4")}
      {box(30, 375, 260, 70, "Your wallet", ["Cards arrive here"], "#7cf7e4")}

      {box(370, 60, 360, 100, "Break (public)", ["Spots, owners, asks + offers, trade log", "Revealed cards, one at a time", "Commitment = sha256(cards, values)"], "#b58cff")}
      {box(370, 180, 170, 110, "Deck (sealed)", ["VRF seed + order", "Private permission,", "zero members", "Public after the end"], "#ff5fa8")}
      {box(560, 180, 170, 110, "Private balances", ["Your USDC (EATA)", "Only you can read it", "Buyer pays seller", "directly"], "#b58cff")}
      {box(370, 310, 360, 70, "Crank", ["Reveals a card every few seconds, then settles"], "#b58cff")}
      {box(370, 395, 360, 55, "Session key", ["Approved once; trades sign silently"], "#b58cff")}

      {box(810, 60, 160, 90, "VRF", ["Seed by callback", "into the Deck"], "#ffd27a")}
      {box(810, 170, 160, 110, "Private", ["Payments API:", "deposit / withdraw", "into the TEE"], "#ffd27a")}
      {box(810, 300, 160, 100, "Magic Action", ["Runs on Solana", "after the commit"], "#ffd27a")}

      <line x1={290} y1={105} x2={368} y2={105} stroke="#7d7586" markerEnd="url(#ar)" />
      <text x={300} y={98} fill="#7d7586" fontSize={10} fontFamily="JetBrains Mono">seal</text>
      <line x1={808} y1={105} x2={545} y2={190} stroke="#7d7586" markerEnd="url(#ar)" />
      <line x1={808} y1={225} x2={732} y2={235} stroke="#7d7586" markerEnd="url(#ar)" />
      <path d="M808 388 H 318 V 332 H 294" fill="none" stroke="#7d7586" markerEnd="url(#ar)" />
      <line x1={160} y1={360} x2={160} y2={373} stroke="#7d7586" markerEnd="url(#ar)" />
      <line x1={455} y1={290} x2={455} y2={308} stroke="#7d7586" markerEnd="url(#ar)" />
    </svg>
  );
}

const LIFE = [
  ["Lock", "The host deposits the card NFTs into a program vault. Values come from the appraisal desk. The full list is hashed into a commitment, and the break is delegated to MagicBlock's TEE validator — and only that validator."],
  ["Sell", "Buyers deposit USDC into a private balance with the Private Payments API, approve a session key once, and buy spots. Each buy is two SPL transfers (95% to the host, 5% fee) plus a program instruction that checks them: the host is paid instantly and BREAKROOM never holds a cent."],
  ["Shuffle", "Start closes the sale and requests MagicBlock VRF. The callback writes the seed straight into the Deck, an account created inside the TEE with a private permission and no members. The order exists only inside the enclave."],
  ["Open", "A crank scheduled inside the rollup reveals one card at a time. Every unopened spot stays tradeable — list it, take an offer, or buy the one still holding the chase. Odds and expected value update with every card."],
  ["Settle", "After the last card, the same crank makes the Deck public and commits the break with a Magic Action that writes every card's recipient to a Receipt on Solana. Anyone can then deliver the cards to winners' wallets."],
  ["Verify", "The seed, the order and the commitment are all public. The verify page re-runs the shuffle in your browser and checks every position, the opening order and the Receipt."],
];

const FAQ = [
  ["Can the host rig the break?", "No. The box is committed before the sale and can't change. The order comes from VRF and lands in a sealed account the host can't read, so there's nothing to leak to a friend or bid against."],
  ["Can BREAKROOM rig it?", "No more than the host can. The Deck has no members, not even the program's deployer, and the verify page checks the published seed against what was revealed."],
  ["Who holds my money?", "You do. Your USDC sits in your own private balance inside the TEE. Every payment is a direct transfer from you to the host or the seller; the program only checks it happened."],
  ["What if VRF doesn't answer?", "After 45 seconds anyone can seed the shuffle from inside the TEE instead. It's still sealed from everyone, but the break is permanently flagged 'TEE seed' so you know."],
  ["What do I still have to trust?", "Intel TDX (the enclave hardware MagicBlock's private rollup runs in) to keep the Deck sealed until the end, and the appraisal desk's prices. On mainnet, the desk is where a grading and tokenization partner plugs in."],
  ["Are these real cards?", "On devnet they're original BREAKROOM Genesis cards minted for testing. The program takes any 1-of-1 card NFT the desk has appraised, which is how tokenized graded cards plug in."],
];

export default function How() {
  return (
    <div className="wrap" style={{ padding: "40px 24px 80px", maxWidth: 1080 }}>
      <div className="eyebrow">How it's fair</div>
      <h1 className="display" style={{ fontSize: "clamp(30px,4vw,46px)", margin: "8px 0 14px", maxWidth: 820 }}>
        Nobody can see the shuffle. Everybody can check it.
      </h1>
      <p className="muted" style={{ fontSize: 17, maxWidth: 720 }}>
        BREAKROOM splits a break between Solana, where the cards and the final result live, and a MagicBlock Private Ephemeral Rollup running inside an Intel TDX enclave, where the shuffle stays sealed and the spot market runs in milliseconds.
      </p>
      <div className="panel" style={{ padding: 16, margin: "28px 0" }}>
        <Diagram />
      </div>
      <h2 className="display" style={{ fontSize: 26, margin: "40px 0 16px" }}>The life of a break</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {LIFE.map(([t, d], i) => (
          <div key={t} className="panel" style={{ padding: 18, display: "grid", gridTemplateColumns: "56px 1fr", gap: 14 }}>
            <div className="mono foil-text" style={{ fontSize: 22, fontWeight: 600 }}>{String(i + 1).padStart(2, "0")}</div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{t}</div>
              <div className="muted" style={{ fontSize: 14 }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
      <h2 className="display" style={{ fontSize: 26, margin: "40px 0 16px" }}>Questions</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
        {FAQ.map(([q, a]) => (
          <div key={q} className="panel" style={{ padding: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{q}</div>
            <div className="muted" style={{ fontSize: 14 }}>{a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
