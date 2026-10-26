// STYLES
import "@/styles/style.scss";
import "@/styles/tailwind.css";
import "@/styles/custom/_index.scss";

// REACT
import { useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { Analytics } from "@vercel/analytics/next";

// I18N
import { appWithTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext, GlobalProvider } from "@/contexts/global.context";
import {
  getDashboardOptionKeyFromPath,
  isEmployeeDashboardRouteAllowed,
  normalizeDashboardPath,
} from "@/_assets/utils/dashboard-access";
import {
  getPushPermissionStatus,
  isPushDisabledForModule,
  setupPushForModule,
} from "@/_assets/utils/webpush";

function ensureAxiosApiAuthInterceptor() {
  if (typeof window === "undefined") return;

  if (window.__gustoApiAuthInterceptorId == null) {
    window.__gustoApiAuthInterceptorId = axios.interceptors.request.use(
      (config) => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        const targetUrl = String(config?.url || "");
        const isApiRequest = apiUrl && targetUrl.startsWith(apiUrl);

        if (!isApiRequest) return config;

        const token = localStorage.getItem("token");

        if (!token || config?.headers?.Authorization) return config;

        return {
          ...config,
          headers: {
            ...(config.headers || {}),
            Authorization: `Bearer ${token}`,
          },
        };
      },
    );
  }

  if (window.__gustoApiSessionInterceptorId == null) {
    window.__gustoApiSessionInterceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        const targetUrl = String(error?.config?.url || "");
        const sessionWasRevoked =
          apiUrl &&
          targetUrl.startsWith(apiUrl) &&
          error?.response?.status === 403 &&
          error?.response?.data?.message === "Session revoked";

        if (sessionWasRevoked && localStorage.getItem("token")) {
          localStorage.removeItem("token");

          const currentPath =
            window.location.pathname +
            window.location.search +
            window.location.hash;
          const loginUrl = currentPath.startsWith("/dashboard/login")
            ? "/dashboard/login"
            : `/dashboard/login?redirect=${encodeURIComponent(currentPath)}`;

          window.location.replace(loginUrl);
        }

        return Promise.reject(error);
      },
    );
  }
}

ensureAxiosApiAuthInterceptor();

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

    if (pathname.startsWith("/dashboard/webapp/take-away")) {
      return "take_away";
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

function WebAppPushSubscriptionSync() {
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
    if (pathname.startsWith("/dashboard/webapp/take-away")) {
      return "take_away";
    }
    return null;
  }, [router.pathname]);

  const restaurantId = restaurantContext?.restaurantData?._id;

  useEffect(() => {
    if (!targetModule || !restaurantContext?.isAuth || !restaurantId) return;
    if (getPushPermissionStatus() !== "granted") return;
    if (isPushDisabledForModule(restaurantId, targetModule)) return;

    let stopped = false;
    let requestInProgress = null;
    let retryTimeout = null;
    let retryDelayMs = 2000;

    const synchronize = () => {
      if (stopped || requestInProgress) return requestInProgress;
      if (getPushPermissionStatus() !== "granted") return null;
      if (isPushDisabledForModule(restaurantId, targetModule)) return null;

      const token = localStorage.getItem("token");
      requestInProgress = setupPushForModule({
        module: targetModule,
        restaurantId,
        token,
        apiUrl: process.env.NEXT_PUBLIC_API_URL,
        requestPermission: false,
      })
        .then((result) => {
          window.clearTimeout(retryTimeout);
          retryTimeout = null;
          retryDelayMs = 2000;
          return result;
        })
        .catch(() => {
          if (!stopped && navigator.onLine !== false) {
            window.clearTimeout(retryTimeout);
            retryTimeout = window.setTimeout(() => {
              retryTimeout = null;
              synchronize();
            }, retryDelayMs);
            retryDelayMs = Math.min(retryDelayMs * 2, 30000);
          }
          return null;
        })
        .finally(() => {
          requestInProgress = null;
        });

      return requestInProgress;
    };

    const handlePageShow = () => synchronize();
    const handleOnline = () => synchronize();
    const handleControllerChange = () => synchronize();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") synchronize();
    };

    synchronize();
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    return () => {
      stopped = true;
      window.clearTimeout(retryTimeout);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, [restaurantContext?.isAuth, restaurantId, targetModule]);

  return null;
}

function OwnerOnlyWebAppGuard({ children }) {
  const router = useRouter();
  const [accessState, setAccessState] = useState("idle");

  useEffect(() => {
    if (!router.isReady) return;

    const isWebAppRoute = (router.pathname || "").startsWith(
      "/dashboard/webapp",
    );
    if (!isWebAppRoute) {
      setAccessState("allowed");
      return;
    }

    if (typeof window === "undefined") {
      setAccessState("blocked");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setAccessState("allowed");
      return;
    }

    try {
      const decoded = jwtDecode(token);
      const employeeWebappAllowed = (router.pathname || "").startsWith(
        "/dashboard/webapp/take-away",
      );
      if (decoded?.role === "employee" && !employeeWebappAllowed) {
        setAccessState("blocked");
        router.replace("/dashboard/my-space");
        return;
      }
    } catch (error) {
      console.warn("Invalid dashboard token for webapp guard", error);
    }

    setAccessState("allowed");
  }, [router.isReady, router.pathname, router]);

  if ((router.pathname || "").startsWith("/dashboard/webapp")) {
    if (!router.isReady || accessState !== "allowed") {
      return null;
    }
  }

  return children;
}

