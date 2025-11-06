import { useContext, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import axios from "axios";

// I18N
import { i18n, useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";

// SVG
import { HealthSvg } from "@/components/_shared/_svgs/health.svg";

// COMPONENTS
import PostheatTemperatureForm from "@/components/dashboard/health-control-plan/postheat-temperature/form.component";
import PostheatTemperatureList from "@/components/dashboard/health-control-plan/postheat-temperature/list.component";
import CookingEquipmentManagerModal from "@/components/dashboard/health-control-plan/cooking-manager-modale.component"

export default function PostHeatTemperaturePage(props) {
  const { t } = useTranslation("");
  const router = useRouter();

  const { restaurantContext } = useContext(GlobalContext);

  const [editing, setEditing] = useState(null);

  // --- Appareils (même logique que la page preheat)
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : ""), []);
  const restaurantId = restaurantContext?.restaurantData?._id;

  const [equipments, setEquipments] = useState([]);
  const [equipmentsLoading, setEquipmentsLoading] = useState(false);
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);

  useEffect(() => {
    const fetchEquipments = async () => {
      if (!restaurantId) return;
      setEquipmentsLoading(true);
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cooking-equipments`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { active: 1 },
        });
        const items = (data?.items || []).sort((a, b) =>
          String(a.name).localeCompare(String(b.name), "fr")
        );
        setEquipments(items);
      } finally {
        setEquipmentsLoading(false);
      }
    };
    fetchEquipments();
  }, [restaurantId, token]);

  const handleEquipmentsChanged = (next) => {
    const sorted = [...(next || [])].sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "fr")
    );
    setEquipments(sorted);
  };

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
                        <span>T° sortie de chauffe</span>
                      </>
                    </h1>
                  </div>

                  {/* Bouton pour ouvrir la modale des appareils (même UX que preheat) */}
                  <button
                    onClick={() => setIsEquipmentModalOpen(true)}
                    className="bg-blue px-6 py-2 rounded-lg text-white h-fit"
                    disabled={equipmentsLoading}
                    title={equipmentsLoading ? "Chargement des appareils…" : ""}
                  >
                    Liste des appareils
                  </button>
                </div>

                <div className="flex flex-col gap-6">
                  <PostheatTemperatureForm
                    restaurantId={restaurantId}
                    initial={editing}
                    equipments={equipments} 
                    onSuccess={(doc) => {
                      setEditing(null);
                      window.dispatchEvent(
                        new CustomEvent("postheat-temperature:upsert", {
                          detail: { doc },
                        })
                      );
                    }}
                    onCancel={() => setEditing(null)}
                  />

                  <PostheatTemperatureList
                    restaurantId={restaurantId}
                    onEdit={(doc) => setEditing(doc)}
                    editingId={editing?._id || null}
                    onDeleted={(doc) => {
                      if (editing?._id && doc?._id === editing._id)
                        setEditing(null);
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

      {/* Modale réutilisée (identique à preheat) */}
      {isEquipmentModalOpen ? (
        <CookingEquipmentManagerModal
          restaurantId={restaurantId}
          initialEquipments={equipments}
          onChanged={handleEquipmentsChanged}
          onClose={() => setIsEquipmentModalOpen(false)}
        />
      ) : null}
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
