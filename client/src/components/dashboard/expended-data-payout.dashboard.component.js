export default function ExpendedDataPayoutDashboardComponent(props){
    return(
        <div className="pt-4 rounded-lg p-4 flex flex-col gap-4">
        <div className="relative my-4">
          <h4 className="relative flex gap-2 items-center font-semibold w-fit px-2 midTablet:px-6 mx-auto text-center uppercase bg-lightGrey z-[4]">
            Transactions de ce virement
          </h4>

          <hr className="bg-darkBlue absolute h-[1px] w-full midTablet:w-[550px] left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-[3]" />
        </div>

        <div className="flex flex-col gap-4">
          {props?.expandedData.map((tx) => {
            const isTxExpanded = props?.expandedTxIds.includes(tx.id);

            return (
              <div
                key={tx.id}
                className="bg-white bg-opacity-80 rounded-lg p-4"
              >
                {/* Conteneur pour les infos initiales et le bouton */}
                <div className="flex justify-between items-center">
                  <div>
                    <p>
                      <strong>Date :</strong>{" "}
                      {new Date(tx.date * 1000).toLocaleDateString()}
                    </p>

                    <p>
                      <strong>Client :</strong>{" "}
                      {tx.customer || "Non renseigné"}
                    </p>

                    {isTxExpanded && (
                      <>
                        <p>
                          <strong>Montant payé : </strong>{" "}
                          {tx.grossAmount} €
                        </p>

                        <p>
                          <strong>Frais Stripe : </strong>{" "}
                          {tx.feeAmount} €
                        </p>
                      </>
                    )}
                    <p>
                      <strong>Montant net : </strong> {tx.netAmount} €
                    </p>

                    {isTxExpanded && (
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
                    )}
                  </div>

                  {/* Bouton pour afficher plus d'infos */}
                  <button
                    onClick={() => props.toggleExpandTx(tx.id)}
                    className="text-blue underline italic opacity-80"
                  >
                    {isTxExpanded ? "Moins d'infos" : "Plus d'infos"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bouton "Charger plus" si hasMore */}
        {props.payoutTxMap[props?.payout.id]?.hasMore && (
          <button
            onClick={() => props.loadMorePayoutTx(props?.payout.id)}
            className="bg-blue text-white py-2 px-4 rounded-lg w-fit mx-auto"
            disabled={props?.loadMoreLoading[props?.payout.id]}
          >
            {props.loadMoreLoading[props?.payout.id]
              ? "Chargement..."
              : "Charger plus"}
          </button>
        )}
      </div>
    )
}