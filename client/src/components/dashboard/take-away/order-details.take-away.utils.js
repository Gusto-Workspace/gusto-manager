export const REFUND_LABELS = {
  succeeded: "Remboursé",
  queued: "À rembourser",
  pending: "Remboursement en attente",
  failed: "Remboursement échoué",
  uncertain: "Remboursement à vérifier",
};

const cents = (value) => Math.round(Number(value || 0) * 100);

// Read-only presentation of current adjustments and historical full refunds.
// Historical refunds did not update items or the remaining/refunded counters.
export function getOrderDetailsPresentation(order) {
  const online = order.paymentMethod === "online";
  const operations = order.adjustments || [];
  const originalCents = cents(order.total);
  const historical = order.financialVersion !== 1 && !operations.length;
  const historicalRefund =
    historical && online && order.paymentStatus === "refunded";
  const historicalTermination =
    historical &&
    (["canceled", "rejected"].includes(order.status) || historicalRefund);
  const remainingCents = historicalTermination
    ? 0
    : (order.remainingAmountCents ?? originalCents);
  const rows = (order.items || []).map((item, index) => {
    const quantity = Number(item.quantity);
    const refused = historicalTermination
      ? quantity
      : Number(item.refusedQuantity || 0);
    return {
      item,
      id: item.lineId || `${order._id}:line:${index}`,
      quantity,
      refused,
      retained: Math.max(0, quantity - refused),
      unitPrice: Number(item.unitPrice) + Number(item.optionsTotal || 0),
      refunds: [],
    };
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const refundsByState = new Map();
  let deliveryRefundedCents = 0;

  function addRefund(row, state, quantity, amountCents) {
    const existing = row.refunds.find((refund) => refund.state === state);
    if (existing) {
      existing.quantity += quantity;
      existing.amountCents += amountCents;
    } else row.refunds.push({ state, quantity, amountCents });
  }

  if (online) {
    for (const operation of operations) {
      if (!REFUND_LABELS[operation.state] || operation.amountCents <= 0)
        continue;
      refundsByState.set(
        operation.state,
        (refundsByState.get(operation.state) || 0) + operation.amountCents,
      );
      let productsCents = 0;
      for (const line of operation.lines || []) {
        const row = byId.get(line.lineId);
        const unitCents =
          line.unitAmountCents ?? (row ? cents(row.unitPrice) : null);
        if (unitCents == null) continue;
        const amountCents = Number(line.quantity) * unitCents;
        productsCents += amountCents;
        if (row)
          addRefund(row, operation.state, Number(line.quantity), amountCents);
      }
      if (
        operation.state === "succeeded" &&
        operation.type === "termination" &&
        order.fulfillmentMode === "delivery"
      ) {
        deliveryRefundedCents += Math.min(
          cents(order.deliveryFee),
          Math.max(0, operation.amountCents - productsCents),
        );
      }
    }

    if (
      historicalTermination &&
      (historicalRefund || order.paymentStatus === "paid")
    ) {
      const state = historicalRefund
        ? "succeeded"
        : ["failed", "canceled"].includes(order.stripeRefundStatus)
          ? "failed"
          : "pending";
      refundsByState.set(state, originalCents);
      for (const row of rows) {
        addRefund(
          row,
          state,
          row.quantity,
          cents(row.item.lineTotal ?? row.quantity * row.unitPrice),
        );
      }
      if (historicalRefund && order.fulfillmentMode === "delivery") {
        deliveryRefundedCents = cents(order.deliveryFee);
      }
    }
  }

  const refundedCents = !online
    ? 0
    : historicalRefund
      ? originalCents
      : (order.refundedAmountCents ?? refundsByState.get("succeeded") ?? 0);
  const productRefundedCents = rows.reduce(
    (total, row) =>
      total +
      row.refunds
        .filter((refund) => refund.state === "succeeded")
        .reduce((sum, refund) => sum + refund.amountCents, 0),
    0,
  );

  return {
    rows,
    originalCents,
    remainingCents,
    adjusted:
      rows.some((row) => row.refused > 0) || remainingCents !== originalCents,
    canceled: order.status === "canceled",
    refundedCents,
    productRefundedCents,
    deliveryRefundedCents,
    unallocatedRefundedCents: Math.max(
      0,
      refundedCents - productRefundedCents - deliveryRefundedCents,
    ),
    pendingRefunds: [...refundsByState]
      .filter(([state]) => state !== "succeeded")
      .map(([state, amountCents]) => ({ state, amountCents })),
  };
}
