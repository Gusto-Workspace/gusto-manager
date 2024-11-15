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
import AddMenusComponent from "@/components/menus/add.menus.component";
import axios from "axios";

export default function AddMenuPage(props) {
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

  return (
    <>
      <Head>
        <title>{title}</title>

        {/* <>
          {description && <meta name="description" content={description} />}
          {title && <meta property="og:title" content={title} />}
          {description && (
            <meta property="og:description" content={description} />
          )}
          <meta
            property="og:url"
            content="https://lespetitsbilingues-newham.com/"
          />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="/img/open-graph.jpg" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
        </> */}
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <div className="ml-[250px] bg-lightGrey text-darkBlue flex-1 p-6 flex flex-col gap-6 min-h-screen">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <AddMenusComponent
              menu={props.menu}
              selectedDishes={props.selectedDishes}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ query, locale }) {
  const { menuId } = query;

  if (!menuId) {
    return {
      props: {
        menu: null,
        selectedDishes: null,
        ...(await serverSideTranslations(locale, [
          "common",
          "dishes",
          "menus",
        ])),
      },
    };
  }

  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/menus/${menuId}`
    );

    const { menu, selectedDishes } = response.data;

    return {
      props: {
        menu,
        selectedDishes,
        ...(await serverSideTranslations(locale, [
          "common",
          "dishes",
          "menus",
        ])),
      },
    };
  } catch (error) {
    console.error("Error fetching menu or dish data:", error);
    return {
      props: {
        menu: null,
        selectedDishes: null,
        ...(await serverSideTranslations(locale, [
          "common",
          "dishes",
          "menus",
        ])),
      },
    };
  }
}
