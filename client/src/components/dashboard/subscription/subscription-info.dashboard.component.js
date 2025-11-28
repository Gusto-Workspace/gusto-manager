// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "../../_shared/skeleton/simple-skeleton.component";

export default function SubscriptionInfoComponent(props) {
  const { t } = useTranslation("subscription");

  const cardCls =
    "w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 py-4 tablet:px-6 tablet:py-5 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex items-center justify-between gap-4";
  const titleCls =
    "text-sm tablet:text-base font-semibold text-darkBlue text-balance";
  const contentWrapCls =
    "flex flex-col items-end text-right text-sm text-darkBlue/80 gap-0.5";
  const planNameCls = "font-medium text-darkBlue";
  const amountCls = "text-sm text-darkBlue/80";
  const emptyTextCls = "text-sm text-darkBlue/50 italic";

  const hasPlan = !!props.subscriptionData?.amount;

  return (
    <section className={cardCls}>
      {/* Titre */}
      <div className="flex flex-col gap-1">
        <span className="inline-flex h-6 px-3 items-center justify-center rounded-full bg-darkBlue/5 text-[10px] font-semibold uppercase tracking-[0.14em] text-darkBlue/80">
          {t("text.subscription")}
        </span>
      </div>

      {/* Contenu droite */}
      {props.isLoading ? (
        <div className="flex-1 flex justify-end">
          <SimpleSkeletonComponent justify="justify-end" />
        </div>
      ) : (
        <div className={contentWrapCls}>
          {hasPlan ? (
            <>
              <p className={planNameCls}>
                {props.subscriptionData?.name || t("text.noSubscription")}
              </p>
              <p className={amountCls}>
                {props.subscriptionData.amount}{" "}
                {props.subscriptionData.currency === "EUR" ? "€" : "$"} /{" "}
                {t("text.month")}
              </p>
            </>
          ) : (
            <p className={emptyTextCls}>{t("text.noSubscription")}</p>
          )}
        </div>
      )}
    </section>
  );
}
