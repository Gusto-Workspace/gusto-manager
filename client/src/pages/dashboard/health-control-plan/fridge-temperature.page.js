import { useContext, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { i18n, useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

import { GlobalContext } from "@/contexts/global.context";
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import { HealthSvg } from "@/components/_shared/_svgs/health.svg";

import FridgeTemperatureForm from "@/components/dashboard/health-control-plan/fridge-temperature/form.component";
import FridgeTemperatureList from "@/components/dashboard/health-control-plan/fridge-temperature/list.component";
import FridgeManagerModal from "@/components/dashboard/health-control-plan/fridge-temperature/fridge-manager-modale.component";

export default function FridgeTemperaturePage() {
  const { t } = useTranslation("");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);

  const [isFridgeModalOpen, setIsFridgeModalOpen] = useState(false);
  const [fridgesVersion, setFridgesVersion] = useState(0); // pour refetch fridges après CRUD

  let title = "Gusto Manager";
  let description = "";

  if (!restaurantContext.isAuth) return null;

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

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
              <hr className="opacity-20" />
              <div className="flex justify-between gap-4">
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
                      <span>T° enceintes frigorifiques</span>
                    </>
                  </h1>
                </div>
                <button
                  onClick={() => setIsFridgeModalOpen(true)}
                  className="bg-blue px-6 py-2 rounded-lg text-white h-fit"
                >
                  Liste des enceintes
                </button>
              </div>

              <div className="flex flex-col gap-6">
                <FridgeTemperatureForm
                  restaurantId={restaurantContext.restaurantData?._id}
                  fridgesVersion={fridgesVersion}
                  onCreated={(doc) => {
                    window.dispatchEvent(
                      new CustomEvent("fridge-temperature:upsert", {
                        detail: { doc },
                      })
                    );
                  }}
                />

                <FridgeTemperatureList
                  restaurantId={restaurantContext.restaurantData?._id}
                  fridgesVersion={fridgesVersion}
                />
              </div>
            </section>
          ) : (
            <NoAvailableComponent dataLoading={restaurantContext.dataLoading} />
          )}
        </div>
      </div>

      {isFridgeModalOpen && (
        <FridgeManagerModal
          restaurantId={restaurantContext.restaurantData?._id}
          onClose={() => setIsFridgeModalOpen(false)}
          onChanged={() => setFridgesVersion((v) => v + 1)}
        />
      )}
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
