import { Printer } from "lucide-react";
import { useTranslation } from "next-i18next";
import { buildRestaurantMenuPrintUrl } from "@/_assets/utils/restaurant-menu-print";

export default function RestaurantMenuPrintActionDashboardComponent({
  website,
  dataLoading = false,
}) {
  const { t } = useTranslation("common");
  const printUrl = buildRestaurantMenuPrintUrl(website);
  const label = t("printMenu.action");
  const className =
    "inline-flex min-h-[42px] items-center justify-center gap-2 self-start rounded-full bg-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue/90 active:scale-[0.98]";

  if (printUrl && !dataLoading) {
    return (
      <a
        href={printUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        <Printer className="size-4" aria-hidden="true" />
        {label}
      </a>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled
        title={t("printMenu.invalidWebsite")}
        className={`${className} cursor-not-allowed opacity-45`}
      >
        <Printer className="size-4" aria-hidden="true" />
        {label}
      </button>
      {!dataLoading ? (
        <p className="text-xs text-darkBlue/60">
          {t("printMenu.invalidWebsite")}
        </p>
      ) : null}
    </div>
  );
}
