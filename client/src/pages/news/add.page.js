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
import AddNewsComponent from "@/components/news/add.news.component";
import axios from "axios";

export default function AddNewsPage(props) {
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

            <AddNewsComponent news={props.news} />
          </div>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ query, locale }) {
  const { newsId } = query;

  try {
    let news = null;

    if (newsId) {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/news/${newsId}`
      );
      news = response.data.news;
    }

    return {
      props: {
        news,
        ...(await serverSideTranslations(locale, ["common", "news"])),
      },
    };
  } catch (error) {
    console.error("Error fetching news data:", error);
    return {
      props: {
        news: null,
        ...(await serverSideTranslations(locale, ["common", "news"])),
      },
    };
  }
}
