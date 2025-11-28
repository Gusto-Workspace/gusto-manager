import { useContext } from "react";
import Head from "next/head";

// I18N
import { i18n, useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import DashboardHealthControlPlanComponent from "@/components/dashboard/health-control-plan/dashboard.health-control-plan.component";

export default function HealthControlPlanPage(props) {
  const { t } = useTranslation("");
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
  const hasHealthControlPlanModule = !!restaurantOptions.health_control_plan;

  const user = restaurantContext.userConnected;
  const isEmployee = user?.role === "employee";

  let employeeHasHealthControlPlanAccess = true;

  if (isEmployee && restaurant) {
    const employeeInRestaurant = restaurant.employees?.find(
      (emp) => String(emp._id) === String(user.id)
    );

    const profile = employeeInRestaurant?.restaurantProfiles?.find(
      (p) => String(p.restaurant) === String(restaurant._id)
    );

    employeeHasHealthControlPlanAccess =
      profile?.options?.health_control_plan === true;
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

            {!hasHealthControlPlanModule ? (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
                emptyText="Vous n'avez pas souscrit à cette option"
              />
            ) : !employeeHasHealthControlPlanAccess ? (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
                emptyText="Vous n'avez pas accès à cette section"
              />
            ) : (
              <DashboardHealthControlPlanComponent />
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
        "health-control-plan",
      ])),
    },
  };
}