function AccountantDashboardAccessGuard({ children }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;

    const pathname = normalizeDashboardPath(
      router.pathname || router.asPath || "",
    );
    if (!pathname.startsWith("/dashboard")) {
      setAllowed(true);
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setAllowed(true);
      return;
    }

    try {
      const role = jwtDecode(token)?.role;
      if (role === "accountant" && pathname !== "/dashboard/accountant") {
        setAllowed(false);
        router.replace("/dashboard/accountant");
        return;
      }

      if (role !== "accountant" && pathname === "/dashboard/accountant") {
        setAllowed(false);
        router.replace(
          role === "employee" ? "/dashboard/my-space" : "/dashboard",
        );
        return;
      }
    } catch {
      setAllowed(true);
      return;
    }

    setAllowed(true);
  }, [router.asPath, router.isReady, router.pathname, router]);

  if (!router.isReady || !allowed) return null;
  return children;
}

function EmployeeDashboardAccessGuard({ children }) {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);

  const authRole = useMemo(() => {
    if (typeof window === "undefined") {
      return restaurantContext.userConnected?.role || null;
    }

    const token = localStorage.getItem("token");
    if (!token) return restaurantContext.userConnected?.role || null;

    try {
      return jwtDecode(token)?.role || null;
    } catch {
      return restaurantContext.userConnected?.role || null;
    }
  }, [restaurantContext.userConnected?.role]);

  const currentPath = useMemo(
    () => normalizeDashboardPath(router.pathname || router.asPath || ""),
    [router.asPath, router.pathname],
  );

  const requiredOptionKey = useMemo(
    () => getDashboardOptionKeyFromPath(currentPath),
    [currentPath],
  );

  const isEmployee = authRole === "employee";
  const isProtectedEmployeeRoute =
    isEmployee && !!requiredOptionKey && currentPath !== "/dashboard/my-space";

  const employeeHasRouteAccess = isProtectedEmployeeRoute
    ? !restaurantContext.dataLoading &&
      isEmployeeDashboardRouteAllowed(currentPath, {
        restaurantData: restaurantContext.restaurantData,
        userConnected: restaurantContext.userConnected,
      })
    : true;

  useEffect(() => {
    if (!router.isReady) return;
    if (!isProtectedEmployeeRoute) return;
    if (restaurantContext.dataLoading) return;
    if (employeeHasRouteAccess) return;

    router.replace("/dashboard/my-space");
  }, [
    employeeHasRouteAccess,
    isProtectedEmployeeRoute,
    restaurantContext.dataLoading,
    router,
    router.isReady,
  ]);

  if (
    isProtectedEmployeeRoute &&
    (!router.isReady ||
      restaurantContext.dataLoading ||
      !employeeHasRouteAccess)
  ) {
    return null;
  }

  return children;
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
    if (p.startsWith("/dashboard/webapp/take-away"))
      return "/manifest-take-away.webmanifest";
    if (p.startsWith("/dashboard/webapp/time-clock"))
      return "/manifest-time-clock.webmanifest";
    if (p.startsWith("/dashboard/admin")) return "/manifest-admin.webmanifest";
    // ajoute ici les autres modules...
    return "/manifest.webmanifest?v=2";
  }, [router.pathname]);

  const isManagerApp =
    router.pathname.startsWith("/dashboard") &&
    manifestHref === "/manifest.webmanifest?v=2";

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

    if (process.env.NODE_ENV === "development") {
      const reloadFlag = "gusto-dev-service-worker-cleared";

      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          const hadServiceWorker =
            registrations.length > 0 ||
            Boolean(navigator.serviceWorker.controller);

          return Promise.all(
            registrations.map((registration) => registration.unregister()),
          ).then(() => hadServiceWorker);
        })
        .then((hadServiceWorker) => {
          if ("caches" in window) {
            return caches
              .keys()
              .then((keys) =>
                Promise.all(keys.map((key) => caches.delete(key))),
              )
              .then(() => hadServiceWorker);
          }
          return hadServiceWorker;
        })
        .then((hadServiceWorker) => {
          if (!hadServiceWorker) return;
          if (sessionStorage.getItem(reloadFlag)) return;
          sessionStorage.setItem(reloadFlag, "1");
          window.location.reload();
        })
        .catch((error) => {
          console.warn(
            "Unable to unregister development service worker",
            error,
          );
        });
      return;
    }

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

        {isManagerApp && (
          <>
            <meta name="application-name" content="Gusto Manager" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="default" />
            <meta name="apple-mobile-web-app-title" content="Gusto Manager" />
            <link
              rel="apple-touch-icon"
              sizes="152x152"
              href="/icons/ios/gusto-152.png?v=2"
            />
            <link
              rel="apple-touch-icon"
              sizes="167x167"
              href="/icons/ios/gusto-167.png?v=2"
            />
            <link
              rel="apple-touch-icon"
              sizes="180x180"
              href="/icons/ios/gusto-180.png?v=2"
            />
          </>
        )}

        {/* (optionnel) utile pour l'UI navigateur Android */}
        <meta name="theme-color" content="#131E36" />
      </Head>

      <GlobalProvider>
        <WebAppNotificationBadgeSync />
        <WebAppPushSubscriptionSync />
        <AccountantDashboardAccessGuard>
          <OwnerOnlyWebAppGuard>
            <EmployeeDashboardAccessGuard>
              <Component {...pageProps} />
            </EmployeeDashboardAccessGuard>
          </OwnerOnlyWebAppGuard>
        </AccountantDashboardAccessGuard>
      </GlobalProvider>
      <Analytics />
    </>
  );
}

export default appWithTranslation(App);
