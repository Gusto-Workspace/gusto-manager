import { useState } from "react";

// AXIOS
import axios from "axios";

// COMPONENTS
import PayoutsDashboardComponent from "./payouts.dashboard.component";
import PaymentsDashboardComponent from "./payments.dashboard.component";

export default function TransactionsDashboardComponent(props) {
  const [selectedOption, setSelectedOption] = useState("payouts");
  const [payoutTxMap, setPayoutTxMap] = useState({});

  const [payoutDataLoading, setPayoutDataLoading] = useState({});
  const [loadMoreLoading, setLoadMoreLoading] = useState({});

  function handleOptionChange(event) {
    setSelectedOption(event.target.value);
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
          <option value="payouts">Détails des Virements</option>
          <option value="payments">Détails des Paiements</option>
        </select>

        {selectedOption === "payouts" && (
          <p className="italic">
            <span className="underline font-semibold">INFORMATION</span> : Pour les virements
            mensuels, les paiements encaissés entre 7 jours avant la date prévue
            du virement et le jour même seront reportés sur le virement du mois
            suivant
          </p>
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
          dataLoading={props.dataLoading}
        />
      )}
    </div>
  );
}