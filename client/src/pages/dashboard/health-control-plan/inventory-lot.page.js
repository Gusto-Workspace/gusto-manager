import { useContext, useState } from "react";
import { useRouter } from "next/router";
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
import InventoryLotForm from "@/components/dashboard/health-control-plan/inventory-lot/form.component";
import InventoryLotList from "@/components/dashboard/health-control-plan/inventory-lot/list.component";

// SVG
import { HealthSvg } from "@/components/_shared/_svgs/health.svg";

export default function InventoryLotPage(props) {
  const { t } = useTranslation("");
  const router = useRouter();
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

          <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            {restaurantContext?.restaurantData?.options?.health_control_plan ? (
              <section className="flex flex-col gap-6">
                <hr className="opacity-20" />

                <div className="flex justify-between  gap-4">
                  <div className="flex items-center gap-2 min-h-[40px]">
                    <HealthSvg width={30} height={30} fillColor="#131E3690" />

                    <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
                      <span
                        className="cursor-pointer hover:underline"
                        onClick={() =>
                          router.push("/dashboard/health-control-plan")
                        }
                      >
                        {t("health-control-plan:titles.main")}
                      </span>

                      <>
                        <span>/</span>
                        <span>Traçabilité étiquettes</span>
                      </>
                    </h1>
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  <InventoryLotForm
                    restaurantId={restaurantContext.restaurantData?._id}
                    initial={editing}
                    onSuccess={(doc) => {
                      setEditing(null);
                      window.dispatchEvent(
                        new CustomEvent("inventory-lot:upsert", {
                          detail: { doc },
                        })
                      );
                    }}
                    onCancel={() => setEditing(null)}
                  />

                  <InventoryLotList
                    restaurantId={restaurantContext.restaurantData?._id}
                    onEdit={(doc) => setEditing(doc)}
                    editingId={editing?._id || null}
                    onDeleted={(doc) => {
                      if (editing?._id && doc?._id === editing._id) {
                        setEditing(null);
                      }
                    }}
                  />
                </div>
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
