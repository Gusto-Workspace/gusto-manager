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
    "inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-blue text-white shadow-sm transition hover:bg-blue/90 active:scale-[0.98]";

  if (printUrl && !dataLoading) {
    return (
      <a
        href={printUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        className={className}
      >
        <Printer className="size-4" aria-hidden="true" />
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled
      aria-label={label}
      title={dataLoading ? label : t("printMenu.invalidWebsite")}
      className={`${className} cursor-not-allowed opacity-45`}
    >
      <Printer className="size-4" aria-hidden="true" />
    </button>
  );
}
