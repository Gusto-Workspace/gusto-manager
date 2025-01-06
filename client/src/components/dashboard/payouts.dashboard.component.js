export default function PayoutsDashboardComponent(props) {
  return (
    <div className="flex flex-col gap-4">
      {props?.payouts?.length > 0 ? (
        props.payouts.map((payout) => {
          const expandedData = props?.payoutTxMap[payout.id]?.data || [];

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
                  onClick={() => props.fetchPayoutTransactions(payout.id)}
                  className="bg-blue text-white py-1 px-3 rounded-lg mt-2"
                >
                  {props.payoutDataLoading[payout.id]
                    ? "Chargement..."
                    : "Voir les transactions associées"}
                </button>
              ) : (
                <button
                  onClick={() =>
                    props.setPayoutTxMap((prev) => ({
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
                        <strong>Type : </strong>{" "}
                        {(() => {
                          switch (tx.type) {
                            case "charge":
                              return "Paiement";
                            case "refund":
                              return "Remboursement";
                            default:
                              return "Type inconnu";
                          }
                        })()}
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
                  {props.payoutTxMap[payout.id]?.hasMore && (
                    <button
                      onClick={() => props.loadMorePayoutTx(payout.id)}
                      className="bg-blue text-white py-2 px-4 rounded-lg"
                    >
                      {props.loadMoreLoading[payout.id]
                        ? "Chargement..."
                        : "Charger plus"}
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
  );
}
