import { useContext } from "react";
import Head from "next/head";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GlobalContext } from "@/contexts/global.context";
import Nav from "@/components/_shared/nav/nav.component";
import Settings from "@/components/_shared/settings/settings.component";
import NoAvailable from "@/components/_shared/options/no-available.options.component";
import TimeClockRegister from "@/components/dashboard/time-clock/register.time-clock.component";

export default function TimeClockPage() {
  const { restaurantContext: context } = useContext(GlobalContext);
  if (!context.isAuth) return null;

  const restaurant = context.restaurantData;
  const user = context.userConnected;
  const employee = restaurant?.employees?.find((item) => String(item._id) === String(user?.id));
  const profile = employee?.restaurantProfiles?.find((item) => String(item.restaurant) === String(restaurant._id));
  const canManage = restaurant?.options?.employees && (
    user?.role === "owner" || (user?.role === "employee" && profile?.options?.employees === true)
  );

  return (
    <>
      <Head><title>Pointeuse | Gusto Manager</title></Head>
      <div className="flex">
        <Nav />
        <main className="min-h-screen min-w-0 flex-1 bg-lightGrey p-2 text-darkBlue tablet:ml-[88px] tablet:px-4">
          <Settings
            dataLoading={context.dataLoading}
            setDataLoading={context.setDataLoading}
            closeEditing={context.closeEditing}
            setRestaurantData={context.setRestaurantData}
            restaurantData={restaurant}
          />
          {canManage ? <TimeClockRegister key={restaurant._id} restaurantId={restaurant._id} employees={restaurant.employees} />
            : <NoAvailable dataLoading={context.dataLoading} />}
        </main>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ["common", "employees"])) } };
}
