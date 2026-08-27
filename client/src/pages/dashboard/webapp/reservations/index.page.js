import { useRouter } from "next/router";
import { useContext, useEffect, useRef, useState } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import ListReservationsWebapp from "@/components/dashboard/webapp/reservations/list.reservations.webapp";
import SplashScreenWebAppComponent from "@/components/dashboard/webapp/_shared/splashscreen.webapp";
import NotGoodDeviceWebAppComponent from "@/components/dashboard/webapp/_shared/not-good-device.webapp";

// WEB PUSB
import { setupPushForModule } from "@/_assets/utils/webpush";

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function getMonthFromDayKey(dayKey) {
  if (typeof dayKey !== "string") return null;
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

function isReservationsIndexUrl(url) {
  const pathname = String(url || "")
    .split(/[?#]/, 1)[0]
    .replace(/\/+$/, "");

  return pathname.endsWith("/dashboard/webapp/reservations");
}

export default function WepAppReservationsPage(props) {
  let title;
  let description;

  switch (i18n.language) {
    case "en":
      title = "Gusto Manager";
      description = "";
      break;
    default:
      title = "Gusto Manager";
      description = "";
  }

  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const [activeCalendarMonth, setActiveCalendarMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [reservationsRouteActive, setReservationsRouteActive] = useState(true);
  const [initialReservationsBootComplete, setInitialReservationsBootComplete] =
    useState(false);
  const initialCalendarMonthRef = useRef(null);

  if (router.isReady && !initialCalendarMonthRef.current) {
    initialCalendarMonthRef.current = startOfMonth(
      getMonthFromDayKey(router.query.day) || activeCalendarMonth,
    );
  }

  useEffect(() => {
    const handleRouteChangeStart = (url) => {
      setReservationsRouteActive(isReservationsIndexUrl(url));
    };
    const handleRouteChangeError = () => {
      setReservationsRouteActive(true);
    };

    router.events.on("routeChangeStart", handleRouteChangeStart);
    router.events.on("routeChangeError", handleRouteChangeError);

    return () => {
      router.events.off("routeChangeStart", handleRouteChangeStart);
      router.events.off("routeChangeError", handleRouteChangeError);
    };
  }, [router.events]);

  useEffect(() => {
    if (!router.isReady) return;
    const monthFromUrl = getMonthFromDayKey(router.query.day);
    if (monthFromUrl) setActiveCalendarMonth(monthFromUrl);
  }, [router.isReady, router.query.day]);

  // ✅ Protection token (redirect login)
  useEffect(() => {
    if (!router.isReady) return;

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    if (!token) {
      const returnTo = router.asPath;
      router.replace(
        `/dashboard/login?redirect=${encodeURIComponent(returnTo)}`,
      );
    }
  }, [router.isReady, router.asPath]);

  useEffect(() => {
    if (!restaurantContext?.isAuth) return;
    if (!restaurantContext?.restaurantData?._id) return;

    const token = localStorage.getItem("token");

    setupPushForModule({
      module: "reservations",
      restaurantId: restaurantContext.restaurantData._id,
      token,
      apiUrl: process.env.NEXT_PUBLIC_API_URL,
    }).catch(() => {
      // noop
    });
  }, [restaurantContext?.isAuth, restaurantContext?.restaurantData?._id]);

  const restaurant = restaurantContext.restaurantData;
  const restaurantReady = Boolean(restaurant?._id);
  const restaurantOptions = restaurant?.options || {};
  const hasReservationsModule = !!restaurantOptions.reservations;

  const user = restaurantContext.userConnected;
  const isEmployee = user?.role === "employee";

  let employeeHasReservationsAccess = true;

  if (isEmployee && restaurant) {
    const employeeInRestaurant = restaurant.employees?.find(
      (emp) => String(emp._id) === String(user.id),
    );

    const profile = employeeInRestaurant?.restaurantProfiles?.find(
      (p) => String(p.restaurant) === String(restaurant._id),
    );

    employeeHasReservationsAccess = profile?.options?.reservations === true;
  }

  const canLoadReservations =
    hasReservationsModule && employeeHasReservationsAccess;
  const initialMonthReservations =
    canLoadReservations && initialCalendarMonthRef.current
    ? restaurantContext.getCachedReservationsMonth?.(
        initialCalendarMonthRef.current,
        restaurant?._id,
      )
    : canLoadReservations
      ? null
      : [];
  const initialMonthReady = Array.isArray(initialMonthReservations);
  const initialReservationsBootLoading =
    reservationsRouteActive &&
    !initialReservationsBootComplete &&
    (restaurantContext.dataLoading ||
      !router.isReady ||
      !restaurantReady ||
      (canLoadReservations && !initialMonthReady));

  useEffect(() => {
    if (initialReservationsBootComplete) return;
    if (restaurantContext.dataLoading || !router.isReady) return;
    if (!restaurantReady) return;
    if (canLoadReservations && !initialMonthReady) return;

    setInitialReservationsBootComplete(true);
  }, [
    canLoadReservations,
    initialMonthReady,
    initialReservationsBootComplete,
    restaurantContext.dataLoading,
    restaurantReady,
    router.isReady,
  ]);

  return (
    <>
      <Head>
        <title>{title}</title>

        {/* Empêche zoom iOS */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />

        {/* iOS: raccourci écran d'accueil */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Réservations" />

        {/* Icône iOS dédiée au module */}
        <link
          rel="apple-touch-icon"
          href="/icons/ios/reservations-180.png?v=1"
        />

        <meta name="format-detection" content="telephone=no" />
      </Head>

      <div className="gm-webapp-device-content">
        <div className="gm-webapp-scroll-container gm-reservations-page bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 h-[100dvh] overflow-y-auto overscroll-none hide-scrollbar">
          {!hasReservationsModule ? (
            <NoAvailableComponent
              dataLoading={restaurantContext.dataLoading}
              emptyText="Vous n'avez pas souscrit à cette option"
            />
          ) : !employeeHasReservationsAccess ? (
            <NoAvailableComponent dataLoading={restaurantContext.dataLoading} />
          ) : (
            <ListReservationsWebapp
              restaurantData={restaurantContext.restaurantData}
              setRestaurantData={restaurantContext.setRestaurantData}
              reservations={restaurantContext.reservationsList}
              ensureReservationsMonth={
                restaurantContext.ensureReservationsMonth
              }
              getCachedReservationsMonth={
                restaurantContext.getCachedReservationsMonth
              }
              currentMonth={activeCalendarMonth}
              setCurrentMonth={setActiveCalendarMonth}
              applyReservationUpdate={restaurantContext.applyReservationUpdate}
              removeReservationFromCache={
                restaurantContext.removeReservationFromCache
              }
              markNotificationRead={restaurantContext.markNotificationRead}
            />
          )}
        </div>
      </div>

      <NotGoodDeviceWebAppComponent />

      {reservationsRouteActive ? (
        <SplashScreenWebAppComponent
          loading={initialReservationsBootLoading}
          forceShow={initialReservationsBootLoading}
          showOnHardReturn={!initialReservationsBootComplete}
          storageKey="gm:splash:webapp:reservations"
          enabled={restaurantContext?.isAuth}
          lastActiveKey="gm:lastActive:webapp:reservations"
          thresholdMs={5 * 60 * 1000}
          onSoftReturn={(_elapsed, details) =>
            restaurantContext.resyncAfterForeground?.({
              hard: false,
              reason: details?.reason || "unknown",
            })
          }
          onHardReturn={(_elapsed, details) =>
            restaurantContext.resyncAfterForeground?.({
              hard: true,
              reason: details?.reason || "unknown",
            })
          }
        />
      ) : null}
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "reservations"])),
    },
  };
}
