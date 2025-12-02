// STYLES
import "@/styles/style.scss";
import "@/styles/tailwind.css";
import "@/styles/custom/_index.scss";

// REACT
import { useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { appWithTranslation } from "next-i18next";

// CONTEXT
import { GlobalProvider } from "@/contexts/global.context";

function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    const scrollToTopEverywhere = () => {
      if (typeof window === "undefined") return;

      const doScroll = () => {
        // scroll "classique"
        window.scrollTo(0, 0);

        // pour les cas où c'est documentElement qui gère le scroll
        document.documentElement.scrollTop = 0;

        // pour les cas où c'est le body qui scrolle (ton hack iOS)
        document.body.scrollTop = 0;
      };

      // tout de suite
      doScroll();

      // une fois au prochain frame (Safari aime bien ça)
      requestAnimationFrame(doScroll);

      // et une petite dernière 50ms après, au cas où
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
    <GlobalProvider>
      <Component {...pageProps} />
    </GlobalProvider>
  );
}

export default appWithTranslation(App);
