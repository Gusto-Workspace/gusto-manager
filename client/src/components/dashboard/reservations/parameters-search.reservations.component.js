import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

const PARAMETER_SECTIONS = [
  {
    id: "reservation-parameters-pauses",
    title: "Mise en pause",
    keywords: "fermeture blocage plage jour entier indisponible",
  },
  {
    id: "reservation-parameters-hours",
    title: "Heures de réservation",
    keywords: "horaire horaires créneau ouverture heures service",
  },
  {
    id: "reservation-parameters-slots",
    title: "Créneaux et acceptation",
    keywords:
      "intervalle 15 min 30 min automatique acceptation confirmation auto accept validation capacité couverts",
  },
  {
    id: "reservation-parameters-bank-hold",
    title: "Empreinte bancaire",
    keywords: "empreinte bancaire carte garantie paiement montant",
  },
  {
    id: "reservation-parameters-waitlist",
    title: "Liste d’attente",
    keywords: "attente liste d'attente waitlist place proposition nettoyage",
  },
  {
    id: "reservation-parameters-automations",
    title: "Automatisations",
    keywords:
      "fin terminée automatique suppression nettoyage durée occupation midi soir table",
  },
  {
    id: "reservation-parameters-emails",
    title: "Gestion des emails",
    keywords: "email emails message notification modèle client restaurant",
  },
  {
    id: "reservation-parameters-sms",
    title: "Rappels SMS",
    keywords: "sms rappel notification message",
  },
  {
    id: "reservation-parameters-availability",
    title: "Placement automatique",
    keywords: "disponibilité disponibilités places attribution table tables",
  },
  {
    id: "reservation-parameters-tables",
    title: "Plan de salle et tables",
    keywords: "table tables sièges couverts salle plan placement",
  },
];

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function ParametersSearchReservationsComponent() {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const searchContainerRef = useRef(null);
  const matchingSections = useMemo(() => {
    const query = normalizeSearchText(search);
    if (!query) return [];

    return PARAMETER_SECTIONS.filter((section) =>
      normalizeSearchText(`${section.title} ${section.keywords}`).includes(
        query,
      ),
    );
  }, [search]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!searchContainerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    section.focus({ preventScroll: true });
    setSearch("");
    setIsOpen(false);
  }

  return (
    <div
      ref={searchContainerRef}
      className="relative w-full midTablet:w-[380px]"
    >
      <label htmlFor="reservation-parameters-search" className="sr-only">
        Rechercher un paramètre
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-darkBlue/40" />
        <input
          id="reservation-parameters-search"
          type="text"
          inputMode="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setIsOpen(Boolean(event.target.value.trim()));
          }}
          onFocus={() => setIsOpen(Boolean(search.trim()))}
          onKeyDown={(event) => {
            if (event.key === "Escape") setIsOpen(false);
          }}
          placeholder="Ex. horaires, intervalle, empreinte…"
          className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 pl-11 pr-9 text-sm shadow-sm outline-none transition placeholder:text-darkBlue/35 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-darkBlue/10 text-[11px] text-darkBlue hover:bg-darkBlue/20 transition"
            aria-label="Effacer la recherche"
            title="Effacer la recherche"
          >
            ×
          </button>
        )}
      </div>

      {search.trim() && isOpen ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-darkBlue/10 bg-white p-2 shadow-lg"
          role="list"
        >
          {matchingSections.length ? (
            matchingSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
                role="listitem"
              >
                {section.title}
              </button>
            ))
          ) : (
            <p className="px-3 py-2.5 text-sm text-darkBlue/55">
              Aucun paramètre trouvé.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
