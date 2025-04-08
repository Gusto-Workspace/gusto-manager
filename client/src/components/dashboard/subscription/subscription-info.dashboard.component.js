// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "../../_shared/skeleton/simple-skeleton.component";

export default function SubscriptionInfoComponent(props) {
  const { t } = useTranslation("subscription");

  return (
    <div className="bg-white p-6 rounded-lg drop-shadow-sm flex justify-between items-center min-h-[100px]">
      <h3 className="font-semibold text-lg text-balance whitespace-nowrap w-full">
        {t("text.subscription")}
      </h3>

      {props.isLoading ? (
        <SimpleSkeletonComponent justify="justify-end" />
      ) : (
        <div className="text-end w-full">
          <p>{props.subscriptionData.name}</p>
          {props.subscriptionData.amount ? (
            <p>
              {props.subscriptionData.amount}{" "}
              {props.subscriptionData.currency === "EUR" ? "€" : "$"} /{" "}
              {t("text.month")}
            </p>
          ) : (
            <p className="w-full">{t("text.noSubscription")}</p>
          )}
        </div>
      )}
    </div>
  );
}
