import { Printer } from "lucide-react";
import { useTranslation } from "next-i18next";
import { buildRestaurantMenuPrintUrl } from "@/_assets/utils/restaurant-menu-print";

const AMBASSADE_PRINT_ROUTE = "/dashboard/menus/print";
const AMBASSADE_HOSTNAMES = new Set([
  "lambassade-montauban.fr",
  "www.lambassade-montauban.fr",
]);

export default function RestaurantMenuPrintActionDashboardComponent({
  website,
  dataLoading = false,
}) {
  const { t } = useTranslation("common");
  const printUrl = buildRestaurantMenuPrintUrl(website);
  const label = t("printMenu.action");
  const className =
    "inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-blue text-white shadow-sm transition hover:bg-blue/90 active:scale-[0.98]";
  const isAmbassadePrintUrl = (() => {
    if (!printUrl) return false;
    try {
      return AMBASSADE_HOSTNAMES.has(new URL(printUrl).hostname.toLowerCase());
    } catch {
      return false;
    }
  })();
  const actionUrl = isAmbassadePrintUrl ? AMBASSADE_PRINT_ROUTE : printUrl;

  if (printUrl && !dataLoading) {
    return (
      <a
        href={actionUrl}
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
