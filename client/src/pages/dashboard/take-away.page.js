import { useContext } from "react";
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

export default function TakeAwayPage(props) {
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
  const hasTakeAwayModule = !!restaurantOptions.take_away;

  const user = restaurantContext.userConnected;
  const isEmployee = user?.role === "employee";

  let employeeHasTakeAwayAccess = true; 

  if (isEmployee && restaurant) {
    const employeeInRestaurant = restaurant.employees?.find(
      (emp) => String(emp._id) === String(user.id)
    );

    const profile = employeeInRestaurant?.restaurantProfiles?.find(
      (p) => String(p.restaurant) === String(restaurant._id)
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

          <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
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
                emptyText="Vous n'avez pas accès à cette section"
              />
            ) : (
              <p>Vente à emporter</p>
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
      ...(await serverSideTranslations(locale, ["common", "take-away"])),
    },
  };
}
