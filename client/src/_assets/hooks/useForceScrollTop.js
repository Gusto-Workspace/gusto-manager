// hooks/useForceScrollTop.js
import { useEffect } from "react";

export default function useForceScrollTop() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Empêche le navigateur de restaurer une position de scroll
    const hadSR = "scrollRestoration" in window.history;
    const prev = hadSR ? window.history.scrollRestoration : null;
    if (hadSR) window.history.scrollRestoration = "manual";

    const jump = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    // 1) tout de suite
    jump();
    // 2) juste après l’hydratation
    const raf = requestAnimationFrame(jump);
    // 3) si le viewport change (fermeture clavier, barre d’adresse, rotation)
    const onResize = () => jump();
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (hadSR && prev) window.history.scrollRestoration = prev;
    };
  }, []);
}
