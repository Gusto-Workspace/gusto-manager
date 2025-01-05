import { useState } from "react";
import axios from "axios";

export default function PaymentsDashboardComponent(props) {
  const [selectedOption, setSelectedOption] = useState("payouts");

  const [payoutTxMap, setPayoutTxMap] = useState({});

  const handleOptionChange = (event) => {
    setSelectedOption(event.target.value);
  };

  // ---- Fonction pour aller chercher les transactions d'un payout ----
  const fetchPayoutTransactions = async (payoutId) => {
    try {
      const restaurantId = props.restaurantId;

      if (!restaurantId) {
        console.error("Restaurant ID introuvable");
        return;
      }

      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}/payouts/${payoutId}/transactions`,
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
    }
  };

  // ---- Fonction pour "Charger plus" de transactions pour un payout ----
  const loadMorePayoutTx = async (payoutId) => {
    const current = payoutTxMap[payoutId];
    if (!current || !current.hasMore || !current.lastTxId) {
      return;
    }

    try {
      const restaurantId = props.restaurantId;
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}/payouts/${payoutId}/transactions`,
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
    }
  };

  return (
    <div className="bg-white drop-shadow-sm rounded-lg p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <select
          value={selectedOption}
          onChange={handleOptionChange}
          className="border rounded-lg p-2"
        >
          <option value="payouts">Détails des Virements</option>
          <option value="payments">Détails des Paiements</option>
        </select>
      </div>

      {/* -- Onglet "payouts" -- */}
      {selectedOption === "payouts" && (
        <div className="flex flex-col gap-4">
          {props.payouts && props.payouts.length > 0 ? (
            props.payouts.map((payout) => {
              const expandedData = payoutTxMap[payout.id]?.data || [];

              return (
                <div key={payout.id} className="border rounded-lg p-4">
                  <p>
                    <strong>Arrive au plus tard le : </strong>
                    {new Date(payout.arrivalDate * 1000).toLocaleDateString()}
                  </p>
                  <p>
                    <strong>Montant : </strong>
                    {payout.amount} {payout.currency.toUpperCase()}
                  </p>
                  <p>
                    <strong>Statut : </strong>
                    {(() => {
                      switch (payout.status) {
                        case "paid":
                          return "Payé";
                        case "pending":
                          return "En attente";
                        case "in_transit":
                          return "En transit";
                        case "failed":
                          return "Échoué";
                        case "canceled":
                          return "Annulé";
                        default:
                          return "Statut inconnu";
                      }
                    })()}
                  </p>

                  {/* Bouton pour fetch les transactions de ce payout */}
                  {expandedData.length === 0 ? (
                    <button
                      onClick={() => fetchPayoutTransactions(payout.id)}
                      className="bg-blue text-white py-1 px-3 rounded-lg mt-2"
                    >
                      Voir les transactions associées
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        setPayoutTxMap((prev) => ({
                          ...prev,
                          [payout.id]: { ...prev[payout.id], data: [] },
                        }))
                      }
                      className="bg-blue text-white py-1 px-3 rounded-lg mt-2"
                    >
                      Masquer les transactions
                    </button>
                  )}

                  {/* Affichage des transactions associées, si fetchées */}
                  {expandedData.length > 0 && (
                    <div className="mt-4 border-t pt-4">
                      <h4 className="font-semibold mb-2">
                        Transactions de ce virement :
                      </h4>

                      {expandedData.map((tx) => (
                        <div key={tx.id} className="border rounded-lg p-2 mb-2">
                          <p>
                            <strong>Type : </strong> {tx.type}
                          </p>
                          <p className="font-medium">
                            <strong>Date :</strong>{" "}
                            {new Date(tx.date * 1000).toLocaleDateString()}
                          </p>
                          <p>
                            <strong>Client :</strong>{" "}
                            {tx.customer || "Non renseigné"}
                          </p>
                          <p>
                            <strong>Montant payé : </strong> {tx.grossAmount} €
                          </p>
                          <p>
                            <strong>Frais Stripe: </strong> {tx.feeAmount} €
                          </p>
                          <p>
                            <strong>Montant net : </strong> {tx.netAmount} €
                          </p>
                        </div>
                      ))}

                      {/* Bouton "Charger plus" si hasMore */}
                      {payoutTxMap[payout.id]?.hasMore && (
                        <button
                          onClick={() => loadMorePayoutTx(payout.id)}
                          className="bg-blue text-white py-1 px-3 rounded-lg"
                        >
                          Charger plus
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p>Aucun virement trouvé.</p>
          )}
        </div>
      )}

      {/* -- Onglet "payments" -- */}
      {selectedOption === "payments" && (
        <div className="flex flex-col gap-4">
          {props.transactions && props.transactions.length > 0 ? (
            props.transactions.map((transaction, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex flex-col">
                  <p className="font-medium">
                    <strong>Date :</strong>{" "}
                    {new Date(transaction.date * 1000).toLocaleDateString()}
                  </p>
                  <p>
                    <strong>Client :</strong>{" "}
                    {transaction.customer || "Non renseigné"}
                  </p>
                  <p>
                    <strong>Montant payé :</strong> {transaction.grossAmount} €
                  </p>
                  <p>
                    <strong>Frais Stripe :</strong> {transaction.feeAmount} €
                  </p>
                  <p>
                    <strong>Montant net :</strong> {transaction.netAmount} €
                  </p>
                </div>
                <button
                  className="bg-red text-white py-1 px-3 rounded-lg"
                  onClick={() =>
                    console.log(`Remboursement de ${transaction.id}`)
                  }
                >
                  Rembourser
                </button>
              </div>
            ))
          ) : (
            <p>Aucune transaction trouvée</p>
          )}
        </div>
      )}
    </div>
  );
}
