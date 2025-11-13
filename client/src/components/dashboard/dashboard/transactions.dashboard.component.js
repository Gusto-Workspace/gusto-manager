import { useState } from "react";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import PayoutsDashboardComponent from "./payouts.dashboard.component";
import PaymentsDashboardComponent from "./payments.dashboard.component";

export default function TransactionsDashboardComponent(props) {
  const { t } = useTranslation("transactions");

  const [selectedOption, setSelectedOption] = useState("payouts");
  const [payoutTxMap, setPayoutTxMap] = useState({});

  const [payoutDataLoading, setPayoutDataLoading] = useState({});
  const [loadMoreLoading, setLoadMoreLoading] = useState({});

  function handleOptionChange(event) {
    setSelectedOption(event.target.value);
  }

  function handleShearchClient(event) {
    props.setClientName(event.target.value);
  }

  function handleResetFilter() {
    props.onResetPayments();
    props.setClientName("");
  }

  // ---- Fonction pour aller chercher les transactions d'un payout ----
  async function fetchPayoutTransactions(payoutId) {
    setPayoutDataLoading((prev) => ({ ...prev, [payoutId]: true }));

    try {
      const restaurantId = props.restaurantId;

      if (!restaurantId) {
        console.error("Restaurant ID introuvable");
        return;
      }

      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}/payouts/${payoutId}/payments`,
        {
          params: { limit: 10 },
        }
      );

      const { payoutTransactions, has_more, last_tx_id } = response.data;

      setPayoutTxMap((prev) => ({
        ...prev,
        [payoutId]: {
          data: payoutTransactions,
          hasMore: has_more,
          lastTxId: last_tx_id,
        },
      }));
    } catch (error) {
      console.error(
        "Erreur lors du fetch des transactions d'un payout :",
        error
      );
    } finally {
      setPayoutDataLoading((prev) => ({ ...prev, [payoutId]: false }));
    }
  }

  // ---- Charger plus de transactions pour un payout ----
  async function loadMorePayoutTx(payoutId) {
    const current = payoutTxMap[payoutId];
    if (!current || !current.hasMore || !current.lastTxId) {
      return;
    }

    setLoadMoreLoading((prev) => ({ ...prev, [payoutId]: true }));

    try {
      const restaurantId = props.restaurantId;
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}/payouts/${payoutId}/payments`,
        {
          params: {
            limit: 10,
            starting_after: current.lastTxId,
          },
        }
      );

      const { payoutTransactions, has_more, last_tx_id } = response.data;

      setPayoutTxMap((prev) => ({
        ...prev,
        [payoutId]: {
          data: [...(current.data || []), ...payoutTransactions],
          hasMore: has_more,
          lastTxId: last_tx_id,
        },
      }));
    } catch (error) {
      console.error(
        "Erreur lors du load more transactions d'un payout :",
        error
      );
    } finally {
      setLoadMoreLoading((prev) => ({ ...prev, [payoutId]: false }));
    }
  }

  return (
    <section className="flex flex-col mt-4 gap-6">
      {/* Bloc sélection + filtres */}
      <section
        className="
          rounded-2xl border border-darkBlue/10 bg-white/50 backdrop-blur-sm
          px-4 py-4 midTablet:px-6 midTablet:py-5
          flex flex-col gap-4
          shadow-[0_18px_45px_rgba(19,30,54,0.06)]
        "
      >
        {/* Ligne select + titre */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base tablet:text-lg font-semibold text-darkBlue">
              {t("title", "Transactions cartes cadeaux")}
            </h2>
            <p className="text-[11px] tablet:text-xs text-darkBlue/60 max-w-xl">
              {selectedOption === "payouts"
                ? t(
                    "payouts.subtitle",
                    "Visualisez les virements reçus et les paiements associés."
                  )
                : t(
                    "payments.subtitle",
                    "Consultez le détail des paiements cartes cadeaux et filtrez par client."
                  )}
            </p>
          </div>

          <div className="relative">
            <select
              value={selectedOption}
              onChange={handleOptionChange}
              className="
                w-[220px] midTablet:w-[260px]
                rounded-xl border border-darkBlue/20 bg-white px-3 py-2
                text-sm text-darkBlue
                shadow-sm
              "
            >
              <option value="payouts">{t("select.payouts")}</option>
              <option value="payments">{t("select.payments")}</option>
            </select>
          </div>
        </div>

        {/* Info texte payouts */}
        {selectedOption === "payouts" && (
          <p className="text-xs tablet:text-sm text-darkBlue/70 leading-relaxed">
            <span className="font-semibold uppercase tracking-wide">
              {t("payouts.information.title")}
            </span>{" "}
            : {t("payouts.information.text")}
          </p>
        )}

        {/* Filtres payments */}
        {selectedOption === "payments" && (
          <div className="flex flex-col midTablet:flex-row gap-4 items-start midTablet:items-center">
            {/* Input + cross */}
            <div className="relative w-full midTablet:w-[320px]">
              <input
                type="text"
                placeholder={t("payments.filter.placeholder")}
                value={props.clientName}
                onChange={handleShearchClient}
                className="
                  w-full rounded-lg border border-darkBlue/25 bg-white
                  px-3 py-2 pr-9 text-sm
                  placeholder:text-darkBlue/40
                "
              />
              {props.clientName && (
                <button
                  type="button"
                  onClick={() => props.setClientName("")}
                  className="
                    absolute right-2 top-1/2 -translate-y-1/2
                    w-6 h-6 rounded-full
                    bg-black/30 text-white
                    flex items-center justify-center text-sm
                  "
                >
                  &times;
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  props.onFetchPaymentsByClient(props.clientName)
                }
                className="
                  inline-flex items-center justify-center gap-2 rounded-lg
                  bg-blue px-4 py-2 text-xs tablet:text-sm font-medium text-white
                  shadow-sm hover:shadow-md hover:opacity-95
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
                disabled={props.filterLoading || !props.clientName}
              >
                {props.filterLoading
                  ? t("payments.filter.button.loading")
                  : t("payments.filter.button.validate")}
              </button>

              {props.isFiltered && (
                <button
                  type="button"
                  onClick={handleResetFilter}
                  className="
                    inline-flex items-center justify-center gap-2 rounded-lg
                    bg-darkBlue/5 px-4 py-2 text-xs tablet:text-sm font-medium text-darkBlue
                    border border-darkBlue/15 hover:bg-darkBlue/8
                  "
                >
                  {t("payments.filter.button.resetFilter")}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Onglet "payouts" */}
      {selectedOption === "payouts" && (
        <PayoutsDashboardComponent
          payouts={props.payouts}
          payoutTxMap={payoutTxMap}
          fetchPayoutTransactions={fetchPayoutTransactions}
          setPayoutTxMap={setPayoutTxMap}
          loadMorePayoutTx={loadMorePayoutTx}
          payoutDataLoading={payoutDataLoading}
          loadMoreLoading={loadMoreLoading}
        />
      )}

      {/* Onglet "payments" */}
      {selectedOption === "payments" && (
        <PaymentsDashboardComponent
          payments={props.payments}
          hasMorePayments={props.hasMorePayments}
          onLoadMore={props.onLoadMore}
          filterLoading={props.filterLoading}
          dataLoading={props.dataLoading}
          handleRefundSuccess={props.handleRefundSuccess}
          restaurantId={props.restaurantId}
          fetchMonthlySales={props.fetchMonthlySales}
          isFiltered={props.isFiltered}
        />
      )}
    </section>
  );
}
