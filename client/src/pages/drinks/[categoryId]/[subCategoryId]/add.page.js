import { useContext } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// AXIOS
import axios from "axios";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import AddDrinksComponent from "@/components/drinks/add.drinks.component";

export default function AddDrinkPage(props) {
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

           <div className="ml-[270px] bg-lightGrey text-darkBlue flex-1 p-6 flex flex-col gap-6 min-h-screen">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <AddDrinksComponent
              subCategory={props.subCategory}
              category={props.category}
              drink={props.drink}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ params, query, locale }) {
  const categoryId = params.categoryId.split("-").pop();
  const subCategoryId = params.subCategoryId?.split("-").pop();

  const { drinkId } = query;

  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/categories/${categoryId}/subcategories/${subCategoryId}/drinks`
    );
    const { category, subCategory } = response.data;

    let drink = null;
    if (drinkId) {
      drink = subCategory.drinks.find((d) => d._id === drinkId) || null;
    }

    return {
      props: {
        category,
        subCategory,
        drink,
        ...(await serverSideTranslations(locale, ["common", "drinks"])),
      },
    };
  } catch (error) {
    console.error("Error fetching category or drink data:", error);
    return {
      props: {
        category: null,
        dish: null,
        ...(await serverSideTranslations(locale, ["common", "drinks"])),
      },
    };
  }
}
