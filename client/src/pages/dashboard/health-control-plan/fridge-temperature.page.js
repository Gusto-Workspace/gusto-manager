import { useContext, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import axios from "axios";

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

  // --- Fridges: source de vérité locale de la page ---
  const [fridges, setFridges] = useState([]);
  const [fridgesLoading, setFridgesLoading] = useState(false);

  const restaurantId = restaurantContext?.restaurantData?._id;
  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

    useEffect(() => {
    if (isFridgeModalOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }

    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [isFridgeModalOpen]);

  // Fetch unique à l’ouverture de la page
  useEffect(() => {
    const fetchFridges = async () => {
      if (!restaurantId) return;
      setFridgesLoading(true);
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridges`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { active: 1 }, // n’affiche que les actives dans les tableaux
        });
        const items = (data?.items || []).sort((a, b) =>
          String(a.name).localeCompare(String(b.name), "fr")
        );
        setFridges(items);
      } finally {
        setFridgesLoading(false);
      }
    };
    fetchFridges();
  }, [restaurantId, token]);

  // Callback passé à la modale : upsert/suppressions locales (déjà faites en BDD par la modale)
  const handleFridgesChanged = (nextList) => {
    // nextList est déjà triée dans la modale ; on peut re-trier pour sûreté :
    const sorted = [...(nextList || [])].sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "fr")
    );
    setFridges(sorted);
  };

  let title = "Gusto Manager";
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
              <div className="flex justify-between flex-wrap gap-4">
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
                  className="bg-blue px-6 py-2 rounded-lg text-white h-fit disabled:opacity-60"
                  disabled={fridgesLoading}
                  title={fridgesLoading ? "Chargement des enceintes…" : ""}
                >
                  Liste des enceintes
                </button>
              </div>

              <div className="flex flex-col gap-6">
                <FridgeTemperatureForm
                  restaurantId={restaurantId}
                  fridges={fridges} // ← injecté
                  onCreated={(doc) => {
                    // on conserve l’event bus pour la List
                    window.dispatchEvent(
                      new CustomEvent("fridge-temperature:upsert", {
                        detail: { doc },
                      })
                    );
                  }}
                />

                <FridgeTemperatureList
                  restaurantId={restaurantId}
                  fridges={fridges} // ← injecté
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
          restaurantId={restaurantId}
          initialFridges={fridges}
          onChanged={handleFridgesChanged}
          onClose={() => setIsFridgeModalOpen(false)}
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
