import { useMemo, useState, useEffect, useContext, useRef } from "react";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { CustomerSvg } from "@/components/_shared/_svgs/customer.svg";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// ICONS
import {
  Search,
  Tag,
  Filter,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  UserCheck,
  Crown,
  RotateCcw,
  UserX,
  X,
} from "lucide-react";

// COMPONENT
import DetailsDrawerCustomersComponent from "./details-drawers.customers.component";
import ConfirmModalCustomersComponent from "./confirm-modal.customers.component";

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function fmtPhone(p) {
  if (!p) return "-";
  return String(p);
}

function getInitials(firstName, lastName) {
  const f = String(firstName || "").trim();
  const l = String(lastName || "").trim();
  const a = (f[0] || "").toUpperCase();
  const b = (l[0] || "").toUpperCase();
  const out = `${a}${b}`.trim();
  return out || "?";
}

function tagHelp(tagKey) {
  switch (tagKey) {
    case "very_regular":
      return "Client VIP (réservations fréquentes / forte récurrence)";
    case "regular":
      return "Client fidèle (revient souvent)";
    case "to_reconquer":
      return "Client à relancer (ne vient plus comme avant)";
    case "lost":
      return "Client inactif depuis longtemps";
    default:
      return "Tag personnalisé";
  }
}

// ✅ tags (avec icons)
const TAGS_UI = {
  regular: {
    label: "Régulier",
    cls: "bg-blue/10 text-blue border-blue/20",
    Icon: UserCheck,
  },
  very_regular: {
    label: "Très régulier",
    cls: "bg-green/10 text-green border-green/20",
    Icon: Crown,
  },
  to_reconquer: {
    label: "À reconquérir",
    cls: "bg-[#FF914D22] text-[#B95E1C] border-[#FF914D55]",
    Icon: RotateCcw,
  },
  lost: {
    label: "Perdu",
    cls: "bg-red/10 text-red border-red/20",
    Icon: UserX,
  },
};

