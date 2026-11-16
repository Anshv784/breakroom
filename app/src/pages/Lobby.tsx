import { useMemo, useState } from "react";
import { useBreakList } from "../lib/useBreaks";
import { BreakCard } from "../ui/BreakCard";

const TABS = [
  { key: "live", label: "Live & on sale", match: (s: number) => s >= 1 && s <= 3 },
  { key: "done", label: "Finished", match: (s: number) => s >= 4 },
];

export default function Lobby() {
  const { list, loading } = useBreakList(4_000);
  const [tab, setTab] = useState("live");
  const shown = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)!;
    // live first, then on sale, newest first
    return list.filter((b) => t.match(b.status)).sort((a, b) => (b.status === 3 ? 1 : 0) - (a.status === 3 ? 1 : 0) || Number(b.createdAt - a.createdAt));
  }, [list, tab]);
  return (
    <div className="wrap" style={{ padding: "40px 24px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <div className="eyebrow">Breaks</div>
          <h1 className="display" style={{ margin: "8px 0 0", fontSize: 36 }}>
            Pull up a chair.
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {TABS.map((t) => (
            <button key={t.key} className={`btn sm ${tab === t.key ? "" : "ghost"}`} onClick={() => setTab(t.key)}>
              {t.label}
              <span className="faint mono">{list.filter((b) => t.match(b.status)).length}</span>
            </button>
          ))}
          <a href="#/host" className="btn sm primary">
            Host a break
          </a>
        </div>
      </div>
      {loading ? (
        <div className="break-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 170 }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="panel" style={{ padding: 48, textAlign: "center" }}>
          <p className="muted" style={{ marginTop: 0 }}>{tab === "live" ? "No break is running right now." : "Nothing finished yet."}</p>
          <a href="#/host" className="btn primary">
            Host the next one
          </a>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
          {shown.map((b) => (
            <BreakCard key={b.breakId.toString()} b={b} />
          ))}
        </div>
      )}
    </div>
  );
}
