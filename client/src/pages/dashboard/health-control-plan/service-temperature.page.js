import { useContext, useEffect, useMemo, useState, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

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

// Local
import axios from "axios";
import ServiceTemperatureForm from "@/components/dashboard/health-control-plan/service-temperature/form.component";
import ServiceTemperatureList from "@/components/dashboard/health-control-plan/service-temperature/list.component";
import ZoneManagerModal from "@/components/dashboard/health-control-plan/zone-manager-modale.component";
import { List } from "lucide-react";

export default function ServiceTemperaturePage(props) {
  const { t } = useTranslation("");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);

  const restaurantId = restaurantContext?.restaurantData?._id;
  const [editing, setEditing] = useState(null);

  // --- Zones pour la modale ---
  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  useEffect(() => {
    if (!restaurantId || !token) return;
    const loadZones = async () => {
      setZonesLoading(true);
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/zones`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { active: 1 },
        });
        const items = (data?.items || []).sort((a, b) =>
          String(a?.name || "").localeCompare(String(b?.name || ""), "fr")
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

  // bloque le scroll body quand la modale est ouverte
  useEffect(() => {
    if (isZoneModalOpen) document.body.classList.add("overflow-hidden");
    else document.body.classList.remove("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [isZoneModalOpen]);

  const handleZonesChanged = useCallback((nextList) => {
    const sorted = [...(nextList || [])].sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), "fr")
    );
    setZones(sorted);
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
                        <span>T° service</span>
                      </>
                    </h1>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsZoneModalOpen(true)}
                    className="bg-blue px-4 py-2 rounded-lg text-white h-fit disabled:opacity-60 inline-flex items-center gap-2"
                    disabled={zonesLoading}
                    title={
                      zonesLoading ? "Chargement des zones…" : "Gérer les zones"
                    }
                  >
                    <List className="size-4" />
                    Liste des zones
                  </button>
                </div>

                <div className="flex flex-col gap-6">
                  <ServiceTemperatureForm
                    restaurantId={restaurantId}
                    initial={editing}
                    zones={zones}
                    onSuccess={(doc) => {
                      setEditing(null);
                      window.dispatchEvent(
                        new CustomEvent("service-temperature:upsert", {
                          detail: { doc },
                        })
                      );
                    }}
                    onCancel={() => setEditing(null)}
                  />

                  <ServiceTemperatureList
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
