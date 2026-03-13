import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";

// HOOK
import useRefetchOnReturn from "@/_assets/utils/useRefetchOnReturn";

const FADE_MS = 550;
const MIN_DURATION = 1250;
const REFRESH_ANTI_FLICKER_MS = 350;

// ✅ évite le warning "useLayoutEffect does nothing on the server"
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function SplashScreenWebAppComponent({
  loading,
  storageKey,
  forceShow = false,
  enabled = false,
  onSoftReturn,
  onHardReturn,
  thresholdMs = 5 * 60 * 1000,
  lastActiveKey = "gm:lastActive:webapp",
}) {
  // ✅ Force show interne déclenché par le retour 1er plan après 5 min
  const [internalForceShow, setInternalForceShow] = useState(false);

  // ✅ Par défaut on rend le splash (SSR inclus),
  // puis côté client on l'enlève AVANT paint si déjà vu.
  const [visible, setVisible] = useState(true);

  const [minTimeDone, setMinTimeDone] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const effectiveForceShow = forceShow || internalForceShow;

  // =========================
  // ✅ Option A : refetch au retour
  // =========================
  useRefetchOnReturn({
    enabled,
    storageKey: lastActiveKey,
    thresholdMs,
    onSoftReturn: () => {
      onSoftReturn?.();
    },
    onHardReturn: () => {
      setInternalForceShow(true);
      onHardReturn?.();
    },
  });

  // ✅ Quand le refetch est fini, on coupe le forceShow interne avec un petit délai
  useEffect(() => {
    if (!internalForceShow) return;
    if (loading) return;

    const t = setTimeout(() => {
      setInternalForceShow(false);
    }, REFRESH_ANTI_FLICKER_MS);

    return () => clearTimeout(t);
  }, [internalForceShow, loading]);

  // =========================
  // ✅ Décision AVANT paint => plus de flash "Chargement ..."
  // =========================
  useIsomorphicLayoutEffect(() => {
    // forceShow => on affiche
    if (effectiveForceShow) {
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
  }, [storageKey, effectiveForceShow]);

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
      // ✅ on marque "seen" uniquement quand c’est le splash “première fois”
      // (pas quand c’est un splash forcé au retour)
      if (!effectiveForceShow) {
        try {
          sessionStorage.setItem(storageKey, "1");
        } catch {}
      }
      setVisible(false);
    }, FADE_MS);

    return () => clearTimeout(t);
  }, [visible, minTimeDone, loading, storageKey, effectiveForceShow]);

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
