import { useContext, useEffect } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import ParametersReservationWebApp from "@/components/dashboard/webapp/reservations/parameters.reservations.webapp";
import NotGoodDeviceWebAppComponent from "@/components/dashboard/webapp/_shared/not-good-device.webapp.component";

// HOOK REFRESH
import useRefetchOnReturn from "@/_assets/utils/useRefetchOnReturn";

export default function ParametersReservationsPage(props) {
  const { restaurantContext } = useContext(GlobalContext);

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

    // ✅ Refetch quand on revient au 1er plan après > 5 min
    useRefetchOnReturn({
      enabled: restaurantContext?.isAuth,
      storageKey: "gm:lastActive:webapp:reservations",
      thresholdMs: 5 * 60 * 1000,
      onRefetch: () => {
        setShowRefetchSplash(true);
        restaurantContext.refetchCurrentRestaurant?.();
      },
    });

  if (!restaurantContext.isAuth) return null;

  return (
    <>
      <Head>
        <title>{title}</title>

        {/* Empeche le zoom / dezoom */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
      </Head>

      <div className="block mobile:hidden">
        <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 h-[100dvh] overflow-y-auto hide-scrollbar">
          {restaurantContext?.restaurantData?.options?.reservations ? (
            <ParametersReservationWebApp
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />
          ) : (
            <NoAvailableComponent dataLoading={restaurantContext.dataLoading} />
          )}
        </div>
      </div>

      <NotGoodDeviceWebAppComponent />
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, [
        "common",
        "reservations",
        "restaurant",
      ])),
    },
  };
}
