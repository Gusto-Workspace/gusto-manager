const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
process.env.STRIPE_API_SECRET_KEY = "sk_test_sms_mock_only";
const {
  TAKE_AWAY_SMS_EVENTS,
  sanitizeTakeAwaySmsSettings,
  orderStatusSmsEvent,
  addRefundConfirmedSmsEvent,
  takeAwaySmsVariables,
} = require("../services/sms/take-away-sms-settings.service");
const {
  syncTakeAwaySmsJobs,
  smsEventType,
  buildTakeAwayFinalMessage,
} = require("../services/sms/take-away-sms.service");
const {
  processClaimedJob,
  recoverExpiredJobs,
} = require("../services/sms/sms-reminder.service");
const { computeSmsSchedule } = require("../services/sms/sms-schedule.service");
const {
  DEFAULT_SMS_TEMPLATE,
  validateSmsTemplate,
} = require("../services/sms/sms-message.service");
const {
  buildStripeMeterEventParams,
} = require("../services/sms/sms-meter.service");
const SmsJob = require("../models/sms-job.model");
const Order = require("../models/take-away-order.model");
const Restaurant = require("../models/restaurant.model");
const {
  assertSenderCreationEligible,
  configureAdminSender,
  serializeAdminSmsJob,
} = require("../routes/admin/sms-reminders.routes");
const notificationsPath = require.resolve("../services/notifications.service");
require.cache[notificationsPath] = {
  id: notificationsPath,
  filename: notificationsPath,
  loaded: true,
  exports: {
    createAndBroadcastNotification: async () => ({ _id: "mock-notification" }),
  },
};
const mailerPath = require.resolve("../services/take-away-mailer.service");
require.cache[mailerPath] = {
  id: mailerPath,
  filename: mailerPath,
  loaded: true,
  exports: {
    sendTakeAwayOrderEmail: async () => ({ skipped: true, reason: "mock" }),
  },
};
const service = require("../services/take-away.service");
const router = require("../routes/take-away.routes");
const now = new Date("2099-01-01T06:00:00Z");
const enabledAt = new Date("2098-12-31T00:00:00Z");
const billing = {
  subscriptionId: "sub_shared",
  stripeCustomerId: "cus_shared",
  periodStart: enabledAt,
  periodEnd: new Date("2099-02-01"),
};

