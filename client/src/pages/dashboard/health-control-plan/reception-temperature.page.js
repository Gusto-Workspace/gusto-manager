import { useContext, useState } from "react";
import Head from "next/head";

// I18N
import { i18n, useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import ReceptionTemperatureForm from "@/components/dashboard/health-control-plan/reception-temperature/form.component";
import ReceptionTemperatureList from "@/components/dashboard/health-control-plan/reception-temperature/list.component";

export default function ReceptionTemperaturePage(props) {
  const { t } = useTranslation("");
  const { restaurantContext } = useContext(GlobalContext);

  const [editing, setEditing] = useState(null);

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

            {restaurantContext?.restaurantData?.options?.health_control_plan ? (
              <section className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    Contrôle T° réception
                  </h2>
                </div>

                <ReceptionTemperatureForm
                  restaurantId={restaurantContext.restaurantData?._id}
                  initial={editing}
                  onSuccess={() => {
                    setEditing(null);
                    // astuce: on va déclencher un custom event pour refresh la liste
                    window.dispatchEvent(
                      new CustomEvent("refresh-temp-reception")
                    );
                  }}
                />

                <ReceptionTemperatureList
                  restaurantId={restaurantContext.restaurantData?._id}
                  onEdit={(doc) => setEditing(doc)}
                />
              </section>
            ) : (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, [
        "common",
        "health-control-plan",
      ])),
    },
  };
}
