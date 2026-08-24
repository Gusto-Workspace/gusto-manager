import { useEffect, useLayoutEffect, useState } from "react";
import Image from "next/image";

// HOOK
import useRefetchOnReturn from "@/_assets/utils/useRefetchOnReturn";
import { markFrontendSplashHidden } from "@/_assets/utils/perf-diagnostics.client";

const FADE_MS = 550;
const MIN_DURATION = 1250;
const REFRESH_ANTI_FLICKER_MS = 350;

let splashScrollLockCount = 0;
let splashScrollLockSnapshot = null;
let splashTouchMoveHandler = null;

// ✅ évite le warning "useLayoutEffect does nothing on the server"
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function acquireSplashScrollLock() {
  if (typeof document === "undefined") return () => {};

  const html = document.documentElement;
  const body = document.body;

  if (splashScrollLockCount === 0) {
    splashScrollLockSnapshot = {
      htmlOverflow: html.style.overflow || "",
      bodyOverflow: body.style.overflow || "",
      bodyTouchAction: body.style.touchAction || "",
    };

    splashTouchMoveHandler = (event) => event.preventDefault();
    document.addEventListener("touchmove", splashTouchMoveHandler, {
      passive: false,
    });

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
  }

  splashScrollLockCount += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    splashScrollLockCount = Math.max(0, splashScrollLockCount - 1);

    if (splashScrollLockCount > 0) return;

    if (splashTouchMoveHandler) {
      document.removeEventListener("touchmove", splashTouchMoveHandler);
    }

    html.style.overflow = splashScrollLockSnapshot?.htmlOverflow || "";
    body.style.overflow = splashScrollLockSnapshot?.bodyOverflow || "";
    body.style.touchAction = splashScrollLockSnapshot?.bodyTouchAction || "";

    splashScrollLockSnapshot = null;
    splashTouchMoveHandler = null;
  };
}

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

  useEffect(() => {
    if (!visible) markFrontendSplashHidden();
  }, [visible]);

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
      setInternalForceShow(true);
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

  // Lock partagé entre les éventuelles instances qui se chevauchent pendant
  // une navigation. Le cleanup layout garantit le déverrouillage avant paint.
  useIsomorphicLayoutEffect(() => {
    if (!visible) return;

    return acquireSplashScrollLock();
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
