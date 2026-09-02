import { useEffect, useLayoutEffect, useState } from "react";

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
  showOnHardReturn = true,
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
    onSoftReturn: (elapsed, details) => {
      onSoftReturn?.(elapsed, details);
    },
    onHardReturn: (elapsed, details) => {
      if (showOnHardReturn) setInternalForceShow(true);
      onHardReturn?.(elapsed, details);
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

    // La page suivante ne doit pas remonter le même splash pendant le fade.
    // On marque donc la session avant l'animation, et non après son timeout.
    if (!effectiveForceShow) {
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {}
    }

    setFadeOut(true);

    const t = setTimeout(() => {
      setVisible(false);
    }, FADE_MS);

    return () => clearTimeout(t);
  }, [visible, minTimeDone, loading, storageKey, effectiveForceShow]);

  if (!visible) return null;

  return (
    <div
      className="gm-splash-layer transition-opacity duration-[550ms]"
      aria-hidden={fadeOut}
      onTransitionEnd={(event) => {
        if (
          fadeOut &&
          event.target === event.currentTarget &&
          event.propertyName === "opacity"
        ) {
          setVisible(false);
        }
      }}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 9999,
        display: "grid",
        alignItems: "center",
        justifyItems: "center",
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        minHeight: "100vh",
        paddingBottom: "6rem",
        overflow: "hidden",
        overscrollBehavior: "none",
        backgroundColor: "#131E36",
        opacity: fadeOut ? 0 : 1,
        pointerEvents: fadeOut ? "none" : "auto",
        touchAction: "none",
      }}
    >
      <div
        className="animate-gm-splash-scale"
        style={{
          width: 150,
          height: 199,
          backgroundImage: "url('/img/logo-blanc.png')",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain",
        }}
      />
    </div>
  );
}
