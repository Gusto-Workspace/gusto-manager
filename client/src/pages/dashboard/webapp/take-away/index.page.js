import { useContext, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

import { GlobalContext } from "@/contexts/global.context";
import { isEmployeeDashboardRouteAllowed } from "@/_assets/utils/dashboard-access";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import NotGoodDeviceWebAppComponent from "@/components/dashboard/webapp/_shared/not-good-device.webapp";
import SplashScreenWebAppComponent from "@/components/dashboard/webapp/_shared/splashscreen.webapp";
import ListTakeAwayWebapp from "@/components/dashboard/webapp/take-away/list.take-away.webapp";

export default function TakeAwayWebappPage() {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);

  useEffect(() => {
    if (!router.isReady) return;
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace(
        `/dashboard/login?redirect=${encodeURIComponent(router.asPath)}`,
      );
    }
  }, [router.asPath, router.isReady, router]);

  const restaurant = restaurantContext.restaurantData;
  const hasTakeAwayModule = restaurant?.options?.take_away === true;
  const employeeHasAccess =
    restaurantContext.userConnected?.role !== "employee" ||
    isEmployeeDashboardRouteAllowed("/dashboard/webapp/take-away", {
      restaurantData: restaurant,
      userConnected: restaurantContext.userConnected,
    });

  return (
    <>
      <Head>
        <title>Gusto Manager</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Vente à emporter" />
        <link rel="apple-touch-icon" href="/icons/android/gusto-192.png" />
        <meta name="format-detection" content="telephone=no" />
      </Head>

      <div className="gm-webapp-device-content">
        <div className="gm-webapp-scroll-container flex h-[100dvh] flex-1 flex-col gap-6 overflow-y-auto overscroll-none bg-lightGrey p-6 px-2 text-darkBlue mobile:px-6">
          {!hasTakeAwayModule ? (
            <NoAvailableComponent
              dataLoading={restaurantContext.dataLoading}
              emptyText="Vous n'avez pas souscrit à cette option"
            />
          ) : !employeeHasAccess ? (
            <NoAvailableComponent dataLoading={restaurantContext.dataLoading} />
          ) : (
            <ListTakeAwayWebapp />
          )}
        </div>
      </div>

      <NotGoodDeviceWebAppComponent />

      <SplashScreenWebAppComponent
        loading={restaurantContext.dataLoading}
        storageKey="gm:splash:webapp:take-away"
        enabled={restaurantContext.isAuth}
        lastActiveKey="gm:lastActive:webapp:take-away"
        thresholdMs={5 * 60 * 1000}
        onSoftReturn={() =>
          restaurantContext.resyncAfterForeground?.({ hard: false })
        }
        onHardReturn={() =>
          restaurantContext.resyncAfterForeground?.({ hard: true })
        }
      />
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}
