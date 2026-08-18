import { useContext } from "react";
import Head from "next/head";
import axios from "axios";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

import { GlobalContext } from "@/contexts/global.context";
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import AddDishesComponent from "@/components/dashboard/dishes/add.dishes.component";

export default function AddDishToSubCategoryPage(props) {
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
          <AddDishesComponent
            category={props.category}
            subCategory={props.subCategory}
            dish={props.dish}
          />
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ params, query, locale }) {
  const categoryId = params.categoryId.split("-").pop();
  const subCategoryId = params.subCategoryId.split("-").pop();

  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/categories/${categoryId}/subcategories/${subCategoryId}/dishes`,
    );
    const { category, subCategory } = response.data;
    const dish = query.dishId
      ? subCategory.dishes.find(
          (candidate) => candidate._id === query.dishId,
        ) || null
      : null;

    return {
      props: {
        category,
        subCategory,
        dish,
        ...(await serverSideTranslations(locale, ["common", "dishes"])),
      },
    };
  } catch (error) {
    console.error("Error fetching dish subcategory data:", error);
    return {
      props: {
        category: null,
        subCategory: null,
        dish: null,
        ...(await serverSideTranslations(locale, ["common", "dishes"])),
      },
    };
  }
}
