"use client";

import React, { useState, useMemo, useContext } from "react";
import Link from "next/link";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { HealthSvg } from "@/components/_shared/_svgs/health.svg";

const tiles = [
  {
    key: "receptions",
    label: "Réceptions",
    icon: "📥",
    note: "Bon de livraison",
    href: "/dashboard/health-control-plan/reception-delivery",
    tone: "162 72% 45%",
  },
  {
    key: "fridges",
    label: "T° enceintes frigorifiques",
    icon: "❄️",
    note: "Frigos / chambres",
    href: "/dashboard/health-control-plan/fridge-temperature",
    tone: "200 95% 50%",
  },
  {
    key: "heating-start",
    label: "T° mise en chauffe",
    icon: "🔥",
    note: "Cuisson / maintien",
    href: "/dashboard/health-control-plan/preheat-temperature",
    tone: "18 92% 55%",
  },
  {
    key: "heating-out",
    label: "T° sortie de chauffe",
    icon: "🍽️",
    note: "Sortie cuisson",
    href: "/dashboard/health-control-plan/postheat-temperature",
    tone: "0 84% 60%",
  },
  {
    key: "service",
    label: "T° service",
    icon: "🍽️",
    note: "Service",
    href: "/dashboard/health-control-plan/service-temperature",
    tone: "32 95% 55%",
  },
  {
    key: "temps-logs",
    label: "Relevés T° génériques",
    icon: "🌡️",
    note: "Historique T°",
    href: "/dashboard/health-control-plan/generic-temperature",
    tone: "350 84% 58%",
  },
  {
    key: "trace",
    label: "Traçabilité étiquettes",
    icon: "🔖",
    note: "Lot / DLC",
    href: "/dashboard/health-control-plan/inventory-lot",
    tone: "238 83% 66%",
  },
  {
    key: "batches",
    label: "Batches recettes",
    icon: "🥣",
    note: "Traçabilité lots",
    href: "/dashboard/health-control-plan/recipe-batches",
    tone: "270 91% 65%",
  },
  {
    key: "oil",
    label: "Huile de friture",
    icon: "🛢️",
    note: "Changement / qualité",
    href: "/dashboard/health-control-plan/oil-change",
    tone: "38 92% 55%",
  },
  {
    key: "clean",
    label: "Nettoyage locaux",
    icon: "🧴",
    note: "Protocoles & preuves",
    href: "/dashboard/health-control-plan/cleaning-task",
    tone: "187 92% 42%",
  },
  {
    key: "pest",
    label: "Lutte nuisibles",
    icon: "🐜",
    note: "Interventions",
    href: "/dashboard/health-control-plan/pest-control",
    tone: "352 75% 54%",
  },
  {
    key: "micro",
    label: "Microbiologie",
    icon: "🔬",
    note: "Analyses labo",
    href: "/dashboard/health-control-plan/microbiology",
    tone: "250 80% 65%",
  },
  {
    key: "ncs",
    label: "Non-conformités",
    icon: "⚠️",
    note: "NC ouvertes / fermées",
    href: "/dashboard/health-control-plan/non-conformity",
    tone: "50 100% 46%",
  },
  {
    key: "supplier-cert",
    label: "Certificats fournisseurs",
    icon: "📄",
    note: "FDS & certificats",
    href: "/dashboard/health-control-plan/suppliers-certificates",
    tone: "215 20% 65%",
  },
  {
    key: "return-nc",
    label: "Retour marchandise NC",
    icon: "↩️",
    note: "Retours non-conformes",
    href: "/dashboard/health-control-plan/recalls",
    tone: "28 92% 54%",
  },
  {
    key: "calibrations",
    label: "Calibrations",
    icon: "🧭",
    note: "Sondes & instruments",
    href: "/dashboard/health-control-plan/calibrations",
    tone: "199 89% 48%",
  },
  {
    key: "trainings",
    label: "Formation du personnel",
    icon: "🎓",
    note: "Formations & certificats",
    href: "/dashboard/health-control-plan/training-sessions",
    tone: "217 91% 60%",
  },
  {
    key: "maintenance",
    label: "Maintenance équipements",
    icon: "🛠️",
    note: "Entretien & réparations",
    href: "/dashboard/health-control-plan/maintenance",
    tone: "215 15% 50%",
  },
  {
    key: "waste",
    label: "Gestion des déchets",
    icon: "🗑️",
    note: "Tri & élimination",
    href: "/dashboard/health-control-plan/waste-entry",
    tone: "142 72% 40%",
  },
  {
    key: "covid",
    label: "Mesures d'hygiène",
    icon: "🧪",
    note: "Mesures & suivi",
    href: "/dashboard/health-control-plan/health-mesures",
    tone: "181 84% 45%",
  },
];

