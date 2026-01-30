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
import WebAppListGiftCardsComponent from "@/components/dashboard/webapp/gift-cards/list.gift-cards.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import SplashScreenWebAppComponent from "@/components/dashboard/webapp/_shared/splashscreen.webapp.component";
import NotGoodDeviceWebAppComponent from "@/components/dashboard/webapp/_shared/not-good-device.webapp.component";

export default function GiftsPage(props) {
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
        <title>{title}</title>

        {/* Empeche le zoom / dezoom */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />

        {/* iOS: raccourci écran d'accueil */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Cartes cadeaux" />

        {/* Icône iOS dédiée au module */}
        <link rel="apple-touch-icon" href="/icons/ios/gift-cards-180.png?v=1" />

        <meta name="format-detection" content="telephone=no" />
      </Head>

      <div className="block mobile:hidden">
        <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
          {!hasGiftCardModule ? (
            <NoAvailableComponent
              dataLoading={restaurantContext.dataLoading}
              emptyText="Vous n'avez pas souscrit à cette option"
            />
          ) : !employeeHasGiftCardAccess ? (
            <NoAvailableComponent
              dataLoading={restaurantContext.dataLoading}
              emptyText="Vous n'avez pas accès à cette section"
            />
          ) : (
            <WebAppListGiftCardsComponent
              restaurantName={restaurantContext?.restaurantData?.name}
            />
          )}
        </div>
      </div>

      <NotGoodDeviceWebAppComponent />

      <SplashScreenWebAppComponent
        loading={restaurantContext.dataLoading}
        storageKey="gm:splash:webapp:giftcards"
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
