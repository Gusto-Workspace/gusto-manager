import { useContext, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

import { GlobalContext } from "@/contexts/global.context";

import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import SplashScreenWebAppComponent from "@/components/dashboard/webapp/_shared/splashscreen.webapp";
import TimeClockKioskComponent from "@/components/dashboard/time-clock/kiosk.time-clock.component";

export default function TimeClockWebAppPage() {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);

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
  }, [router.asPath, router.isReady]);

  let title;

  switch (i18n.language) {
    case "en":
      title = "Gusto Manager";
      break;
    default:
      title = "Gusto Manager";
  }

  const restaurant = restaurantContext?.restaurantData;
  const hasEmployeesModule = !!restaurant?.options?.employees;
  const handleSoftReturn = () =>
    restaurantContext?.resyncAfterForeground?.({ hard: false });
  const handleHardReturn = () =>
    restaurantContext?.resyncAfterForeground?.({ hard: true });

  return (
    <>
      <Head>
        <title>{title}</title>

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />

        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Pointeuse" />

        <link rel="apple-touch-icon" href="/icons/ios/time-clock-180.png?v=1" />

        <meta name="format-detection" content="telephone=no" />
      </Head>

      <div className="min-h-[100dvh] bg-lightGrey px-3 py-4 text-darkBlue midTablet:px-5 midTablet:py-5">
        {!hasEmployeesModule ? (
          <NoAvailableComponent
            dataLoading={restaurantContext?.dataLoading}
            emptyText="Vous n'avez pas souscrit à cette option"
          />
        ) : (
          <TimeClockKioskComponent />
        )}
      </div>

      <SplashScreenWebAppComponent
        loading={restaurantContext?.dataLoading}
        storageKey="gm:splash:webapp:timeclock"
        enabled={restaurantContext?.isAuth}
        lastActiveKey="gm:lastActive:webapp:timeclock"
        thresholdMs={5 * 60 * 1000}
        onSoftReturn={handleSoftReturn}
        onHardReturn={handleHardReturn}
      />
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "employees", "myspace"])),
    },
  };
}
