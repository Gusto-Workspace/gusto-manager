// I18N
import { useTranslation } from "next-i18next";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

export default function ExpendedDataPayoutDashboardComponent(props) {
  const { t } = useTranslation("transactions");

  const expandedData = props?.expandedData || [];
  const expandedTxIds = props?.expandedTxIds || [];
  const payoutId = props?.payout?.id;
  const payoutState = (props?.payoutTxMap && payoutId)
    ? props.payoutTxMap[payoutId]
    : null;
  const hasMore = payoutState?.hasMore;
  const isLoadingMore =
    props?.loadMoreLoading && payoutId
      ? props.loadMoreLoading[payoutId]
      : false;

  return (
    <section className="pt-4 rounded-2xl flex flex-col gap-5">
      {/* Titre / séparateur */}
      <div className="relative my-4">
        <h4
          className="
            relative z-[2] mx-auto w-fit px-4 midTablet:px-6
            flex items-center gap-2
            rounded-full bg-white/90 border border-darkBlue/10
            text-[11px] tracking-[0.12em] font-semibold uppercase text-darkBlue/70
          "
        >
          {t("payouts.expended.title")}
        </h4>
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-full midTablet:w-[580px] -translate-x-1/2 -translate-y-1/2 bg-darkBlue/10" />
      </div>

      {/* Liste des transactions */}
      <div className="flex flex-col gap-3">
        {expandedData.map((tx) => {
          const isTxExpanded = expandedTxIds.includes(tx.id);

          return (
            <article
              key={tx.id}
              className={`
                relative overflow-hidden
                rounded-2xl border
                bg-white/50
                border-darkBlue/10
                px-4 py-3 tablet:px-5 tablet:py-4
                shadow-[0_14px_35px_rgba(19,30,54,0.06)]
              `}
            >
              {/* Décor léger */}
              <div className="pointer-events-none absolute -right-10 -top-10 h-16 w-16 rounded-full bg-[#e66430]/6" />
              <div className="pointer-events-none absolute -left-16 bottom-[-32px] h-24 w-24 rounded-full bg-darkBlue/2" />

              <div className="relative z-10 flex gap-3 flex-row items-center justify-between">
                {/* Infos principales */}
                <div className="flex flex-col gap-1 text-sm text-darkBlue">
                  <p>
                    <span className="font-semibold">
                      {t("payouts.expended.date")} :
                    </span>{" "}
                    {new Date(tx.date * 1000).toLocaleDateString()}
                  </p>

                  <p>
                    <span className="font-semibold">
                      {t("payouts.expended.customer")} :
                    </span>{" "}
                    {tx.customer || "Non renseigné"}
                  </p>

                  {isTxExpanded && (
                    <>
                      <p>
                        <span className="font-semibold">
                          {t("payouts.expended.grossAmount")} :
                        </span>{" "}
                        {tx.grossAmount} €
                      </p>
                      <p>
                        <span className="font-semibold">
                          {t("payouts.expended.fees")} :
                        </span>{" "}
                        {tx.feeAmount} €
                      </p>
                    </>
                  )}

                  <p>
                    <span className="font-semibold">
                      {t("payouts.expended.netAmount")} :
                    </span>{" "}
                    {tx.netAmount} €
                  </p>

                  {isTxExpanded && (
                    <p>
                      <span className="font-semibold">
                        {t("payouts.expended.type.title")} :
                      </span>{" "}
                      {(() => {
                        switch (tx.type) {
                          case "charge":
                            return t("payouts.expended.type.charge");
                          case "refund":
                            return t("payouts.expended.type.refund");
                          default:
                            return t("Inconnu");
                        }
                      })()}
                    </p>
                  )}
                </div>

                {/* Bouton toggle */}
                <button
                  type="button"
                  onClick={() => props.toggleExpandTx(tx.id)}
                  className="
                    inline-flex items-center gap-1 :self-auto
                    rounded-full border border-darkBlue/15 bg-white/90
                    px-3 py-1.5 text-xs font-medium text-darkBlue
                    hover:bg-darkBlue/5 hover:border-darkBlue/25
                    transition-colors text-nowrap
                  "
                >
                  {isTxExpanded ? (
                    <>
                      <ChevronUp className="size-3.5 text-[#e66430]" />
                      {t("payouts.expended.buttons.lessInfos")}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-3.5 text-[#e66430]" />
                      {t("payouts.expended.buttons.moreInfos")}
                    </>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Bouton "Charger plus" */}
      {hasMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => props.loadMorePayoutTx(payoutId)}
            disabled={isLoadingMore}
            className="
              inline-flex items-center gap-2
              rounded-full border border-darkBlue/20 bg-white/90
              px-4 py-2 text-xs tablet:text-sm font-medium text-darkBlue
              hover:bg-darkBlue/5 hover:border-darkBlue/30
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="size-4 animate-spin text-[#e66430]" />
                {t("payouts.expended.buttons.loading")}
              </>
            ) : (
              t("payouts.expended.buttons.loadMore")
            )}
          </button>
        </div>
      )}
    </section>
  );
}
