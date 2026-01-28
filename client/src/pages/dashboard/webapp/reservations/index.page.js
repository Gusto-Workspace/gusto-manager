import { useContext, useState } from "react";
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
import ListReservationsComponent from "@/components/dashboard/webapp/reservations/list.reservations.component"

export default function ReservationsPage(props) {
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

  const restaurant = restaurantContext.restaurantData;
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

  return (
    <>
      <Head>
        <title>{title}</title>

        {/* iOS: raccourci écran d'accueil */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Réservations" />

        {/* Icône iOS dédiée au module */}
        <link
          rel="apple-touch-icon"
          href="/icons/ios/reservations-180.png?v=1"
        />

        {/* (Optionnel) Empêche Safari de “détecter” certains formats */}
        <meta name="format-detection" content="telephone=no" />
      </Head>

      <div>
        <div className="flex">
          {/* <NavComponent /> */}

          <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            {!hasReservationsModule ? (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
                emptyText="Vous n'avez pas souscrit à cette option"
              />
            ) : !employeeHasReservationsAccess ? (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
                emptyText="Vous n'avez pas accès à cette section"
              />
            ) : (
              <ListReservationsComponent
                restaurantData={restaurantContext.restaurantData}
                setRestaurantData={restaurantContext.setRestaurantData}
                reservations={
                  restaurantContext?.restaurantData?.reservations?.list
                }
              />
            )}
          </div>
        </div>
      </div>
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
