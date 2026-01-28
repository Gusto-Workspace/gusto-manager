import { useContext, useState, useMemo } from "react";
// AXIOS
import axios from "axios";
// CONTEXT
import { GlobalContext } from "@/contexts/global.context";
// I18N
import { useTranslation } from "next-i18next";
// SVG
import { GiftSvg } from "../../_shared/_svgs/gift.svg";
import { TrashSvg } from "../../_shared/_svgs/trash.svg";
import { ChevronDown } from "lucide-react";

export default function PurchasesGiftListComponent(props) {
  const { t } = useTranslation("gifts");
  const { restaurantContext } = useContext(GlobalContext);

  // 🔗 On lit toujours la liste dans le CONTEXT (mise à jour par SSE)
  const purchasesGiftCards =
    restaurantContext.restaurantData?.purchasesGiftCards || [];

  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [actionType, setActionType] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);

  // ----- Styles communs -----
  const headerTitleCls = "pl-2 text-xl tablet:text-2xl text-darkBlue";
  const searchInputCls =
    "h-10 w-full rounded-xl border border-darkBlue/15 bg-white/90 px-3 pr-9 text-sm outline-none placeholder:text-darkBlue/40 shadow-sm focus:border-blue/60 focus:ring-1 focus:ring-blue/30";
  const statusChipWrap = "flex items-center gap-3 my-4 max-w-3xl mx-auto px-2";
  const statusChipLine = "h-px flex-1 bg-darkBlue/10";
  const statusChipLabel =
    "inline-flex items-center justify-center rounded-full border px-5 py-1.5 text-[11px] font-semibold tracking-[0.18em] uppercase shadow-sm";
  const btnPrimary =
    "inline-flex items-center justify-center rounded-xl bg-blue px-4 py-2 text-xs font-medium text-white shadow hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const emptyBoxCls =
    "p-5 rounded-2xl w-full border border-dashed border-darkBlue/10 bg-white/50 text-center text-sm text-darkBlue/60 mx-auto";
  const modalOverlayCls = "fixed inset-0 bg-black/25 backdrop-blur-[1px]";
  const modalCardCls =
    "relative w-full max-w-[460px] rounded-2xl border border-darkBlue/10 bg-white/95 px-5 py-6 tablet:px-7 tablet:py-7 shadow-[0_22px_55px_rgba(19,30,54,0.20)] flex flex-col gap-5";
  const modalBtnPrimary =
    "inline-flex items-center justify-center rounded-xl bg-blue px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-blue/90 transition";
  const modalBtnSecondary =
    "inline-flex items-center justify-center rounded-xl bg-red px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-red/90 transition";

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

  function handleActionConfirm() {
    if (!selectedPurchase || !actionType) return;

    const baseUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext.restaurantData._id}/purchases/${selectedPurchase._id}`;
    const url =
      actionType === "Used"
        ? `${baseUrl}/use`
        : actionType === "Valid"
          ? `${baseUrl}/validate`
          : `${baseUrl}/delete`;

    const method = actionType === "Delete" ? "delete" : "put";

    axios[method](url)
      .then((response) => {
        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          purchasesGiftCards: response.data.restaurant.purchasesGiftCards,
        }));
        setIsModalOpen(false);
        setSelectedPurchase(null);
        setActionType("");
      })
      .catch((error) => {
        console.error("Erreur mise à jour carte cadeau :", error);
        setIsModalOpen(false);
      });
  }

  function handleDeleteGiftCard(purchase) {
    setSelectedPurchase(purchase);
    setActionType("Delete");
    setIsModalOpen(true);
  }

  function handleActionClick(purchase, type) {
    setSelectedPurchase(purchase);
    setActionType(type);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setSelectedPurchase(null);
    setActionType("");
  }

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
              "Rechercher un code, un bénéficiaire, un email ..."
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
                      <li
                        key={purchase._id}
                        className="relative flex flex-col gap-3 tablet:flex-row tablet:items-end justify-between rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-4"
                      >
                        {/* Bouton supprimer */}
                        <button
                          type="button"
                          className="group absolute right-3 top-3 inline-flex items-center justify-center rounded-full bg-white shadow-sm border border-red/10 p-1.5 hover:bg-red/5"
                          onClick={() => handleDeleteGiftCard(purchase)}
                        >
                          <TrashSvg
                            height={22}
                            width={22}
                            strokeColor="#FF7664"
                            className="group-hover:rotate-12 transition-transform duration-200"
                          />
                        </button>

                        {/* Infos principales */}
                        <div className="flex flex-col gap-1 text-sm text-darkBlue">
                          <p className="font-semibold">
                            {t("labels.amount")} : {purchase.value}€
                          </p>

                          {purchase.description && (
                            <p className="text-xs text-darkBlue/70">
                              {t("labels.description")} : {purchase.description}
                            </p>
                          )}

                          <p>
                            {t("labels.owner")} :{" "}
                            <span className="font-medium">
                              {purchase.beneficiaryFirstName}{" "}
                              {purchase.beneficiaryLastName}
                            </span>
                          </p>

                          <p>
                            {t("labels.code")} :{" "}
                            <span className="font-mono text-[13px]">
                              {purchase.purchaseCode}
                            </span>
                          </p>

                          <p>
                            {t("labels.sender")} : {purchase.sender}{" "}
                            {purchase.sendEmail && (
                              <span className="text-xs text-darkBlue/40 italic">
                                ({purchase.sendEmail})
                              </span>
                            )}
                          </p>

                          {createdDate && (
                            <p className="text-xs text-darkBlue/70 mt-1">
                              {t("labels.orderedDay")} :{" "}
                              {createdDate.toLocaleDateString("fr-FR")}
                            </p>
                          )}

                          {status === "Valid" && purchase.validUntil && (
                            <p className="text-xs text-darkBlue/70">
                              {t("labels.valididy")} :{" "}
                              {new Date(purchase.validUntil).toLocaleDateString(
                                "fr-FR"
                              )}
                            </p>
                          )}

                          {status === "Used" && purchase.useDate && (
                            <p className="text-xs text-darkBlue/70">
                              {t("labels.useDate")} :{" "}
                              {new Date(purchase.useDate).toLocaleDateString(
                                "fr-FR"
                              )}
                            </p>
                          )}
                        </div>

                        {/* Bouton action statut */}
                        <div className="mt-3 tablet:mt-0 tablet:text-right">
                          {(status === "Valid" || status === "Expired") && (
                            <button
                              type="button"
                              className={btnPrimary}
                              onClick={() =>
                                handleActionClick(purchase, "Used")
                              }
                            >
                              {t("buttons.usedCard")}
                            </button>
                          )}

                          {status === "Used" && (
                            <button
                              type="button"
                              className={btnPrimary}
                              onClick={() =>
                                handleActionClick(purchase, "Valid")
                              }
                            >
                              {t("buttons.revalidateCard")}
                            </button>
                          )}
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

      {/* MODALE CONFIRMATION */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
          <div className={modalOverlayCls} onClick={closeModal} />

          <div className={modalCardCls}>
            <h2 className="text-lg tablet:text-xl font-semibold text-center text-darkBlue">
              {actionType === "Used"
                ? t("labels.confirmUse.title")
                : actionType === "Valid"
                  ? t("labels.confirmRevalidate.title")
                  : t("labels.confirmDelete.title")}
            </h2>

            <p className="text-sm text-center text-darkBlue/80">
              {actionType === "Used"
                ? t("labels.confirmUse.text")
                : actionType === "Valid"
                  ? t("labels.confirmRevalidate.text")
                  : t("labels.confirmDelete.text")}
            </p>

            <div className="mt-2 flex flex-col gap-2 tablet:flex-row tablet:justify-center">
              <button
                type="button"
                className={modalBtnPrimary}
                onClick={handleActionConfirm}
              >
                {t("buttons.confirm")}
              </button>
              <button
                type="button"
                className={modalBtnSecondary}
                onClick={closeModal}
              >
                {t("buttons.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
