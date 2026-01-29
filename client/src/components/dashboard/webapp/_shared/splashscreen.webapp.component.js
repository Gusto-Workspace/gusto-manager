import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const FADE_MS = 550;

export default function SplashScreenWebAppComponent(props) {
  const [visible, setVisible] = useState(true);
  const [minTimeDone, setMinTimeDone] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const prevBodyBg = useRef("");

  // Force le body bg pendant le splash (important iOS)
  useEffect(() => {
    if (typeof document === "undefined") return;
    prevBodyBg.current = document.body.style.backgroundColor || "";
    document.body.style.backgroundColor = props.bgColor;

    return () => {
      document.body.style.backgroundColor = prevBodyBg.current;
    };
  }, [props.bgColor]);

  useEffect(() => {
    const t = setTimeout(() => setMinTimeDone(true), 1750);
    return () => clearTimeout(t);
  }, [1750]);

  useEffect(() => {
    if (!minTimeDone) return;
    if (props.loading) return;

    // dès le fade, on remet le body au gris final
    if (typeof document !== "undefined") {
      document.body.style.backgroundColor = props.finalBgColor;
    }

    setFadeOut(true);
    const t = setTimeout(() => setVisible(false), FADE_MS);
    return () => clearTimeout(t);
  }, [minTimeDone, props.loading, props.finalBgColor]);

  if (!visible) return null;

  return (
    <div
      className="gm-splash-layer transition-opacity duration-[550ms]"
      style={{
        backgroundColor: props.bgColor,
        opacity: fadeOut ? 0 : 1,
      }}
    >
      <div className="animate-gm-splash-scale -mt-12">
        <Image
          src={props.logoSrc}
          alt="App logo"
          width={200}
          height={200}
          priority
        />
      </div>
    </div>
  );
}
