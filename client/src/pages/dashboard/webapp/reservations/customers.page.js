import { useContext, useEffect } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// AXIOS
import axios from "axios";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import NotGoodDeviceWebAppComponent from "@/components/dashboard/webapp/_shared/not-good-device.webapp";
import ListCustomersReservationsWebapp from "@/components/dashboard/webapp/reservations/list-customers.reservations.webapp";
import SplashScreenWebAppComponent from "@/components/dashboard/webapp/_shared/splashscreen.webapp";

export default function AddReservationsPage(props) {
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
            <ListCustomersReservationsWebapp
              dataLoading={restaurantContext.dataLoading}
              restaurantData={restaurantContext.restaurantData}
              setRestaurantData={restaurantContext.setRestaurantData}
            />
          ) : (
            <NoAvailableComponent dataLoading={restaurantContext.dataLoading} />
          )}
        </div>
      </div>

      <NotGoodDeviceWebAppComponent />

      <SplashScreenWebAppComponent
        loading={restaurantContext.dataLoading}
        storageKey="gm:splash:webapp:reservations"
        enabled={restaurantContext?.isAuth}
        lastActiveKey="gm:lastActive:webapp:reservations"
        onRefetch={() => restaurantContext.refetchCurrentRestaurant?.()}
      />
    </>
  );
}

export async function getServerSideProps({ query, locale }) {
  const { reservationId } = query;

  try {
    let reservation = null;

    if (reservationId) {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/reservations/${reservationId}`,
      );
      reservation = response.data.reservation;
    }

    return {
      props: {
        reservation,
        ...(await serverSideTranslations(locale, ["common", "reservations"])),
      },
    };
  } catch (error) {
    console.error("Error fetching reservations data:", error);
    return {
      props: {
        reservation: null,
        ...(await serverSideTranslations(locale, ["common", "reservations"])),
      },
    };
  }
}