export default function DashboardHealthControlPlanComponent() {
  const { t } = useTranslation(["health-control-plan", "common"]);
  const { restaurantContext } = useContext(GlobalContext);

  const [searchTerm, setSearchTerm] = useState("");

  // états pour la modale de rapport
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  const restaurantId = restaurantContext?.restaurantData?._id;
  const restaurantName = restaurantContext?.restaurantData?.name;

  // normalize string (accent-insensitive)
  const normalize = (s = "") =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  // build translated label/note for each tile for search purposes
  const tilesWithText = useMemo(
    () =>
      tiles.map((tile) => {
        const translatedLabel = t(`tiles.${tile.key}`, tile.label);
        const translatedNote = t(`tiles.${tile.key}.note`, tile.note || "");
        return {
          ...tile,
          _searchText: `${tile.key} ${tile.label} ${translatedLabel} ${tile.note} ${translatedNote}`,
        };
      }),
    [t]
  );

  // filtered tiles by searchTerm (matches key/label/note, accent-insensitive)
  const filteredTiles = useMemo(() => {
    const q = normalize(searchTerm);
    if (!q) return tilesWithText;
    return tilesWithText.filter((tile) =>
      normalize(tile._searchText).includes(q)
    );
  }, [tilesWithText, searchTerm]);

  const handleDownloadReport = async () => {
    if (!restaurantId) {
      setReportError(
        "Aucun restaurant sélectionné. Veuillez recharger le tableau de bord."
      );
      return;
    }

    // Garde-fou : empêcher un "to" antérieur à "from"
    if (reportFrom && reportTo && reportTo < reportFrom) {
      setReportError(
        "La date de fin ne peut pas être antérieure à la date de début."
      );
      return;
    }

    setReportError(null);
    setReportLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;

      let token = null;
      if (typeof window !== "undefined") {
        token = localStorage.getItem("token");
      }

      const payload = {
        from: reportFrom || null,
        to: reportTo || null,
        restaurantName: restaurantName || null,
      };

      const response = await axios.post(
        `${API_URL}/restaurants/${restaurantId}/haccp-report`,
        payload,
        {
          responseType: "blob",
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {},
        }
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const fromLabel = reportFrom || "";
      const toLabel = reportTo || "";
      const safeName = (restaurantName || `restaurant-${restaurantId}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const link = document.createElement("a");
      link.href = url;
      link.download = `haccp-${safeName}-${fromLabel || "from"}-${
        toLabel || "to"
      }.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setIsReportModalOpen(false);
    } catch (err) {
      console.error("Erreur lors du téléchargement du rapport HACCP :", err);
      setReportError(
        "Impossible de générer le rapport. Veuillez réessayer dans quelques instants."
      );
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex flex-col gap-4">
        <div className="flex justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-h-[40px]">
            <HealthSvg width={30} height={30} fillColor="#131E3690" />

            <h1 className="pl-2 py-1 text-xl tablet:text-2xl">
              {t("health-control-plan:titles.main")}
            </h1>
          </div>

          {/* Bouton édition de rapport */}
          <button
            type="button"
            onClick={() => {
              setIsReportModalOpen(true);
              setReportError(null);
            }}
            className="bg-blue h-fit px-6 py-2 rounded-lg text-white cursor-pointer hover:opacity-80 transition-all ease-in-out"
          >
            Générer un rapport
          </button>
        </div>

        {/* Search + count */}
        <div className="w-full">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="relative max-w-[320px] w-full">
                <input
                  type="text"
                  placeholder={t(
                    "placeholders.searchTile",
                    "Rechercher une catégorie"
                  )}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full p-2 pr-10 border border-[#131E3690] rounded-lg bg-white"
                  aria-label={t(
                    "placeholders.searchTile",
                    "Rechercher une catégorie"
                  )}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
                    aria-label={t("buttons.clear") || "Clear"}
                    title={t("buttons.clear") || "Clear"}
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tiles grid */}
        <div className="grid grid-cols-1 midTablet:grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4 ultraWild:grid-cols-5 gap-2 midTablet:gap-4 w-full">
          {filteredTiles.map((tile) => {
            const tone = tile.tone;
            return (
              <Link
                href={tile.href}
                key={tile.key}
                tabIndex={0}
                aria-label={tile.label}
                style={{ "--tone": tone }}
                className={[
                  "group relative overflow-hidden rounded-xl bg-white h-36",
                  "border-slate-200/80 shadow-[0_1px_0_rgba(0,0,0,0.03)]",
                  "transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md",
                  "focus:outline-none ",
                ].join(" ")}
              >
                {/* halo radial discret en haut-droite */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(70% 55% at 100% 0%, hsl(${tone}/0.10) 0%, transparent 60%)`,
                  }}
                  aria-hidden="true"
                />

                {/* contenu centré */}
                <div className="relative z-[1] h-full px-4 py-3 flex flex-col items-center justify-center gap-3 text-center">
                  {/* badge icône */}
                  <div
                    className="h-11 w-11 rounded-2xl flex items-center justify-center text-2xl leading-none select-none
                       transition-transform duration-200 group-hover:scale-[1.03]"
                    style={{ backgroundColor: `hsl(${tone} / 0.16)` }}
                    aria-hidden="true"
                  >
                    {tile.icon}
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold text-slate-900">
                      {t(`tiles.${tile.key}`, tile.label)}
                    </div>
                    <div className="text-xs text-slate-600">
                      {t(`tiles.${tile.key}.note`, tile.note)}
                    </div>
                  </div>
                </div>

                {/* finitions hover : léger ring interne teinté */}
                <div
                  className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{
                    boxShadow: "inset 0 0 0 1px hsl(var(--tone) / 0.28)",
                  }}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Modale édition de rapport */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-[90%] p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-2">
              {t(
                "health-control-plan:report.modalTitle",
                "Générer un rapport HACCP"
              )}
            </h2>

            <p className="text-sm text-slate-600">
              {t(
                "health-control-plan:report.modalDescription",
                "Sélectionnez une plage de dates pour générer un rapport complet de vos enregistrements HACCP."
              )}
            </p>

            <div className="flex flex-col gap-4 mt-4">
              {/* Du (inclus) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">
                  {t("health-control-plan:report.from", "Du (inclus)")}
                </label>
                <input
                  type="date"
                  className="w-full border border-[#131E3690] rounded-lg px-2 py-2 bg-white"
                  value={reportFrom}
                  // Empêche de choisir une date > reportTo si déjà renseigné
                  max={reportTo || undefined}
                  onChange={(e) => {
                    const value = e.target.value;

                    if (reportTo && value && value > reportTo) {
                      setReportError(
                        "La date de début ne peut pas être postérieure à la date de fin."
                      );
                      return;
                    }

                    setReportFrom(value);
                    setReportError(null);
                  }}
                />
              </div>

              {/* Au (inclus) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">
                  {t("health-control-plan:report.to", "Au (inclus)")}
                </label>
                <input
                  type="date"
                  className="w-full border border-[#131E3690] rounded-lg px-2 py-2 bg-white"
                  value={reportTo}
                  // Empêche de sélectionner une date antérieure à "from"
                  min={reportFrom || undefined}
                  onChange={(e) => {
                    const value = e.target.value;

                    if (reportFrom && value && value < reportFrom) {
                      setReportError(
                        "La date de fin ne peut pas être antérieure à la date de début."
                      );
                      return;
                    }

                    setReportTo(value);
                    setReportError(null);
                  }}
                />
              </div>
            </div>

            {reportError && (
              <p className="text-xs text-red mt-2">{reportError}</p>
            )}

            <div className="flex flex-col-reverse mobile:flex-row mobile:justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  if (!reportLoading) {
                    setIsReportModalOpen(false);
                    setReportError(null);
                  }
                }}
                className="px-3 w-full mobile:w-auto py-2 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
              >
                {t("common:buttons.cancel", "Annuler")}
              </button>
              <button
                type="button"
                onClick={handleDownloadReport}
                disabled={reportLoading}
                className="px-4 py-2 w-full mobile:w-auto text-sm rounded-lg bg-[#131E36] text-white hover:bg-[#131E36]/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {reportLoading
                  ? t("common:loading", "Génération…")
                  : t(
                      "health-control-plan:report.generate",
                      "Générer le rapport"
                    )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
