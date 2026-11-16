// Tiny hash router: #/, #/breaks, #/break/<id>, #/host, #/vault, #/verify/<id>
import { useEffect, useState } from "react";

export function useRoute(): string[] {
  const read = () => (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean);
  const [r, setR] = useState(read);
  useEffect(() => {
    const f = () => {
      setR(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return r;
}

export const go = (path: string) => {
  location.hash = path.startsWith("#") ? path : `#${path}`;
};
