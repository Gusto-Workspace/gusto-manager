// Payment success is recorded only by server-side Stripe verification. paidAt
// preserves that business existence through subsequent payment/status changes.
function hasRestaurantOrderHistory(order) {
  return Boolean(order) && (
    order.paymentMethod !== "online" || Boolean(order.paidAt) ||
    ["paid", "refunded"].includes(order.paymentStatus)
  );
}

function isRestaurantOrderVisible(order) {
  return hasRestaurantOrderHistory(order) && !order.deletedAt;
}

function restaurantOrderVisibilityFilter() {
  return {
    deletedAt: null,
    $or: [
      { paymentMethod: { $ne: "online" } },
      { paymentStatus: { $in: ["paid", "refunded"] } },
      { paidAt: { $ne: null } },
    ],
  };
}

module.exports = {
  hasRestaurantOrderHistory,
  isRestaurantOrderVisible,
  restaurantOrderVisibilityFilter,
};
