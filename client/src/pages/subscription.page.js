import { useContext, useEffect, useState } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// AXIOS
import axios from "axios";

// SVG
import { InvoiceSvg } from "@/components/_shared/_svgs/_index";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import SubscriptionInfoComponent from "@/components/dashboard/subscription-info.dashboard.component";
import InvoicesListComponent from "@/components/dashboard/invoices-list.dashboard.component";

export default function SubscriptionPage(props) {
  const { t } = useTranslation("");
  const { restaurantContext } = useContext(GlobalContext);
  const [isLoading, setIsLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState({});

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

  function fetchSubscriptionData(restaurantId) {
    const token = localStorage.getItem("token");
    setIsLoading(true);
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/owner/restaurant-subscription`, {
        params: { restaurantId },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((response) => {
        setSubscriptionData(response.data.subscription);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error(
          "Erreur lors de la récupération de l'abonnement :",
          error
        );
        setIsLoading(false);
      });
  }

  useEffect(() => {
    if (restaurantContext.isAuth && restaurantContext.restaurantData) {
      fetchSubscriptionData(restaurantContext.restaurantData._id);
    }
  }, [restaurantContext.restaurantData]);

  if (!restaurantContext.isAuth) return null;

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

           <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 p-6 flex flex-col gap-6 min-h-screen">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <hr className="opacity-20" />

            <div className="flex gap-2 items-center">
              <InvoiceSvg width={30} height={30} fillColor="#131E3690" />

              <h1 className="pl-2 text-2xl">{t("subscription:titles.main")}</h1>
            </div>

            <SubscriptionInfoComponent
              subscriptionData={subscriptionData}
              isLoading={isLoading}
            />

            <div className="flex gap-2 items-center mt-6">
              <InvoiceSvg width={30} height={30} fillColor="#131E3690" />

              <h1 className="pl-2 text-2xl">
                {t("subscription:titles.second")}
              </h1>
            </div>

            <InvoicesListComponent
              subscriptionData={subscriptionData}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "subscription"])),
    },
  };
}
