import { useContext, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import { SettingsSvg } from "@/components/_shared/_svgs/settings.svg";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import GeneralFormSettingsComponent from "@/components/settings/general-form.settings.component";
import PasswordFormSettingsComponent from "@/components/settings/password-form.settings.component";

export default function SettingsPage(props) {
  const { t } = useTranslation("");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const [ownerData, setOwnerData] = useState(null);

  function fetchOwnerData() {
    const token = localStorage.getItem("token");
    if (!token) return router.push("/dashboard/login");

    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/owner/get-data`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        setOwnerData(response.data.owner);
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error(
          "Erreur lors de la récupération des informations :",
          error
        );
        router.push("/dashboard/login");
      });
  }

  useEffect(() => {
    fetchOwnerData();
  }, []);

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

            <div className="flex justify-between">
              <div className="flex gap-2 items-center">
                <SettingsSvg width={30} height={30} strokeColor="#131E3690" />

                <h1 className="pl-2 text-2xl">{t("settings:titles.main")}</h1>
              </div>
            </div>

            <GeneralFormSettingsComponent
              ownerData={ownerData}
              fetchOwnerData={fetchOwnerData}
            />
            <PasswordFormSettingsComponent />
          </div>
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "settings"])),
    },
  };
}
