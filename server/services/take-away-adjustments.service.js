const crypto = require("crypto");
const { DateTime } = require("luxon");
const Order = require("../models/take-away-order.model");
const { orderStatusSmsEvent } = require("./sms/take-away-sms-settings.service");

const EDITABLE_STATUSES = ["pending", "confirmed", "preparing"];
const cents = (value) => Math.round(Number(value || 0) * 100);
const plain = (value) => (value?.toObject ? value.toObject() : value);
function fail(message, status = 409) {
  return Object.assign(new Error(message), { status });
}
function parisDate(dateKey, time = "00:00") {
  const date = DateTime.fromISO(`${dateKey}T${time}`, { zone: "Europe/Paris" });
  // Luxon shifts nonexistent spring times; do not offer a shifted slot.
  if (
    !date.isValid ||
    date.toFormat("yyyy-MM-dd'T'HH:mm") !== `${dateKey}T${time}`
  )
    return null;
  // A repeated autumn wall-clock time always names its first occurrence,
  // independently of the current server offset or the caller's timezone.
  return date
    .getPossibleOffsets()
    .sort((a, b) => a.toMillis() - b.toMillis())[0]
    .toJSDate();
}
function deadlineFor(restaurant, scheduledFor, source = "public") {
  const settings = restaurant.takeAwaySettings || {};
  if (
    source !== "public" ||
    settings.auto_accept !== false
  )
    return null;
  const minutes = Math.max(
    Number(settings.confirmationDeadlineMinutes ?? 30),
    Number(settings.preparationTimeMinutes || 0),
  );
  return new Date(new Date(scheduledFor).getTime() - minutes * 60000);
}
function lineId(order, item, index) {
  return item.lineId || `${String(order._id)}:line:${index}`;
}
function remainingQuantity(item) {
  return Math.max(0, Number(item.quantity) - Number(item.refusedQuantity || 0));
}
function operationEvent(order, operation, type, suffix = "") {
  return {
    id: `${operation.id}:${type}${suffix ? `:${suffix}` : ""}`,
    type,
    operationId: operation.id,
    createdAt: new Date(),
    snapshot: {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      restaurantId: String(order.restaurant_id),
      customerFirstName: order.customerFirstName,
      customerLastName: order.customerLastName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      fulfillmentMode: order.fulfillmentMode,
      scheduledFor: order.scheduledFor,
      amountCents: operation.amountCents,
      currency: order.currency,
      reason: operation.reason,
      lines: operation.lines,
      state: operation.state,
      attempt: operation.attempt,
      stripeRefundId: operation.stripeRefundId || "",
      stripeRefundStatus: operation.stripeRefundStatus || "",
      targetStatus: operation.targetStatus || "",
      paymentMethod: order.paymentMethod,
      total: ["partial_rejection", "order_terminated", "confirmation_expired"].includes(type)
        ? Math.max(0, (order.remainingAmountCents ?? Math.round(order.total * 100)) - operation.amountCents) / 100
        : (order.remainingAmountCents == null ? order.total : order.remainingAmountCents / 100),
    },
  };
}
function hashDecision(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
async function loadOrder(restaurantId, orderId) {
  const order = await Order.findOne({
    _id: orderId,
    restaurant_id: restaurantId,
  });
  if (!order) throw fail("Commande introuvable", 404);
  return order;
}
async function effects(order, restaurant) {
  const service = require("./take-away.service");
  // Notification failures must never undo a recorded financial decision.
  try {
    const current = await Order.findOne({ _id: order._id }).select(
      "+pendingCustomerEmailEvents +customerEmailEventsSent",
    );
    if (current) await service.runOrderStatusEffects(current, restaurant);
  } catch (error) {
    console.error("[take-away] adjustment effects deferred", error.message);
  }
}

async function recordDecision({
  restaurant,
  orderId,
  requestKey,
  lines = [],
  reason = "",
  actorId = "",
  targetStatus = "",
  expiration = false,
  now = new Date(),
}) {
  if (
    typeof requestKey !== "string" ||
    !/^[A-Za-z0-9:_-]{8,160}$/.test(requestKey)
  )
    throw fail("Clé d'idempotence invalide", 400);
  if (typeof reason !== "string" || reason.length > 500)
    throw fail("Motif invalide (500 caractères maximum)", 400);
  if (!Array.isArray(lines) || lines.length > 50)
    throw fail("Articles invalides", 400);
  if (
    lines.some(
      (line) =>
        !line || typeof line !== "object" || typeof line.lineId !== "string",
    )
  )
    throw fail("Articles invalides", 400);
  const normalizedLines = lines
    .map((line) => ({
      lineId: String(line.lineId || ""),
      quantity: Number(line.quantity),
    }))
    .sort((a, b) => a.lineId.localeCompare(b.lineId));
  if (
    !targetStatus &&
    (!normalizedLines.length ||
      new Set(normalizedLines.map((line) => line.lineId)).size !==
        normalizedLines.length)
  )
    throw fail("Sélection d'articles invalide", 400);
  const payloadHash = hashDecision({
    lines: normalizedLines,
    reason: reason.trim(),
    targetStatus,
    expiration,
  });
  for (let retry = 0; retry < 5; retry += 1) {
    const order = await loadOrder(restaurant._id, orderId);
    const existing = (order.adjustments || []).find(
      (operation) => operation.requestKey === requestKey,
    );
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw fail("Cette clé a déjà été utilisée pour une autre décision");
      return order;
    }
    if (
      expiration &&
      (order.status !== "pending" ||
        !order.confirmationDeadlineAt ||
        new Date(order.confirmationDeadlineAt) > now)
    )
      return order;
    if (!targetStatus && !EDITABLE_STATUSES.includes(order.status))
      throw fail("Les articles ne peuvent plus être refusés à ce stade");
    if (
      !targetStatus &&
      order.paymentMethod === "online" &&
      order.paymentStatus !== "paid"
    )
      throw fail("Le paiement doit être encaissé avant un refus partiel");
    if (
      order.financialVersion !== 1 &&
      (order.stripeRefundId ||
        order.refundTargetStatus ||
        order.paymentStatus === "refunded")
    )
      throw fail("Un remboursement historique existe déjà pour cette commande");
    const items = (order.items || []).map((item, index) => ({
      ...plain(item),
      lineId: lineId(order, item, index),
    }));
    const selected = normalizedLines.map((entry) => {
      const item = items.find((candidate) => candidate.lineId === entry.lineId);
      if (
        !item ||
        !Number.isInteger(entry.quantity) ||
        entry.quantity < 1 ||
        entry.quantity > remainingQuantity(item)
      )
        throw fail("Quantité refusée supérieure à la quantité restante", 400);
      return {
        lineId: item.lineId,
        name: item.name,
        options: item.options,
        quantity: entry.quantity,
        unitAmountCents: cents(
          Number(item.unitPrice) + Number(item.optionsTotal || 0),
        ),
      };
    });
    for (const line of selected) {
      const item = items.find((candidate) => candidate.lineId === line.lineId);
      item.refusedQuantity = Number(item.refusedQuantity || 0) + line.quantity;
    }
    const allRefused = items.every((item) => remainingQuantity(item) === 0);
    let terminal =
      targetStatus ||
      (allRefused
        ? order.status === "pending"
          ? "rejected"
          : "canceled"
        : "");
    if (terminal && order.status !== terminal)
      require("./take-away.service").assertStatusTransition(order, terminal);
    const original = cents(order.total);
    const reserved = (order.adjustments || []).reduce(
      (sum, operation) => sum + operation.amountCents,
      0,
    );
    const amountCents = terminal
      ? original - reserved
      : selected.reduce(
          (sum, line) => sum + line.quantity * line.unitAmountCents,
          0,
        );
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < 0 ||
      reserved + amountCents > original
    )
      throw fail("Montant de remboursement incohérent");
    if (terminal) {
      // Keep the original snapshot and show that no articles remain deliverable.
      for (const item of items) item.refusedQuantity = item.quantity;
    }
    const nextStatus =
      terminal || (order.status === "pending" ? "confirmed" : order.status);
    const operation = {
      id: crypto.randomUUID(),
      requestKey,
      payloadHash,
      type: terminal ? "termination" : "partial_rejection",
      targetStatus: terminal,
      reason: reason.trim(),
      actorId: String(actorId || ""),
      emailEnabled:
        Boolean(terminal) ||
        restaurant.takeAwaySettings?.partialRejectionEmailEnabled !== false,
      lines: selected.length
        ? selected
        : items
            .map((item, index) => ({
              lineId: item.lineId,
              name: item.name,
              options: item.options,
              quantity: remainingQuantity(order.items[index]),
              unitAmountCents: cents(
                Number(item.unitPrice) + Number(item.optionsTotal || 0),
              ),
            }))
            .filter((line) => line.quantity),
      amountCents,
      state:
        order.paymentMethod === "online" && amountCents > 0
          ? "queued"
          : "not_required",
      attempt: 0,
      createdAt: now,
      updatedAt: now,
    };
    const email = expiration
      ? `expired:${operation.id}`
      : terminal
        ? terminal
        : `partial_rejection:${operation.id}`;
    const events = [
      operationEvent(
        order,
        operation,
        expiration
          ? "confirmation_expired"
          : terminal
            ? "order_terminated"
            : "partial_rejection",
      ),
    ];
    if (operation.state === "queued" && order.paymentStatus === "paid")
      events.push(operationEvent(order, operation, "refund_requested", "0"));
    // A partial acceptance also confirms a pending order. Keep that real
    // transition durable; the SMS consumer combines it with the refusal when
    // both notifications are selected, so an operation sends one summary.
    if (!terminal && order.status !== nextStatus) {
      const statusEvent = orderStatusSmsEvent({
        ...plain(order), remainingAmountCents: original - reserved - amountCents,
      }, nextStatus, now);
      if (statusEvent) events.push({ ...statusEvent, operationId: operation.id });
    }
    const filter = {
      _id: order._id,
      restaurant_id: restaurant._id,
      status: order.status,
      financialRevision: {
        $in: [
          Number(order.financialRevision || 0),
          ...(order.financialRevision ? [] : [null]),
        ],
      },
    };
    // Historical full refunds and their first partial upgrade share this CAS.
    if (order.financialVersion !== 1)
      Object.assign(filter, {
        stripeRefundId: { $in: ["", null] },
        refundTargetStatus: { $in: ["", null] },
      });
    if (order.status === "pending" && !expiration)
      filter.$or = [
        { confirmationDeadlineAt: null },
        { confirmationDeadlineAt: { $gt: new Date() } },
      ];
    if (expiration)
      Object.assign(filter, {
        status: "pending",
        confirmationDeadlineAt: { $lte: now, $ne: null },
      });
    const updated = await Order.findOneAndUpdate(
      filter,
      {
        $set: {
          items,
          financialVersion: 1,
          remainingAmountCents: original - reserved - amountCents,
          status: nextStatus,
          ...(nextStatus !== order.status
            ? {
                [nextStatus === "confirmed"
                  ? "confirmedAt"
                  : nextStatus === "rejected"
                    ? "rejectedAt"
                    : "canceledAt"]: now,
                ...(order.customer
                  ? {
                      pendingCrmPrevStatus: order.status,
                      pendingCrmNextStatus: nextStatus,
                    }
                  : {}),
              }
            : {}),
          ...(terminal
            ? {
                refundTargetStatus: terminal,
                ...(order.paymentStatus === "paid"
                  ? { stripeRefundStatus: "pending" }
                  : {}),
              }
            : {}),
        },
        $inc: { financialRevision: 1 },
        $push: { adjustments: operation, businessEvents: { $each: events } },
        $addToSet: {
          ...(order.customer ? { pendingCrmAdjustmentIds: operation.id } : {}),
          ...(order.source === "public" &&
          (terminal ||
            restaurant.takeAwaySettings?.partialRejectionEmailEnabled !== false)
            ? { pendingCustomerEmailEvents: email }
            : {}),
        },
      },
      { new: true },
    );
    if (updated) return updated;
    if (
      order.status === "pending" &&
      !expiration &&
      order.confirmationDeadlineAt &&
      new Date(order.confirmationDeadlineAt) <= now
    )
      throw fail("Le délai de confirmation est expiré");
  }
  throw fail("La commande a été modifiée, veuillez réessayer");
}

