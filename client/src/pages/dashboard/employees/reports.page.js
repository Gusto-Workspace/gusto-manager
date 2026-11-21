import { useContext } from "react";
import Head from "next/head";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GlobalContext } from "@/contexts/global.context";
import { canManagePersonnel } from "@/components/dashboard/employees/employee-directory.utils.mjs";
import PersonnelReport from "@/components/dashboard/employees/personnel-report.employees.component";
import Nav from "@/components/_shared/nav/nav.component";
import Settings from "@/components/_shared/settings/settings.component";
import NoAvailable from "@/components/_shared/options/no-available.options.component";

export default function ReportsPage() {
  const { restaurantContext: context } = useContext(GlobalContext);
  if (!context.isAuth) return null;
  const restaurant = context.restaurantData;
  const canManage = !context.dataLoading && canManagePersonnel(restaurant, context.userConnected);
  return (
    <>
      <Head><title>Rapport RH | Gusto Manager</title></Head>
      <div className="flex">
        <Nav />
        <main className="tablet:ml-[88px] bg-lightGrey text-darkBlue min-w-0 flex-1 p-3 mobile:p-6 flex flex-col gap-6 min-h-screen">
          <Settings dataLoading={context.dataLoading} setDataLoading={context.setDataLoading}
            closeEditing={context.closeEditing} setRestaurantData={context.setRestaurantData} restaurantData={restaurant} />
          {canManage ? <PersonnelReport key={restaurant._id} restaurantId={restaurant._id} /> :
            <NoAvailable dataLoading={context.dataLoading} />}
        </main>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ["common", "employees"])) } };
}
