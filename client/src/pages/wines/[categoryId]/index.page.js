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
import ListWinesComponent from "@/components/wines/list.wines.component";

export default function CategorieWinesPage(props) {
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

          <div className="bg-lightGrey text-darkBlue overflow-y-auto flex-1 p-6 h-screen flex flex-col gap-6">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <ListWinesComponent category={props.category} />
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
      `${process.env.NEXT_PUBLIC_API_URL}/categories/${actualCategoryId}/wines`
    );
    const { category } = response.data;

    return {
      props: {
        category,
        ...(await serverSideTranslations(locale, ["common", "wines"])),
      },
    };
  } catch (error) {
    console.error("Error fetching category data:", error);
    return {
      props: {
        category: null,
        ...(await serverSideTranslations(locale, ["common", "wines"])),
      },
    };
  }
}
