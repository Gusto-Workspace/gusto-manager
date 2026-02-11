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

// HOOK REFRESH
import useRefetchOnReturn from "@/_assets/utils/useRefetchOnReturn";

// WEB PUSB
import { setupPushForModule } from "@/_assets/utils/webpush";

export default function GiftsPage(props) {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);

  const [showRefetchSplash, setShowRefetchSplash] = useState(false);

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
  useRefetchOnReturn({
    enabled: restaurantContext?.isAuth,
    storageKey: "gm:lastActive:webapp:giftcards",
    thresholdMs: 5 * 60 * 1000,
    onRefetch: () => {
      setShowRefetchSplash(true);
      restaurantContext.refetchCurrentRestaurant?.();
    },
  });

  // ✅ Quand le loading finit, on coupe le forceShow (avec anti-clignotement)
  useEffect(() => {
    if (!showRefetchSplash) return;

    if (!restaurantContext?.dataLoading) {
      const t = setTimeout(() => setShowRefetchSplash(false), 350);
      return () => clearTimeout(t);
    }
  }, [restaurantContext?.dataLoading, showRefetchSplash]);

  if (!router.isReady) return null;

  useEffect(() => {
    if (!restaurantContext?.isAuth) return;
    if (!restaurantContext?.restaurantData?._id) return;

    // évite de relancer à chaque re-render / refetch
    const key = `gm:push:subscribed:gift_cards:${restaurantContext.restaurantData._id}`;
    if (localStorage.getItem(key) === "1") return;

    const token = localStorage.getItem("token");

    setupPushForModule({
      module: "gift_cards",
      restaurantId: restaurantContext.restaurantData._id,
      token,
      apiUrl: process.env.NEXT_PUBLIC_API_URL,
    })
      .then(() => localStorage.setItem(key, "1"))
      .catch(() => {
        // ne pas set le flag si ça échoue
      });
  }, [restaurantContext?.isAuth, restaurantContext?.restaurantData?._id]);

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
