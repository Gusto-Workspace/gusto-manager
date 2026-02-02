import { useEffect, useState } from "react";
import Image from "next/image";

const FADE_MS = 550;
const MIN_DURATION = 1250;

export default function SplashScreenWebAppComponent({
  loading,
  storageKey,
  forceShow = false,
}) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    return forceShow ? true : sessionStorage.getItem(storageKey) !== "1";
  });

  const [minTimeDone, setMinTimeDone] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (!forceShow) return;
    setFadeOut(false);
    setMinTimeDone(false);
    setVisible(true);
  }, [forceShow]);

  useEffect(() => {
    if (!visible) return;
    if (typeof document === "undefined") return;

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

  // ✅ durée minimum
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setMinTimeDone(true), MIN_DURATION);
    return () => clearTimeout(t);
  }, [visible]);

  // ✅ fin: fade + unmount + (boot only) sessionStorage
  useEffect(() => {
    if (!visible) return;
    if (!minTimeDone) return;
    if (loading) return;

    setFadeOut(true);

    const t = setTimeout(() => {
      // Boot: on persiste "déjà vu"
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
