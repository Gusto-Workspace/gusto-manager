import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import WebAppListGiftCardsComponent from "@/components/dashboard/webapp/gift-cards/list.gift-cards.component";
import SplashScreenWebAppComponent from "@/components/dashboard/webapp/_shared/splashscreen.webapp.component";
import NotGoodDeviceWebAppComponent from "@/components/dashboard/webapp/_shared/not-good-device.webapp.component";

export default function GiftsPage(props) {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);

  const [showRefetchSplash, setShowRefetchSplash] = useState(false);

  // ✅ Redirect vers login si pas de token (1ère ouverture via raccourci)
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

  // ✅ Refetch quand retour au 1er plan après > 5 min
  useEffect(() => {
    if (!restaurantContext?.isAuth) return;
    if (typeof window === "undefined") return;

    const KEY = "gm:lastActive:webapp:giftcards";
    const THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

    const mark = () => {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {}
    };

    const shouldRefetch = () => {
      try {
        const prev = Number(localStorage.getItem(KEY) || 0);
        return Date.now() - prev > THRESHOLD_MS;
      } catch {
        return true;
      }
    };

    // ✅ initialise / refresh la date au montage
    mark();

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        mark();
        return;
      }

      if (document.visibilityState === "visible" && shouldRefetch()) {
        setShowRefetchSplash(true);
        restaurantContext.refetchCurrentRestaurant?.();
      }
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", mark);
    window.addEventListener("blur", mark);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", mark);
      window.removeEventListener("blur", mark);
    };
  }, [restaurantContext?.isAuth]);

  // ✅ Quand le loading finit, on coupe le forceShow (avec anti-clignotement)
  useEffect(() => {
    if (!showRefetchSplash) return;

    if (!restaurantContext?.dataLoading) {
      const t = setTimeout(() => setShowRefetchSplash(false), 350);
      return () => clearTimeout(t);
    }
  }, [restaurantContext?.dataLoading, showRefetchSplash]);

  if (!router.isReady) return null;
  if (!restaurantContext?.isAuth) return null;

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

  const restaurant = restaurantContext.restaurantData;
  const restaurantOptions = restaurant?.options || {};
  const hasGiftCardModule = !!restaurantOptions.gift_card;

  const user = restaurantContext.userConnected;
  const isEmployee = user?.role === "employee";

  let employeeHasGiftCardAccess = true;

  if (isEmployee && restaurant) {
    const employeeInRestaurant = restaurant.employees?.find(
      (emp) => String(emp._id) === String(user.id),
    );

    const profile = employeeInRestaurant?.restaurantProfiles?.find(
      (p) => String(p.restaurant) === String(restaurant._id),
    );

    employeeHasGiftCardAccess = profile?.options?.gift_card === true;
  }

  return (
    <>
      <Head>
        <title>{title}</title>

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />

        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Cartes cadeaux" />

        <link rel="apple-touch-icon" href="/icons/ios/gift-cards-180.png?v=1" />

        <meta name="format-detection" content="telephone=no" />
      </Head>

      <div className="block mobile:hidden">
        <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
          {!hasGiftCardModule ? (
            <NoAvailableComponent
              dataLoading={restaurantContext.dataLoading}
              emptyText="Vous n'avez pas souscrit à cette option"
            />
          ) : !employeeHasGiftCardAccess ? (
            <NoAvailableComponent
              dataLoading={restaurantContext.dataLoading}
              emptyText="Vous n'avez pas accès à cette section"
            />
          ) : (
            <WebAppListGiftCardsComponent
              restaurantName={restaurantContext?.restaurantData?.name}
            />
          )}
        </div>
      </div>

      <NotGoodDeviceWebAppComponent />

      <SplashScreenWebAppComponent
        loading={restaurantContext.dataLoading}
        storageKey="gm:splash:webapp:giftcards"
        forceShow={showRefetchSplash}
      />
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "gifts"])),
    },
  };
}
