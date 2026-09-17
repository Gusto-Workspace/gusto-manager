const test = require("node:test");
const assert = require("node:assert/strict");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_catalog_tests";
process.env.STRIPE_SMS_FIXED_PRICE_ID = "price_sms_fixed";
process.env.STRIPE_SMS_METERED_PRICE_ID = "price_sms_metered";

const {
  buildScheduledRemovalState,
  buildSmsDeactivationPhaseItems,
  buildSubscriptionItemUpdatePayload,
  buildSubscriptionSummaryFromItems,
  catalogCodeAllowsOffered,
  getOrCreateOfferedPrice,
  isRecurringMonthlyPrice,
  isSmsMeteredComponent,
} = require("../services/stripe-subscription-catalog.service");

const plan = {
  subscriptionItemId: "si_plan",
  priceId: "price_plan",
  productName: "Plan",
  kind: "plan",
  code: "base",
  quantity: 1,
  amount: 95,
  totalAmount: 95,
  currency: "EUR",
};
const smsFixed = {
  subscriptionItemId: "si_sms_fixed",
  priceId: "price_sms_fixed",
  productName: "Rappels SMS",
  kind: "addon",
  code: "sms_reminders",
  quantity: 1,
  amount: 9.9,
  totalAmount: 9.9,
  currency: "EUR",
};
const smsMetered = {
  subscriptionItemId: "si_sms_metered",
  priceId: "price_sms_metered",
  productName: "Rappels SMS",
  kind: "addon",
  code: "sms_reminders",
  usageType: "metered",
  technical: true,
  quantity: 1,
  amount: 0,
  totalAmount: 0,
  currency: "EUR",
};
const classicAddon = {
  subscriptionItemId: "si_classic",
  priceId: "price_classic",
  productName: "Module classique",
  kind: "addon",
  code: "classic",
  quantity: 1,
  amount: 12,
  totalAmount: 12,
  currency: "EUR",
};
const offeredAddon = {
  subscriptionItemId: "si_offered",
  priceId: "price_offered",
  productName: "Module offert",
  kind: "addon",
  code: "offered",
  quantity: 1,
  amount: 0,
  totalAmount: 0,
  currency: "EUR",
};

function selection(addons) {
  return { plan: { priceId: plan.priceId }, addons };
}

function smsSelection() {
  return selection([
    { priceId: smsFixed.priceId, code: smsFixed.code, quantity: 1 },
  ]);
}

function smsOperations(operations) {
  return operations.filter(
    (operation) =>
      [smsFixed.priceId, smsMetered.priceId].includes(operation.price) ||
      [smsFixed.subscriptionItemId, smsMetered.subscriptionItemId].includes(
        operation.id,
      ),
  );
}

function scheduleWithFuturePriceIds(priceIds) {
  return {
    status: "active",
    current_phase: { start_date: 1000, end_date: 2000 },
    phases: [
      { start_date: 1000, end_date: 2000, items: [] },
      {
        start_date: 2000,
        end_date: 3000,
        items: priceIds.map((price) => ({ price })),
      },
    ],
  };
}

test("SMS actif et conservé à l'échéance reste sélectionné", () => {
  const summary = buildSubscriptionSummaryFromItems([
    plan,
    smsFixed,
    smsMetered,
  ]);
  const removals = buildScheduledRemovalState({
    schedule: scheduleWithFuturePriceIds([
      plan.priceId,
      smsFixed.priceId,
      smsMetered.priceId,
    ]),
    summary,
  });

  assert.deepEqual(removals, []);
});

test("SMS actif mais absent de la phase future est signalé avec sa date", () => {
  const summary = buildSubscriptionSummaryFromItems([
    plan,
    smsFixed,
    smsMetered,
  ]);
  const removals = buildScheduledRemovalState({
    schedule: scheduleWithFuturePriceIds([plan.priceId]),
    summary,
  });

  assert.equal(removals.length, 1);
  assert.equal(removals[0].code, "sms_reminders");
  assert.equal(removals[0].scheduledForRemoval, true);
  assert.equal(removals[0].scheduledRemovalAt, 2000);
  assert.deepEqual(
    buildScheduledRemovalState({
      schedule: scheduleWithFuturePriceIds([plan.priceId]),
      summary,
    }),
    removals,
  );
});

test("l'annulation du schedule rétablit un état SMS sélectionné", () => {
  const summary = buildSubscriptionSummaryFromItems([
    plan,
    smsFixed,
    smsMetered,
  ]);
  assert.deepEqual(
    buildScheduledRemovalState({ schedule: null, summary }),
    [],
  );
});

test("un autre module conservé dans la phase future reste inchangé", () => {
  const summary = buildSubscriptionSummaryFromItems([
    plan,
    smsFixed,
    smsMetered,
    classicAddon,
  ]);
  const removals = buildScheduledRemovalState({
    schedule: scheduleWithFuturePriceIds([
      plan.priceId,
      classicAddon.priceId,
    ]),
    summary,
  });

  assert.equal(removals.some((item) => item.code === "classic"), false);
});

test("le résumé expose une seule ligne commerciale Rappels SMS à 9,90 €", () => {
  const summary = buildSubscriptionSummaryFromItems([
    plan,
    smsFixed,
    smsMetered,
  ]);

  assert.deepEqual(summary.addons.map((item) => item.priceId), [
    "price_sms_fixed",
  ]);
  assert.equal(summary.addons[0].amount, 9.9);
  assert.deepEqual(summary.technicalItems.map((item) => item.priceId), [
    "price_sms_metered",
  ]);
});

