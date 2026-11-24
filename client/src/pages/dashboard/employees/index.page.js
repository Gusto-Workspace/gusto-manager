import { useContext } from "react";
import Head from "next/head";

// I18N
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";
import { canManagePersonnel } from "@/components/dashboard/employees/employee-directory.utils.mjs";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import ListEmployeesComponent from "@/components/dashboard/employees/list.employees.component";

export default function EmployeesPage() {
  const { restaurantContext } = useContext(GlobalContext);

  if (!restaurantContext.isAuth) return null;

  const restaurant = restaurantContext.restaurantData;
  const restaurantOptions = restaurant?.options || {};
  const hasEmployeesModule = !!restaurantOptions.employees;

  const canManage = canManagePersonnel(restaurant, restaurantContext.userConnected);

  return (
    <>
      <Head>
        <title>Gusto Manager</title>
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <main className="tablet:ml-[88px] bg-lightGrey text-darkBlue min-w-0 flex-1 p-3 mobile:p-6 flex flex-col gap-6 min-h-screen">
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
            ) : !canManage || restaurantContext.dataLoading ? (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
              />
            ) : (
              <ListEmployeesComponent key={restaurant._id} />
            )}
          </main>
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "employees"])),
    },
  };
}
