export default function PaymentsDashboardComponent(props) {
  return (
    <div className="flex flex-col gap-4">
      {props?.payments?.length > 0 ? (
        <>
          {props.payments.map((payment, index) => (
            <div
              key={index}
              className="bg-white drop-shadow-sm flex items-center justify-between p-4 rounded-lg"
            >
              <div className="flex flex-col">
                <p className="font-medium">
                  <strong>Date :</strong>{" "}
                  {new Date(payment.date * 1000).toLocaleDateString()}
                </p>

                <p>
                  <strong>Client :</strong>{" "}
                  {payment.customer || "Non renseigné"}
                </p>

                <p>
                  <strong>Montant payé :</strong> {payment.grossAmount} €
                </p>

                <p>
                  <strong>Frais Stripe : </strong>
                  {payment.status !== "succeeded" ? "-" : payment.feeAmount} €
                </p>

                <p>
                  <strong>Montant net :</strong>{" "}
                  {payment.status !== "succeeded" ? "-" : payment.netAmount} €
                </p>

                <p>
                  <strong>Statut : </strong>
                  {(() => {
                    switch (payment.status) {
                      case "succeeded":
                        return "Réussi";
                      case "pending":
                        return "En attente";
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

              {payment.refunded ? (
                <p className="italic text-blue">Remboursé</p>
              ) : (
                <button
                  className={`bg-red text-white py-1 px-3 rounded-lg ${payment.status !== "succeeded" && "hidden"}`}
                  onClick={() => console.log(`Remboursement de ${payment.id}`)}
                  disabled={payment.status !== "succeeded"}
                >
                  Rembourser
                </button>
              )}
            </div>
          ))}

          {/* Bouton "Charger plus" si on a encore des paiements */}
          {props.hasMorePayments && (
            <button
              className="bg-blue text-white py-2 px-4 rounded-lg w-fit self-center"
              onClick={() => props.onLoadMore("payments")}
              disabled={props.dataLoading}
            >
              {props.dataLoading ? "Chargement..." : "Charger plus"}
            </button>
          )}
        </>
      ) : (
        <p>Aucun paiement trouvée</p>
      )}
    </div>
  );
}
