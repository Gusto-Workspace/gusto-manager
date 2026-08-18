import { useContext } from "react";
import Head from "next/head";
import axios from "axios";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

import { GlobalContext } from "@/contexts/global.context";
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import ListDishesComponent from "@/components/dashboard/dishes/list.dishes.component";

export default function SubCategoryDishesPage(props) {
  const { restaurantContext } = useContext(GlobalContext);

  return (
    <>
      <Head>
        <title>Gusto Manager</title>
      </Head>
      <div className="flex">
        <NavComponent />
        <div className="tablet:ml-[88px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
          <SettingsComponent
            dataLoading={restaurantContext.dataLoading}
            setDataLoading={restaurantContext.setDataLoading}
            closeEditing={restaurantContext.closeEditing}
            setRestaurantData={restaurantContext.setRestaurantData}
            restaurantData={restaurantContext.restaurantData}
          />
          <ListDishesComponent
            category={props.category}
            subCategory={props.subCategory}
          />
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ params, locale }) {
  const categoryId = params.categoryId.split("-").pop();
  const subCategoryId = params.subCategoryId.split("-").pop();

  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/categories/${categoryId}/subcategories/${subCategoryId}/dishes`,
    );
    const { category, subCategory } = response.data;

    return {
      props: {
        category,
        subCategory,
        ...(await serverSideTranslations(locale, ["common", "dishes"])),
      },
    };
  } catch (error) {
    console.error("Error fetching dish subcategory data:", error);
    return {
      props: {
        category: null,
        subCategory: null,
        ...(await serverSideTranslations(locale, ["common", "dishes"])),
      },
    };
  }
}
