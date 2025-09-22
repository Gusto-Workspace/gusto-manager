import React, { useState, useMemo } from "react";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { HealthSvg } from "@/components/_shared/_svgs/health.svg";
import Link from "next/link";

const defaultTiles = [
  {
    key: "reception-temp",
    label: "Contrôle T° réception",
    icon: "📦",
    note: "Réceptions & T°",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "fridges",
    label: "T° enceintes frigorifiques",
    icon: "❄️",
    note: "Frigos / chambres",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "heating-start",
    label: "T° mise en chauffe",
    icon: "🔥",
    note: "Cuisson / maintien",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "heating-out",
    label: "T° sortie de chauffe",
    icon: "🍽️",
    note: "Sortie cuisson",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "service",
    label: "T° service",
    icon: "🍽️",
    note: "Service",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "temps-logs",
    label: "Relevés T°",
    icon: "🌡️",
    note: "Historique T°",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "receptions",
    label: "Réceptions",
    icon: "📥",
    note: "Bon de livraison",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "trace",
    label: "Traçabilité étiquettes",
    icon: "🔖",
    note: "Lot / DLC",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "batches",
    label: "Batches recettes",
    icon: "🥣",
    note: "Traçabilité lots",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "oil",
    label: "Huile de friture",
    icon: "🛢️",
    note: "Changement / qualité",
    href: "/dashboard/health-control-plan/reception-temperature",
  },

  {
    key: "clean",
    label: "Nettoyage locaux",
    icon: "🧴",
    note: "Protocoles & preuves",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "pest",
    label: "Lutte nuisibles",
    icon: "🐜",
    note: "Interventions",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "allergens",
    label: "Allergènes",
    icon: "🥜",
    note: "Gestion & étiquetage",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "micro",
    label: "Microbiologie",
    icon: "🔬",
    note: "Analyses labo",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "ncs",
    label: "Non-conformités",
    icon: "⚠️",
    note: "NC ouvertes / fermées",
    href: "/dashboard/health-control-plan/reception-temperature",
  },

  {
    key: "supplier-cert",
    label: "Certificats fournisseurs",
    icon: "📄",
    note: "FDS & certificats",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "return-nc",
    label: "Retour marchandise NC",
    icon: "↩️",
    note: "Retours non-conformes",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "calibrations",
    label: "Calibrations",
    icon: "🧭",
    note: "Sondes & instruments",
    href: "/dashboard/health-control-plan/reception-temperature",
  },

  {
    key: "trainings",
    label: "Formation du personnel",
    icon: "🎓",
    note: "Formations & certificats",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "maintenance",
    label: "Maintenance équipements",
    icon: "🛠️",
    note: "Entretien & réparations",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "waste",
    label: "Gestion des déchets",
    icon: "🗑️",
    note: "Tri & élimination",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
  {
    key: "covid",
    label: "Mesures COVID-19",
    icon: "🧪",
    note: "Mesures & suivi",
    href: "/dashboard/health-control-plan/reception-temperature",
  },
];

export default function DashboardHealthControlPlanComponent({
  restaurantData = null,
  tilesConfig = null,
}) {
  const { t } = useTranslation(["health-control-plan", "common"]);
  const tiles = tilesConfig || defaultTiles;

  const [searchTerm, setSearchTerm] = useState("");

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
    [tiles, t]
  );

  // filtered tiles by searchTerm (matches key/label/note, accent-insensitive)
  const filteredTiles = useMemo(() => {
    const q = normalize(searchTerm);
    if (!q) return tilesWithText;
    return tilesWithText.filter((tile) =>
      normalize(tile._searchText).includes(q)
    );
  }, [tilesWithText, searchTerm]);

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 min-h-[40px]">
            <HealthSvg width={30} height={30} fillColor="#131E3690" />

            <h1 className="pl-2 py-1 text-xl tablet:text-2xl">
              {t("health-control-plan:titles.main")}
            </h1>
          </div>
        </div>
        <div className="w-full">
          {/* Search + count */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="relative max-w-[320px]">
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
        <div className="grid grid-cols-1 midTablet:grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4 ultraWild:grid-cols-5 gap-4 w-full">
          {filteredTiles.map((tile) => {
            return (
              <Link
                href={tile.href}
                key={tile.key}
                tabIndex={0}
                aria-label={tile.label}
                className={`rounded-md shadow-sm h-36 flex flex-col justify-between p-4 bg-white`}
              >
                <div className="flex flex-col w-full h-full justify-center text-center items-center gap-3">
                  <div className="text-3xl">{tile.icon}</div>
                  <div>
                    <div className="text-sm font-semibold">
                      {t(`tiles.${tile.key}`, tile.label)}
                    </div>
                    <div className="text-xs">
                      {t(`tiles.${tile.key}.note`, tile.note)}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
