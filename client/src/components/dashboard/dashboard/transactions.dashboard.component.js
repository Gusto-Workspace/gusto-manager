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

      // On met à jour le mapping
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

  // ---- Fonction pour "Charger plus" de transactions pour un payout ----
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        <select
          value={selectedOption}
          onChange={handleOptionChange}
          className="border rounded-lg p-2 w-[250px]"
        >
          <option value="payouts">{t("select.payouts")}</option>
          <option value="payments">{t("select.payments")}</option>
        </select>

        {selectedOption === "payouts" && (
          <p className="italic">
            <span className="underline uppercase font-semibold">
              {t("payouts.information.title")}
            </span>{" "}
            : {t("payouts.information.text")}
          </p>
        )}

        {selectedOption === "payments" && (
          <div className="flex flex-col midTablet:flex-row gap-4">
            <input
              type="text"
              placeholder={t("payments.filter.placeholder")}
              value={props.clientName}
              onChange={handleShearchClient}
              className="p-2 border rounded-lg midTablet:w-[350px]"
            />

            <div className="flex gap-4">
              <button
                onClick={() => props.onFetchPaymentsByClient(props.clientName)}
                className="bg-blue text-white px-4 py-2 rounded-lg disabled:opacity-80"
                disabled={props.filterLoading || !props.clientName}
              >
                {props.filterLoading
                  ? t("payments.filter.button.loading")
                  : t("payments.filter.button.validate")}
              </button>

              {props.isFiltered && (
                <button
                  onClick={handleResetFilter}
                  className="bg-violet text-white px-4 py-2 rounded-lg hover:bg-opacity-80"
                >
                  {t("payments.filter.button.resetFilter")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

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

      {/* -- Onglet "payments" -- */}
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
    </div>
  );
}
