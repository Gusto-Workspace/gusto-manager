import { useState } from "react";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import ExpendedDataPayoutDashboardComponent from "./expended-data-payout.dashboard.component";

// ICONS
import { Loader2, ListTree, EyeOff } from "lucide-react";

export default function PayoutsDashboardComponent(props) {
  const { t } = useTranslation("transactions");

  const [expandedTxIds, setExpandedTxIds] = useState([]);

  function toggleExpandTx(txId) {
    setExpandedTxIds((prev) =>
      prev.includes(txId) ? prev.filter((id) => id !== txId) : [...prev, txId]
    );
  }

  // Au moins un payout avec des transactions chargées
  const anyExpanded = props?.payouts.some(
    (payout) => props?.payoutTxMap[payout.id]?.data.length > 0
  );

  if (!props?.payouts?.length) {
    return (
      <section className="rounded-2xl border border-darkBlue/10 bg-white/50 backdrop-blur-sm px-4 py-5 text-sm text-darkBlue/70">
        {t("payouts.empty")}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {props.payouts.map((payout) => {
        const expandedData = props?.payoutTxMap[payout.id]?.data || [];
        const isExpanded = expandedData.length > 0;

        const containerClasses = `transition-opacity duration-300 ${
          anyExpanded && !isExpanded ? "opacity-15" : "opacity-100"
        }`;

        // Label + couleur de statut
        let statusLabel = t("payouts.details.status.unknown");
        let statusBadgeCls =
          "bg-darkBlue/5 text-darkBlue border border-darkBlue/10";

        switch (payout.status) {
          case "paid":
            statusLabel = t("payouts.details.status.paid");
            statusBadgeCls = "bg-[#4ead7a1a] text-[#167a47] border-none";
            break;
          case "pending":
          case "in_transit":
            statusLabel =
              payout.status === "pending"
                ? t("payouts.details.status.pending")
                : t("payouts.details.status.inTransit");
            statusBadgeCls = "bg-[#f973161a] text-[#c2410c] border-none";
            break;
          case "failed":
          case "canceled":
            statusLabel =
              payout.status === "failed"
                ? t("payouts.details.status.failed")
                : t("payouts.details.status.canceled");
            statusBadgeCls = "bg-[#ef44441a] text-[#b91c1c] border-none";
            break;
        }

        return (
          <div key={payout.id} className={containerClasses}>
            <section
              className="
                rounded-2xl border border-darkBlue/10 bg-white/50 backdrop-blur-sm
                px-4 py-4 midTablet:px-6 midTablet:py-5
                flex gap-4 flex-row items-center justify-between
                shadow-[0_18px_45px_rgba(19,30,54,0.06)]
              "
            >
              <div className="flex flex-col gap-2 text-sm text-darkBlue">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-base">
                    {t("payouts.details.title", "Virement")}
                  </h3>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-medium ${statusBadgeCls}`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <p>
                  <span className="font-medium">
                    {t("payouts.details.arrival")} :
                  </span>{" "}
                  {new Date(payout.arrivalDate * 1000).toLocaleDateString()}
                </p>

                <p>
                  <span className="font-medium">
                    {t("payouts.details.amount")} :
                  </span>{" "}
                  {payout.amount} {payout.currency.toUpperCase()}
                </p>
              </div>

              {/* Boutons */}
              <div className="flex items-center gap-3 justify-end">
                {expandedData.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => props.fetchPayoutTransactions(payout.id)}
                    className={`
                      inline-flex items-center justify-center gap-2 rounded-full
                      bg-blue px-4 py-2 text-xs tablet:text-sm font-medium text-white
                      shadow-sm
                      transition-all duration-150
                      ${
                        anyExpanded && !isExpanded
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:shadow-md hover:opacity-95"
                      }
                    `}
                    disabled={anyExpanded && !isExpanded}
                  >
                    {props.payoutDataLoading[payout.id] ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        <span className="hidden mobile:inline">
                          {t("payouts.details.loading")}
                        </span>
                      </>
                    ) : (
                      <>
                        <ListTree className="size-4" />
                        <span className="hidden mobile:inline">
                          {t("payouts.details.seeTransactions")}
                        </span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      props.setPayoutTxMap((prev) => ({
                        ...prev,
                        [payout.id]: { ...prev[payout.id], data: [] },
                      }));
                      setExpandedTxIds([]);
                    }}
                    className="
                      inline-flex items-center justify-center gap-2 rounded-full
                      bg-darkBlue/5 px-4 py-2 text-xs tablet:text-sm font-medium text-darkBlue
                      border border-darkBlue/15
                      hover:bg-darkBlue/8 transition-colors
                    "
                  >
                    <EyeOff className="size-4" />
                    <span className="hidden mobile:inline">
                      {t("payouts.details.maskTransactions")}
                    </span>
                  </button>
                )}
              </div>
            </section>

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
      })}
    </div>
  );
}
