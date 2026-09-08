import { useContext } from "react";
import Head from "next/head";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

import { GlobalContext } from "@/contexts/global.context";
import { isEmployeeDashboardRouteAllowed } from "@/_assets/utils/dashboard-access";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import NotGoodDeviceWebAppComponent from "@/components/dashboard/webapp/_shared/not-good-device.webapp";
import SplashScreenWebAppComponent from "@/components/dashboard/webapp/_shared/splashscreen.webapp";
import CatalogTakeAwayWebapp from "@/components/dashboard/webapp/take-away/catalog.take-away.webapp";

export default function TakeAwayWebappCatalogPage() {
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const hasTakeAwayModule = restaurant?.options?.take_away === true;
  const employeeHasAccess =
    restaurantContext.userConnected?.role !== "employee" ||
    isEmployeeDashboardRouteAllowed("/dashboard/webapp/take-away/catalog", {
      restaurantData: restaurant,
      userConnected: restaurantContext.userConnected,
    });

  if (!restaurantContext.isAuth) return null;

  return (
    <>
      <Head>
        <title>Gusto Manager</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
      </Head>

      <div className="gm-webapp-device-content">
        <div className="flex h-[100dvh] flex-1 flex-col gap-6 overflow-y-auto overscroll-none bg-lightGrey p-6 px-2 text-darkBlue mobile:px-6">
          {!hasTakeAwayModule ? (
            <NoAvailableComponent
              dataLoading={restaurantContext.dataLoading}
              emptyText="Vous n'avez pas souscrit à cette option"
            />
          ) : !employeeHasAccess ? (
            <NoAvailableComponent dataLoading={restaurantContext.dataLoading} />
          ) : (
            <CatalogTakeAwayWebapp />
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
