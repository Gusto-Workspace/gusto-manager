import { useContext } from "react";
import Head from "next/head";
import axios from "axios";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import ListDrinksComponent from "@/components/drinks/list.drinks.component";

export default function CategoriesDrinksPage(props) {
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
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

           <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 p-6 flex flex-col gap-6 min-h-screen">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />
            <ListDrinksComponent category={props.category} />
          </div>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ params, locale }) {
  const { categoryId } = params;

  const actualCategoryId = categoryId.split("-").pop();

  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/categories/${actualCategoryId}/drinks`
    );
    const { category } = response.data;

    return {
      props: {
        category,
        ...(await serverSideTranslations(locale, ["common", "drinks"])),
      },
    };
  } catch (error) {
    console.error("Error fetching category data:", error);
    return {
      props: {
        category: null,
        ...(await serverSideTranslations(locale, ["common", "drinks"])),
      },
    };
  }
}
