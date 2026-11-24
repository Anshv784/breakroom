// Landing block for pages that need a wallet (Host, Vault): what it is, why it's good, one clear action.
import { useMemo } from "react";
import { cardImage, type CardFace } from "../lib/art";
import "./intro.css";

const SAMPLE: CardFace[] = [
  { name: "Solar Lion", set: "Genesis", tier: 4, grade: 100, art: 7, value: 547_000_000n },
  { name: "Void Seraph", set: "Genesis", tier: 4, grade: 95, art: 3, value: 484_000_000n },
  { name: "Glacier Maw", set: "Genesis", tier: 3, grade: 95, art: 6, value: 176_000_000n },
  { name: "Bloom Dryad", set: "Genesis", tier: 2, grade: 90, art: 5, value: 82_000_000n },
];

export function Intro({
  eyebrow,
  title,
  sub,
  action,
  note,
  points,
  steps,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  action: JSX.Element;
  note?: string;
  points: { title: string; body: string }[];
  steps?: { title: string; body: string }[];
}) {
  const imgs = useMemo(() => SAMPLE.map(cardImage), []);
  return (
    <div className="wrap intro">
      <section className="intro-hero">
        <div className="intro-copy">
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="display">{title}</h1>
          <p className="muted">{sub}</p>
          <div className="intro-cta">{action}</div>
          {note && (
            <p className="intro-note">
              <span className="dot" />
              {note}
            </p>
          )}
        </div>
        <div className="intro-art" aria-hidden>
          <div className="intro-glow" />
          {imgs.map((src, i) => (
            <img key={i} src={src} alt="" className={`intro-card c${i}`} />
          ))}
        </div>
      </section>
      <section className="intro-points">
        {points.map((p) => (
          <div key={p.title} className="panel intro-point">
            <h3>{p.title}</h3>
            <p className="muted">{p.body}</p>
          </div>
        ))}
      </section>
      {steps && (
        <section className="intro-steps">
          <h2 className="display">How it works</h2>
          <div className="intro-steps-row">
            {steps.map((st, i) => (
              <div key={st.title} className="intro-step">
                <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                <h3>{st.title}</h3>
                <p className="muted">{st.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
