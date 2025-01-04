import { useRouter } from "next/router";
import { useEffect, useState } from "react";

// DATA
import { dashboardData } from "@/_assets/data/dashboard.data";
import { giftDashboardData } from "@/_assets/data/gift-dashboard.data";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// COMPONENTS
import DataCardCompnent from "./data-card.dashboard.component";
import DonutChartComponent from "./donut-chart.dashboard.component";
import StatusDonutChartComponent from "./status-donut-chart.dashboard.component";
import MonthlyGiftCardSalesChart from "./monthly-gift-card-sales-chart.dashboard.component";
import SimpleSkeletonComponent from "../_shared/skeleton/simple-skeleton.component";
import PaymentsDashboardComponent from "./payments.dashboard.component";

export default function DashboardComponent(props) {
  const { t } = useTranslation("index");
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  const [totalGiftCardSales, setTotalGiftCardSales] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);
  const [showPaymentsDetails, setShowPaymentsDetails] = useState(false);

  useEffect(() => {
    setShowPaymentsDetails(false);

    async function fetchGiftCardSales() {
      try {
        setDataLoading(true);
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${props.restaurantData._id}/transactions`
        );

        // Filtrer les transactions "charges" et calculer le total des ventes nettes
        const totalNetAmount =
          response.data.charges?.reduce(
            (acc, transaction) => acc + transaction.netAmount,
            0
          ) || 0;

        setTotalGiftCardSales(totalNetAmount.toFixed(2));
        setDataLoading(false);
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des ventes de cartes cadeaux :",
          error
        );
      }
    }

    if (!props.dataLoading && props.restaurantData?.options?.gift_card) {
      fetchGiftCardSales();
    }
  }, [props.restaurantData, props.dataLoading]);

  return (
    <section className="flex flex-col gap-12">
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

      {props.restaurantData?.options?.gift_card && (
        <div className="flex flex-col desktop:flex-row gap-6">
          <div className="w-full">
            <MonthlyGiftCardSalesChart
              purchasesGiftCards={
                props?.restaurantData?.purchasesGiftCards || []
              }
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

            <div className="bg-white p-6 rounded-lg drop-shadow-sm flex flex-col justify-between gap-2">
              <div className="flex gap-8">
                <h3 className="w-full font-semibold text-lg text-balance">
                  {t("labels.totalSold")}
                </h3>

                {dataLoading ? (
                  <SimpleSkeletonComponent
                    justify="justify-end"
                    height="h-[32px]"
                  />
                ) : (
                  <p className="font-bold text-2xl whitespace-nowrap">
                    {totalGiftCardSales} {currencySymbol}
                  </p>
                )}
              </div>

              <button
                onClick={() => setShowPaymentsDetails(!showPaymentsDetails)}
                className="bg-blue text-white w-fit py-2 px-4 rounded-lg"
              >
                {showPaymentsDetails ? "Masquer" : "Afficher"} le détails des
                paiements
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentsDetails && props.restaurantData?.options?.gift_card && (
        <PaymentsDashboardComponent />
      )}
    </section>
  );
}
