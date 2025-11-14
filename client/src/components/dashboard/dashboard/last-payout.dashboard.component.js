import { useRouter } from "next/router";

// COMPONENTS
import SimpleSkeletonComponent from "../../_shared/skeleton/simple-skeleton.component";

// I18N
import { useTranslation } from "next-i18next";

// ICONS
import { ArrowRightLeft } from "lucide-react";

export default function LastPayoutDashboardComponent(props) {
  const { t } = useTranslation("index");
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  const payouts = props?.payouts || [];

  const latestPaidPayout = payouts.find((p) => p.status === "paid");
  const latestPaidDate = latestPaidPayout?.arrivalDate
    ? new Date(latestPaidPayout.arrivalDate * 1000).toLocaleDateString(
        locale || "fr-FR"
      )
    : null;

  const latestAmount = payouts[0]?.amount ?? null;

  return (
    <section
      className="
        relative overflow-hidden
        rounded-2xl border border-darkBlue/10
        bg-white/50
        px-4 py-4 tablet:px-5 tablet:py-5
        shadow-[0_18px_45px_rgba(19,30,54,0.08)]
        flex flex-col gap-4
      "
    >
      {/* Décor léger */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-20 w-20 rounded-full bg-[#e66430]/8" />

      <div className="relative z-10 flex flex-col gap-4 justify-between h-full">
        {/* Header + montant */}
        <div className="flex flex-col midTablet:flex-row gap-4 justify-between items-start midTablet:items-start">
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold text-base tablet:text-lg text-darkBlue">
              {t("labels.totalSold")}
            </h3>

            <p className="text-xs tablet:text-sm text-darkBlue/60">
              {latestPaidDate
                ? `Reçu le ${latestPaidDate}`
                : "Aucun virement reçu pour le moment."}
            </p>
          </div>

          {props.dataLoading ? (
            <div className="min-w-[120px] tablet:min-w-[170px]">
              <SimpleSkeletonComponent />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center rounded-2xl bg-white/85 border border-darkBlue/10 px-4 py-2 shadow-sm">
              <span className="text-xs text-darkBlue/60 mr-2 text-nowrap">
                Montant
              </span>
              <span className="text-lg font-semibold text-darkBlue whitespace-nowrap">
                {latestAmount != null
                  ? `${latestAmount} ${currencySymbol}`
                  : "Aucun virement"}
              </span>
            </div>
          )}
        </div>

        {/* Bouton détail virements/paiements */}
        <button
          type="button"
          onClick={() => {
            props.setShowPaymentsDetails(!props.showPaymentsDetails);

            setTimeout(() => {
              window.scrollBy({ top: 500, behavior: "smooth" });
            }, 200);
          }}
          className="
            inline-flex items-center gap-2 w-fit
            rounded-xl border border-darkBlue/15 bg-white/80
            px-3 py-2 text-xs tablet:text-sm font-medium text-darkBlue
            hover:bg-darkBlue/3 hover:border-darkBlue/25
            transition-colors
          "
        >
          <ArrowRightLeft className="size-4 text-[#e66430]" />
          <span>
            {props.showPaymentsDetails ? "Masquer" : "Afficher"} le détail des
            virements et paiements
          </span>
        </button>
      </div>
    </section>
  );
}
