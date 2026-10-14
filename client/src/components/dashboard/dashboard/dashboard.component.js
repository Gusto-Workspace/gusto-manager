import { useCallback, useEffect, useRef, useState } from "react";

// DATA
import { dashboardData } from "@/_assets/data/dashboard.data";
import { giftDashboardData } from "@/_assets/data/gift-dashboard.data";

// AXIOS
import axios from "axios";

// COMPONENTS
import DataCardCompnent from "./data-card.dashboard.component";
import DonutChartComponent from "./donut-chart.dashboard.component";
import MonthlyGiftCardSalesChart from "./monthly-gift-card-sales-chart.dashboard.component";
import TransactionsDashboardComponent from "./transactions.dashboard.component";
import LastPayoutDashboardComponent from "./last-payout.dashboard.component";
import MonthlyCounterVisits from "./montly-counter-visits.component";
import {
  activeFinancialModules,
  FINANCIAL_MODULE_LABELS,
  selectedFinancialSeries,
} from "./financial-dashboard.utils";

function EmptyChartComponent() {
  return null;
}

export default function DashboardComponent(props) {
  const hasGiftCardModule = Boolean(props.restaurantData?.options?.gift_card);
  const hasTakeAwayModule = Boolean(props.restaurantData?.options?.take_away);
  const hasStripeTransactions = hasGiftCardModule || hasTakeAwayModule;
  const restaurantId = props.restaurantData?._id;
  const activeModules = activeFinancialModules(props.restaurantData?.options);

  //  ---- States pour les VISITES ----
  const [monthlyVisits, setMonthlyVisits] = useState([]);
  const [visitsLoading, setVisitsLoading] = useState(true);

  // ---- States pour les PAIEMENTS ----
  const [payments, setPayments] = useState([]);
  const [hasMorePayments, setHasMorePayments] = useState(false);
  const [lastChargeId, setLastChargeId] = useState(null);
  const [isFiltered, setIsFiltered] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [clientName, setClientName] = useState("");

  // ---- States pour les PAYOUTS ----
  const [payouts, setPayouts] = useState([]);
  const [hasMorePayouts, setHasMorePayouts] = useState(false);
  const [lastPayoutId, setLastPayoutId] = useState(null);

  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [payoutsLoading, setPayoutsLoading] = useState(true);
  const [showPaymentsDetails, setShowPaymentsDetails] = useState(false);
  const [seriesByModule, setSeriesByModule] = useState({});
  const [salesModule, setSalesModule] = useState("gift_card");
  const [salesCurrency, setSalesCurrency] = useState("eur");
  const [salesError, setSalesError] = useState("");
  const [exportModules, setExportModules] = useState([]);
  const [exportModulesLoading, setExportModulesLoading] = useState(false);
  const [exportModulesError, setExportModulesError] = useState("");
  const salesCache = useRef(new Map());
  const currentRestaurant = useRef(restaurantId);
  currentRestaurant.current = restaurantId;
  const chart = selectedFinancialSeries(
    seriesByModule,
    activeModules,
    salesModule,
    salesCurrency,
  );
  const [monthlyDataLoading, setMonthlyDataLoading] = useState(true);

  function mergeUniqueTransactions(previousPayments = [], nextPayments = []) {
    const seen = new Set();

    return [
      ...previousPayments,
      ...(Array.isArray(nextPayments) ? nextPayments : []),
    ].filter((payment) => {
      const paymentId = String(payment?.id || "").trim();
      if (!paymentId || seen.has(paymentId)) return false;
      seen.add(paymentId);
      return true;
    });
  }

  // ---- Requête pour paiements (charges) ----
  const fetchGiftCardSales = useCallback(
    async (starting_after) => {
      const requestedId = restaurantId;
      setPaymentsLoading(true);
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${
            requestedId
          }/payments`,
          {
            params: {
              limit: 10,
              starting_after,
            },
          },
        );

        const { charges, has_more, last_charge_id } = response.data;

        if (currentRestaurant.current !== requestedId) return;
        setPayments((prev) => mergeUniqueTransactions(prev, charges));
        setHasMorePayments(has_more);
        setLastChargeId(last_charge_id);
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des cartes cadeaux :",
          error,
        );
      } finally {
        if (currentRestaurant.current === requestedId)
          setPaymentsLoading(false);
      }
    },
    [restaurantId],
  );

  // ---- Requête pour les paiements (charges) d'un client spécifique ----
  async function fetchPaymentsByClient(query) {
    const requestedId = restaurantId;
    if (!query.trim()) {
      return;
    }

    setFilterLoading(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${requestedId}/payments/search`,
        {
          params: {
            query,
            limit: 100,
          },
        },
      );

      if (currentRestaurant.current !== requestedId) return;
      setPayments(response.data.charges);
      setIsFiltered(true);
    } catch (error) {
      console.error(
        "Erreur lors de la recherche des paiements pour le client :",
        error,
      );
    } finally {
      if (currentRestaurant.current === requestedId) setFilterLoading(false);
    }
  }

  // ---- Réinitialisation des paiements (retirer le filtre) ----
  function resetPayments() {
    setPayments([]); // Réinitialise les paiements avant de tout recharger
    fetchGiftCardSales();
    setIsFiltered(false); // Recharge tous les paiements
  }

  // ---- Requête pour les virements (payouts) ----
  const fetchGiftCardPayouts = useCallback(
    async (starting_after) => {
      const requestedId = restaurantId;
      setPayoutsLoading(true);
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${
            requestedId
          }/payouts`,
          {
            params: {
              limit: 10,
              starting_after,
            },
          },
        );

        const { payouts, has_more, last_payout_id } = response.data;

        if (currentRestaurant.current !== requestedId) return;
        setPayouts((prev) => [...prev, ...payouts]);
        setHasMorePayouts(has_more);
        setLastPayoutId(last_payout_id);
      } catch (error) {
        console.error("Erreur lors de la récupération des virements :", error);
      } finally {
        if (currentRestaurant.current === requestedId) setPayoutsLoading(false);
      }
    },
    [restaurantId],
  );

  // ---- Handler load more : on sait si on est en mode payouts ou payments
  function handleLoadMore(selectedOption) {
    if (selectedOption === "payments") {
      if (hasMorePayments && lastChargeId) {
        fetchGiftCardSales(lastChargeId);
      }
    } else {
      // "payouts"
      if (hasMorePayouts && lastPayoutId) {
        fetchGiftCardPayouts(lastPayoutId);
      }
    }
  }

  // ---- Récupération des ventes mensuelles ----
  const fetchMonthlySales = useCallback(
    async (force = false) => {
      const requestedId = restaurantId;
      const cached = salesCache.current.get(requestedId);
      if (!force && cached?.expires > Date.now()) {
        setSeriesByModule(cached.series);
        setMonthlyDataLoading(false);
        return;
      }
      setMonthlyDataLoading(true);
      setSalesError("");
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${requestedId}/payments/monthly-sales`,
          { params: { module: "all" } },
        );
        const series = response.data.seriesByModule || {};
        if (salesCache.current.size >= 10)
          salesCache.current.delete(salesCache.current.keys().next().value);
        salesCache.current.set(requestedId, {
          series,
          expires: Date.now() + 60000,
        });
        if (currentRestaurant.current === requestedId)
          setSeriesByModule(series);
      } catch (error) {
        if (currentRestaurant.current === requestedId)
          setSalesError(
            error.response?.data?.message ||
              "Impossible de charger les ventes nettes.",
          );
      } finally {
        if (currentRestaurant.current === requestedId)
          setMonthlyDataLoading(false);
      }
    },
    [restaurantId],
  );

  const fetchExportModules = useCallback(async () => {
    const requestedId = restaurantId;
    setExportModulesLoading(true);
    setExportModulesError("");
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${requestedId}/payments/export-modules`,
      );
      if (currentRestaurant.current === requestedId)
        setExportModules(response.data.modules || []);
    } catch (error) {
      if (currentRestaurant.current === requestedId)
        setExportModulesError(
          error.response?.data?.message ||
            "Impossible de charger les modules exportables.",
        );
    } finally {
      if (currentRestaurant.current === requestedId)
        setExportModulesLoading(false);
    }
  }, [restaurantId]);

  // ---- Récupération des visites mensuelles ----

  const fetchMonthlyVisits = useCallback(async () => {
    const requestedId = restaurantId;
    setVisitsLoading(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${requestedId}/visits/monthly`,
        {
          params: { months: 13 },
        },
      );
      if (currentRestaurant.current === requestedId)
        setMonthlyVisits(response.data.data);
    } catch (error) {
      console.error("Erreur de fetch monthly-visits :", error);
    } finally {
      if (currentRestaurant.current === requestedId) setVisitsLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    setSeriesByModule({});
    setSalesError("");
    setMonthlyDataLoading(true);
    setExportModules([]);
    setExportModulesError("");
  }, [restaurantId]);

  useEffect(() => {
    setPayments([]);
    setLastChargeId(null);
    setPayouts([]);
    setLastPayoutId(null);
    setClientName("");
    setIsFiltered(false);
  }, [props.dataLoading, restaurantId]);

  useEffect(() => {
    setShowPaymentsDetails(false);
    if (!props.dataLoading && hasStripeTransactions) {
      fetchGiftCardSales();
      fetchGiftCardPayouts();
      fetchMonthlySales();
    }
  }, [
    props.dataLoading,
    hasStripeTransactions,
    fetchGiftCardSales,
    fetchGiftCardPayouts,
    fetchMonthlySales,
  ]);

  useEffect(() => {
    if (!props.dataLoading && restaurantId) fetchExportModules();
  }, [props.dataLoading, restaurantId, fetchExportModules]);

  useEffect(() => {
    if (!props.dataLoading && restaurantId) fetchMonthlyVisits();
  }, [props.dataLoading, restaurantId, fetchMonthlyVisits]);

  // ---- Fonction appelée quand un paiement est remboursé avec succès ----
  function handleRefundSuccess(paymentId, refundData = {}) {
    const refundedAt =
      refundData?.refundedAt ?? refundData?.refund?.created ?? null;

    setPayments((prevPayments) =>
      prevPayments.map((p) =>
        p.id === paymentId
          ? {
              ...p,
              refunded: true,
              refundedAt,
            }
          : p,
      ),
    );
  }

  // Récupère l’objet options (tu peux aussi l’extraire de restaurantContext si tu préfères)
  const opts = props.restaurantData?.options || {};

  // Ne garde que les cartes qui n’ont pas d’optionKey (toujours visibles)
  // ou celles dont options[optionKey] est à true
  const mainDashboardCards = dashboardData.filter(
    (card) => !card.optionKey || opts[card.optionKey] === true,
  );

  return (
    <section className="flex flex-col gap-2 midTablet:gap-4">
      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-3 gap-2 midTablet:gap-4 z-[5]">
        {mainDashboardCards.map(
          ({ title, IconComponent, getCounts, emptyLabel, noDonut }) => {
            const { visible, hidden, total } = getCounts(
              props.restaurantData,
              props.reservationsList,
            );

            // Si la carte ne doit pas afficher de donut, on prépare un chart vide
            let chartData = [];
            let ChartComp = DonutChartComponent;
            if (noDonut) {
              ChartComp = EmptyChartComponent;
              chartData = [];
            } else {
              chartData =
                total > 0
                  ? [
                      {
                        name: "labels.visible",
                        value: visible,
                        fill: "#e66430",
                      },
                      { name: "labels.masked", value: hidden, fill: "#eee" },
                    ]
                  : [{ name: emptyLabel, value: 1, fill: "#E0E0E0" }];
            }

            return (
              <DataCardCompnent
                key={title}
                title={title}
                count={total}
                data={chartData}
                IconComponent={IconComponent}
                ChartComponent={ChartComp}
              />
            );
          },
        )}
      </div>

      {!props.dataLoading && (
        <MonthlyCounterVisits
          data={monthlyVisits}
          loading={visitsLoading}
          title="Visites mensuelles de votre site internet"
        />
      )}

      {hasStripeTransactions && (
        <div className="flex flex-col desktop:flex-row gap-2 midTablet:gap-4">
          <div className="w-full">
            <MonthlyGiftCardSalesChart
              loading={monthlyDataLoading}
              data={chart.data}
              currency={chart.currency}
              title={
                activeModules.length > 1 ? (
                  <select
                    aria-label="Module des ventes"
                    value={chart.module}
                    onChange={(event) => setSalesModule(event.target.value)}
                    className="h-8 max-w-full rounded-xl border border-darkBlue/20 bg-white px-2 text-base font-semibold leading-none text-darkBlue tablet:text-lg"
                  >
                    {activeModules.map((module) => (
                      <option key={module} value={module}>
                        {FINANCIAL_MODULE_LABELS[module] === "Cartes cadeaux"
                          ? "Vente cartes cadeaux"
                          : "Ventes à emporter"}
                      </option>
                    ))}
                  </select>
                ) : chart.module === "take_away" ? (
                  "Ventes à emporter"
                ) : (
                  "Vente cartes cadeaux"
                )
              }
              subtitle={
                chart.module === "take_away"
                  ? "Montant des ventes à emporter des 6 derniers mois."
                  : "Montant des cartes cadeaux vendues les 6 derniers mois."
              }
              error={salesError}
            >
              {chart.currencies.length > 1 && (
                <select
                  aria-label="Devise des ventes"
                  value={chart.currency}
                  onChange={(event) => setSalesCurrency(event.target.value)}
                  className="rounded-xl border border-darkBlue/20 bg-white px-3 py-2 text-sm text-darkBlue"
                >
                  {chart.currencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency.toUpperCase()}
                    </option>
                  ))}
                </select>
              )}
            </MonthlyGiftCardSalesChart>
          </div>
          <div className={`grid grid-cols-1 gap-2 midTablet:gap-4 w-full ${
            !hasGiftCardModule ? "desktop:flex desktop:flex-col desktop:justify-end" : ""
          }`}>
            {hasGiftCardModule &&
              giftDashboardData.map(
                ({ key, title, IconComponent, getCounts, emptyLabel }) => {
                  const { total = 0, data = [] } =
                    getCounts?.(props.restaurantData) ?? {};

                  const hasData = Array.isArray(data) && data.length > 0;

                  const chartData = hasData
                    ? data
                    : [{ name: emptyLabel, value: 1, fill: "#E0E0E0" }];

                  return (
                    <DataCardCompnent
                      key={key}
                      title={title}
                      count={total}
                      data={chartData}
                      IconComponent={IconComponent}
                      ChartComponent={DonutChartComponent}
                    />
                  );
                },
              )}

            <LastPayoutDashboardComponent
              dataLoading={payoutsLoading}
              payouts={payouts}
              setShowPaymentsDetails={setShowPaymentsDetails}
              showPaymentsDetails={showPaymentsDetails}
            />
          </div>
        </div>
      )}

      {(showPaymentsDetails ||
        (!hasStripeTransactions && exportModules.length > 0) ||
        exportModulesError) && (
        <TransactionsDashboardComponent
          key={restaurantId}
          hideDetails={!hasStripeTransactions}
          payments={payments}
          payouts={payouts}
          onLoadMore={handleLoadMore}
          restaurantId={props.restaurantData._id}
          hasMorePayments={hasMorePayments}
          hasMorePayouts={hasMorePayouts}
          dataLoading={paymentsLoading}
          filterLoading={filterLoading}
          handleRefundSuccess={handleRefundSuccess}
          fetchMonthlySales={() => fetchMonthlySales(true)}
          onFetchPaymentsByClient={fetchPaymentsByClient}
          onResetPayments={resetPayments}
          isFiltered={isFiltered}
          clientName={clientName}
          setClientName={setClientName}
          exportModules={exportModules}
          exportModulesLoading={exportModulesLoading}
          exportModulesError={exportModulesError}
          onRetryExportModules={fetchExportModules}
        />
      )}
    </section>
  );
}