test("le Price metered SMS n'est ni sélectionnable ni réutilisable comme Offert", async () => {
  const price = {
    id: "price_sms_metered",
    active: true,
    type: "recurring",
    product: "prod_sms",
    unit_amount: 0,
    currency: "eur",
    recurring: { interval: "month", interval_count: 1, usage_type: "metered" },
  };
  const addon = {
    code: "sms_reminders",
    offered: true,
    price,
    productId: "prod_sms",
    currency: "EUR",
    interval: "month",
    intervalCount: 1,
  };
  let created = 0;
  const stripeClient = {
    prices: {
      async list() { return { data: [price], has_more: false }; },
      async create() {
        created += 1;
        return { id: "price_sms_offered_created" };
      },
    },
  };

  assert.equal(isSmsMeteredComponent(price, { code: "sms_reminders" }), true);
  assert.equal(isRecurringMonthlyPrice(price), false);
  assert.equal(catalogCodeAllowsOffered("sms_reminders"), false);
  assert.equal(
    await getOrCreateOfferedPrice(addon, stripeClient),
    "price_sms_offered_created",
  );
  assert.equal(created, 1);
});

test("l'activation SMS ajoute exactement le fixe et le metered", () => {
  const currentSummary = buildSubscriptionSummaryFromItems([plan]);
  const operations = smsOperations(
    buildSubscriptionItemUpdatePayload({
      currentSummary,
      selection: smsSelection(),
    }),
  );

  assert.deepEqual(operations, [
    { price: "price_sms_fixed", quantity: 1 },
    { price: "price_sms_metered" },
  ]);
});

test("une nouvelle sauvegarde SMS réutilise les deux Subscription Items", () => {
  const currentSummary = buildSubscriptionSummaryFromItems([
    plan,
    smsFixed,
    smsMetered,
  ]);
  const operations = smsOperations(
    buildSubscriptionItemUpdatePayload({
      currentSummary,
      selection: smsSelection(),
    }),
  );

  assert.equal(operations.length, 2);
  assert.equal(operations.every((operation) => operation.id), true);
  assert.equal(operations.some((operation) => operation.deleted), false);
});

test("la phase de désactivation retire les deux composantes SMS", () => {
  const phaseItems = buildSmsDeactivationPhaseItems({
    items: {
      data: [
        { price: { id: plan.priceId, recurring: { usage_type: "licensed" } }, quantity: 1 },
        { price: { id: smsFixed.priceId, recurring: { usage_type: "licensed" } }, quantity: 1 },
        { price: { id: smsMetered.priceId, recurring: { usage_type: "metered" } } },
      ],
    },
  });

  assert.deepEqual(phaseItems, [{ price: "price_plan", quantity: 1 }]);
});

test("une réactivation conserve un seul fixe et un seul metered", () => {
  const currentSummary = buildSubscriptionSummaryFromItems([
    plan,
    smsFixed,
    smsMetered,
    { ...smsMetered, subscriptionItemId: "si_sms_metered_duplicate" },
  ]);
  const allOperations = buildSubscriptionItemUpdatePayload({
    currentSummary,
    selection: smsSelection(),
  });
  const operations = smsOperations(allOperations);

  assert.equal(operations.filter((operation) => !operation.deleted).length, 2);
  assert.equal(
    allOperations.filter(
      (operation) =>
        operation.id === "si_sms_metered_duplicate" && operation.deleted,
    ).length,
    1,
  );
});

test("un vrai Price gratuit licensed reste reconnu comme Offert", async () => {
  const freePrice = {
    id: "price_offered_reusable",
    active: true,
    type: "recurring",
    product: "prod_classic",
    unit_amount: 0,
    currency: "eur",
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  };
  let created = 0;
  const stripeClient = {
    prices: {
      async list() { return { data: [freePrice], has_more: false }; },
      async create() {
        created += 1;
        return { id: "price_should_not_be_created" };
      },
    },
  };
  assert.equal(
    await getOrCreateOfferedPrice(
      {
        code: "classic",
        offered: true,
        productId: "prod_classic",
        currency: "EUR",
        interval: "month",
        intervalCount: 1,
      },
      stripeClient,
    ),
    "price_offered_reusable",
  );
  assert.equal(created, 0);
  const summary = buildSubscriptionSummaryFromItems([plan, offeredAddon]);
  assert.equal(summary.addons[0].priceId, "price_offered");
  assert.equal(summary.addons[0].amount, 0);
});

test("un module classique conserve son Subscription Item", () => {
  const currentSummary = buildSubscriptionSummaryFromItems([
    plan,
    classicAddon,
  ]);
  const operations = buildSubscriptionItemUpdatePayload({
    currentSummary,
    selection: selection([
      { priceId: classicAddon.priceId, code: classicAddon.code, quantity: 1 },
    ]),
  });
  const classicOperation = operations.find(
    (operation) => operation.id === classicAddon.subscriptionItemId,
  );

  assert.deepEqual(classicOperation, {
    id: "si_classic",
    price: "price_classic",
    quantity: 1,
  });
});
