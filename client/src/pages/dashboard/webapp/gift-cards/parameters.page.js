import { useContext } from "react";
import Head from "next/head";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GlobalContext } from "@/contexts/global.context";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import NotGoodDeviceWebAppComponent from "@/components/dashboard/webapp/_shared/not-good-device.webapp";
import SplashScreenWebAppComponent from "@/components/dashboard/webapp/_shared/splashscreen.webapp";
import ParametersGiftCardsWebapp from "@/components/dashboard/webapp/gift-cards/parameters.gift-cards.component";

export default function GiftCardsParametersPage() {
  const { restaurantContext } = useContext(GlobalContext);

  if (!restaurantContext.isAuth) return null;

  const restaurant = restaurantContext.restaurantData;
  const restaurantOptions = restaurant?.options || {};
  const hasGiftCardModule = !!restaurantOptions.gift_card;

  const user = restaurantContext.userConnected;
  const isEmployee = user?.role === "employee";

  let employeeHasGiftCardAccess = true;

  if (isEmployee && restaurant) {
    const employeeInRestaurant = restaurant.employees?.find(
      (emp) => String(emp._id) === String(user.id),
    );

    const profile = employeeInRestaurant?.restaurantProfiles?.find(
      (p) => String(p.restaurant) === String(restaurant._id),
    );

    employeeHasGiftCardAccess = profile?.options?.gift_card === true;
  }

  return (
    <>
      <Head>
        <title>Gusto Manager</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
      </Head>

      <div className="block midTablet:hidden">
        <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 h-[100dvh] overflow-y-auto overscroll-none hide-scrollbar">
          {!hasGiftCardModule ? (
            <NoAvailableComponent
              dataLoading={restaurantContext.dataLoading}
              emptyText="Vous n'avez pas souscrit à cette option"
            />
          ) : !employeeHasGiftCardAccess ? (
            <NoAvailableComponent dataLoading={restaurantContext.dataLoading} />
          ) : (
            <ParametersGiftCardsWebapp />
          )}
        </div>
      </div>

      <NotGoodDeviceWebAppComponent />

      <SplashScreenWebAppComponent
        loading={restaurantContext.dataLoading}
        storageKey="gm:splash:webapp:giftcards"
        enabled={restaurantContext?.isAuth}
        lastActiveKey="gm:lastActive:webapp:giftcards"
        thresholdMs={5 * 60 * 1000}
        onSoftReturn={() =>
          restaurantContext.resyncAfterForeground?.({ hard: false })
        }
        onHardReturn={() =>
          restaurantContext.resyncAfterForeground?.({ hard: true })
        }
      />
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "gifts"])),
    },
  };
}
