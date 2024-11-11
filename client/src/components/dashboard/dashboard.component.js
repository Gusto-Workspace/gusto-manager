import { useRouter } from "next/router";

// DATA
import { dashboardData } from "@/_assets/data/dashboard.data";
import { giftDashboardData } from "@/_assets/data/gift-dashboard.data";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import DataCardCompnent from "./data-card.dashboard.component";
import DonutChartComponent from "./donut-chart.dashboard.component";
import StatusDonutChartComponent from "./status-donut-chart.dashboard.component";
import MonthlyGiftCardSalesChart from "./monthly-gift-card-sales-chart.dashboard.component";

export default function DashboardComponent(props) {
  const { t } = useTranslation("index");
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  const totalGiftCardSales =
    props.restaurantData?.purchasesGiftCards?.reduce(
      (acc, giftCard) => acc + giftCard.value,
      0
    ) || 0;

  return (
    <section
      style={{ willChange: "transform" }}
      className="flex flex-col gap-12"
    >
      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-3 gap-6">
        {dashboardData.map(
          ({ title, IconComponent, getCounts, emptyLabel }) => {
            const { visible, hidden, total } = getCounts(props.restaurantData);
            const chartData =
              total > 0
                ? [
                    { name: "labels.visible", value: visible, fill: "#e66430" },
                    { name: "labels.masked", value: hidden, fill: "#eee" },
                  ]
                : [{ name: emptyLabel, value: 1, fill: "#E0E0E0" }];

            return (
              <DataCardCompnent
                key={title}
                title={title}
                count={total}
                data={chartData}
                IconComponent={IconComponent}
                ChartComponent={DonutChartComponent}
              />
            );
          }
        )}
      </div>

      <div className="flex flex-col tablet:flex-row gap-6">
        <div className="w-full">
          <MonthlyGiftCardSalesChart
            purchasesGiftCards={props?.restaurantData?.purchasesGiftCards || []}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 w-full">
          {giftDashboardData.map(
            ({ title, IconComponent, getCounts, emptyLabel }) => {
              const { total, data } = getCounts(props.restaurantData);
              const chartData =
                total > 0
                  ? data
                  : [{ name: emptyLabel, value: 1, fill: "#E0E0E0" }];

              return (
                <DataCardCompnent
                  key={title}
                  title={title}
                  count={total}
                  data={chartData}
                  IconComponent={IconComponent}
                  ChartComponent={
                    title === "Total cartes cadeaux vendues"
                      ? StatusDonutChartComponent
                      : DonutChartComponent
                  }
                />
              );
            }
          )}

          <div className="bg-white p-6 rounded-lg drop-shadow-sm flex justify-between items-center gap-8">
            <h3 className="font-semibold text-lg text-balance">
              {t("labels.totalSold")}
            </h3>

            <p className="font-bold text-2xl whitespace-nowrap">
              {totalGiftCardSales} {currencySymbol}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
