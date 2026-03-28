import { useMemo, useState, useEffect, useContext, useRef } from "react";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

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
  PlusCircle,
  UserCheck,
  Crown,
  RotateCcw,
  UserX,
  X,
  Menu,
} from "lucide-react";

// COMPONENT
import DetailsDrawerCustomersComponent from "../../customers/details-drawers.customers.component";
import ConfirmModalCustomersComponent from "../../customers/confirm-modal.customers.component";
import SidebarReservationsWebapp from "./sidebar.webapp";

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
    case "new":
      return "Client récemment acquis, à suivre de près";
    case "to_reconquer":
      return "Client à relancer (ne vient plus comme avant)";
    case "lost":
      return "Client inactif depuis longtemps";
    default:
      return "Tag personnalisé";
  }
}

const TAGS_UI = {
  new: {
    label: "Nouveau",
    cls: "bg-violet/10 text-violet border-violet/20",
    Icon: PlusCircle,
  },
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

      const maxW = Math.min(320, window.innerWidth - 16);
      tip.style.maxWidth = `${maxW}px`;

      const tipRect = tip.getBoundingClientRect();
      const tipW = tipRect.width;
      const tipH = tipRect.height;

      let left = r.left + r.width / 2 - tipW / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));

      let top = r.top - tipH - 10;
      if (top < 8) top = r.bottom + 10;

      setTipStyle({ left, top });
    };

    compute();
    window.addEventListener("resize", compute);
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
          className="fixed z-[9999] bg-darkBlue text-white text-xs px-3 py-2 rounded-xl shadow-[0_12px_30px_rgba(19,30,54,0.25)] whitespace-normal pointer-events-none"
          style={tipStyle || { left: -9999, top: -9999 }}
        >
          {tagHelp(tagKey)}
        </div>
      ) : null}
    </div>
  );
}

