// STYLES
import "@/styles/style.scss";
import "@/styles/tailwind.css";
import "@/styles/custom/_index.scss";

// REACT
import { useContext, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

// I18N
import { appWithTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext, GlobalProvider } from "@/contexts/global.context";

function WebAppNotificationBadgeSync() {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);

  const targetModule = useMemo(() => {
    const pathname = router.pathname || "";

    if (pathname.startsWith("/dashboard/webapp/reservations")) {
      return "reservations";
    }

    if (pathname.startsWith("/dashboard/webapp/gift-cards")) {
      return "gift_cards";
    }

    return null;
  }, [router.pathname]);

  const badgeCount = useMemo(() => {
    if (!targetModule) return null;
    return Number(
      restaurantContext?.unreadCounts?.byModule?.[targetModule] || 0,
    );
  }, [restaurantContext?.unreadCounts?.byModule, targetModule]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!targetModule) return;
    if (restaurantContext?.dataLoading) return;

    const setBadge =
      typeof navigator.setAppBadge === "function"
        ? navigator.setAppBadge.bind(navigator)
        : null;
    const clearBadge =
      typeof navigator.clearAppBadge === "function"
        ? navigator.clearAppBadge.bind(navigator)
        : null;

    if (!setBadge && !clearBadge) return;

    const count = Number.isFinite(badgeCount) ? badgeCount : 0;

    Promise.resolve()
      .then(() => {
        if (count > 0 && setBadge) return setBadge(count);
        if (clearBadge) return clearBadge();
        if (setBadge) return setBadge();
        return undefined;
      })
      .catch(() => {});
  }, [badgeCount, restaurantContext?.dataLoading, targetModule]);

  return null;
}

function App({ Component, pageProps }) {
  const router = useRouter();

  // ✅ Choix du manifest selon le module (Android)
  const manifestHref = useMemo(() => {
    const p = router.pathname || "";

    if (p.startsWith("/dashboard/webapp/reservations"))
      return "/manifest-reservations.webmanifest";
    if (p.startsWith("/dashboard/webapp/gift-cards"))
      return "/manifest-gift-cards.webmanifest";
    if (p.startsWith("/dashboard/webapp/time-clock"))
      return "/manifest-time-clock.webmanifest";
    if (p.startsWith("/dashboard/admin")) return "/manifest-admin.webmanifest";
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const handleServiceWorkerMessage = (event) => {
      const message = event?.data;
      if (message?.type !== "notification:navigate") return;

      const rawTargetUrl = String(message?.targetUrl || "").trim();
      if (!rawTargetUrl) return;

      try {
        const targetUrl = new URL(rawTargetUrl, window.location.origin);
        if (targetUrl.origin !== window.location.origin) return;

        const nextPath = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
        const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

        if (!nextPath || currentPath === nextPath) return;

        router.push(nextPath, undefined, { scroll: false });
      } catch (error) {
        console.warn("Invalid service worker navigation target", error);
      }
    };

    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage,
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        "message",
        handleServiceWorkerMessage,
      );
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
        <WebAppNotificationBadgeSync />
        <Component {...pageProps} />
      </GlobalProvider>
    </>
  );
}

export default appWithTranslation(App);
