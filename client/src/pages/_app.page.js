// STYLES
import "@/styles/style.scss";
import "@/styles/tailwind.css";
import "@/styles/custom/_index.scss";

// REACT
import { useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

// I18N
import { appWithTranslation } from "next-i18next";

// CONTEXT
import { GlobalProvider } from "@/contexts/global.context";

function App({ Component, pageProps }) {
  const router = useRouter();

  // ✅ Choix du manifest selon le module (Android)
  const manifestHref = useMemo(() => {
    const p = router.pathname || "";

    if (p.startsWith("/dashboard/reservations"))
      return "/manifest-reservations.webmanifest";
    if (p.startsWith("/dashboard/gift-cards")) return "/manifest-gift-cards.webmanifest";
    // ajoute ici les autres modules...
    return "/manifest.webmanifest";
  }, [router.pathname]);

  useEffect(() => {
    const scrollToTopEverywhere = () => {
      if (typeof window === "undefined") return;

      const doScroll = () => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      };

      doScroll();
      requestAnimationFrame(doScroll);
      setTimeout(doScroll, 50);
    };

    const handleRouteChange = () => {
      scrollToTopEverywhere();
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    router.events.on("routeChangeError", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
      router.events.off("routeChangeError", handleRouteChange);
    };
  }, [router]);

  return (
    <>
      <Head>
        {/* ✅ Android/Chrome : manifest par module */}
        <link rel="manifest" href={manifestHref} />

        {/* (optionnel) utile pour l'UI navigateur Android */}
        <meta name="theme-color" content="#131E36" />
      </Head>

      <GlobalProvider>
        <Component {...pageProps} />
      </GlobalProvider>
    </>
  );
}

export default appWithTranslation(App);
