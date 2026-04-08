const express = require("express");
const router = express.Router();

const authenticateAdmin = require("../../middleware/authenticate-admin");
const OwnerModel = require("../../models/owner.model");
const RestaurantModel = require("../../models/restaurant.model");
const { listAllStripeInvoices } = require("../../services/stripe-admin.service");

router.use("/admin", authenticateAdmin);

function startOfUtcMonth(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0),
  );
}

function buildRecentMonthBuckets(months = 12) {
  const now = new Date();
  const currentMonthStart = startOfUtcMonth(now);
  const buckets = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const monthStart = new Date(currentMonthStart);
    monthStart.setUTCMonth(currentMonthStart.getUTCMonth() - offset);

    const year = monthStart.getUTCFullYear();
    const month = monthStart.getUTCMonth() + 1;
    const label = `${year}-${String(month).padStart(2, "0")}`;

    buckets.push({
      label,
      year,
      month,
      revenue: 0,
      restaurants: 0,
    });
  }

  return buckets;
}

function toMonthLabel(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

router.get("/admin/dashboard", async (req, res) => {
  try {
    const [totalRestaurants, totalOwners, restaurants, invoices] =
      await Promise.all([
        RestaurantModel.countDocuments(),
        OwnerModel.countDocuments(),
        RestaurantModel.find({}, "_id created_at").lean(),
        listAllStripeInvoices(),
      ]);

    const paidSubscriptionInvoices = invoices.filter((invoice) => {
      const hasSubscription = Boolean(
        invoice?.subscription ||
          invoice?.parent?.subscription_details?.subscription,
      );
      const paidAt = Number(invoice?.status_transitions?.paid_at || 0);
      const isPaid = invoice?.paid === true || invoice?.status === "paid" || paidAt > 0;
      const amountPaid = Number(invoice?.amount_paid || 0);

      return hasSubscription && isPaid && amountPaid > 0;
    });

    const totalRevenue = paidSubscriptionInvoices.reduce(
      (sum, invoice) => sum + Number(invoice?.amount_paid || 0) / 100,
      0,
    );

    const monthBuckets = buildRecentMonthBuckets(12);
    const bucketByLabel = new Map(monthBuckets.map((bucket) => [bucket.label, bucket]));

    restaurants.forEach((restaurant) => {
      const label = toMonthLabel(restaurant?.created_at);
      const bucket = bucketByLabel.get(label);
      if (bucket) bucket.restaurants += 1;
    });

    paidSubscriptionInvoices.forEach((invoice) => {
      const paidAt =
        Number(invoice?.status_transitions?.paid_at || 0) ||
        Number(invoice?.created || 0);
      const label = toMonthLabel(paidAt * 1000);
      const bucket = bucketByLabel.get(label);
      if (bucket) {
        bucket.revenue += Number(invoice?.amount_paid || 0) / 100;
      }
    });

    const currentMonth = monthBuckets[monthBuckets.length - 1] || null;

    res.status(200).json({
      metrics: {
        totalRestaurants,
        totalOwners,
        totalRevenue,
        currentMonthRevenue: Number(currentMonth?.revenue || 0),
      },
      charts: {
        revenueByMonth: monthBuckets.map((bucket) => ({
          label: bucket.label,
          revenue: Number(bucket.revenue || 0),
        })),
        onboardedRestaurantsByMonth: monthBuckets.map((bucket) => ({
          label: bucket.label,
          count: Number(bucket.restaurants || 0),
        })),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du dashboard admin:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération du dashboard admin",
    });
  }
});

module.exports = router;