function restaurant() {
  return {
    _id: "restaurant-1",
    owner_id: "owner-1",
    name: "Restaurant",
    options: { sms_reminders: true, take_away: true },
    reservationsSettings: {
      smsReminder: {
        enabled: false,
        deliveryMode: "eco",
        internationalEnabled: false,
        billingPeriodSpendingLimit: null,
        sender: { value: "RESTO", status: "approved" },
      },
    },
    takeAwaySettings: {
      smsNotifications: {
        enabled: true,
        enabledAt,
        events: Object.fromEntries(
          Object.entries(TAKE_AWAY_SMS_EVENTS).map(([key, event]) => [
            key,
            { enabled: true, enabledAt, template: event.template },
          ]),
        ),
      },
    },
  };
}
function order(events = []) {
  return {
    _id: "order-1",
    restaurant_id: "restaurant-1",
    orderNumber: "TA-TEST",
    source: "public",
    status: "confirmed",
    customerFirstName: "Ada",
    customerPhone: "0612345678",
    scheduledFor: new Date("2099-01-01T18:00:00Z"),
    fulfillmentMode: "pickup",
    total: 25,
    currency: "eur",
    paymentMethod: "online",
    paymentStatus: "paid",
    businessEvents: events,
  };
}
function partial(id = "operation-1") {
  return {
    id: `${id}:partial_rejection`,
    operationId: id,
    type: "partial_rejection",
    createdAt: now,
    snapshot: {
      ...order(),
      lines: [
        { name: "Pizza", quantity: 2 },
        { name: "Dessert", quantity: 1 },
      ],
      amountCents: 1200,
      reason: "Indisponible",
      state: "queued",
    },
  };
}
function query(value) {
  return {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    populate() {
      return this;
    },
    lean: async () => value,
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}
function outboxFixture(events, options = {}) {
  const value = order(events);
  const rest = restaurant();
  const jobs = new Map();
  let acknowledgements = 0;
  return {
    value,
    rest,
    jobs,
    get acknowledgements() {
      return acknowledgements;
    },
    deps: {
      now,
      orderModel: {
        find: () => query([value]),
        async updateOne(_filter, update, opts) {
          if (options.failAck) throw new Error("crash before acknowledgement");
          const event = events.find(
            (event) => event.id === opts.arrayFilters[0]["event.id"],
          );
          event.smsProcessedAt =
            update.$set["businessEvents.$[event].smsProcessedAt"];
          acknowledgements++;
        },
      },
      restaurantModel: { findById: async () => rest },
      smsJobModel: {
        async updateOne(identity, update) {
          if (options.failJob) throw new Error("job database unavailable");
          if (!jobs.has(identity.eventId))
            jobs.set(identity.eventId, { ...update.$setOnInsert });
        },
        async findOne(identity) {
          return jobs.get(identity.eventId);
        },
      },
    },
  };
}
function usageModel(consumedCredits = 99) {
  const state = {
    _id: "period-1",
    consumedCredits,
    reservedCredits: 0,
    includedCreditsConsumed: consumedCredits,
    overageCredits: 0,
    overageAmount: 0,
  };
  const identities = [];
  return {
    state,
    identities,
    async updateOne(_filter, update) {
      for (const [key, value] of Object.entries(update.$inc || {}))
        state[key] = (state[key] || 0) + value;
      return { modifiedCount: 1 };
    },
    async findOneAndUpdate(filter, update) {
      identities.push({
        restaurantId: filter.restaurantId,
        stripeSubscriptionId: filter.stripeSubscriptionId,
        periodStart: filter.periodStart,
        periodEnd: filter.periodEnd,
      });
      const credits = filter.$expr.$lte[0].$add.at(-1);
      if (
        state.consumedCredits + state.reservedCredits + credits >
        filter.$expr.$lte[1]
      )
        return null;
      const before = { ...state };
      state.reservedCredits += update.$inc.reservedCredits;
      return before;
    },
  };
}
function processingJob(event = "confirmed", snapshot = order()) {
  return {
    _id: `job-${event}`,
    restaurantId: "restaurant-1",
    type: `take_away_${event}`,
    eventSnapshot: { ...snapshot },
    templateSnapshot: TAKE_AWAY_SMS_EVENTS[event].template,
    providerReference: `mock-${event}`,
    status: "processing",
    usageState: "none",
    async save() {},
  };
}
function processDeps(rest, usage, overrides = {}) {
  const calls = [];
  const reports = [];
  const deps = {
    restaurantModel: { findById: async () => rest },
    usagePeriodModel: usage,
    destinationPolicyModel: {
      findOne: async () => ({
        enabled: true,
        country: "FR",
        provider: "smsmode",
        senderMode: "registered_alpha",
        senderRegistrationRequired: true,
        supportsDlr: true,
        providerRateHt: 0.05,
        billingCredits: 1,
        lastReviewedAt: now,
      }),
    },
    getBillingContext: async () => billing,
    sendingEnabled: () => true,
    provider: {
      async send(payload) {
        calls.push(payload);
        return { providerMessageId: "mock-message" };
      },
    },
    reportUsage: async (job) =>
      reports.push(buildStripeMeterEventParams(job, billing)),
    ...overrides,
  };
  return { deps, calls, reports };
}

test("Sender initial : abonnement requis, historiques éditables, absence fournisseur reste pending", async () => {
  const rest = restaurant();
  rest.reservationsSettings.smsReminder.sender = {};
  assert.doesNotThrow(() => assertSenderCreationEligible(rest));
  rest.options.sms_reminders = false;
  assert.throws(() => assertSenderCreationEligible(rest), /souscrit/);
  rest.reservationsSettings.smsReminder.sender = { value: "HISTORIQUE" };
  assert.doesNotThrow(() => assertSenderCreationEligible(rest));
  rest.options.sms_reminders = true;
  rest.reservationsSettings.smsReminder.sender = {};
  rest.save = async () => {};
  assert.equal(
    (
      await configureAdminSender(
        rest,
        { value: "RESTO" },
        { senderExists: async () => ({ exists: false }) },
      )
    ).sender.status,
    "pending",
  );
});

test("admin : restaurant absent de la liste, création puis entrée visible au vrai statut", async (t) => {
  const adminRouter = require("../routes/admin/sms-reminders.routes");
  const Provider = require("../services/sms/smsmode-provider");
  const rest = restaurant();
  rest.reservationsSettings.smsReminder.sender = {};
  rest.save = async () => {};
  t.mock.method(Restaurant, "find", () => query([rest]));
  t.mock.method(Restaurant, "findById", async () => rest);
  t.mock.method(Provider.prototype, "senderExists", async () => ({
    exists: true,
  }));
  const handler = (path, method) =>
    adminRouter.stack
      .find(
        (layer) => layer.route?.path === path && layer.route.methods[method],
      )
      .route.stack.at(-1).handle;
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler("/admin/sms/senders", "get")({}, res);
  assert.equal(res.body.senders.length, 0);
  assert.equal(res.body.eligibleRestaurants.length, 1);
  await handler("/admin/restaurants/:id/sms-sender", "put")(
    { params: { id: rest._id }, body: { value: "RESTO" } },
    res,
  );
  assert.equal(res.body.sender.status, "approved");
  await handler("/admin/sms/senders", "get")({}, res);
  assert.equal(res.body.senders.length, 1);
  assert.equal(res.body.eligibleRestaurants.length, 0);
});

test("événement initial : paiement, source manuelle et confirmation automatique", () => {
  assert.equal(
    orderStatusSmsEvent({ ...order(), paymentStatus: "pending" }, "pending"),
    null,
  );
  assert.equal(
    orderStatusSmsEvent({ ...order(), source: "dashboard" }, "confirmed").snapshot.status,
    "confirmed",
  );
  assert.equal(
    orderStatusSmsEvent(order(), "confirmed", now).snapshot.status,
    "confirmed",
  );
  assert.equal(
    orderStatusSmsEvent(
      { ...order(), paymentMethod: "on_site" },
      "pending",
      now,
    ).snapshot.status,
    "pending",
  );
});

test("deux refus partiels, plusieurs lignes : deux jobs, reprise du même événement sans doublon", async () => {
  const options = { failAck: true };
  const fixture = outboxFixture([partial(), partial("operation-2")], options);
  await assert.rejects(syncTakeAwaySmsJobs(fixture.deps), /crash/);
  assert.equal(fixture.jobs.size, 1);
  assert.equal(fixture.acknowledgements, 0);
  options.failAck = false;
  await syncTakeAwaySmsJobs(fixture.deps);
  await syncTakeAwaySmsJobs(fixture.deps);
  assert.equal(fixture.jobs.size, 2);
  assert.equal(fixture.acknowledgements, 2);
  const job = [...fixture.jobs.values()][0];
  assert.equal(job.scheduledAt.getTime(), now.getTime()); // Before 8am: no reservation scheduling rules.
  const rendered = buildTakeAwayFinalMessage({ job, restaurant: fixture.rest });
  assert.match(rendered.message, /2 x Pizza, 1 x Dessert/);
  assert.doesNotMatch(rendered.message, /remboursement.*(effectue|confirme)/i);
});

test("crash avant job : événement conservé et repris", async () => {
  const options = { failJob: true };
  const fixture = outboxFixture([partial()], options);
  await assert.rejects(syncTakeAwaySmsJobs(fixture.deps), /unavailable/);
  assert.equal(fixture.acknowledgements, 0);
  options.failJob = false;
  await syncTakeAwaySmsJobs(fixture.deps);
  assert.equal(fixture.jobs.size, 1);
});

test("confirmation par refus partiel : un seul résumé, ou confirmation seule si refus désactivé", async () => {
  const confirmation = {
    ...orderStatusSmsEvent(order(), "confirmed", now),
    operationId: "operation-1",
  };
  const fixture = outboxFixture([partial(), confirmation]);
  await syncTakeAwaySmsJobs(fixture.deps);
  assert.equal(
    [...fixture.jobs.values()].filter((job) => job.status === "scheduled")
      .length,
    1,
  );
  assert.equal(
    fixture.jobs.get(confirmation.id).skipReason,
    "covered_by_partial_rejection",
  );
  const other = outboxFixture([
    partial(),
    { ...confirmation, smsProcessedAt: null },
  ]);
  other.rest.takeAwaySettings.smsNotifications.events.partial_rejection.enabled = false;
  await syncTakeAwaySmsJobs(other.deps);
  assert.equal(other.jobs.get(confirmation.id).status, "scheduled");
});

test("remboursement confirmé séparé du refus et des états financiers incertains", async () => {
  const fixture = outboxFixture([
    partial(),
    { ...partial(), id: "op:requested", type: "refund_requested" },
    {
      ...partial(),
      id: "op:confirmed",
      type: "refund_confirmed",
      snapshot: {
        ...partial().snapshot,
        state: "succeeded",
        stripeRefundStatus: "succeeded",
      },
    },
  ]);
  assert.equal(
    smsEventType(
      {
        type: "refund_confirmed",
        snapshot: { state: "pending", stripeRefundStatus: "pending" },
      },
      fixture.value,
    ),
    "",
  );
  await syncTakeAwaySmsJobs(fixture.deps);
  assert.equal(fixture.jobs.size, 2);
  const confirmed = fixture.jobs.get("op:confirmed");
  assert.match(
    buildTakeAwayFinalMessage({ job: confirmed, restaurant: fixture.rest })
      .message,
    /remboursement de 12,00 EUR confirme/,
  );
  assert.equal(
    addRefundConfirmedSmsEvent({}, order(), "canceled", {
      id: "re_mock",
      status: "pending",
    }).$push,
    undefined,
  );
});

test("activation sans historique et événements pertinents pour le mode réel", async () => {
  for (const [event, patch, expected] of [
    [
      { ...partial(), createdAt: new Date("2090-01-01") },
      {},
      "event_before_activation",
    ],
    [
      orderStatusSmsEvent(
        { ...order(), fulfillmentMode: "delivery" },
        "ready",
        now,
      ),
      { status: "ready" },
      "fulfillment_not_applicable",
    ],
    [
      orderStatusSmsEvent(order(), "pending", now),
      { status: "confirmed" },
      "event_obsolete",
    ],
  ]) {
    const fixture = outboxFixture([event]);
    Object.assign(fixture.value, patch);
    await syncTakeAwaySmsJobs(fixture.deps);
    assert.equal([...fixture.jobs.values()][0].skipReason, expected);
  }
});

test("quota partagé : rappel puis commande franchissent ensemble 100 crédits, Meter brut", async () => {
  const rest = restaurant();
  rest.reservationsSettings.smsReminder.enabled = true;
  rest.reservationsSettings.smsReminder.deliveryMode = "sms_always";
  rest.reservationsSettings.smsReminder.delayMinutes = 120;
  rest.reservationsSettings.smsReminder.template = DEFAULT_SMS_TEMPLATE;
  const reservation = {
    _id: "resa-1",
    status: "Confirmed",
    customerFirstName: "Ada",
    customerPhone: "0612345678",
    numberOfGuests: 2,
    reservationDate: new Date("2099-01-01"),
    reservationTime: "20:00",
  };
  const usage = usageModel();
  const context = processDeps(rest, usage, {
    reservationModel: { findById: async () => reservation },
  });
  const reminder = {
    ...processingJob(),
    type: "reservation_reminder",
    reservationId: reservation._id,
    occurrenceKey: computeSmsSchedule({
      reservation,
      restaurant: rest,
      delayMinutes: 120,
    }).reservationStartsAt.toISOString(),
  };
  await processClaimedJob(reminder, context.deps);
  rest.reservationsSettings.smsReminder.enabled = false;
  rest.reservationsSettings.smsReminder.deliveryMode = "eco";
  const command = processingJob("preparing");
  await processClaimedJob(command, context.deps);
  assert.equal(context.calls.length, 2);
  assert.equal(usage.state.consumedCredits, 101);
  assert.equal(usage.state.includedCreditsConsumed, 100);
  assert.equal(usage.state.overageCredits, 1);
  assert.deepEqual(usage.identities[0], usage.identities[1]);
  assert.deepEqual(
    context.reports.map((entry) => entry.payload.value),
    ["1", "1"],
  );
  assert.equal(command.usagePeriodId, reminder.usagePeriodId);
});

test("restrictions communes : international, Sender, politique et plafond", async () => {
  for (const reason of [
    "international_disabled",
    "sender_not_approved",
    "unsupported_destination",
    "budget_limit",
    "subscription_inactive",
  ]) {
    const rest = restaurant();
    const job = processingJob();
    const usage = usageModel(100);
    const overrides = {};
    if (reason === "international_disabled")
      job.eventSnapshot.customerPhone = "+32470123456";
    if (reason === "sender_not_approved")
      rest.reservationsSettings.smsReminder.sender.status = "pending";
    if (reason === "unsupported_destination")
      overrides.destinationPolicyModel = { findOne: async () => null };
    if (reason === "subscription_inactive")
      overrides.getBillingContext = async () => null;
    if (reason === "budget_limit")
      rest.reservationsSettings.smsReminder.billingPeriodSpendingLimit = 0;
    const context = processDeps(rest, usage, overrides);
    await processClaimedJob(job, context.deps);
    assert.equal(job.skipReason, reason);
    assert.equal(context.calls.length, 0);
    assert.equal(context.reports.length, 0);
  }
});

test("réservation de crédits reprise avant soumission et résultat incertain sans renvoi", async () => {
  const usage = usageModel(0);
  usage.state.reservedCredits = 1;
  const job = processingJob();
  Object.assign(job, {
    usageState: "reserved",
    usagePeriodId: "period-1",
    billingCredits: 1,
    includedCreditsApplied: 1,
    overageCredits: 0,
  });
  const context = processDeps(restaurant(), usage);
  await processClaimedJob(job, context.deps);
  assert.equal(usage.state.reservedCredits, 0);
  assert.equal(usage.state.consumedCredits, 1);
  const uncertain = processingJob();
  const failure = processDeps(restaurant(), usage, {
    provider: {
      send: async () => {
        throw new Error("timeout");
      },
    },
  });
  await processClaimedJob(uncertain, failure.deps);
  assert.equal(uncertain.status, "uncertain");
  const updates = [];
  await recoverExpiredJobs({
    updateMany: async (...args) => updates.push(args),
  });
  assert.equal(updates[1][1].$set.status, "uncertain");
  assert.equal(usage.state.reservedCredits, 1);
});

test("catalogues de variables isolés et dates d’activation contrôlées côté serveur", () => {
  const settings = sanitizeTakeAwaySmsSettings(
    {
      enabled: true,
      enabledAt: new Date(0),
      events: { partial_rejection: { enabled: true } },
    },
    {},
    now,
  );
  assert.equal(settings.enabledAt, now);
  assert.equal(settings.events.partial_rejection.enabledAt, now);
  assert.throws(
    () => validateSmsTemplate("{guests}", takeAwaySmsVariables("confirmed")),
    /non autorisées/,
  );
  assert.throws(
    () =>
      validateSmsTemplate("{refundAmount}", takeAwaySmsVariables("confirmed")),
    /non autorisées/,
  );
  assert.doesNotThrow(() => validateSmsTemplate("{guests}"));
  const merged = service.mergeTakeAwaySettingsInput(
    { smsNotifications: settings, confirmationDeadlineMinutes: 45 },
    { auto_accept: true },
  );
  assert.deepEqual(merged.smsNotifications, settings);
  assert.equal(merged.confirmationDeadlineMinutes, 45);
});

test("index Réservations préservé et jobs sans réservation valides", () => {
  const indexes = SmsJob.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, opts]) =>
        keys.reservationId === 1 &&
        keys.type === 1 &&
        keys.occurrenceKey === 1 &&
        opts.unique,
    ),
  );
  assert.ok(
    indexes.some(
      ([keys, opts]) =>
        keys.takeAwayOrderId === 1 &&
        opts.partialFilterExpression?.takeAwayOrderId?.$type === "objectId",
    ),
  );
  const job = new SmsJob({
    restaurantId: "507f1f77bcf86cd799439011",
    takeAwayOrderId: "507f1f77bcf86cd799439012",
    type: "take_away_partial_rejection",
    eventId: "op1",
    eventSnapshot: partial().snapshot,
    templateSnapshot: TAKE_AWAY_SMS_EVENTS.partial_rejection.template,
    occurrenceKey: "order1:op1",
    providerReference: "mock",
    scheduledAt: now,
  });
  assert.equal(job.validateSync(), undefined);
  assert.ok(
    new SmsJob({ type: "reservation_reminder" }).validateSync().errors
      .reservationId,
  );
  assert.equal(
    serializeAdminSmsJob({
      type: job.type,
      eventSnapshot: { orderNumber: "TA-TEST" },
    }).module,
    "take_away",
  );
});

