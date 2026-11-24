import { useContext } from "react";
import { useRouter } from "next/router";
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
import DetailsEmployeesComponent from "@/components/dashboard/employees/details.employees.component";

export default function EmployeeDetailsPage() {
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { employeeId } = router.query;

  if (!restaurantContext.isAuth || !employeeId) return null;

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

            {!restaurantContext.dataLoading &&
            canManagePersonnel(restaurantContext.restaurantData, restaurantContext.userConnected) ? (
              <DetailsEmployeesComponent
                key={`${restaurantContext.restaurantData._id}:${employeeId}`}
                employeeId={employeeId}
              />
            ) : (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
              />
            )}
          </main>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "employees"])),
    },
  };
}
