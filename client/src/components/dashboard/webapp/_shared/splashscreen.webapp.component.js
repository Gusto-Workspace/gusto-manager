import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const FADE_MS = 550;
const DEFAULT_MIN_DURATION = 1750;

export default function SplashScreenWebAppComponent(props) {
  const minDuration = props.minDuration ?? DEFAULT_MIN_DURATION;
  const storageKey = props.storageKey ?? "gm:splash:webapp:default";
  const bgColor = props.bgColor ?? "#131E36";
  const logoSrc = props.logoSrc ?? "/img/logo-blanc.png";

  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    return sessionStorage.getItem(storageKey) !== "1";
  });

  const [minTimeDone, setMinTimeDone] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const prevBodyBg = useRef("");
  const prevHtmlBg = useRef("");

  // ✅ Force html+body bg pendant le splash (important iOS)
  useEffect(() => {
    if (!visible) return;
    if (typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;

    prevHtmlBg.current = html.style.backgroundColor || "";
    prevBodyBg.current = body.style.backgroundColor || "";

    html.style.backgroundColor = bgColor;
    body.style.backgroundColor = bgColor;

    return () => {
      html.style.backgroundColor = prevHtmlBg.current;
      body.style.backgroundColor = prevBodyBg.current;
    };
  }, [bgColor, visible]);

  // ✅ Durée min d’affichage
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setMinTimeDone(true), minDuration);
    return () => clearTimeout(t);
  }, [minDuration, visible]);

  // ✅ Fin: fade + unmount + set sessionStorage
  useEffect(() => {
    if (!visible) return;
    if (!minTimeDone) return;
    if (props.loading) return;

    setFadeOut(true);

    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {}
      setVisible(false);
    }, FADE_MS);

    return () => clearTimeout(t);
  }, [visible, minTimeDone, props.loading, storageKey]);

  if (!visible) return null;

  return (
    <div
      className="gm-splash-layer transition-opacity duration-[550ms]"
      style={{
        backgroundColor: bgColor,
        opacity: fadeOut ? 0 : 1,
      }}
    >
      <div className="animate-gm-splash-scale">
        <Image src={logoSrc} alt="App logo" width={250} height={250} priority />
      </div>
    </div>
  );
}
