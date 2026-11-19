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
import DaysOffEmployeesComponent from "@/components/dashboard/employees/days-off.employees.component";

export default function EmployeesDaysOffPage() {
  const { restaurantContext } = useContext(GlobalContext);

  if (!restaurantContext.isAuth) return null;

  return (
    <>
      <Head>
        <title>Gusto Manager</title>
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <main className="min-h-screen min-w-0 flex-1 bg-lightGrey p-3 text-darkBlue mobile:p-6 tablet:ml-[88px]">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <div className="mt-5 border-t border-darkBlue/10 pt-4">
            {!restaurantContext.dataLoading &&
            canManagePersonnel(restaurantContext.restaurantData, restaurantContext.userConnected) ? (
              <DaysOffEmployeesComponent key={restaurantContext.restaurantData._id} />
            ) : (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
              />
            )}
            </div>
          </main>
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
