import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const FADE_MS = 550;

export default function SplashScreenWebAppComponent(props) {
  const minDuration = 1750;

  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    return sessionStorage.getItem(props.storageKey) !== "1";
  });

  const [minTimeDone, setMinTimeDone] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const prevBodyBg = useRef("");

  // Force le body bg pendant le splash (important iOS)
  useEffect(() => {
    if (!visible) return;
    if (typeof document === "undefined") return;

    prevBodyBg.current = document.body.style.backgroundColor || "";
    document.body.style.backgroundColor = props.bgColor;

    return () => {
      document.body.style.backgroundColor = prevBodyBg.current;
    };
  }, [props.bgColor, visible]);

  // Durée min d’affichage
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setMinTimeDone(true), minDuration);
    return () => clearTimeout(t);
  }, [minDuration, visible]);

  // Fin: fade + unmount + set sessionStorage
  useEffect(() => {
    if (!visible) return;
    if (!minTimeDone) return;
    if (props.loading) return;

    // dès le fade, on remet le body au gris final
    if (typeof document !== "undefined") {
      document.body.style.backgroundColor = props.finalBgColor;
    }

    setFadeOut(true);

    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(props.storageKey, "1");
      } catch {}
      setVisible(false);
    }, FADE_MS);

    return () => clearTimeout(t);
  }, [
    visible,
    minTimeDone,
    props.loading,
    props.finalBgColor,
    props.storageKey,
  ]);

  if (!visible) return null;

  return (
    <div
      className="gm-splash-layer transition-opacity duration-[550ms]"
      style={{
        backgroundColor: props.bgColor,
        opacity: fadeOut ? 0 : 1,
      }}
    >
      <div className="animate-gm-splash-scale">
        <Image
          src={props.logoSrc}
          alt="App logo"
          width={250}
          height={250}
          priority
        />
      </div>
    </div>
  );
}
