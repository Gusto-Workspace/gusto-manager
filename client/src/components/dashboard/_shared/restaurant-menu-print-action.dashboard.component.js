import { Printer } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
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
  const router = useRouter();
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

  if (printUrl && !dataLoading) {
    if (isAmbassadePrintUrl) {
      return (
        <button
          type="button"
          disabled={!router.isReady}
          onClick={() => {
            // Impression temporaire dans le même document, sans ajouter d'entrée.
            void router.replace({
              pathname: AMBASSADE_PRINT_ROUTE,
              query: {
                from: router.pathname === "/dashboard/dishes" ? "dishes" : "menus",
              },
            });
          }}
          aria-label={label}
          title={label}
          className={className}
        >
          <Printer className="size-4" aria-hidden="true" />
        </button>
      );
    }

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
