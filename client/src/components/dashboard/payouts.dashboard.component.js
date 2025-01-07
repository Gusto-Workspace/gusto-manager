import { useState } from "react";

// COMPONENTS
import ExpendedDataPayoutDashboardComponent from "./expended-data-payout.dashboard.component";

export default function PayoutsDashboardComponent(props) {
  // État local pour gérer les transactions étendues
  const [expandedTxIds, setExpandedTxIds] = useState([]);

  // Fonction pour basculer l'état d'une transaction
  function toggleExpandTx(txId) {
    setExpandedTxIds((prev) =>
      prev.includes(txId) ? prev.filter((id) => id !== txId) : [...prev, txId]
    );
  }

  // Vérifiez si au moins un virement est étendu
  const anyExpanded = props?.payouts.some(
    (payout) => props?.payoutTxMap[payout.id]?.data.length > 0
  );

  return (
    <div className="flex flex-col gap-4">
      {props?.payouts?.length > 0 ? (
        props?.payouts.map((payout) => {
          const expandedData = props?.payoutTxMap[payout.id]?.data || [];
          const isExpanded = expandedData.length > 0;

          const containerClasses = `transition-opacity duration-300 ${
            anyExpanded && !isExpanded ? "opacity-10" : "opacity-100"
          }`;

          return (
            <div key={payout.id} className={containerClasses}>
              <div className="bg-white rounded-lg p-4 drop-shadow-sm flex justify-between items-center">
                <div>
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
                </div>

                {/* Bouton pour fetch les transactions de ce payout */}
                {expandedData.length === 0 ? (
                  <button
                    onClick={() => props.fetchPayoutTransactions(payout.id)}
                    className={`bg-blue text-white py-1 px-3 rounded-lg mt-2 ${
                      anyExpanded && !isExpanded ? "opacity-50" : ""
                    }`}
                    disabled={anyExpanded && !isExpanded}
                  >
                    {props.payoutDataLoading[payout.id]
                      ? "Chargement..."
                      : "Voir les transactions associées"}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      props.setPayoutTxMap((prev) => ({
                        ...prev,
                        [payout.id]: { ...prev[payout.id], data: [] },
                      }));
                      setExpandedTxIds([]);
                    }}
                    className="bg-blue text-white py-1 px-3 rounded-lg mt-2"
                  >
                    Masquer les transactions
                  </button>
                )}
              </div>

              {/* Affichage des transactions associées, si fetchées */}
              {expandedData.length > 0 && (
                <ExpendedDataPayoutDashboardComponent
                  expandedData={expandedData}
                  expandedTxIds={expandedTxIds}
                  payoutTxMap={props.payoutTxMap}
                  loadMoreLoading={props.loadMoreLoading}
                  payout={payout}
                  loadMorePayoutTx={props.loadMorePayoutTx}
                  toggleExpandTx={toggleExpandTx}
                />
              )}
            </div>
          );
        })
      ) : (
        <p>Aucun virement trouvé.</p>
      )}
    </div>
  );
}
