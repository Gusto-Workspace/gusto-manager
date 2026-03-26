import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
// AXIOS
import axios from "axios";
// CONTEXT
import { GlobalContext } from "@/contexts/global.context";
// I18N
import { useTranslation } from "next-i18next";
// SVG
import { GiftSvg } from "../../_shared/_svgs/gift.svg";
import {
  CalendarDays,
  ChevronDown,
  CreditCard,
  ExternalLink,
  Hash,
  User,
} from "lucide-react";
import PurshasesDrawerGiftCardsComponent from "../../_shared/gift-cards/purshases-drawer.gift-cards.component";

export default function PurchasesGiftListComponent(props) {
  const { t } = useTranslation("gifts");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  // 🔗 On lit toujours la liste dans le CONTEXT (mise à jour par SSE)
  const purchasesGiftCards =
    restaurantContext.restaurantData?.purchasesGiftCards || [];

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const autoOpenedPurchaseRef = useRef(null);
  const focusedPurchaseId =
    typeof router.query.purchaseId === "string"
      ? router.query.purchaseId
      : null;

  // ----- Styles communs -----
  const headerTitleCls = "pl-2 text-xl tablet:text-2xl text-darkBlue";
  const searchInputCls =
    "h-10 w-full rounded-xl border border-darkBlue/15 bg-white/90 px-3 pr-9 text-base outline-none placeholder:text-darkBlue/40 shadow-sm focus:border-blue/60 focus:ring-1 focus:ring-blue/30";
  const statusChipWrap = "flex items-center gap-3 my-4 max-w-3xl mx-auto px-2";
  const statusChipLine = "h-px flex-1 bg-darkBlue/10";
  const statusChipLabel =
    "inline-flex items-center justify-center rounded-full border px-5 py-1.5 text-[11px] font-semibold tracking-[0.18em] uppercase shadow-sm";
  const emptyBoxCls =
    "p-5 rounded-2xl w-full border border-dashed border-darkBlue/10 bg-white/50 text-center text-sm text-darkBlue/60 mx-auto";
  const detailsCardCls =
    "w-full text-left rounded-2xl border border-darkBlue/10 bg-white/70 shadow-sm hover:shadow-md transition-shadow p-4";
  const metaPill =
    "inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white/70 px-2.5 py-1 text-[12px] font-semibold text-darkBlue/80";

  // Couleurs pour les badges de statuts
  const statusColor = {
    Valid: "bg-[#4ead7a1a] text-[#166534] border-[#4ead7a80]",
    Used: "bg-[#4f46e51a] text-[#312e81] border-[#4f46e580]",
    Expired: "bg-[#ef44441a] text-[#b91c1c] border-[#ef444480]",
    Archived: "bg-[#e5e7eb] text-[#4b5563] border-[#d1d5db]",
  };

  // ----- Utils -----
  const normalize = (str = "") =>
    str
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

  // Group by status
  const purchasesByStatus = useMemo(() => {
    const groups = { Valid: [], Used: [], Expired: [], Archived: [] };
    const sorted = [...purchasesGiftCards].sort((a, b) => {
      const da = getCreatedDate(a)?.getTime() || 0;
      const db = getCreatedDate(b)?.getTime() || 0;
      return da - db;
    });

    sorted.forEach((purchase) => {
      if (groups[purchase.status]) {
        groups[purchase.status].push(purchase);
      }
    });

    return groups;
  }, [purchasesGiftCards]);

  // Search filter inside each status
  const filteredByStatus = useMemo(() => {
    const norm = normalize(searchTerm);
    const filterFn = (p) =>
      [
        p.purchaseCode,
        p.beneficiaryFirstName,
        p.beneficiaryLastName,
        p.sender,
        p.sendEmail,
      ].some((field) => normalize(field).includes(norm));

    return {
      Valid: purchasesByStatus.Valid.filter(filterFn),
      Used: purchasesByStatus.Used.filter(filterFn),
      Expired: purchasesByStatus.Expired.filter(filterFn),
      Archived: purchasesByStatus.Archived.filter(filterFn),
    };
  }, [purchasesByStatus, searchTerm]);

  const statusTranslations = {
    Valid: t("labels.valid"),
    Used: t("labels.used"),
    Expired: t("labels.expired"),
    Archived: t("labels.archived"),
  };

  const handleSearchChange = (e) => setSearchTerm(e.target.value);

  function openDetails(purchase) {
    setSelectedPurchase(purchase);
    setDetailsOpen(true);
  }

  function closeDetails() {
    const scrollY = typeof window !== "undefined" ? window.scrollY || 0 : 0;

    setDetailsOpen(false);
    setSelectedPurchase(null);

    if (!router.isReady || !focusedPurchaseId) return;

    const nextQuery = { ...router.query };
    delete nextQuery.purchaseId;

    router
      .replace(
        {
          pathname: router.pathname,
          query: nextQuery,
        },
        undefined,
        { shallow: true, scroll: false },
      )
      .finally(() => {
        if (typeof window === "undefined") return;

        window.requestAnimationFrame(() => {
          window.scrollTo(0, scrollY);
        });
      });
  }

  const handleDrawerAction = async (purchase, type) => {
    closeDetails();

    if (!purchase) return;

    const baseUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext.restaurantData._id}/purchases/${purchase._id}`;
    const url =
      type === "Used"
        ? `${baseUrl}/use`
        : type === "Valid"
          ? `${baseUrl}/validate`
          : `${baseUrl}/delete`;

    const method = type === "Delete" ? "delete" : "put";

    try {
      const response = await axios[method](url);
      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        purchasesGiftCards: response.data.restaurant.purchasesGiftCards,
      }));
    } catch (error) {
      console.error("Erreur action carte cadeau :", error);
    }
  };

  useEffect(() => {
    if (!focusedPurchaseId) {
      autoOpenedPurchaseRef.current = null;
      return;
    }

    if (autoOpenedPurchaseRef.current === focusedPurchaseId) return;

    const targetPurchase = purchasesGiftCards.find(
      (purchase) => String(purchase?._id) === String(focusedPurchaseId),
    );

    if (!targetPurchase) return;

    autoOpenedPurchaseRef.current = focusedPurchaseId;
    openDetails(targetPurchase);
  }, [focusedPurchaseId, purchasesGiftCards]);

  return (
    <div className="flex flex-col gap-6 mt-4">
      {/* Header + search */}
      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
        <div className="flex gap-2 items-center min-h-[40px]">
          <GiftSvg width={30} height={30} fillColor="#131E3690" />
          <h1 className={headerTitleCls}>{t("titles.second")}</h1>
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
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-darkBlue/10 text-[11px] text-darkBlue hover:bg-darkBlue/20 transition"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Lists par statut */}
      <div className="flex flex-col gap-10">
        {["Valid", "Used", "Expired", "Archived"].map((status) => {
          const items = filteredByStatus[status] || [];
          const isArchived = status === "Archived";

          return (
            <div key={status} className="flex flex-col gap-4">
              {/* Badge de catégorie coloré + lignes */}
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
                    ({items.length})
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

              {/* Si ARCHIVED est replié, on n’affiche pas la liste */}
              {isArchived && !archivedOpen ? null : items.length > 0 ? (
                <ul className="flex flex-col gap-1 max-h-[570px] overflow-y-auto">
                  {items.map((purchase) => {
                    const createdDate = getCreatedDate(purchase);

                    return (
                      <li key={purchase._id} className="w-full">
                        <div className={detailsCardCls}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  <User className="size-4 text-darkBlue/45 shrink-0" />
                                  <p className="font-semibold text-darkBlue truncate">
                                    {`${purchase?.beneficiaryFirstName || ""} ${
                                      purchase?.beneficiaryLastName || ""
                                    }`.trim() || "-"}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap justify-between items-center gap-2">
                                <div className="flex gap-1 flex-wrap">
                                  <span className={metaPill}>
                                    <CreditCard className="size-3.5 opacity-50" />
                                    {purchase?.value ?? 0}€
                                  </span>

                                  <span className={metaPill}>
                                    <Hash className="size-3.5 opacity-50" />
                                    <span className="font-mono font-normal text-[12px]">
                                      {purchase?.purchaseCode || "-"}
                                    </span>
                                  </span>

                                  {createdDate ? (
                                    <span className={metaPill}>
                                      <CalendarDays className="size-3.5 opacity-50" />
                                      {createdDate.toLocaleDateString("fr-FR")}
                                    </span>
                                  ) : null}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => openDetails(purchase)}
                                  className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2 text-xs font-semibold text-darkBlue"
                                  aria-label={t("labels.details", "Détails")}
                                  title={t("labels.details", "Détails")}
                                >
                                  <ExternalLink className="size-4 text-darkBlue/60" />
                                  Détails
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className={emptyBoxCls}>
                  <p className="italic">{t("labels.emptyCard")}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <PurshasesDrawerGiftCardsComponent
        open={detailsOpen}
        onClose={closeDetails}
        purchase={selectedPurchase}
        t={t}
        onAction={handleDrawerAction}
      />
    </div>
  );
}
