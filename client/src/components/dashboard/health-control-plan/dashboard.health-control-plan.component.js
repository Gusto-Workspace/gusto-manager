import React, { useState, useMemo } from "react";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { HealthSvg } from "@/components/_shared/_svgs/health.svg";
import Link from "next/link";

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
  // {
  //   key: "allergens",
  //   label: "Allergènes",
  //   icon: "🥜",
  //   note: "Gestion & étiquetage",
  //   href: "/dashboard/health-control-plan/allergen-incidents",
  //   tone: "30 92% 50%",
  // },
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
        <div className="grid grid-cols-1 midTablet:grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4 ultraWild:grid-cols-5 gap-4 w-full">
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
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone)/0.35)]",
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
    </section>
  );
}
