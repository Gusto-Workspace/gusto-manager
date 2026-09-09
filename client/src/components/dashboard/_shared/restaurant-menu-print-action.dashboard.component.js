import { Printer } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import { buildRestaurantMenuPrintUrl } from "@/_assets/utils/restaurant-menu-print";

const RESTAURANT_MENU_PRINT_ROUTE = "/dashboard/menus/print";

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

  if (printUrl && !dataLoading) {
    return (
      <button
        type="button"
        disabled={!router.isReady}
        onClick={() => {
          void router.replace({
            pathname: RESTAURANT_MENU_PRINT_ROUTE,
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
