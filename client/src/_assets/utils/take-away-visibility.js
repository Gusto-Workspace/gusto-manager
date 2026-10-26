export function isTakeAwayOrderVisible(order) {
  return Boolean(order) && !order.deletedAt && (
    order.paymentMethod !== "online" || Boolean(order.paidAt) ||
    ["paid", "refunded"].includes(order.paymentStatus)
  );
}

export function canDeleteTakeAwayOrder(order) {
  return isTakeAwayOrderVisible(order) &&
    ["completed", "canceled"].includes(order.status);
}
