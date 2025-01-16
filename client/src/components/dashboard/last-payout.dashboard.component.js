import { useRouter } from "next/router";

// COMPONENTS
import SimpleSkeletonComponent from "../_shared/skeleton/simple-skeleton.component";

// I18N
import { useTranslation } from "next-i18next";

export default function LastPayoutDashboardComponent(props) {
  const { t } = useTranslation("index");
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  return (
    <div className="bg-white p-6 rounded-lg drop-shadow-sm flex flex-col justify-between gap-6">
      <div className="flex flex-col midTablet:flex-row gap-8 justify-between">
        <div>
          <h3 className="w-full font-semibold text-lg text-pretty">
            {t("labels.totalSold")}
          </h3>

          <p className="italic mt-2">
            {props?.payouts?.length > 0
              ? `En date du ${new Date(props.payouts.find((payout) => payout.status === "paid").arrivalDate * 1000).toLocaleDateString()}`
              : "-"}
          </p>
        </div>
        
        {props.dataLoading ? (
          <SimpleSkeletonComponent />
        ) : (
          <p className="font-bold text-2xl whitespace-nowrap min-w-32 tablet:min-w-44 text-center midTablet:text-right">
            {props?.payouts?.length > 0
              ? `${props?.payouts[0].amount} ${currencySymbol}`
              : "Aucun virement"}
          </p>
        )}
      </div>

      <button
        onClick={() => {
          props.setShowPaymentsDetails(!props.showPaymentsDetails);

          setTimeout(() => {
            window.scrollBy({ top: 500, behavior: "smooth" });
          }, [200]);
        }}
        className="bg-blue text-white w-fit py-2 px-4 rounded-lg text-balance"
      >
        {props.showPaymentsDetails ? "Masquer" : "Afficher"} le détails des
        virements et paiements
      </button>
    </div>
  );
}
