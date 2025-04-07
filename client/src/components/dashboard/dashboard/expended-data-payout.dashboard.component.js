// I18N
import { useTranslation } from "next-i18next";

export default function ExpendedDataPayoutDashboardComponent(props) {
  const { t } = useTranslation("transactions");

  return (
    <div className="pt-4 rounded-lg p-4 flex flex-col gap-4">
      <div className="relative my-4">
        <h4 className="relative flex gap-2 items-center font-semibold w-fit px-2 midTablet:px-6 mx-auto text-center uppercase bg-lightGrey z-[4]">
          {t("payouts.expended.title")}
        </h4>

        <hr className="bg-darkBlue absolute h-[1px] w-full midTablet:w-[550px] left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-[3]" />
      </div>

      <div className="flex flex-col gap-4">
        {props?.expandedData.map((tx) => {
          const isTxExpanded = props?.expandedTxIds.includes(tx.id);

          return (
            <div key={tx.id} className="bg-white bg-opacity-80 rounded-lg p-4">
              <div className="flex flex-col gap-4 midTablet:flex-row justify-between midTablet:items-center">
                <div>
                  <p>
                    <strong>{t("payouts.expended.date")} :</strong>{" "}
                    {new Date(tx.date * 1000).toLocaleDateString()}
                  </p>

                  <p>
                    <strong>{t("payouts.expended.customer")} :</strong>{" "}
                    {tx.customer || "Non renseigné"}
                  </p>

                  {isTxExpanded && (
                    <>
                      <p>
                        <strong>{t("payouts.expended.grossAmount")} : </strong>{" "}
                        {tx.grossAmount} €
                      </p>

                      <p>
                        <strong>{t("payouts.expended.fees")} : </strong>{" "}
                        {tx.feeAmount} €
                      </p>
                    </>
                  )}
                  <p>
                    <strong>{t("payouts.expended.netAmount")} : </strong>{" "}
                    {tx.netAmount} €
                  </p>

                  {isTxExpanded && (
                    <p>
                      <strong>{t("payouts.expended.type.title")} : </strong>{" "}
                      {(() => {
                        switch (tx.type) {
                          case "charge":
                            return t("payouts.expended.type.charge");
                          case "refund":
                            return t("payouts.expended.type.refund");
                          default:
                            return t("payouts.expended.type.unknown");
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
                  {isTxExpanded
                    ? t("payouts.expended.buttons.lessInfos")
                    : t("payouts.expended.buttons.moreInfos")}
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
            ? t("payouts.expended.buttons.loading")
            : t("payouts.expended.buttons.loadMore")}
        </button>
      )}
    </div>
  );
}
