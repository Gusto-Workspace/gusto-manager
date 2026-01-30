import { useContext, useMemo, useState } from "react";
// AXIOS
import axios from "axios";
// CONTEXT
import { GlobalContext } from "@/contexts/global.context";
// I18N
import { useTranslation } from "next-i18next";
// SVG
import { GiftSvg } from "../../../_shared/_svgs/_index";

// LUCIDE
import {
  CalendarDays,
  CreditCard,
  ExternalLink,
  Hash,
  User,
} from "lucide-react";
import { ChevronDown } from "lucide-react";

// ✅ Bottomsheet
import BottomSheetPurchasesComponent from "./bottom-sheet-purshases.gift-cards.component";

export default function WebAppPurchasesGiftListComponent(props) {
  const { t } = useTranslation("gifts");
  const { restaurantContext } = useContext(GlobalContext);

  // 🔗 SSE-friendly: always from context
  const purchasesGiftCards =
    restaurantContext.restaurantData?.purchasesGiftCards || [];

  const [searchTerm, setSearchTerm] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);

  // ✅ Bottomsheet
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);

  // ✅ UX: “Afficher plus” par statut
  const STEP = 10;
  const [visibleCount, setVisibleCount] = useState({
    Valid: STEP,
    Used: STEP,
    Expired: STEP,
    Archived: STEP,
  });

  // ----- Styles -----
  const headerTitleCls = "pl-2 text-xl tablet:text-2xl text-darkBlue";

  const searchInputCls =
    "h-10 w-full rounded-xl border border-darkBlue/15 bg-white/90 px-3 pr-9 text-base outline-none placeholder:text-darkBlue/40 shadow-sm focus:border-blue/60 focus:ring-1 focus:ring-blue/30";

  const statusChipWrap = "flex items-center gap-3 my-4 max-w-3xl mx-auto px-2";
  const statusChipLine = "h-px flex-1 bg-darkBlue/10";
  const statusChipLabel =
    "inline-flex items-center justify-center rounded-full border px-5 py-1.5 text-[11px] font-semibold tracking-[0.18em] uppercase shadow-sm";

  const emptyBoxCls =
    "p-5 rounded-2xl w-full border border-dashed border-darkBlue/10 bg-white/50 text-center text-sm text-darkBlue/60 mx-auto";

  const btnMore =
    "inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-4 h-11 text-sm font-semibold text-darkBlue";

  // ✅ Sticky header (webapp feel)
  // - top-0 : colle au haut du scroll container
  // - bg-white/50 : ton style webapp
  // - backdrop-blur : effet “app”
  // - z-20 : au-dessus des listes
  const stickyHeaderWrap =
    "sticky top-0 z-20 -mx-2 px-2 pt-2 pb-3 bg-white/50 backdrop-blur-md border-b border-darkBlue/10";

  // Statuts couleurs (inchangé)
  const statusColor = {
    Valid: "bg-[#4ead7a1a] text-[#166534] border-[#4ead7a80]",
    Used: "bg-[#4f46e51a] text-[#312e81] border-[#4f46e580]",
    Expired: "bg-[#ef44441a] text-[#b91c1c] border-[#ef444480]",
    Archived: "bg-[#e5e7eb] text-[#4b5563] border-[#d1d5db]",
  };

  // ----- Utils -----
  const normalize = (str = "") =>
    str
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const objectIdToDate = (oid) =>
    new Date(parseInt(String(oid).substring(0, 8), 16) * 1000);

  const getCreatedDate = (purchase) => {
    if (purchase.created_at) return new Date(purchase.created_at);
    if (purchase.createdAt) return new Date(purchase.createdAt);
    if (purchase._id) return objectIdToDate(purchase._id);
    return null;
  };

  const formatName = (p) =>
    `${p?.beneficiaryFirstName || ""} ${p?.beneficiaryLastName || ""}`.trim() ||
    "-";

  // ✅ Sort once (newest first)
  const sortedPurchases = useMemo(() => {
    return [...purchasesGiftCards].sort((a, b) => {
      const da = getCreatedDate(a)?.getTime() || 0;
      const db = getCreatedDate(b)?.getTime() || 0;
      return db - da;
    });
  }, [purchasesGiftCards]);

  const filteredSortedPurchases = useMemo(() => {
    const norm = normalize(searchTerm);
    if (!norm) return sortedPurchases;

    const filterFn = (p) => {
      const fullName =
        `${p?.beneficiaryFirstName || ""} ${p?.beneficiaryLastName || ""}`.trim();
      const fullNameRev =
        `${p?.beneficiaryLastName || ""} ${p?.beneficiaryFirstName || ""}`.trim();

      const haystacks = [
        p.purchaseCode,
        p.beneficiaryFirstName,
        p.beneficiaryLastName,

        // ✅ champ virtuel prénom + nom
        fullName,
        fullNameRev,

        // ✅ versions sans espaces (si l’utilisateur tape "pauls")
        fullName.replace(/\s+/g, ""),
        fullNameRev.replace(/\s+/g, ""),

        p.sender,
        p.sendEmail,
        p.value != null ? String(p.value) : "",
      ].map((x) => normalize(x));

      return haystacks.some((h) => h.includes(norm));
    };

    return sortedPurchases.filter(filterFn);
  }, [sortedPurchases, searchTerm]);

  // ✅ Group by status AFTER filtering
  const filteredByStatus = useMemo(() => {
    const groups = { Valid: [], Used: [], Expired: [], Archived: [] };

    filteredSortedPurchases.forEach((purchase) => {
      const st = purchase?.status;
      if (groups[st]) groups[st].push(purchase);
    });

    return groups;
  }, [filteredSortedPurchases]);

  const statusTranslations = {
    Valid: t("labels.valid"),
    Used: t("labels.used"),
    Expired: t("labels.expired"),
    Archived: t("labels.archived"),
  };

  const handleSearchChange = (e) => {
    const next = e?.target?.value ?? "";
    setSearchTerm(next);

    // ✅ reset pagination pour éviter des sections “vides” après search
    setVisibleCount({ Valid: STEP, Used: STEP, Expired: STEP, Archived: STEP });

    // ✅ si on cherche, on ouvre automatiquement Archived pour éviter “je trouve rien”
    // (sinon tu peux le retirer)
    if (normalize(next)) setArchivedOpen(true);
  };

  const clearSearch = () => handleSearchChange({ target: { value: "" } });

  // ✅ open details only via CTA button (pas toute la card)
  const openDetails = (purchase) => {
    setSelectedPurchase(purchase);
    setDetailsOpen(true);
  };
  const closeDetails = () => setDetailsOpen(false);

  // ✅ API actions (only from bottomsheet)
  const runAction = async (purchase, type) => {
    if (!purchase) return;

    const baseUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext.restaurantData._id}/purchases/${purchase._id}`;
    const url =
      type === "Used"
        ? `${baseUrl}/use`
        : type === "Valid"
          ? `${baseUrl}/validate`
          : `${baseUrl}/delete`;

    const method = type === "Delete" ? "delete" : "put";
    const response = await axios[method](url);

    restaurantContext.setRestaurantData((prev) => ({
      ...prev,
      purchasesGiftCards: response.data.restaurant.purchasesGiftCards,
    }));
  };

  // ✅ Actions from bottomsheet
  const handleDrawerAction = async (purchase, type) => {
    setDetailsOpen(false);

    try {
      await runAction(purchase, type); // "Used" | "Valid" | "Delete"
    } catch (e) {
      console.error("Erreur action carte cadeau :", e);
    }
  };

  // Card helpers
  const metaPill =
    "inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-darkBlue/80";

  // ✅ Webapp UX: when searching, show ALL results (no “show more” limit)
  // -> This is the key fix for your issue: search must feel exhaustive.
  const isSearching = Boolean(normalize(searchTerm));
  const getVisibleForStatus = (status, total) => {
    if (isSearching) return total; // show all matched results
    return Math.min(visibleCount[status] || STEP, total);
  };

  // Optional: total results badge in header
  const totalResults = useMemo(() => {
    if (!isSearching) return null;
    return (
      (filteredByStatus.Valid?.length || 0) +
      (filteredByStatus.Used?.length || 0) +
      (filteredByStatus.Expired?.length || 0) +
      (filteredByStatus.Archived?.length || 0)
    );
  }, [filteredByStatus, isSearching]);

  return (
    <>
      <div className="flex flex-col gap-6 mt-6 px-2">
        {/* ✅ Sticky header + search */}
        <div className={stickyHeaderWrap}>
          <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
            <div className="flex gap-2 items-center min-h-[40px]">
              <GiftSvg width={30} height={30} fillColor="#131E3690" />
              <div className="flex items-baseline gap-2">
                <h1 className={headerTitleCls}>{t("titles.second")}</h1>

                {isSearching ? (
                  <span className="text-xs font-semibold text-darkBlue/50">
                    {totalResults != null ? `(${totalResults})` : null}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="relative w-full tablet:max-w-xs">
              <input
                type="text"
                placeholder={t(
                  "placeholders.search",
                  "Rechercher un code, un bénéficiaire, un email ...",
                )}
                value={searchTerm}
                onChange={handleSearchChange}
                className={searchInputCls}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-darkBlue/10 text-xs text-darkBlue hover:bg-darkBlue/20 transition"
                  aria-label="clear"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* ✅ Small helper line (webapp feel) */}
          {isSearching ? (
            <div className="mt-2 text-xs text-darkBlue/60">
              {t("labels.searching", "Recherche en cours")} :{" "}
              <span className="font-semibold text-darkBlue/70">
                “{searchTerm}”
              </span>
            </div>
          ) : null}
        </div>

        {/* Lists par statut */}
        <div className="flex flex-col gap-10 pb-2">
          {["Valid", "Used", "Expired", "Archived"].map((status) => {
            const itemsAll = filteredByStatus[status] || [];
            const isArchived = status === "Archived";

            const visible = getVisibleForStatus(status, itemsAll.length);
            const items = itemsAll.slice(0, visible);

            // In search mode, no "show more"
            const hasMore = !isSearching && visible < itemsAll.length;

            return (
              <div key={status} className="flex flex-col gap-4">
                {/* Badge de catégorie */}
                <div className={statusChipWrap}>
                  <div className={statusChipLine} />

                  <button
                    type="button"
                    className={`
                      ${statusChipLabel} ${statusColor[status]}
                      ${isArchived ? "cursor-pointer" : ""}
                      inline-flex items-center gap-2
                    `}
                    onClick={
                      isArchived
                        ? () => setArchivedOpen((prev) => !prev)
                        : undefined
                    }
                  >
                    <span>{statusTranslations[status]}</span>
                    <span className="ml-1 text-xs opacity-70">
                      ({itemsAll.length})
                    </span>
                    {isArchived && (
                      <ChevronDown
                        className={`size-3 transition-transform ${
                          archivedOpen ? "rotate-180" : ""
                        }`}
                      />
                    )}
                  </button>

                  <div className={statusChipLine} />
                </div>

                {/* ARCHIVED fermé => rien */}
                {isArchived && !archivedOpen ? null : itemsAll.length > 0 ? (
                  <>
                    <ul className="flex flex-col gap-2">
                      {items.map((purchase) => {
                        const createdDate = getCreatedDate(purchase);

                        return (
                          <li key={purchase._id} className="w-full">
                            <div className="w-full text-left rounded-2xl border border-darkBlue/10 bg-white/70 shadow-sm hover:shadow-md transition-shadow p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  {/* Top row: beneficiary */}
                                  <div className="flex justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <User className="size-4 text-darkBlue/45 shrink-0" />
                                      <p className="font-semibold text-darkBlue truncate">
                                        {formatName(purchase)}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Meta pills + CTA */}
                                  <div className="mt-2 flex flex-wrap justify-between items-center gap-2">
                                    <div className="flex gap-1 flex-wrap">
                                      <span className={metaPill}>
                                        <CreditCard className="size-3.5 opacity-50" />
                                        {purchase?.value ?? 0}€
                                      </span>

                                      <span className={metaPill}>
                                        <Hash className="size-3.5 opacity-50" />
                                        <span className="font-mono text-[11px]">
                                          {purchase?.purchaseCode || "-"}
                                        </span>
                                      </span>

                                      {createdDate ? (
                                        <span className={metaPill}>
                                          <CalendarDays className="size-3.5 opacity-50" />
                                          {createdDate.toLocaleDateString(
                                            "fr-FR",
                                          )}
                                        </span>
                                      ) : null}
                                    </div>

                                    {/* ✅ CTA “détails” ONLY */}
                                    <button
                                      type="button"
                                      onClick={() => openDetails(purchase)}
                                      className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2 text-xs font-semibold text-darkBlue"
                                      aria-label={t(
                                        "labels.details",
                                        "Détails",
                                      )}
                                      title={t("labels.details", "Détails")}
                                    >
                                      <ExternalLink className="size-4 text-darkBlue/60" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {/* ✅ UX: Afficher plus (disabled in search mode) */}
                    {hasMore ? (
                      <button
                        type="button"
                        className={btnMore}
                        onClick={() =>
                          setVisibleCount((prev) => ({
                            ...prev,
                            [status]: (prev[status] || STEP) + STEP,
                          }))
                        }
                      >
                        {t("buttons.showMore", "Afficher plus")} (
                        {itemsAll.length - visible})
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className={emptyBoxCls}>
                    <p className="italic">{t("labels.emptyCard")}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ✅ BOTTOMSHEET */}
      <BottomSheetPurchasesComponent
        open={detailsOpen}
        onClose={closeDetails}
        purchase={selectedPurchase}
        t={t}
        onAction={handleDrawerAction} // (purchase, "Used"|"Valid"|"Delete")
      />
    </>
  );
}
