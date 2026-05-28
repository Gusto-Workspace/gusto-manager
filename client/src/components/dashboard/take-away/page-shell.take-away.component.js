import { useContext } from "react";
import Head from "next/head";

import { GlobalContext } from "@/contexts/global.context";
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";

export default function TakeAwayPageShell({ children }) {
  const { restaurantContext } = useContext(GlobalContext);

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
        <title>Gusto Manager</title>
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <div className="tablet:ml-[270px] flex min-h-screen flex-1 flex-col gap-6 bg-lightGrey p-6 px-2 text-darkBlue mobile:px-6">
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
              children
            )}
          </div>
        </div>
      </div>
    </>
  );
}
