import { useEffect, useLayoutEffect, useState } from "react";
import Image from "next/image";

const FADE_MS = 550;
const MIN_DURATION = 1250;

// ✅ évite le warning "useLayoutEffect does nothing on the server"
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function SplashScreenWebAppComponent({
  loading,
  storageKey,
  forceShow = false,
}) {
  // ✅ Par défaut on rend le splash (SSR inclus),
  // puis côté client on l'enlève AVANT paint si déjà vu.
  const [visible, setVisible] = useState(true);

  const [minTimeDone, setMinTimeDone] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  // ✅ Décision AVANT paint => plus de flash "Chargement ..."
  useIsomorphicLayoutEffect(() => {
    // forceShow => on affiche
    if (forceShow) {
      setFadeOut(false);
      setMinTimeDone(false);
      setVisible(true);
      return;
    }

    // sinon, si déjà vu => on cache (avant paint)
    try {
      const alreadySeen = sessionStorage.getItem(storageKey) === "1";
      if (alreadySeen) {
        setVisible(false);
        return;
      }
    } catch {}

    // pas vu => on affiche
    setFadeOut(false);
    setMinTimeDone(false);
    setVisible(true);
  }, [storageKey, forceShow]);

  // lock scroll quand visible
  useEffect(() => {
    if (!visible) return;

    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow || "";
    const prevBodyOverflow = body.style.overflow || "";
    const prevTouchAction = body.style.touchAction || "";

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";

    const preventTouchMove = (e) => e.preventDefault();
    document.addEventListener("touchmove", preventTouchMove, {
      passive: false,
    });

    return () => {
      document.removeEventListener("touchmove", preventTouchMove);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevTouchAction;
    };
  }, [visible]);

  // durée minimum
  useEffect(() => {
    if (!visible) return;
    setMinTimeDone(false);
    const t = setTimeout(() => setMinTimeDone(true), MIN_DURATION);
    return () => clearTimeout(t);
  }, [visible]);

  // fin: fade + unmount + mark seen (si pas forceShow)
  useEffect(() => {
    if (!visible) return;
    if (!minTimeDone) return;
    if (loading) return;

    setFadeOut(true);

    const t = setTimeout(() => {
      if (!forceShow) {
        try {
          sessionStorage.setItem(storageKey, "1");
        } catch {}
      }
      setVisible(false);
    }, FADE_MS);

    return () => clearTimeout(t);
  }, [visible, minTimeDone, loading, storageKey, forceShow]);

  if (!visible) return null;

  return (
    <div
      className="gm-splash-layer transition-opacity duration-[550ms]"
      style={{
        backgroundColor: "#131E36",
        opacity: fadeOut ? 0 : 1,
        pointerEvents: fadeOut ? "none" : "auto",
      }}
    >
      <div className="animate-gm-splash-scale -mt-24">
        <Image
          src="/img/logo-blanc.png"
          alt="App logo"
          width={150}
          height={150}
          priority
        />
      </div>
    </div>
  );
}
