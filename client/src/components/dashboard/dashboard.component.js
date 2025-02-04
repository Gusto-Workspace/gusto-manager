import { useEffect, useState } from "react";

// DATA
import { dashboardData } from "@/_assets/data/dashboard.data";
import { giftDashboardData } from "@/_assets/data/gift-dashboard.data";

// AXIOS
import axios from "axios";

// COMPONENTS
import DataCardCompnent from "./data-card.dashboard.component";
import DonutChartComponent from "./donut-chart.dashboard.component";
import StatusDonutChartComponent from "./status-donut-chart.dashboard.component";
import MonthlyGiftCardSalesChart from "./monthly-gift-card-sales-chart.dashboard.component";
import TransactionsDashboardComponent from "./transactions.dashboard.component";
import LastPayoutDashboardComponent from "./last-payout.dashboard.component";

export default function DashboardComponent(props) {
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

  const [dataLoading, setDataLoading] = useState(true);
  const [showPaymentsDetails, setShowPaymentsDetails] = useState(false);
  const [monthlySales, setMonthlySales] = useState([]);
  const [monthlyDataLoading, setMonthlyDataLoading] = useState(true);

  useEffect(() => {
    setShowPaymentsDetails(false);

    if (!props.dataLoading && props.restaurantData?.options?.gift_card) {
      fetchGiftCardSales();
      fetchGiftCardPayouts();
      fetchMonthlySales();
    }
  }, [props.dataLoading]);

  useEffect(() => {
    setPayments([]);
    setLastChargeId(null);
    setPayouts([]);
    setLastPayoutId(null);
  }, [props.dataLoading]);

  // ---- Requête pour paiements (charges) ----
  async function fetchGiftCardSales(starting_after) {
    setDataLoading(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${
          props.restaurantData._id
        }/payments`,
        {
          params: {
            limit: 10,
            starting_after,
          },
        }
      );

      const { charges, has_more, last_charge_id } = response.data;

      setPayments((prev) => [...prev, ...charges]);
      setHasMorePayments(has_more);
      setLastChargeId(last_charge_id);
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des cartes cadeaux :",
        error
      );
    } finally {
      setDataLoading(false);
    }
  }

  // ---- Requête pour les paiements (charges) d'un client spécifique ----
  async function fetchPaymentsByClient(query) {
    if (!query.trim()) {
      return;
    }

    setFilterLoading(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${props.restaurantData._id}/payments/search`,
        {
          params: {
            query,
            limit: 100,
          },
        }
      );

      setPayments(response.data.charges);
      setIsFiltered(true);
    } catch (error) {
      console.error(
        "Erreur lors de la recherche des paiements pour le client :",
        error
      );
    } finally {
      setFilterLoading(false);
    }
  }

  // ---- Réinitialisation des paiements (retirer le filtre) ----
  function resetPayments() {
    setPayments([]); // Réinitialise les paiements avant de tout recharger
    fetchGiftCardSales();
    setIsFiltered(false); // Recharge tous les paiements
  }

  // ---- Requête pour les virements (payouts) ----
  async function fetchGiftCardPayouts(starting_after) {
    setDataLoading(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${
          props.restaurantData._id
        }/payouts`,
        {
          params: {
            limit: 10,
            starting_after,
          },
        }
      );

      const { payouts, has_more, last_payout_id } = response.data;

      setPayouts((prev) => [...prev, ...payouts]);
      setHasMorePayouts(has_more);
      setLastPayoutId(last_payout_id);
    } catch (error) {
      console.error("Erreur lors de la récupération des virements :", error);
    } finally {
      setDataLoading(false);
    }
  }

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
  async function fetchMonthlySales() {
    setMonthlyDataLoading(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${props.restaurantData._id}/payments/monthly-sales`
      );
      setMonthlySales(response.data.monthlySales);
    } catch (error) {
      console.error("Erreur de fetch monthly-sales:", error);
    } finally {
      setMonthlyDataLoading(false);
    }
  }

  // ---- Fonction appelée quand un paiement est remboursé avec succès ----
  function handleRefundSuccess(paymentId) {
    // On met à jour l'état local "payments" pour définir refunded = true
    setPayments((prevPayments) =>
      prevPayments.map((p) =>
        p.id === paymentId ? { ...p, refunded: true } : p
      )
    );
  }

  return (
    <section className="flex flex-col gap-6">
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
              monthlyDataLoading={monthlyDataLoading}
              monthlySales={monthlySales}
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

            <LastPayoutDashboardComponent
              dataLoading={dataLoading}
              payouts={payouts}
              setShowPaymentsDetails={setShowPaymentsDetails}
              showPaymentsDetails={showPaymentsDetails}
            />
          </div>
        </div>
      )}

      {showPaymentsDetails && props.restaurantData?.options?.gift_card && (
        <TransactionsDashboardComponent
          payments={payments}
          payouts={payouts}
          onLoadMore={handleLoadMore}
          restaurantId={props.restaurantData._id}
          hasMorePayments={hasMorePayments}
          hasMorePayouts={hasMorePayouts}
          dataLoading={dataLoading}
          filterLoading={filterLoading}
          handleRefundSuccess={handleRefundSuccess}
          fetchMonthlySales={fetchMonthlySales}
          onFetchPaymentsByClient={fetchPaymentsByClient}
          onResetPayments={resetPayments}
          isFiltered={isFiltered}
          clientName={clientName}
          setClientName={setClientName}
        />
      )}
    </section>
  );
}
