import "./polyfill";
import { StrictMode, Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import "./styles.css";
import { useRoute } from "./lib/router";
import { ConnectModal, Nav, OnboardModal, Toasts } from "./ui/Shell";
import { Footer } from "./ui/Footer";
import { useApp } from "./state/store";
import { detectWallets } from "./state/wallet";

(globalThis as any).Buffer ??= Buffer;
// lets the UI test (and the console) force a balance refresh
(window as any).__refresh = () => useApp.getState().refresh();

const Home = lazy(() => import("./pages/Home"));
const Lobby = lazy(() => import("./pages/Lobby"));
const Room = lazy(() => import("./pages/Room"));
const Host = lazy(() => import("./pages/Host"));
const Vault = lazy(() => import("./pages/Vault"));
const Verify = lazy(() => import("./pages/Verify"));
const How = lazy(() => import("./pages/How"));
const Leaders = lazy(() => import("./pages/Leaders"));

function NotFound() {
  return (
    <div className="wrap" style={{ padding: "120px 24px", textAlign: "center" }}>
      <div className="eyebrow">404</div>
      <h1 className="display" style={{ fontSize: 44, margin: "10px 0 12px" }}>This pack was empty.</h1>
      <p className="muted" style={{ margin: "0 0 28px" }}>The page you're looking for isn't here.</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <a href="#/breaks" className="btn primary">Browse breaks</a>
        <a href="#/" className="btn">Home</a>
      </div>
    </div>
  );
}

function App() {
  const route = useRoute();
  // reconnect the last wallet silently
  useEffect(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem("br-last-wallet");
    } catch {
      /* ignore */
    }
    if (!last) return;
    const t = setTimeout(() => {
      if (last === "guest") useApp.getState().connect("guest");
      else {
        const d = detectWallets().find((w) => w.name === last);
        if (d) useApp.getState().connect(d).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(t);
  }, []);
  // keep balances fresh
  useEffect(() => {
    const t = setInterval(() => useApp.getState().refresh(), 15_000);
    return () => clearInterval(t);
  }, []);
  const page = route[0] ?? "";
  const fullBleed = page === "break";
  const known = ["", "breaks", "break", "host", "vault", "verify", "how", "leaders"].includes(page);
  useEffect(() => {
    const t: Record<string, string> = { "": "Card breaks you can verify", breaks: "Live breaks", break: "Break room", host: "Host a break", vault: "Your vault", verify: "Verify a break", how: "How it's fair", leaders: "Leaderboard" };
    document.title = `${known ? t[page] : "Not found"} · BREAKROOM`;
  }, [page]);
  return (
    <>
      <Nav route={route} />
      <main style={fullBleed ? undefined : { minHeight: "calc(100vh - 64px)" }}>
        <Suspense fallback={<div className="wrap" style={{ padding: 48 }}><div className="skeleton" style={{ height: 320 }} /></div>}>
          <div key={route.join("/")} className={fullBleed ? undefined : "page-in"}>
          {page === "" && <Home />}
          {page === "breaks" && <Lobby />}
          {page === "break" && route[1] && <Room id={BigInt(route[1])} />}
          {page === "host" && <Host />}
          {page === "vault" && <Vault />}
          {page === "verify" && route[1] && <Verify id={BigInt(route[1])} />}
          {page === "how" && <How />}
          {page === "leaders" && <Leaders />}
          {!known && <NotFound />}
          </div>
        </Suspense>
      </main>
      {!fullBleed && <Footer />}
      <ConnectModal />
      <OnboardModal />
      <Toasts />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