function validateRefund(refund, order, operation) {
  const intent =
    typeof refund.payment_intent === "object"
      ? refund.payment_intent?.id
      : refund.payment_intent;
  if (
    intent !== order.stripePaymentIntentId ||
    refund.amount !== operation.amountCents ||
    String(refund.currency || order.currency).toLowerCase() !==
      String(order.currency || "eur").toLowerCase() ||
    refund.metadata?.type !== "takeaway_order_refund" ||
    refund.metadata?.orderId !== String(order._id) ||
    refund.metadata?.restaurantId !== String(order.restaurant_id) ||
    refund.metadata?.operationId !== operation.id ||
    String(refund.metadata?.attempt) !== String(operation.attempt)
  )
    throw fail("Remboursement non correspondant à l'opération");
}
async function findStripeRefund(stripe, order, operation) {
  if (operation.stripeRefundId)
    return stripe.refunds.retrieve(operation.stripeRefundId);
  let startingAfter;
  do {
    const page = await stripe.refunds.list({
      payment_intent: order.stripePaymentIntentId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const found = page.data.find(
      (refund) =>
        refund.metadata?.operationId === operation.id &&
        String(refund.metadata?.attempt) === String(operation.attempt),
    );
    if (found) return found;
    if (!page.has_more) return null;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) throw fail("Réconciliation Stripe incomplète");
  } while (true);
}
async function saveOperation(
  order,
  operation,
  state,
  extra = {},
  leaseOwner = "",
) {
  const operations = order.adjustments.map((entry) =>
    entry.id === operation.id
      ? { ...plain(entry), ...extra, state, updatedAt: new Date() }
      : plain(entry),
  );
  const refunded = operations
    .filter((entry) => entry.state === "succeeded")
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  let events = [];
  if (
    state !== operation.state &&
    ["succeeded", "failed", "uncertain"].includes(state)
  )
    events.push(
      operationEvent(
        order,
        { ...plain(operation), ...extra, state },
        state === "succeeded"
          ? "refund_confirmed"
          : state === "failed"
            ? "refund_failed"
            : "refund_reconciliation_required",
        String(operation.attempt),
      ),
    );
  if (
    state === "queued" &&
    ["failed", "pending", "not_required"].includes(operation.state)
  )
    events.push(
      operationEvent(
        order,
        { ...plain(operation), ...extra, state },
        "refund_requested",
        String(extra.attempt ?? operation.attempt),
      ),
    );
  events = events.filter(
    (event) =>
      !(order.businessEvents || []).some(
        (existing) => existing.id === event.id,
      ),
  );
  const allFinancialDone = operations.every((entry) =>
    ["succeeded", "not_required"].includes(entry.state),
  );
  const terminal = ["canceled", "rejected"].includes(order.status);
  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      financialRevision: Number(order.financialRevision || 0),
      ...(leaseOwner ? { refundLeaseOwner: leaseOwner } : {}),
    },
    {
      $set: {
        adjustments: operations,
        refundedAmountCents: refunded,
        ...(refunded === cents(order.total) && refunded > 0
          ? { paymentStatus: "refunded", refundedAt: new Date() }
          : {}),
        ...(terminal
          ? {
              stripeRefundStatus: allFinancialDone
                ? refunded
                  ? "succeeded"
                  : ""
                : state === "failed" || state === "uncertain"
                  ? "failed"
                  : "pending",
              stripeRefundId:
                extra.stripeRefundId || order.stripeRefundId || "",
            }
          : {}),
      },
      $inc: { financialRevision: 1 },
      ...(events.length
        ? { $push: { businessEvents: { $each: events } } }
        : {}),
    },
    { new: true },
  );
  if (!updated)
    throw fail(
      "L'opération financière a été modifiée, réconciliation différée",
    );
  // The initial recap uses the final state of this processing pass. Send a
  // separate update only when the client has already received that recap.
  if (events.length && operation.emailEnabled !== false) {
    await Order.updateOne(
      {
        _id: order._id,
        source: "public",
        customerEmailEventsSent: {
          $in: [
            `partial_rejection:${operation.id}`,
            `expired:${operation.id}`,
            "canceled",
            "rejected",
          ],
        },
      },
      {
        $addToSet: {
          pendingCustomerEmailEvents: `refund_update:${operation.id}:${operation.attempt}:${state}`,
        },
      },
    );
  }
  return updated;
}

