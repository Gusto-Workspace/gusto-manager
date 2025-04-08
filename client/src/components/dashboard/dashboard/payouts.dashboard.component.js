import { useState } from "react";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import ExpendedDataPayoutDashboardComponent from "./expended-data-payout.dashboard.component";

export default function PayoutsDashboardComponent(props) {
  const { t } = useTranslation("transactions");

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
              <div className="bg-white rounded-lg p-4 drop-shadow-sm flex flex-col gap-4 midTablet:flex-row justify-between midTablet:items-center">
                <div>
                  <p>
                    <strong>{t("payouts.details.arrival")} : </strong>
                    {new Date(payout.arrivalDate * 1000).toLocaleDateString()}
                  </p>

                  <p>
                    <strong>{t("payouts.details.amount")} : </strong>
                    {payout.amount} {payout.currency.toUpperCase()}
                  </p>

                  <p>
                    <strong>{t("payouts.details.status.title")} : </strong>
                    {(() => {
                      switch (payout.status) {
                        case "paid":
                          return t("payouts.details.status.paid");
                        case "pending":
                          return t("payouts.details.status.pending");
                        case "in_transit":
                          return t("payouts.details.status.inTransit");
                        case "failed":
                          return t("payouts.details.status.failed");
                        case "canceled":
                          return t("payouts.details.status.canceled");
                        default:
                          return t("payouts.details.status.unknown");
                      }
                    })()}
                  </p>
                </div>

                {/* Bouton pour fetch les transactions de ce payout */}
                {expandedData.length === 0 ? (
                  <button
                    onClick={() => props.fetchPayoutTransactions(payout.id)}
                    className={`bg-blue text-white py-1 px-3 rounded-lg mt-2 w-fit mx-auto midTablet:mx-0 ${
                      anyExpanded && !isExpanded ? "opacity-50" : ""
                    }`}
                    disabled={anyExpanded && !isExpanded}
                  >
                    {props.payoutDataLoading[payout.id]
                      ? t("payouts.details.loading")
                      : t("payouts.details.seeTransactions")}
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
                    {t("payouts.details.maskTransactions")}
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
        <p className="bg-white p-6 rounded-lg drop-shadow-sm">
          {t("payouts.empty")}
        </p>
      )}
    </div>
  );
}
