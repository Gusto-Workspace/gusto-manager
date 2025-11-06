// pages/dashboard/health-control-plan/generic-temperature.page.jsx
import { useContext, useEffect, useMemo, useState, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { i18n, useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import axios from "axios";

import { GlobalContext } from "@/contexts/global.context";
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import { HealthSvg } from "@/components/_shared/_svgs/health.svg";

import GenericTemperatureForm from "@/components/dashboard/health-control-plan/generic-temperature/form.component";
import GenericTemperatureList from "@/components/dashboard/health-control-plan/generic-temperature/list.component";

// ⚠️ même nommage que tes autres fichiers (modale)
import ZoneManagerModal from "@/components/dashboard/health-control-plan/zone-manager-modale.component";

export default function GenericTemperaturePage() {
  const { t } = useTranslation("");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);

  const restaurantId = restaurantContext?.restaurantData?._id;
  const [editing, setEditing] = useState(null);

  // --- Zones : source de vérité locale ---
  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  useEffect(() => {
    if (!restaurantId) return;
    const loadZones = async () => {
      setZonesLoading(true);
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/zones`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { active: 1 },
        });
        const items = (data?.items || []).sort((a, b) =>
          String(a.name).localeCompare(String(b.name), "fr")
        );
        setZones(items);
      } catch (e) {
        console.error("fetch zones error:", e);
      } finally {
        setZonesLoading(false);
      }
    };
    loadZones();
  }, [restaurantId, token]);

  useEffect(() => {
    if (isZoneModalOpen) document.body.classList.add("overflow-hidden");
    else document.body.classList.remove("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [isZoneModalOpen]);

  // même pattern que ta page preheat
  const handleZonesChanged = useCallback((nextList) => {
    const sorted = [...(nextList || [])].sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "fr")
    );
    setZones(sorted);
  }, []);

  if (!restaurantContext.isAuth) return null;

  const title = "Gusto Manager";

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
                      <span>Relevés T° génériques</span>
                    </>
                  </h1>
                </div>

                <button
                  type="button"
                  onClick={() => setIsZoneModalOpen(true)}
                  className="bg-blue px-6 py-2 rounded-lg text-white h-fit disabled:opacity-60"
                  disabled={zonesLoading}
                  title={
                    zonesLoading ? "Chargement des zones…" : "Gérer les zones"
                  }
                >
                  Liste des zones
                </button>
              </div>

              <div className="flex flex-col gap-6">
                <GenericTemperatureForm
                  restaurantId={restaurantId}
                  initial={editing}
                  zones={zones}
                  onSuccess={(doc) => {
                    setEditing(null);
                    window.dispatchEvent(
                      new CustomEvent("generic-temperature:upsert", {
                        detail: { doc },
                      })
                    );
                  }}
                  onCancel={() => setEditing(null)}
                />

                <GenericTemperatureList
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

      {isZoneModalOpen && (
        <ZoneManagerModal
          restaurantId={restaurantId}
          initialZones={zones}
          onChanged={handleZonesChanged}
          onClose={() => setIsZoneModalOpen(false)}
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