async function processRefunds({
  restaurant,
  orderId,
  stripeInstance = null,
  now = new Date(),
}) {
  const leaseOwner = crypto.randomUUID();
  let order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      restaurant_id: restaurant._id,
      financialVersion: 1,
      $or: [{ refundLeaseUntil: null }, { refundLeaseUntil: { $lte: now } }],
    },
    {
      $set: {
        refundLeaseOwner: leaseOwner,
        refundLeaseUntil: new Date(now.getTime() + 120000),
      },
    },
    { new: true },
  );
  if (!order) return loadOrder(restaurant._id, orderId);
  try {
    for (let index = 0; index < order.adjustments.length; index += 1) {
      let operation = order.adjustments[index];
      if (
        operation.state === "not_required" &&
        order.paymentMethod === "online" &&
        order.paymentStatus === "paid" &&
        operation.amountCents > 0
      ) {
        order = await saveOperation(order, operation, "queued", {}, leaseOwner);
        operation = order.adjustments[index];
      }
      if (["succeeded", "not_required"].includes(operation.state)) continue;
      if (operation.nextAttemptAt && new Date(operation.nextAttemptAt) > now)
        break;
      try {
        const service = require("./take-away.service");
        const stripe =
          stripeInstance || service.getStripeForRestaurant(restaurant);
        if (!order.stripePaymentIntentId) {
          if (order.paymentStatus === "paid")
            throw fail("Paiement encaissé sans identifiant Stripe");
          order = await saveOperation(
            order,
            operation,
            "not_required",
            {},
            leaseOwner,
          );
          await Order.updateOne(
            { _id: order._id, paymentStatus: { $nin: ["paid", "refunded"] } },
            {
              $set: {
                paymentStatus: "failed",
                paymentFailedAt: now,
                paymentExpiresAt: now,
              },
            },
          );
          continue;
        }
        let payment = await stripe.paymentIntents.retrieve(
          order.stripePaymentIntentId,
        );
        service.assertPaymentIntentMatchesOrder(payment, order, {
          requireSucceeded: false,
        });
        if (payment.status !== "succeeded") {
          if (operation.type !== "termination")
            throw fail("Paiement non encaissé");
          if (payment.status !== "canceled") {
            try {
              await stripe.paymentIntents.cancel(
                payment.id,
                {},
                {
                  idempotencyKey: `takeaway-order-${order._id}-terminal-payment`,
                },
              );
            } catch {
              payment = await stripe.paymentIntents.retrieve(payment.id);
              if (!["succeeded", "canceled"].includes(payment.status))
                throw fail("Annulation du paiement à réconcilier");
            }
          }
          if (payment.status !== "succeeded") {
            order = await saveOperation(
              order,
              operation,
              "not_required",
              {},
              leaseOwner,
            );
            await Order.updateOne(
              { _id: order._id, paymentStatus: { $nin: ["paid", "refunded"] } },
              {
                $set: {
                  paymentStatus: "failed",
                  paymentFailedAt: now,
                  paymentExpiresAt: now,
                },
              },
            );
            continue;
          }
        }
        service.assertPaymentIntentMatchesOrder(payment, order);
        if (order.paymentStatus !== "paid") {
          await Order.updateOne(
            { _id: order._id, paymentStatus: { $ne: "refunded" } },
            {
              $set: {
                paymentStatus: "paid",
                paidAt: order.paidAt || now,
                paymentExpiresAt: null,
              },
            },
          );
          order.paymentStatus = "paid";
        }
        let refund = await findStripeRefund(stripe, order, operation);
        if (refund) {
          validateRefund(refund, order, operation);
          if (["failed", "canceled"].includes(refund.status)) {
            if (operation.state !== "failed") {
              order = await saveOperation(
                order,
                operation,
                "failed",
                {
                  stripeRefundId: refund.id,
                  stripeRefundStatus: refund.status,
                },
                leaseOwner,
              );
              operation = order.adjustments[index];
            }
            // A new Stripe attempt belongs to the SAME durable business decision.
            const nextAttempt = Number(operation.attempt || 0) + 1;
            order = await saveOperation(
              order,
              operation,
              "queued",
              {
                attempt: nextAttempt,
                stripeRefundId: "",
                stripeRefundStatus: "",
                submittedAt: null,
              },
              leaseOwner,
            );
            operation = order.adjustments[index];
            refund = null;
          }
        }
        if (!refund) {
          // Reconcile every retry before create, even beyond Stripe's key retention.
          const charge =
            typeof payment.latest_charge === "object"
              ? payment.latest_charge
              : await stripe.charges.retrieve(payment.latest_charge);
          if (
            !charge ||
            Number(charge.amount_refunded || 0) + operation.amountCents >
              Number(payment.amount_received)
          )
            throw fail(
              "Solde Stripe insuffisant : rapprochement manuel nécessaire",
            );
          order = await saveOperation(
            order,
            operation,
            "queued",
            {
              submittedAt: now,
              nextAttemptAt: new Date(now.getTime() + 60000),
            },
            leaseOwner,
          );
          operation = order.adjustments[index];
          refund = await stripe.refunds.create(
            {
              payment_intent: order.stripePaymentIntentId,
              amount: operation.amountCents,
              metadata: {
                type: "takeaway_order_refund",
                restaurantId: String(restaurant._id),
                orderId: String(order._id),
                operationId: operation.id,
                attempt: String(operation.attempt),
                targetStatus: operation.targetStatus,
              },
            },
            {
              idempotencyKey: `takeaway-order-${order._id}-operation-${operation.id}-${operation.attempt}`,
            },
          );
          validateRefund(refund, order, operation);
        }
        const state =
          refund.status === "succeeded"
            ? "succeeded"
            : ["failed", "canceled"].includes(refund.status)
              ? "failed"
              : "pending";
        order = await saveOperation(
          order,
          operation,
          state,
          {
            stripeRefundId: refund.id,
            stripeRefundStatus: refund.status,
            lastError: "",
            nextAttemptAt:
              state === "succeeded"
                ? null
                : new Date(
                    now.getTime() + (state === "failed" ? 300000 : 60000),
                  ),
          },
          leaseOwner,
        );
        if (state !== "succeeded") break;
      } catch (error) {
        // If a webhook changed the revision, reload rather than overwrite it.
        order = await loadOrder(restaurant._id, orderId);
        operation = order.adjustments[index];
        if (!["succeeded", "not_required"].includes(operation.state)) {
          order = await saveOperation(
            order,
            operation,
            "uncertain",
            {
              lastError: String(error.message || "Erreur Stripe").slice(0, 300),
              nextAttemptAt: new Date(now.getTime() + 300000),
            },
            leaseOwner,
          ).catch(() => order);
        }
        break;
      }
    }
  } finally {
    await Order.updateOne(
      { _id: orderId, refundLeaseOwner: leaseOwner },
      { $set: { refundLeaseOwner: "", refundLeaseUntil: null } },
    );
  }
  order = await loadOrder(restaurant._id, orderId);
  await effects(order, restaurant);
  return order;
}
async function rejectItems(args) {
  const order = await recordDecision(args);
  return processRefunds({ ...args, orderId: order._id });
}
async function terminateOrder(args) {
  const current = await loadOrder(args.restaurant._id, args.orderId);
  if (
    ["canceled", "rejected"].includes(current.status) &&
    current.adjustments?.some((operation) => operation.type === "termination")
  ) {
    return processRefunds(args);
  }
  const order = await recordDecision({
    ...args,
    requestKey: args.requestKey || `terminal:${args.targetStatus}`,
    targetStatus: args.targetStatus || "canceled",
  });
  return processRefunds({ ...args, orderId: order._id });
}
async function reconcileRefund({ restaurant, order, refund }) {
  for (let retry = 0; retry < 5; retry += 1) {
    const operation = order.adjustments.find(
      (entry) => entry.id === refund.metadata?.operationId,
    );
    if (!operation) throw fail("Opération de remboursement introuvable");
    // Old attempt webhooks cannot undo a newer attempt.
    if (Number(refund.metadata.attempt) < operation.attempt) return order;
    validateRefund(refund, order, operation);
    if (operation.state === "succeeded") return order;
    const state =
      refund.status === "succeeded"
        ? "succeeded"
        : ["failed", "canceled"].includes(refund.status)
          ? "failed"
          : "pending";
    try {
      const updated = await saveOperation(order, operation, state, {
        stripeRefundId: refund.id,
        stripeRefundStatus: refund.status,
        nextAttemptAt:
          state === "succeeded" ? null : new Date(Date.now() + 300000),
      });
      await effects(updated, restaurant);
      return updated;
    } catch (error) {
      if (error.status !== 409) throw error;
      order = await loadOrder(restaurant._id, order._id);
    }
  }
  throw fail("Réconciliation concurrente, veuillez réessayer");
}
async function runAdjustmentLifecycle({ now = new Date() } = {}) {
  const service = require("./take-away.service");
  const due = await Order.find({
    status: "pending",
    confirmationDeadlineAt: { $ne: null, $lte: now },
  }).limit(200);
  const restaurants = new Map();
  async function restaurantFor(order) {
    const key = String(order.restaurant_id);
    if (!restaurants.has(key))
      restaurants.set(key, await service.loadRestaurantForTakeAway(key));
    return restaurants.get(key);
  }
  let expired = 0;
  for (const order of due) {
    try {
      const restaurant = await restaurantFor(order);
      if (!restaurant) continue;
      const result = await terminateOrder({
        restaurant,
        orderId: order._id,
        targetStatus: "canceled",
        expiration: true,
        reason: "Absence de validation avant l'échéance",
        requestKey: "confirmation:expiration",
        now,
      });
      if (result.status === "canceled") expired += 1;
    } catch (error) {
      console.error(
        "[take-away] confirmation expiration deferred",
        String(order._id),
        error.message,
      );
    }
  }
  const pending = await Order.find({
    financialVersion: 1,
    adjustments: {
      $elemMatch: {
        state: { $in: ["queued", "pending", "failed", "uncertain"] },
        $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
      },
    },
  }).limit(200);
  for (const order of pending) {
    try {
      const restaurant = await restaurantFor(order);
      if (restaurant)
        await processRefunds({ restaurant, orderId: order._id, now });
    } catch (error) {
      console.error(
        "[take-away] refund reconciliation deferred",
        String(order._id),
        error.message,
      );
    }
  }
  // Preserve and resume historical full refunds, using their existing keys.
  const legacy = await Order.find({
    financialVersion: { $ne: 1 },
    status: { $in: ["canceled", "rejected"] },
    paymentStatus: "paid",
    refundTargetStatus: { $in: ["canceled", "rejected"] },
  }).limit(200);
  for (const order of legacy) {
    try {
      const restaurant = await restaurantFor(order);
      if (!restaurant) continue;
      if (
        order.stripeRefundId &&
        !["failed", "canceled"].includes(order.stripeRefundStatus)
      ) {
        const refund = await service
          .getStripeForRestaurant(restaurant)
          .refunds.retrieve(order.stripeRefundId);
        await service.handleTakeAwayStripeWebhookEvent({
          restaurant,
          event: { type: "refund.updated", data: { object: refund } },
        });
      } else
        await service.refundPaidOrder({
          restaurant,
          order,
          targetStatus: order.status,
        });
    } catch (error) {
      console.error(
        "[take-away] historical refund deferred",
        String(order._id),
        error.message,
      );
    }
  }
  return { expired, resumed: pending.length, historical: legacy.length };
}
module.exports = {
  parisDate,
  deadlineFor,
  lineId,
  remainingQuantity,
  recordDecision,
  rejectItems,
  terminateOrder,
  processRefunds,
  reconcileRefund,
  runAdjustmentLifecycle,
  validateRefund,
};