test("commandes manuelles : création via endpoint, téléphone conditionnel et retry idempotent", async (t) => {
  const rest = restaurant();
  Object.assign(rest.takeAwaySettings, {
    enabled: true,
    pickupEnabled: true,
    slots: Array.from({ length: 7 }, () => ({
      isClosed: false,
      slots: [{ start: "19:00", end: "20:00", intervalMinutes: 60, maxOrders: 10 }],
    })),
  });
  rest.takeAwayCatalog = [{ _id: "catalog-1", name: "Plat", price: 25, active: true }];
  const stored = new Map();
  const locks = require("../models/take-away-slot-lock.model");
  t.mock.method(Restaurant, "findById", () => query(rest));
  t.mock.method(Order, "findOne", async (filter) => stored.get(filter.idempotencyKey) || null);
  t.mock.method(Order, "aggregate", async () => []);
  t.mock.method(Order, "create", async (input) => {
    const value = {
      ...input, _id: `order-${stored.size}`, customer: "customer-1", crmRecordedAt: now,
      $locals: {}, async save() {},
    };
    stored.set(input.idempotencyKey, value);
    return value;
  });
  t.mock.method(locks, "findOneAndUpdate", async (_filter, update) => ({ owner: update.$set.owner }));
  t.mock.method(locks, "deleteOne", async () => ({}));
  const handler = router.stack.find((layer) =>
    layer.route?.path === "/restaurants/:restaurantId/take-away/orders" && layer.route.methods.post,
  ).route.stack.at(-1).handle;
  async function create(phone, key) {
    const res = {
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handler({
      params: { restaurantId: rest._id }, user: { role: "owner", id: rest.owner_id },
      body: {
        customerFirstName: "Ada", customerLastName: "Lovelace", customerPhone: phone,
        slotId: "2099-09-07-19:00", items: [{ catalogItemId: "catalog-1", quantity: 1 }],
        paymentMethod: "on_site", idempotencyKey: key,
        // The client's flag cannot override the stored setting.
        smsNotifications: { enabled: false },
      },
    }, res);
    return res;
  }
  assert.equal((await create("", "manual-missing-phone-1")).code, 400);
  assert.match((await create("invalid", "manual-invalid-phone-1")).body.message, /Téléphone invalide/);
  assert.equal(stored.size, 0);
  assert.equal((await create("1234567890", "manual-invalid-number-1")).code, 400);
  const first = await create("06 12 34 56 78", "manual-valid-phone-1");
  assert.equal(first.code, 201);
  assert.equal(first.body.order.customerPhone, "+33612345678");
  assert.equal(first.body.order.status, "confirmed");
  assert.equal(first.body.order.paymentStatus, "not_required");
  assert.deepEqual(first.body.order.pendingCustomerEmailEvents, []);
  assert.deepEqual(first.body.order.businessEvents.map((event) => event.id), ["status:confirmed"]);
  const initial = outboxFixture(first.body.order.businessEvents);
  initial.value.source = "dashboard";
  initial.rest.takeAwaySettings.smsNotifications.enabledAt = new Date(0);
  initial.rest.takeAwaySettings.smsNotifications.events.confirmed.enabledAt = new Date(0);
  await syncTakeAwaySmsJobs(initial.deps);
  const confirmation = initial.jobs.get("status:confirmed");
  assert.equal(confirmation.status, "scheduled");
  confirmation.save = async () => {};
  const sms = processDeps(initial.rest, usageModel(0));
  await processClaimedJob(confirmation, sms.deps);
  assert.equal(sms.calls.length, 1);
  const replay = await create("06 12 34 56 78", "manual-valid-phone-1");
  assert.equal(replay.body.order._id, first.body.order._id);
  assert.equal(stored.size, 1);
  assert.equal(replay.body.order.businessEvents.length, 1);
  assert.equal((await create("+32 470 12 34 56", "manual-international-1")).body.order.customerPhone, "+32470123456");
  rest.takeAwaySettings.smsNotifications.enabled = false;
  const optional = await create("", "manual-optional-phone-1");
  assert.equal(optional.code, 201);
  assert.equal(optional.body.order.customerPhone, "");
  // A pre-existing command without a phone remains replayable after activation.
  rest.takeAwaySettings.smsNotifications.enabled = true;
  assert.equal((await create("", "manual-optional-phone-1")).code, 201);
  assert.throws(() => service.validateCustomerInput({
    customerFirstName: "Ada", customerLastName: "Lovelace", customerPhone: "",
  }), /Téléphone requis/); // Public validation is unchanged.
});

test("commandes manuelles : confirmation et prête seules, événements désactivés sans envoi", async () => {
  const manual = { ...order(), source: "dashboard", paymentMethod: "on_site", paymentStatus: "not_required" };
  const fixture = outboxFixture(["confirmed", "preparing", "ready"].map((status) =>
    orderStatusSmsEvent(manual, status, now),
  ));
  Object.assign(fixture.value, manual, { status: "ready", businessEvents: fixture.value.businessEvents });
  fixture.rest.takeAwaySettings.smsNotifications.events.preparing.enabled = false;
  await syncTakeAwaySmsJobs(fixture.deps);
  await syncTakeAwaySmsJobs(fixture.deps);
  assert.equal(fixture.jobs.size, 3);
  const context = processDeps(fixture.rest, usageModel(0));
  for (const job of fixture.jobs.values()) {
    if (job.status === "scheduled") {
      job.save = async () => {};
      await processClaimedJob(job, context.deps);
      assert.equal(job.status, "accepted");
    } else {
      assert.equal(job.skipReason, "feature_disabled");
    }
  }
  assert.equal(context.calls.length, 2);
  assert.equal(context.reports.length, 2);
  // Revalidate selection in the worker if settings changed after scheduling.
  const disabled = processingJob("preparing", manual);
  await processClaimedJob(disabled, context.deps);
  assert.equal(disabled.skipReason, "feature_disabled");
  assert.equal(context.calls.length, 2);
});

test("commandes manuelles : refus, annulation et reprise outbox sans doublon", async () => {
  const options = { failAck: true };
  const fixture = outboxFixture([partial(), {
    ...partial("terminal-1"), type: "order_terminated", snapshot: { ...partial().snapshot, targetStatus: "rejected" },
  }, orderStatusSmsEvent({ ...order(), source: "dashboard" }, "canceled", now)], options);
  Object.assign(fixture.value, { source: "dashboard", paymentMethod: "on_site", paymentStatus: "not_required" });
  await assert.rejects(syncTakeAwaySmsJobs(fixture.deps), /crash/);
  options.failAck = false;
  await syncTakeAwaySmsJobs(fixture.deps);
  await syncTakeAwaySmsJobs(fixture.deps);
  assert.equal(fixture.jobs.size, 3);
  assert.deepEqual([...fixture.jobs.values()].map((job) => job.type), [
    "take_away_partial_rejection", "take_away_rejected", "take_away_canceled",
  ]);
  assert.ok([...fixture.jobs.values()].every((job) => job.status === "scheduled"));
});

test("commandes manuelles : quota, crédits et Meter identiques aux commandes publiques", async () => {
  const results = [];
  for (const source of ["public", "dashboard"]) {
    const usage = usageModel(100);
    const context = processDeps(restaurant(), usage);
    const job = processingJob("confirmed", {
      ...order(), source, paymentMethod: "on_site", paymentStatus: "not_required",
    });
    await processClaimedJob(job, context.deps);
    results.push({ status: job.status, credits: job.billingCredits, usage: usage.state, reports: context.reports, payload: context.calls });
  }
  assert.equal(results[0].status, "accepted");
  assert.deepEqual(results[0], results[1]);
});

test("commandes manuelles : protections d’envoi et erreur fournisseur conservées", async () => {
  for (const reason of ["no_phone", "international_disabled", "sender_not_approved", "unsupported_destination", "budget_limit", "subscription_inactive"]) {
    const rest = restaurant();
    const job = processingJob("confirmed", { ...order(), source: "dashboard", paymentMethod: "on_site" });
    const overrides = {};
    if (reason === "no_phone") job.eventSnapshot.customerPhone = "";
    if (reason === "international_disabled") job.eventSnapshot.customerPhone = "+32470123456";
    if (reason === "sender_not_approved") rest.reservationsSettings.smsReminder.sender.status = "pending";
    if (reason === "unsupported_destination") overrides.destinationPolicyModel = { findOne: async () => null };
    if (reason === "budget_limit") rest.reservationsSettings.smsReminder.billingPeriodSpendingLimit = 0;
    if (reason === "subscription_inactive") overrides.getBillingContext = async () => null;
    const context = processDeps(rest, usageModel(100), overrides);
    await processClaimedJob(job, context.deps);
    assert.equal(job.skipReason, reason);
    assert.equal(context.calls.length, 0);
    assert.equal(context.reports.length, 0);
  }
  const manual = { ...order(), source: "dashboard", paymentMethod: "on_site" };
  const job = processingJob("confirmed", manual);
  const context = processDeps(restaurant(), usageModel(0), {
    provider: { send: async () => { throw new Error("timeout"); } },
  });
  await processClaimedJob(job, context.deps);
  assert.equal(job.status, "uncertain");
  assert.equal(manual.status, "confirmed");
  assert.equal(context.reports.length, 0);
});

test("commandes manuelles : transitions persistées jusqu’à prête et ancienne commande sans téléphone", async (t) => {
  const value = {
    ...order(), source: "dashboard", paymentMethod: "on_site", paymentStatus: "not_required",
    financialVersion: 1, financialRevision: 0, customer: null, customerPhone: "",
  };
  const writes = [];
  t.mock.method(Order, "findOne", async () => value);
  t.mock.method(Order, "findOneAndUpdate", async (_filter, update) => {
    writes.push(update);
    Object.assign(value, update.$set);
    if (update.$push?.businessEvents) value.businessEvents.push(update.$push.businessEvents);
    return value;
  });
  for (const status of ["preparing", "ready", "ready"]) {
    await service.updateOrderStatus({ restaurant: restaurant(), orderId: value._id, status });
  }
  assert.equal(value.status, "ready");
  assert.equal(writes.length, 2);
  assert.deepEqual(value.businessEvents.map((event) => event.id), ["status:preparing", "status:ready"]);
  assert.ok(writes.every((update) => !update.$addToSet?.pendingCustomerEmailEvents));
});

test("mutation de statut : événement durable dans la même écriture, répétition sans nouvel événement", async (t) => {
  const value = {
    ...order(),
    financialVersion: 1,
    financialRevision: 0,
    customer: null,
  };
  const writes = [];
  t.mock.method(Order, "findOne", async () => value);
  t.mock.method(Order, "findOneAndUpdate", async (_filter, update) => {
    writes.push(update);
    Object.assign(value, update.$set);
    if (update.$push?.businessEvents)
      value.businessEvents.push(update.$push.businessEvents);
    return value;
  });
  await service.updateOrderStatus({
    restaurant: restaurant(),
    orderId: value._id,
    status: "preparing",
  });
  await service.updateOrderStatus({
    restaurant: restaurant(),
    orderId: value._id,
    status: "preparing",
  });
  assert.equal(writes.length, 1);
  assert.equal(value.businessEvents[0].snapshot.status, "preparing");
});

test("route paramètres : employé take_away accède sans droit Réservations et ne peut modifier le quota", async (t) => {
  const rest = restaurant();
  rest.employees = ["employee-1"];
  const Employee = require("../models/employee.model");
  t.mock.method(Employee, "findById", () => query({ restaurantProfiles: [
    { restaurant: rest._id, options: { take_away: true, reservations: false } },
  ] }));
  t.mock.method(Restaurant, "findById", () => query(rest));
  t.mock.method(Restaurant, "updateOne", async (_, update) => {
    if (update.$set?.takeAwaySettings) rest.takeAwaySettings = update.$set.takeAwaySettings;
    return { matchedCount: 1, modifiedCount: 1 };
  });
  const Period = require("../models/sms-usage-period.model");
  const Policy = require("../models/sms-destination-policy.model");
  t.mock.method(Period, "findOne", () =>
    query({ includedCredits: 100, consumedCredits: 7 }),
  );
  t.mock.method(Policy, "find", () => query([]));
  const handler = router.stack
    .find((layer) => layer.route?.path.endsWith("/sms-notifications"))
    .route.stack.at(-1).handle;
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const user = {
    id: "employee-1",
    role: "employee",
    restaurantId: rest._id,
    options: { take_away: true, reservations: false },
  };
  await handler({ params: { restaurantId: rest._id }, user }, res);
  assert.equal(res.body.usage.consumedCredits, 7);
  assert.equal(res.body.sender.status, "approved");
  const shared = structuredClone(rest.reservationsSettings.smsReminder);
  rest.save = async () => {};
  const saveHandler = router.stack
    .find((layer) => layer.route?.path.endsWith("/take-away/settings"))
    .route.stack.at(-1).handle;
  await saveHandler(
    {
      params: { restaurantId: rest._id },
      user,
      body: {
        settings: {
          smsNotifications: {
            enabled: true,
            sender: { value: "FORGED" },
            billingPeriodSpendingLimit: 999,
            internationalEnabled: true,
          },
        },
      },
    },
    res,
  );
  assert.deepEqual(rest.reservationsSettings.smsReminder, shared);
  assert.equal(rest.takeAwaySettings.smsNotifications.enabled, true);
  await saveHandler(
    {
      params: { restaurantId: rest._id },
      user,
      body: {
        settings: {
          smsNotifications: { enabled: true },
          smsSharedSettings: {
            billingPeriodSpendingLimit: 25,
            internationalEnabled: true,
          },
        },
      },
    },
    res,
  );
  assert.equal(res.code, 403);
  assert.deepEqual(rest.reservationsSettings.smsReminder, shared);
  assert.equal(rest.takeAwaySettings.smsNotifications.enabled, true);
  user.id = "owner-1";
  user.role = "owner";
  await saveHandler(
    {
      params: { restaurantId: rest._id },
      user,
      body: {
        settings: {
          smsNotifications: { enabled: true },
          smsSharedSettings: {
            billingPeriodSpendingLimit: 25,
            internationalEnabled: true,
          },
        },
      },
    },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(
    rest.reservationsSettings.smsReminder.billingPeriodSpendingLimit,
    25,
  );
  assert.equal(rest.reservationsSettings.smsReminder.internationalEnabled, true);
  assert.equal(rest.reservationsSettings.smsReminder.deliveryMode, "eco");
  assert.equal(rest.reservationsSettings.smsReminder.sender.value, "RESTO");
  user.id = "employee-1";
  user.role = "employee";
  user.options.take_away = false;
  rest.employees = [
    {
      _id: user.id,
      restaurantProfiles: [
        { restaurant: rest._id, options: { reservations: true } },
      ],
    },
  ];
  await handler({ params: { restaurantId: rest._id }, user }, res);
  assert.equal(res.code, 403);
});

test("éditeur générique conserve les tokens de commande et ceux de Réservations", async () => {
  const source = readFileSync(
    resolve(
      __dirname,
      "../../client/src/components/dashboard/_shared/reservations/sms-message.utils.js",
    ),
    "utf8",
  );
  const utils = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  const variables = [
    { backend: "{orderNumber}", display: "{Numéro de commande}" },
  ];
  const display = utils.smsTemplateToDisplay(
    "Commande {orderNumber}",
    variables,
  );
  assert.equal(
    utils.smsTemplateToBackend(display, variables),
    "Commande {orderNumber}",
  );
  assert.equal(
    utils.normalizeSmsTemplateToGsm7(display, variables).value,
    display,
  );
  assert.equal(
    utils.splitSmsTemplateTokens(display, variables).at(-1).type,
    "token",
  );
  assert.equal(
    utils.splitSmsTemplateTokens("{firstName}")[0].value,
    "{Prénom}",
  );
});
