import { useContext } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import HoursRestaurantComponent from "@/components/restaurant/hours.restaurant.component";
import ContactRestaurantComponent from "@/components/restaurant/contact.restaurant.component";
import { RestaurantSvg } from "@/components/_shared/_svgs/restaurant.svg";

export default function RestaurantPage(props) {
  const { t } = useTranslation("");
  const { restaurantContext } = useContext(GlobalContext);

  function handleUpdateData(updatedRestaurant) {
    restaurantContext.setRestaurantData(updatedRestaurant);
  }

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

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <div className="bg-lightGrey text-darkBlue overflow-y-auto flex-1 p-6 h-screen flex flex-col gap-6">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <hr className="opacity-20" />
            <div className="pl-2 flex gap-2 items-center">
              <RestaurantSvg width={30} height={30} fillColor="#131E3690" />
              <h1 className="pl-2 py-1 text-2xl">{t("restaurant:title")}</h1>
            </div>

            <div className="flex gap-6">
              <HoursRestaurantComponent
                openingHours={restaurantContext.restaurantData?.opening_hours}
                restaurantId={restaurantContext.restaurantData?._id}
                dataLoading={restaurantContext.dataLoading}
                closeEditing={restaurantContext.closeEditing}
                handleUpdateData={handleUpdateData}
              />

              <ContactRestaurantComponent
                restaurantData={restaurantContext.restaurantData}
                restaurantId={restaurantContext.restaurantData?._id}
                handleUpdateData={handleUpdateData}
                dataLoading={restaurantContext.dataLoading}
                closeEditing={restaurantContext.closeEditing}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "restaurant"])),
    },
  };
}
