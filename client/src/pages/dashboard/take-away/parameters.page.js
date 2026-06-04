import { useContext } from "react";
import Head from "next/head";
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

import { GlobalContext } from "@/contexts/global.context";
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import TakeAwayParametersComponent from "@/components/dashboard/take-away/parameters.take-away.component";

export default function TakeAwayParametersPage() {
  const { restaurantContext } = useContext(GlobalContext);

  let title;
  switch (i18n.language) {
    case "en":
      title = "Gusto Manager";
      break;
    default:
      title = "Gusto Manager";
  }

  if (!restaurantContext.isAuth) return null;

  const restaurant = restaurantContext.restaurantData;
  const hasTakeAwayModule = !!restaurant?.options?.take_away;
  const user = restaurantContext.userConnected;
  const isEmployee = user?.role === "employee";
  let employeeHasTakeAwayAccess = true;

  if (isEmployee && restaurant) {
    const employeeInRestaurant = restaurant.employees?.find(
      (emp) => String(emp._id) === String(user.id),
    );
    const profile = employeeInRestaurant?.restaurantProfiles?.find(
      (p) => String(p.restaurant) === String(restaurant._id),
    );
    employeeHasTakeAwayAccess = profile?.options?.take_away === true;
  }

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <div className="tablet:ml-[88px] flex min-h-screen flex-1 flex-col gap-6 bg-lightGrey p-6 px-2 text-darkBlue mobile:px-6">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            {!hasTakeAwayModule ? (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
                emptyText="Vous n'avez pas souscrit à cette option"
              />
            ) : !employeeHasTakeAwayAccess ? (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
              />
            ) : (
              <TakeAwayParametersComponent />
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
      ...(await serverSideTranslations(locale, [
        "common",
        "take-away",
        "restaurant",
      ])),
    },
  };
}
