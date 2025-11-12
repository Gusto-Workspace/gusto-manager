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
import AddDishesComponent from "@/components/dashboard/dishes/add.dishes.component";
import axios from "axios";

export default function AddDishPage(props) {
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

           <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <AddDishesComponent category={props.category} dish={props.dish} />
          </div>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ params, query, locale }) {
  const categoryId = params.categoryId.split("-").pop();
  const { dishId } = query;

  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/categories/${categoryId}/dishes`
    );
    const { category } = response.data;

    let dish = null;
    if (dishId) {
      dish = category.dishes.find((d) => d._id === dishId) || null;
    }

    return {
      props: {
        category,
        dish,
        ...(await serverSideTranslations(locale, ["common", "dishes"])),
      },
    };
  } catch (error) {
    console.error("Error fetching category or dish data:", error);
    return {
      props: {
        category: null,
        dish: null,
        ...(await serverSideTranslations(locale, ["common", "dishes"])),
      },
    };
  }
}
