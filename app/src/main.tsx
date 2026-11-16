import { StrictMode, Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import "./styles.css";
import { useRoute } from "./lib/router";
import { ConnectModal, Nav, OnboardModal, Toasts } from "./ui/Shell";
import { useApp } from "./state/store";
import { detectWallets } from "./state/wallet";

(globalThis as any).Buffer ??= Buffer;

const Home = lazy(() => import("./pages/Home"));
const Lobby = lazy(() => import("./pages/Lobby"));
const Room = lazy(() => import("./pages/Room"));
const Host = lazy(() => import("./pages/Host"));
const Vault = lazy(() => import("./pages/Vault"));
const Verify = lazy(() => import("./pages/Verify"));
const How = lazy(() => import("./pages/How"));

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
  return (
    <>
      <Nav route={route} />
      <main style={fullBleed ? undefined : { minHeight: "calc(100vh - 64px)" }}>
        <Suspense fallback={<div className="wrap" style={{ padding: 48 }}><div className="skeleton" style={{ height: 320 }} /></div>}>
          {page === "" && <Home />}
          {page === "breaks" && <Lobby />}
          {page === "break" && route[1] && <Room id={BigInt(route[1])} />}
          {page === "host" && <Host />}
          {page === "vault" && <Vault />}
          {page === "verify" && route[1] && <Verify id={BigInt(route[1])} />}
          {page === "how" && <How />}
        </Suspense>
      </main>
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
