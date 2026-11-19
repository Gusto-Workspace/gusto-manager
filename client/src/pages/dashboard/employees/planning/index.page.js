import { useContext } from "react";
import Head from "next/head";

import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import PlanningEmployeesComponent from "@/components/dashboard/employees/planning.employees.component";

export default function PlanningEmployeePage() {
  const { restaurantContext } = useContext(GlobalContext);

  if (!restaurantContext.isAuth) return null;

  const restaurant = restaurantContext.restaurantData;
  const restaurantOptions = restaurant?.options || {};
  const hasEmployeesModule = !!restaurantOptions.employees;

  const user = restaurantContext.userConnected;
  const isEmployee = user?.role === "employee";

  let employeeHasEmployeesAccess = true;

  if (isEmployee && restaurant) {
    const employeeInRestaurant = restaurant.employees?.find(
      (emp) => String(emp._id) === String(user.id),
    );

    const profile = employeeInRestaurant?.restaurantProfiles?.find(
      (p) => String(p.restaurant) === String(restaurant._id),
    );

    employeeHasEmployeesAccess = profile?.options?.employees === true;
  }

  return (
    <>
      <Head>
        <title>Gusto Manager</title>
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <div className="tablet:ml-[88px] bg-lightGrey text-darkBlue flex-1 px-2 py-2 tablet:px-4 flex flex-col gap-2 min-h-screen min-w-0">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            {!hasEmployeesModule ? (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
                emptyText="Vous n'avez pas souscrit à cette option"
              />
            ) : !employeeHasEmployeesAccess || user?.role === "accountant" ? (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
              />
            ) : (
              <PlanningEmployeesComponent key={restaurant._id} />
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
      ...(await serverSideTranslations(locale, ["common", "employees", "planning"])),
    },
  };
}