function TagPill({ tagKey, tooltipKey, hoveredTooltip, setHoveredTooltip }) {
  const pillRef = useRef(null);
  const tipRef = useRef(null);
  const [tipStyle, setTipStyle] = useState(null);
  const ui = TAGS_UI[tagKey] || {
    label: tagKey,
    cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/15",
    Icon: Tag,
  };

  const Icon = ui.Icon || Tag;
  const isOpen = hoveredTooltip === tooltipKey;

  useEffect(() => {
    if (!isOpen) {
      setTipStyle(null);
      return;
    }

    const compute = () => {
      const pill = pillRef.current;
      const tip = tipRef.current;
      if (!pill || !tip) return;

      const r = pill.getBoundingClientRect();

      // largeur tooltip (limitée)
      const maxW = Math.min(320, window.innerWidth - 16);
      tip.style.maxWidth = `${maxW}px`;

      // re-mesure après maxWidth
      const tipRect = tip.getBoundingClientRect();
      const tipW = tipRect.width;
      const tipH = tipRect.height;

      // position souhaitée: centré au-dessus du tag
      let left = r.left + r.width / 2 - tipW / 2;
      // clamp horizontal (8px de marge)
      left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));

      // au-dessus par défaut
      let top = r.top - tipH - 10;

      // si ça sort en haut => on le met en dessous
      if (top < 8) top = r.bottom + 10;

      setTipStyle({ left, top });
    };

    // compute initial + on resize/scroll
    compute();
    window.addEventListener("resize", compute);

    // scroll: capture pour capter les scrolls dans containers
    window.addEventListener("scroll", compute, true);

    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [isOpen]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHoveredTooltip(tooltipKey)}
      onMouseLeave={() => setHoveredTooltip(null)}
    >
      <button
        ref={pillRef}
        type="button"
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${ui.cls}`}
        onClick={(e) => {
          e.stopPropagation();
          setHoveredTooltip(isOpen ? null : tooltipKey);
        }}
      >
        <Icon className="size-3.5 opacity-80" />
        {ui.label}
      </button>

      {isOpen ? (
        <div
          ref={tipRef}
          className="
      fixed z-[9999]
      bg-darkBlue text-white text-xs px-3 py-2 rounded-xl
      shadow-[0_12px_30px_rgba(19,30,54,0.25)]
      whitespace-normal
      pointer-events-none
    "
          style={tipStyle || { left: -9999, top: -9999 }}
        >
          {tagHelp(tagKey)}
        </div>
      ) : null}
    </div>
  );
}

const MOCK_CUSTOMERS = [
  {
    id: "c1",
    firstName: "François",
    lastName: "?",
    phone: "+33 5 55 95 14 33",
    email: "f.camus@noos.fr",
    tags: "",
    stats: {
      reservationsTotal: 2,
      reservationsCanceled: 1,
      giftCardsBought: 0,
    },
    history: {
      reservations: [
        {
          id: "r1",
          date: "2026-02-12",
          time: "20:00",
          guests: 2,
          status: "Canceled",
        },
        {
          id: "r2",
          date: "2026-01-18",
          time: "19:30",
          guests: 2,
          status: "Finished",
        },
      ],
      giftCards: [],
    },
    notes: "",
    createdAt: "2024-02-16",
  },
  {
    id: "c2",
    firstName: "Matthieu",
    lastName: "Moschetta",
    phone: "+33 6 85 46 23 70",
    email: "moimathieu.m@gmail.com",
    tags: ["very_regular"],
    stats: {
      reservationsTotal: 11,
      reservationsCanceled: 0,
      giftCardsBought: 2,
    },
    history: {
      reservations: [
        {
          id: "r3",
          date: "2026-02-14",
          time: "21:00",
          guests: 4,
          status: "Finished",
        },
        {
          id: "r4",
          date: "2026-02-01",
          time: "20:00",
          guests: 2,
          status: "Finished",
        },
        {
          id: "r5",
          date: "2026-01-10",
          time: "19:45",
          guests: 2,
          status: "Finished",
        },
      ],
      giftCards: [
        {
          id: "g1",
          date: "2026-01-05",
          amount: 80,
          description: "Anniversaire — merci 🙌",
        },
        { id: "g2", date: "2025-12-20", amount: 50, description: "" },
      ],
    },
    notes: "Aime une table au calme.",
    createdAt: "2024-02-16",
  },
  {
    id: "c3",
    firstName: "Mathis",
    lastName: "Achard",
    phone: "+33 6 42 28 27 89",
    email: "mathis.achard3@gmail.com",
    tags: ["lost"],
    stats: {
      reservationsTotal: 1,
      reservationsCanceled: 0,
      giftCardsBought: 0,
    },
    history: {
      reservations: [
        {
          id: "r6",
          date: "2024-02-16",
          time: "20:00",
          guests: 2,
          status: "Finished",
        },
      ],
      giftCards: [],
    },
    notes: "",
    createdAt: "2024-02-16",
  },
  {
    id: "c4",
    firstName: "Laura",
    lastName: "Aguirre",
    phone: "+33 6 29 51 67 82",
    email: "aguirrelaura82@yahoo.fr",
    tags: ["regular"],
    stats: {
      reservationsTotal: 4,
      reservationsCanceled: 1,
      giftCardsBought: 1,
    },
    history: {
      reservations: [
        {
          id: "r7",
          date: "2026-02-07",
          time: "19:30",
          guests: 2,
          status: "Finished",
        },
        {
          id: "r8",
          date: "2026-01-21",
          time: "20:00",
          guests: 3,
          status: "Canceled",
        },
      ],
      giftCards: [
        {
          id: "g3",
          date: "2026-02-10",
          amount: 100,
          description: "Pour un couple",
        },
      ],
    },
    notes: "",
    createdAt: "2024-06-12",
  },
];

export default function ListCustomersComponent() {
  const { t } = useTranslation("customers");

  // ✅ options restaurant (pour afficher/masquer le filtre source)
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext?.restaurantData;
  const restaurantOptions = restaurant?.options || {};
  const hasGiftCardModule = !!restaurantOptions.gift_card;
  const hasReservationsModule = !!restaurantOptions.reservations;
  const showSourceFilter = hasGiftCardModule && hasReservationsModule;

  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all"); // all | reservations | gift_cards

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteProcessing, setDeleteProcessing] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // ✅ tooltip key (au niveau du tag)
  const [hoveredTooltip, setHoveredTooltip] = useState(null);

  // pagination mock
  const pageSize = 12;
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = normalize(query);

    return MOCK_CUSTOMERS.filter((c) => {
      const hay = normalize(
        `${c.firstName} ${c.lastName} ${c.email} ${c.phone}`.trim(),
      );
      const passQuery = !q || hay.includes(q);

      const passTag =
        tagFilter === "all" ? true : (c.tags || []).includes(tagFilter);

      // ✅ source filter (uniquement si showSourceFilter)
      const hasResa = (c.history?.reservations?.length || 0) > 0;
      const hasGift = (c.history?.giftCards?.length || 0) > 0;

      const passSource =
        !showSourceFilter || sourceFilter === "all"
          ? true
          : sourceFilter === "reservations"
            ? hasResa
            : hasGift;

      return passQuery && passTag && passSource;
    });
  }, [query, tagFilter, sourceFilter, showSourceFilter]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / pageSize)),
    [filtered.length],
  );

  const paged = useMemo(() => {
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  useEffect(() => setPage(1), [query, tagFilter, sourceFilter]);

  // ✅ si le resto n'a pas les 2 modules, on force "all" (et donc aucun filtre affiché)
  useEffect(() => {
    if (!showSourceFilter && sourceFilter !== "all") {
      setSourceFilter("all");
    }
  }, [showSourceFilter, sourceFilter]);

  const openDrawer = (customer) => {
    setSelectedCustomer(customer);
    setDrawerOpen(true);
  };

  const requestDelete = (customer) => {
    setDeleteError(null);
    setDeleteTarget(customer);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    setDeleteProcessing(true);
    setDeleteError(null);

    try {
      // ✅ MOCK (plus tard -> route backend)
      await new Promise((r) => setTimeout(r, 450));

      console.log("(mock) delete customer:", deleteTarget?.id);

      setConfirmOpen(false);

      // si tu veux aussi fermer le drawer si c'est le même client
      if (drawerOpen && selectedCustomer?.id === deleteTarget?.id) {
        setDrawerOpen(false);
      }
    } catch (e) {
      setDeleteError("Une erreur est survenue lors de la suppression.");
    } finally {
      setDeleteProcessing(false);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <hr className="opacity-20" />

      {/* Header */}
      <div className="flex flex-wrap gap-4 justify-between items-start">
        <div className="flex gap-2">
          <div className="flex items-center min-h-[40px]">
            <CustomerSvg width={30} height={30} fillColor="#131E3690" />
          </div>

          <div className="flex flex-col">
            <h1 className="pl-2 text-xl tablet:text-2xl">Fichier clients</h1>
            <span className="ml-2 text-xs font-semibold text-darkBlue/50">
              {filtered.length} client{filtered.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full tablet:w-auto">
          {/* Search */}
          <div className="relative flex items-center gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-2 w-full tablet:w-[340px] shadow-sm">
            <Search className="size-4 text-darkBlue/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (nom, email, téléphone)…"
              className="w-full outline-none text-sm text-darkBlue placeholder:text-darkBlue/40 bg-transparent pr-8"
            />

            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-6 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                aria-label="Effacer"
                title="Effacer"
                type="button"
              >
                <X className="size-4 text-darkBlue/60" />
              </button>
            )}
          </div>

          {/* ✅ Source filter (uniquement si le resto a les 2 modules) */}
          {showSourceFilter ? (
            <div className="flex items-center gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-2 shadow-sm">
              <Filter className="size-4 text-darkBlue/40" />
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="bg-transparent outline-none text-sm text-darkBlue"
              >
                <option value="all">Tous</option>
                <option value="reservations">Réservations</option>
                <option value="gift_cards">Cartes cadeaux</option>
              </select>
            </div>
          ) : null}

          {/* Tag filter */}
          <div className="flex items-center gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-2 shadow-sm">
            <Tag className="size-4 text-darkBlue/40" />
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="bg-transparent outline-none text-sm text-darkBlue"
            >
              <option value="all">Tous</option>
              <option value="very_regular">Très régulier</option>
              <option value="regular">Régulier</option>
              <option value="to_reconquer">À reconquérir</option>
              <option value="lost">Perdu</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-3xl border border-darkBlue/10 bg-white/50 shadow-sm overflow-hidden">
        <div className="hidden tablet:grid grid-cols-[56px_1.1fr_1.1fr_1fr_1.6fr_1fr_48px] gap-3 px-4 py-3 border-b border-darkBlue/10 bg-white/50">
          <p className="text-xs font-semibold text-darkBlue/60"></p>
          <p className="text-xs font-semibold text-darkBlue/60">Prénom</p>
          <p className="text-xs font-semibold text-darkBlue/60">Nom</p>
          <p className="text-xs font-semibold text-darkBlue/60">Téléphone</p>
          <p className="text-xs font-semibold text-darkBlue/60">Email</p>
          <p className="text-xs font-semibold text-darkBlue/60">Tags</p>
          <p className="text-xs font-semibold text-darkBlue/60 text-right"></p>
        </div>

        <div className="divide-y divide-darkBlue/10">
          {paged.map((c) => (
            <div
              key={c.id}
              className="
                grid grid-cols-1 tablet:grid-cols-[56px_1.1fr_1.1fr_1fr_1.6fr_1fr_48px]
                gap-3 px-4 py-4 tablet:py-3
                desktop:hover:bg-darkBlue/5 transition
              "
            >
              {/* Mobile header line */}
              {/* Mobile header line */}
              <div className="tablet:hidden flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-11 rounded-full bg-darkBlue text-white flex items-center justify-center text-sm font-semibold shrink-0">
                    {getInitials(c.firstName, c.lastName)}
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-darkBlue truncate">
                      {c.firstName} {c.lastName}
                    </p>
                  </div>
                </div>

                {!(Array.isArray(c.tags) && c.tags.length) ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
                      onClick={() => {
                        if (!c.phone) return;
                        window.location.href = `tel:${String(c.phone).replace(/\s/g, "")}`;
                      }}
                      aria-label="Appeler"
                      type="button"
                    >
                      <Phone className="size-5 text-darkBlue/60" />
                    </button>

                    <button
                      className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
                      onClick={() => {
                        if (!c.email) return;
                        window.location.href = `mailto:${c.email}`;
                      }}
                      aria-label="Envoyer un email"
                      type="button"
                    >
                      <Mail className="size-5 text-darkBlue/60" />
                    </button>

                    <button
                      className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
                      onClick={() => openDrawer(c)}
                      aria-label="Voir la fiche"
                      type="button"
                    >
                      <ChevronRight className="size-5 text-darkBlue/60" />
                    </button>
                  </div>
                ) : (
                  // ✅ sinon on garde la flèche seule (comme avant)
                  <button
                    className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
                    onClick={() => openDrawer(c)}
                    aria-label="Voir la fiche"
                    type="button"
                  >
                    <ChevronRight className="size-5 text-darkBlue/60" />
                  </button>
                )}
              </div>

              {/* Desktop avatar */}
              <div className="hidden tablet:flex items-center">
                <div className="size-10 rounded-full bg-darkBlue text-white flex items-center justify-center text-sm font-semibold">
                  {getInitials(c.firstName, c.lastName)}
                </div>
              </div>

              <div className="hidden tablet:flex items-center text-sm font-semibold text-darkBlue truncate">
                {c.firstName || "-"}
              </div>

              <div className="hidden tablet:flex items-center text-sm font-semibold text-darkBlue truncate">
                {c.lastName || "-"}
              </div>

              {/* Tel clickable */}
              <div className="hidden tablet:flex items-center gap-2 text-sm text-darkBlue/80 truncate">
                <Phone className="size-4 text-darkBlue/40" />
                <button
                  type="button"
                  className="truncate hover:underline"
                  title="Clique pour appeler"
                  onClick={() => {
                    if (!c.phone) return;
                    window.location.href = `tel:${String(c.phone).replace(/\s/g, "")}`;
                  }}
                >
                  {fmtPhone(c.phone)}
                </button>
              </div>

              {/* Email clickable */}
              <div className="hidden tablet:flex items-center gap-2 text-sm text-darkBlue/80 truncate">
                <Mail className="size-4 text-darkBlue/40" />
                <button
                  type="button"
                  className="truncate hover:underline"
                  title="Clique pour envoyer un email"
                  onClick={() => {
                    if (!c.email) return;
                    window.location.href = `mailto:${c.email}`;
                  }}
                >
                  {c.email || "-"}
                </button>
              </div>

              {/* Tags + tooltip local */}
              <div className="hidden tablet:flex items-center gap-2 flex-wrap">
                {(c.tags || []).length ? (
                  c.tags
                    .slice(0, 2)
                    .map((tagKey) => (
                      <TagPill
                        key={`${c.id}-${tagKey}`}
                        tagKey={tagKey}
                        tooltipKey={`${c.id}-tag-${tagKey}`}
                        hoveredTooltip={hoveredTooltip}
                        setHoveredTooltip={setHoveredTooltip}
                      />
                    ))
                ) : (
                  <span className="text-xs text-darkBlue/40">-</span>
                )}
              </div>

              {/* ✅ Arrow only */}
              <div className="hidden tablet:flex items-center justify-end">
                <button
                  className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
                  onClick={() => openDrawer(c)}
                  aria-label="Voir la fiche"
                  type="button"
                >
                  <ChevronRight className="size-5 text-darkBlue/60" />
                </button>
              </div>

              {/* Mobile quick actions */}

              {Array.isArray(c.tags) && c.tags.length ? (
                <div className="tablet:hidden flex justify-between items-center gap-2">
                  {/* Mobile tags line */}
                  <div className="flex flex-wrap gap-2">
                    {c.tags.slice(0, 2).map((tagKey) => (
                      <TagPill
                        key={`${c.id}-${tagKey}`}
                        tagKey={tagKey}
                        tooltipKey={`${c.id}-tag-${tagKey}`}
                        hoveredTooltip={hoveredTooltip}
                        setHoveredTooltip={setHoveredTooltip}
                      />
                    ))}
                  </div>

                  <div className="flex gap-1">
                    <button
                      className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white desktop:hover:bg-darkBlue/5 transition p-2"
                      onClick={() => {
                        if (!c.phone) return;
                        window.location.href = `tel:${String(c.phone).replace(/\s/g, "")}`;
                      }}
                      aria-label="Appeler"
                      type="button"
                    >
                      <Phone className="size-5 text-darkBlue/60" />
                    </button>

                    <button
                      className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white desktop:hover:bg-darkBlue/5 transition p-2"
                      onClick={() => {
                        if (!c.email) return;
                        window.location.href = `mailto:${c.email}`;
                      }}
                      aria-label="Envoyer un email"
                      type="button"
                    >
                      <Mail className="size-5 text-darkBlue/60" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {!paged.length ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold text-darkBlue/70">
                Aucun client trouvé
              </p>
              <p className="text-xs text-darkBlue/50 mt-1">
                Change le filtre ou la recherche.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2 px-4 py-4">
        <button
          className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2 disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          aria-label="Page précédente"
          type="button"
        >
          <ChevronLeft className="size-4 text-darkBlue/70" />
        </button>

        <div className="text-sm px-4 py-2 rounded-xl font-semibold text-darkBlue border border-darkBlue/10 bg-white">
          {page} / {totalPages}
        </div>

        <button
          className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2 disabled:opacity-50"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          aria-label="Page suivante"
          type="button"
        >
          <ChevronRight className="size-4 text-darkBlue/70" />
        </button>
      </div>

      {/* Drawer */}
      <DetailsDrawerCustomersComponent
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        customer={selectedCustomer}
        t={t}
        onAction={(customer, actionType, payload) => {
          if (actionType === "delete") {
            requestDelete(customer);
            return;
          }

          if (actionType === "save") {
            // eslint-disable-next-line no-console
            console.log("(mock) save:", customer?.id, payload);
            return;
          }

          if (actionType === "note_save") {
            // eslint-disable-next-line no-console
            console.log("(mock) save note:", customer?.id, payload);
            return;
          }
        }}
      />

      <ConfirmModalCustomersComponent
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        customer={deleteTarget}
        isProcessing={deleteProcessing}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