function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function ListCustomersReservationsWebapp({
  defaultSourceFilter = "all",
  sidebarTitle = "Réservations",
  sidebarModule = "reservations",
}) {
  const { t } = useTranslation("customers");

  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext?.restaurantData;
  const restaurantId = restaurant?._id;

  const restaurantOptions = restaurant?.options || {};
  const hasGiftCardModule = !!restaurantOptions.gift_card;
  const hasReservationsModule = !!restaurantOptions.reservations;
  const showSourceFilter = hasGiftCardModule && hasReservationsModule;

  const fetchCustomersCached = restaurantContext?.fetchCustomersCached;
  const invalidateCustomersCache = restaurantContext?.invalidateCustomersCache;
  const peekCustomersCache = restaurantContext?.peekCustomersCache;

  const [bootstrapped, setBootstrapped] = useState(false);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);

  const [tagFilter, setTagFilter] = useState("all");
  const normalizedDefaultSourceFilter =
    defaultSourceFilter === "reservations" ||
    defaultSourceFilter === "gift_cards"
      ? defaultSourceFilter
      : "all";
  const hasAppliedDefaultSourceRef = useRef(false);
  const [sourceFilter, setSourceFilter] = useState(
    normalizedDefaultSourceFilter,
  );

  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 30,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteProcessing, setDeleteProcessing] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const requestIdRef = useRef(0);

  // ✅ sidebar state (comme paramètres)
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    if (!showSourceFilter) {
      if (sourceFilter !== "all") setSourceFilter("all");
      return;
    }

    if (!hasAppliedDefaultSourceRef.current) {
      hasAppliedDefaultSourceRef.current = true;
      setSourceFilter(normalizedDefaultSourceFilter);
    }
  }, [showSourceFilter, sourceFilter, normalizedDefaultSourceFilter]);

  useEffect(() => {
    setPagination((p) => ({ ...p, page: 1 }));
  }, [debouncedQuery, tagFilter, sourceFilter]);

  const fetchCustomers = async ({
    page = pagination.page,
    limit = pagination.limit,
    silent = false,
    force = false,
  } = {}) => {
    if (!restaurantId) return;
    if (!fetchCustomersCached) return;

    const rid = ++requestIdRef.current;

    // cache sync (no skeleton)
    if (!force && peekCustomersCache) {
      const cached = peekCustomersCache({
        rid: restaurantId,
        page,
        limit,
        query: debouncedQuery,
        tag: tagFilter,
        source: sourceFilter,
        showSourceFilter,
        ttlMs: 600_000,
      });

      if (cached) {
        if (rid !== requestIdRef.current) return;

        setCustomers(Array.isArray(cached?.customers) ? cached.customers : []);
        const pg = cached?.pagination || {};
        setPagination({
          page: pg.page ?? page,
          limit: pg.limit ?? limit,
          total: pg.total ?? 0,
          totalPages: pg.totalPages ?? 1,
        });
        return;
      }
    }

    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }

    try {
      const data = await fetchCustomersCached({
        rid: restaurantId,
        page,
        limit,
        query: debouncedQuery,
        tag: tagFilter,
        source: sourceFilter,
        showSourceFilter,
        ttlMs: 600_000,
        force,
      });

      if (rid !== requestIdRef.current) return;

      setCustomers(Array.isArray(data?.customers) ? data.customers : []);
      const pg = data?.pagination || {};
      setPagination({
        page: pg.page ?? page,
        limit: pg.limit ?? limit,
        total: pg.total ?? 0,
        totalPages: pg.totalPages ?? 1,
      });
    } catch (e) {
      if (rid !== requestIdRef.current) return;
      setLoadError(
        e?.response?.data?.message ||
          "Une erreur est survenue lors du chargement des clients.",
      );
      setCustomers([]);
      setPagination((p) => ({ ...p, total: 0, totalPages: 1 }));
    } finally {
      if (rid === requestIdRef.current && !silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers({ page: pagination.page, limit: pagination.limit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    restaurantId,
    pagination.page,
    pagination.limit,
    debouncedQuery,
    tagFilter,
    sourceFilter,
    showSourceFilter,
  ]);

  useEffect(() => {
    if (!restaurantId) return;
    setBootstrapped(false);

    if (peekCustomersCache) {
      const cached = peekCustomersCache({
        rid: restaurantId,
        page: pagination.page,
        limit: pagination.limit,
        query: debouncedQuery,
        tag: tagFilter,
        source: sourceFilter,
        showSourceFilter,
        ttlMs: 600_000,
      });

      if (cached) {
        setCustomers(Array.isArray(cached?.customers) ? cached.customers : []);
        const pg = cached?.pagination || {};
        setPagination((p) => ({
          ...p,
          page: pg.page ?? p.page,
          limit: pg.limit ?? p.limit,
          total: pg.total ?? 0,
          totalPages: pg.totalPages ?? 1,
        }));
      }
    }

    setBootstrapped(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

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
    if (!deleteTarget?._id || !restaurantId) return;

    setDeleteProcessing(true);
    setDeleteError(null);

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setDeleteProcessing(false);
      setDeleteError("Session expirée.");
      return;
    }

    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/customers/${deleteTarget._id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setConfirmOpen(false);

      if (drawerOpen && selectedCustomer?._id === deleteTarget?._id) {
        setDrawerOpen(false);
        setSelectedCustomer(null);
      }

      invalidateCustomersCache?.(restaurantId);
      await fetchCustomers({
        page: 1,
        limit: pagination.limit,
        silent: true,
        force: true,
      });
      setPagination((p) => ({ ...p, page: 1 }));
    } catch (e) {
      setDeleteError(
        e?.response?.data?.message ||
          "Une erreur est survenue lors de la suppression.",
      );
    } finally {
      setDeleteProcessing(false);
    }
  };

  const totalCountLabel = useMemo(() => {
    const n = pagination?.total ?? 0;
    return `${n} client${n > 1 ? "s" : ""}`;
  }, [pagination?.total]);

  if (!restaurantId) return null;
  if (!bootstrapped) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* ✅ Sidebar */}
      <SidebarReservationsWebapp
        open={sidebarOpen}
        onClose={closeSidebar}
        title={sidebarTitle}
        module={sidebarModule}
      />

      {/* ✅ Header */}
      <div className="flex flex-col gap-3">
        <div className="h-[50px] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={openSidebar}
            className="shrink-0 inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/50 active:scale-[0.98] transition p-3"
            aria-label="Menu"
            title="Menu"
          >
            <Menu className="size-5 text-darkBlue/70" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-darkBlue truncate">
              Fichier clients
            </h1>

            <span className="text-xs font-semibold text-darkBlue/50">
              {totalCountLabel}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex items-center gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-3 shadow-sm">
          <Search className="size-4 text-darkBlue/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (nom, email, téléphone)…"
            className="w-full outline-none text-sm text-darkBlue placeholder:text-darkBlue/40 bg-white pr-8"
          />

          {query ? (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-8 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
              aria-label="Effacer"
              title="Effacer"
              type="button"
            >
              <X className="size-4 text-darkBlue/60" />
            </button>
          ) : null}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-1">
          {showSourceFilter ? (
            <div className="flex items-center gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-3 shadow-sm">
              <Filter className="size-4 text-darkBlue/40" />
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="bg-white outline-none text-sm text-darkBlue w-full"
              >
                <option value="all">Tous</option>
                <option value="reservations">Réservations</option>
                <option value="gift_cards">Cartes cadeaux</option>
              </select>
            </div>
          ) : null}

          <div className="flex items-center gap-2 bg-white border border-darkBlue/10 rounded-2xl px-3 py-3 shadow-sm">
            <Tag className="size-4 text-darkBlue/40" />
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="bg-white outline-none text-sm text-darkBlue w-full"
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

      {/* Error */}
      {loadError ? (
        <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
          {loadError}
        </div>
      ) : null}

      <div className="rounded-3xl border border-darkBlue/10 bg-white/50 shadow-sm overflow-hidden">
        <div className="divide-y divide-darkBlue/10">
          {(loading ? Array.from({ length: 8 }) : customers).map((c, idx) => {
            if (loading) {
              return (
                <div key={`sk-${idx}`} className="px-4 py-4 bg-white/30">
                  <div className="flex items-center gap-3">
                    <div className="size-11 rounded-full bg-darkBlue/10" />
                    <div className="flex-1">
                      <div className="h-4 w-40 bg-darkBlue/10 rounded-xl mb-2" />
                      <div className="h-3 w-56 bg-darkBlue/10 rounded-xl" />
                    </div>
                  </div>
                </div>
              );
            }

            const hasTags = Array.isArray(c.tags) && c.tags.length;

            return (
              <div
                key={c._id}
                className="
                               grid grid-cols-1 tablet:grid-cols-[56px_1.1fr_1.1fr_1fr_1.6fr_1fr_48px]
                               gap-3 px-4 py-4 tablet:py-3
                               desktop:hover:bg-darkBlue/5 transition
                             "
              >
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

                  {/* ✅ si pas de tag => tel/mail/arrow sur la même ligne */}
                  {!(Array.isArray(c.tags) && c.tags.length) ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
                        onClick={() => {
                          if (!c.phone) return;
                          window.location.href = `tel:${String(c.phone).replace(
                            /\s/g,
                            "",
                          )}`;
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
                      window.location.href = `tel:${String(c.phone).replace(
                        /\s/g,
                        "",
                      )}`;
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

                {/* Tags + tooltip */}
                <div className="hidden tablet:flex items-center gap-2 flex-wrap">
                  {(c.tags || []).length ? (
                    c.tags
                      .slice(0, 2)
                      .map((tagKey) => (
                        <TagPill
                          key={`${c._id}-${tagKey}`}
                          tagKey={tagKey}
                          tooltipKey={`${c._id}-tag-${tagKey}`}
                          hoveredTooltip={hoveredTooltip}
                          setHoveredTooltip={setHoveredTooltip}
                        />
                      ))
                  ) : (
                    <span className="text-xs text-darkBlue/40">-</span>
                  )}
                </div>

                {/* Arrow only */}
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

                {/* Mobile tags line + tel/mail buttons */}
                {Array.isArray(c.tags) && c.tags.length ? (
                  <div className="tablet:hidden flex justify-between items-center gap-2">
                    <div className="flex flex-wrap gap-2">
                      {c.tags.slice(0, 2).map((tagKey) => (
                        <TagPill
                          key={`${c._id}-${tagKey}`}
                          tagKey={tagKey}
                          tooltipKey={`${c._id}-tag-${tagKey}`}
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
                          window.location.href = `tel:${String(c.phone).replace(
                            /\s/g,
                            "",
                          )}`;
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
            );
          })}

          {bootstrapped && !loading && !customers.length ? (
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
      <div className="flex items-center justify-center gap-2 px-1 py-2">
        <button
          className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2 disabled:opacity-50"
          disabled={pagination.page <= 1 || loading}
          onClick={() =>
            setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
          }
          aria-label="Page précédente"
          type="button"
        >
          <ChevronLeft className="size-4 text-darkBlue/70" />
        </button>

        <div className="text-sm px-4 py-2 rounded-xl font-semibold text-darkBlue border border-darkBlue/10 bg-white">
          {pagination.page} / {pagination.totalPages}
        </div>

        <button
          className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2 disabled:opacity-50"
          disabled={pagination.page >= pagination.totalPages || loading}
          onClick={() =>
            setPagination((p) => ({
              ...p,
              page: Math.min(p.totalPages, p.page + 1),
            }))
          }
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
        restaurantId={restaurantId}
        onUpdated={() => {
          invalidateCustomersCache?.(restaurantId);
          fetchCustomers({
            page: pagination.page,
            limit: pagination.limit,
            silent: true,
            force: true,
          });
        }}
        onAction={(customer, actionType) => {
          if (actionType === "delete") requestDelete(customer);
        }}
      />

      {/* Confirm delete modal */}
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
