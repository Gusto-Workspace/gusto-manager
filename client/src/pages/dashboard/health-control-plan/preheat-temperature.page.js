// pages/dashboard/health-control-plan/preheat-temperature.page.jsx
import { useContext, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import axios from "axios";
import { List } from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import { HealthSvg } from "@/components/_shared/_svgs/health.svg";

import PreheatTemperatureForm from "@/components/dashboard/health-control-plan/preheat-temperature/form.component";
import PreheatTemperatureList from "@/components/dashboard/health-control-plan/preheat-temperature/list.component";
import CookingEquipmentManagerModal from "@/components/dashboard/health-control-plan/cooking-manager-modale.component";

export default function PreheatTemperaturePage(props) {
  const { t } = useTranslation("");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);

  const [editing, setEditing] = useState(null);

  // --- Equipements: source locale ---
  const [equipments, setEquipments] = useState([]);
  const [equipmentsLoading, setEquipmentsLoading] = useState(false);
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);

  const restaurantId = restaurantContext?.restaurantData?._id;
  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  useEffect(() => {
    if (isEquipmentModalOpen) document.body.classList.add("overflow-hidden");
    else document.body.classList.remove("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [isEquipmentModalOpen]);

  // Fetch au mount
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

  if (!restaurantContext.isAuth) return null;

  return (
    <>
      <Head>
        <title>Gusto Manager</title>
      </Head>

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
                      <span>T° mise en chauffe</span>
                    </>
                  </h1>
                </div>

                <button
                  onClick={() => setIsEquipmentModalOpen(true)}
                  className="bg-blue px-4 py-2 rounded-lg text-white h-fit disabled:opacity-60 inline-flex items-center gap-2"
                  disabled={equipmentsLoading}
                  title={
                    equipmentsLoading
                      ? "Chargement des appareils…"
                      : "Gérer les appareils"
                  }
                >
                  <List className="size-4" />
                  Liste des appareils
                </button>
              </div>

              <div className="flex flex-col gap-6">
                <PreheatTemperatureForm
                  restaurantId={restaurantId}
                  initial={editing}
                  equipments={equipments}
                  onSuccess={(doc) => {
                    setEditing(null);
                    window.dispatchEvent(
                      new CustomEvent("preheat-temperature:upsert", {
                        detail: { doc },
                      })
                    );
                  }}
                  onCancel={() => setEditing(null)}
                />

                <PreheatTemperatureList
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
            <NoAvailableComponent dataLoading={restaurantContext.dataLoading} />
          )}
        </div>
      </div>

      {isEquipmentModalOpen && (
        <CookingEquipmentManagerModal
          restaurantId={restaurantId}
          initialEquipments={equipments}
          onChanged={handleEquipmentsChanged}
          onClose={() => setIsEquipmentModalOpen(false)}
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
