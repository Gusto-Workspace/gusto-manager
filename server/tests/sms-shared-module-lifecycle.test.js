const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");

process.env.STRIPE_API_SECRET_KEY = "sk_test_mock_sms_modules";
process.env.STRIPE_SMS_FIXED_PRICE_ID = "price_sms_fixed_mock";
process.env.STRIPE_SMS_METERED_PRICE_ID = "price_sms_meter_mock";
const SmsJob = require("../models/sms-job.model");
const {
  smsModuleStates, assertSmsActivationUnchanged, smsSettingsWriteFilter,
} = require("../services/sms/sms-module-state.service");
const {
  finalizeDueSmsDeactivations, syncReservationSmsJob, reserveUsage, processClaimedJob,
} = require("../services/sms/sms-reminder.service");
const { syncTakeAwaySmsJobs } = require("../services/sms/take-away-sms.service");

function get(object, path) { return path.split(".").reduce((o, key) => o?.[key], object); }
function set(object, path, value) {
  const keys = path.split(".");
  const parent = keys.slice(0, -1).reduce((o, key) => o[key] ||= {}, object);
  parent[keys.at(-1)] = structuredClone(value);
}
function matches(object, filter) {
  return Object.entries(filter).every(([path, value]) => {
    if (path === "$or") return value.some((branch) => matches(object, branch));
    const actual = get(object, path);
    if (value instanceof RegExp) return value.test(actual);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("$ne" in value) return actual !== value.$ne;
      if ("$nin" in value) return !value.$nin.includes(actual);
      if ("$in" in value) return value.$in.includes(actual);
      if ("$lt" in value) return new Date(actual) < value.$lt;
    }
    return value === null ? actual == null : actual === value;
  });
}

function fixture(t, reservations, takeAway) {
  let restaurant = {
    _id: "507f1f77bcf86cd799439011", owner_id: "owner", employees: [], name: "Restaurant",
    options: { sms_reminders: true, take_away: true, reservations: true },
    reservationsSettings: { smsReminder: {
      enabled: reservations, enabledAt: null, selfServiceEligible: true,
      delayMinutes: 1440, deliveryMode: "sms_always", billingPeriodSpendingLimit: 12,
      sender: { value: "RESTO", status: "approved" }, internationalEnabled: false,
      commercialDeactivation: { status: "none", stripeScheduleId: "", effectiveAt: null },
      selfServiceOperation: { status: "", action: "", idempotencyKey: "" },
    } },
    takeAwaySettings: { smsNotifications: { enabled: takeAway, enabledAt: null, events: {
      confirmed: { enabled: true, enabledAt: null, template: "Commande confirmee" },
    } } },
  };
  const period = {
    _id: "period_existing", stripeSubscriptionId: "sub_existing",
    periodStart: new Date("2026-10-01"), periodEnd: new Date("2099-11-01"),
    includedCredits: 100, consumedCredits: 35, includedCreditsConsumed: 35,
    reservedCredits: 7, overageCredits: 2, overageAmount: 0.2,
  };
  const subscription = {
    id: "sub_existing", status: "active", schedule: null,
    current_period_start: period.periodStart.getTime() / 1000,
    current_period_end: period.periodEnd.getTime() / 1000,
    items: { data: ["base", process.env.STRIPE_SMS_FIXED_PRICE_ID,
      process.env.STRIPE_SMS_METERED_PRICE_ID].map((id) => ({ id: `item_${id}`, price: { id } })) },
  };
  const jobs = [
    { type: "reservation_reminder", status: "scheduled", providerSubmissionStartedAt: null, restaurantId: restaurant._id },
    { type: "take_away_confirmed", status: "processing", providerSubmissionStartedAt: null, restaurantId: restaurant._id },
    { type: "take_away_ready", status: "accepted", providerSubmissionStartedAt: new Date(), restaurantId: restaurant._id },
  ];
  const calls = { schedule: 0, release: 0, update: 0, amendments: [], sender: 0, writes: 0 };
  let beforeLock = null;
  let failDocument = false;
  function document() {
    const copy = structuredClone(restaurant);
    copy.save = async () => {
      const { save, ...data } = copy;
      restaurant = structuredClone(data);
      calls.writes++;
    };
    return copy;
  }
  const model = {
    findById: async () => document(),
    findOneAndUpdate: async (filter, update) => {
      if (beforeLock) { beforeLock(restaurant); beforeLock = null; }
      if (!matches(restaurant, filter)) return null;
      for (const [key, value] of Object.entries(update.$set)) set(restaurant, key, value);
      return document();
    },
    updateOne: async (filter, update) => {
      if (!matches(restaurant, filter)) return { matchedCount: 0, modifiedCount: 0 };
      for (const [key, value] of Object.entries(update.$set)) set(restaurant, key, value);
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  const cancelJobs = async (filter, update) => {
    for (const job of jobs) if (matches(job, filter)) Object.assign(job, update.$set);
    return { modifiedCount: 1 };
  };
  t.mock.method(SmsJob, "updateMany", cancelJobs);
  const summary = () => ({
    plan: { priceId: "base" },
    addons: subscription.items.data.some((item) => item.price.id === process.env.STRIPE_SMS_FIXED_PRICE_ID)
      ? [{ code: "sms_reminders", priceId: process.env.STRIPE_SMS_FIXED_PRICE_ID, amount: 9.9 }] : [],
    subscription: { current_period_end: subscription.current_period_end },
  });
  const stripe = {
    subscriptions: {
      retrieve: async (id) => { assert.equal(id, "sub_existing"); return subscription; },
      update: async (id) => {
        assert.equal(id, "sub_existing"); calls.update++;
        subscription.items.data = ["base", process.env.STRIPE_SMS_FIXED_PRICE_ID,
          process.env.STRIPE_SMS_METERED_PRICE_ID].map((priceId) => ({ price: { id: priceId } }));
        return subscription;
      },
      create: async () => assert.fail("Aucun deuxième abonnement Stripe"),
    },
    prices: { retrieve: async () => ({ unit_amount: 990 }) },
  };
  const modules = {
    "../models/restaurant.model": model,
    "../models/document.model": { findOne: async () => null },
    "../models/employee.model": {},
    "../models/sms-usage-period.model": { updateOne: async () => assert.fail("Aucun reset du quota"), findOne: () => assert.fail("Les toggles ne remplacent pas la période") },
    "../models/sms-destination-policy.model": { find: () => ({ lean: async () => [{ country: "FR", enabled: true }] }) },
    "../services/sms/sms-reminder.service": {
      revalidateSmsSenderForReactivation: async () => { calls.sender++; return {}; },
      smsDestinationPolicyIsUsable: () => true, syncAllFutureSmsJobs: async () => {},
    },
    "../services/stripe-billing.service": { findRestaurantSubscription: async () => ({ subscription }) },
    "../services/stripe-subscription-catalog.service": {
      SMS_ADDON_CODE: "sms_reminders", buildSubscriptionSummary: async () => summary(),
      buildCatalogSelectionMetadata: () => ({}), buildSubscriptionItemUpdatePayload: () => [],
    },
    "../services/contract-commercial.service": { buildStripeCommercialSnapshot: (s) => ({ items: s.addons }) },
    "../services/contract-self-service.service": { finalizeSelfServiceAmendment: async ({ acceptance }) => {
      if (failDocument) throw new Error("mock document unavailable");
      if (!calls.amendments.some((item) => item.idempotencyKey === acceptance.idempotencyKey)) calls.amendments.push(acceptance);
      return { _id: "document_mock" };
    } },
    "./admin/subscriptions.routes": {
      scheduleSmsDeactivation: async ({ subscription: value }) => {
        assert.equal(value.id, "sub_existing"); calls.schedule++; subscription.schedule = "schedule_mock";
        return { scheduleId: "schedule_mock", effectiveAt: value.current_period_end };
      },
      releaseGustoSmsDeactivationSchedule: async ({ subscription: value }) => {
        assert.equal(value.id, "sub_existing"); calls.release++; subscription.schedule = null;
      },
    },
    stripe: () => stripe,
  };
  const path = require.resolve("../routes/sms-reminders.routes");
  const requireActual = createRequire(path);
  const exported = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) {${fs.readFileSync(path, "utf8")}\n})`)(
    (name) => modules[name] || requireActual(name), exported, exported.exports,
  );
  const handler = exported.exports.stack.find((layer) => layer.route?.path.endsWith("/sms-subscription/actions")).route.stack.at(-1).handle;
  let sequence = 0;
  async function change(module, enabled, extra = {}) {
    const body = { action: "set_module", module, enabled, idempotencyKey: `request-module-${++sequence}`, ...extra };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await handler({ body, params: { id: restaurant._id }, user: { id: "owner", role: "owner" }, get: (key) => key === "Idempotency-Key" ? body.idempotencyKey : "mock", ip: "mock" }, res);
    return res;
  }
  return { change, calls, jobs, period, subscription, model, cancelJobs,
    restaurant: () => restaurant,
    beforeLock: (fn) => { beforeLock = fn; }, failDocument: (value) => { failDocument = value; } };
}

for (const reservations of [false, true]) for (const takeaway of [false, true]) {
  for (const module of ["reservations", "take_away"]) {
    test(`toggles ${Number(reservations)}/${Number(takeaway)} : désactivation ${module}`, async (t) => {
      const f = fixture(t, reservations, takeaway);
      const quota = structuredClone(f.period);
      const before = smsModuleStates(f.restaurant());
      const other = module === "reservations" ? "take_away" : "reservations";
      const result = await f.change(module, false);
      if (before[module] && !before[other]) {
        assert.equal(result.body.confirmationRequired, "schedule_deactivation");
        assert.deepEqual(smsModuleStates(f.restaurant()), before); // Annuler conserve l’état.
        assert.equal(f.calls.writes, 0);
        await f.change(module, false, { confirm: true, confirmedAction: "schedule_deactivation" });
        assert.equal(f.calls.schedule, 1);
        assert.equal(f.calls.amendments[0].actionType, "SMS_DEACTIVATION_SCHEDULED");
      } else {
        assert.equal(result.body.confirmationRequired, undefined);
        assert.equal(f.calls.schedule, 0);
        assert.equal(f.calls.amendments.length, 0);
      }
      assert.deepEqual(smsModuleStates(f.restaurant()), { ...before, [module]: false });
      assert.equal(f.restaurant().options.sms_reminders, true);
      assert.equal(f.jobs[0].status, module === "reservations" ? "cancelled" : "scheduled");
      assert.equal(f.jobs[1].status, module === "take_away" ? "cancelled" : "processing");
      assert.equal(f.jobs[2].status, "accepted");
      assert.deepEqual(f.period, quota);
      assert.equal(f.calls.update, 0);
    });
    test(`toggles ${Number(reservations)}/${Number(takeaway)} : activation ${module}, abonnement actif`, async (t) => {
      const f = fixture(t, reservations, takeaway);
      const before = smsModuleStates(f.restaurant());
      const quota = structuredClone(f.period);
      const result = await f.change(module, true);
      assert.equal(result.code, 200);
      assert.equal(result.body.confirmationRequired, undefined);
      assert.deepEqual(smsModuleStates(f.restaurant()), { ...before, [module]: true });
      assert.equal(f.calls.schedule + f.calls.release + f.calls.update, 0);
      assert.equal(f.calls.amendments.length, 0);
      assert.deepEqual(f.period, quota);
    });
  }
}

for (const module of ["reservations", "take_away"]) {
  test(`résiliation puis réactivation ${module} : même période, quota exact et même abonnement`, async (t) => {
    const f = fixture(t, module === "reservations", module === "take_away");
    const quota = structuredClone(f.period);
    const before = structuredClone(f.subscription);
    await f.change(module, false, { confirm: true, confirmedAction: "schedule_deactivation" });
    const preview = await f.change(module, true);
    assert.equal(preview.body.confirmationRequired, "cancel_deactivation");
    assert.equal(smsModuleStates(f.restaurant())[module], false);
    const result = await f.change(module, true, { confirm: true, confirmedAction: "cancel_deactivation", idempotencyKey: "reactivation-idempotente" });
    assert.equal(result.code, 200);
    await f.change(module, true, { confirm: true, confirmedAction: "cancel_deactivation", idempotencyKey: "reactivation-idempotente" });
    assert.deepEqual(smsModuleStates(f.restaurant()), { reservations: module === "reservations", take_away: module === "take_away" });
    assert.equal(f.calls.release, 1);
    assert.equal(f.calls.update, 0);
    assert.equal(f.calls.amendments.length, 2); // Résiliation + son annulation uniquement.
    assert.equal(f.calls.amendments[1].actionType, "SMS_DEACTIVATION_CANCELLED");
    assert.deepEqual(f.subscription, before);
    assert.deepEqual(f.period, quota);
    assert.equal(100 - f.period.includedCreditsConsumed, 65);
    assert.equal(f.jobs[module === "reservations" ? 0 : 1].status, "cancelled");
    assert.equal(f.restaurant().reservationsSettings.smsReminder.billingPeriodSpendingLimit, 12);
  });
}

test("le backend recontrôle l’autre module après ouverture de la modale", async (t) => {
  const f = fixture(t, true, false);
  assert.equal((await f.change("reservations", false)).body.confirmationRequired, "schedule_deactivation");
  f.beforeLock((r) => { r.takeAwaySettings.smsNotifications.enabled = true; });
  const result = await f.change("reservations", false, { confirm: true, confirmedAction: "schedule_deactivation" });
  assert.deepEqual(result.body.modules, { reservations: false, take_away: true });
  assert.equal(f.calls.schedule, 0);
});

test("l’échéance attend Stripe et protège une réactivation concurrente", async (t) => {
  const f = fixture(t, true, false);
  await f.change("reservations", false, { confirm: true, confirmedAction: "schedule_deactivation" });
  const model = { find: () => ({ select: async () => [structuredClone(f.restaurant())] }), updateOne: f.model.updateOne };
  const deps = { restaurantModel: model, smsJobModel: { updateMany: f.cancelJobs }, findSubscription: async () => ({ subscription: f.subscription }) };
  const due = new Date("2099-11-02");
  await finalizeDueSmsDeactivations(due, deps);
  assert.equal(f.restaurant().options.sms_reminders, true); // Stripe n’a pas encore retiré les prix.
  f.subscription.items.data = [{ price: { id: "base" } }];
  await finalizeDueSmsDeactivations(due, { ...deps, findSubscription: async () => {
    f.restaurant().takeAwaySettings.smsNotifications.enabled = true;
    return { subscription: f.subscription };
  } });
  assert.equal(f.restaurant().options.sms_reminders, true); // Garde atomique après la lecture.
  f.restaurant().takeAwaySettings.smsNotifications.enabled = false;
  await finalizeDueSmsDeactivations(due, deps);
  assert.equal(f.restaurant().options.sms_reminders, false);
  assert.equal(f.restaurant().reservationsSettings.smsReminder.commercialDeactivation.status, "effective");
});

test("abonnement SMS terminé : confirmation commerciale et ajout sur la souscription existante", async (t) => {
  const f = fixture(t, false, false);
  f.restaurant().options.sms_reminders = false;
  f.restaurant().reservationsSettings.smsReminder.commercialDeactivation.status = "effective";
  f.subscription.items.data = [{ price: { id: "base" } }];
  const preview = await f.change("take_away", true);
  assert.equal(preview.body.confirmationRequired, "reactivate");
  assert.equal(f.calls.update, 0);
  const result = await f.change("take_away", true, { confirm: true, confirmedAction: "reactivate" });
  assert.equal(result.code, 200);
  assert.equal(f.calls.sender, 1);
  assert.equal(f.calls.update, 1);
  assert.equal(f.calls.amendments[0].actionType, "SMS_REACTIVATED");
  assert.deepEqual(result.body.modules, { reservations: false, take_away: true });
});

test("une souscription Stripe entièrement terminée ne peut être relancée par un toggle", async (t) => {
  const f = fixture(t, false, false);
  f.restaurant().options.sms_reminders = false;
  f.subscription.status = "canceled";
  const result = await f.change("reservations", true, { confirm: true, confirmedAction: "reactivate" });
  assert.equal(result.code, 409);
  assert.equal(f.calls.update, 0);
  assert.equal(f.calls.amendments.length, 0);
  assert.equal(f.restaurant().reservationsSettings.smsReminder.enabled, false);
});

test("l’ancienne action de résiliation vérifie également la vente à emporter", async (t) => {
  const f = fixture(t, true, true);
  const result = await f.change("reservations", false, { action: "schedule_deactivation" });
  assert.deepEqual(result.body.modules, { reservations: false, take_away: true });
  assert.equal(f.calls.schedule, 0);
});

test("un avenant en échec est repris sans deuxième mutation Stripe", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = fixture(t, true, false);
  f.failDocument(true);
  const request = { confirm: true, confirmedAction: "schedule_deactivation", idempotencyKey: "retry-document-identique" };
  const result = await f.change("reservations", false, request);
  assert.equal(result.code, 202);
  f.failDocument(false);
  const retried = await f.change("reservations", false, request);
  assert.equal(retried.code, 200);
  assert.equal(f.calls.schedule, 1);
  assert.equal(f.calls.amendments.length, 1);
});

test("les routes de paramètres ne peuvent contourner les activations coordonnées", () => {
  const r = { _id: "r", reservationsSettings: { smsReminder: { enabled: true } }, takeAwaySettings: { smsNotifications: { enabled: false } } };
  assert.throws(() => assertSmsActivationUnchanged(r, "reservations", { enabled: false }), { statusCode: 409 });
  assert.throws(() => assertSmsActivationUnchanged(r, "take_away", { enabled: "false" }), { statusCode: 409 });
  assert.equal(matches(r, smsSettingsWriteFilter(r)), true);
  r.takeAwaySettings.smsNotifications.enabled = true;
  assert.equal(matches(r, { ...smsSettingsWriteFilter(r), "takeAwaySettings.smsNotifications.enabled": { $ne: true } }), false);
});

test("un job de réservation annulé par le toggle n’est jamais réarmé, même avec force", async () => {
  const job = { status: "cancelled", skipReason: "module_disabled" };
  let rearmed = false;
  const result = await syncReservationSmsJob({ _id: "reservation", status: "Confirmed", reservationDate: new Date("2099-11-10"), reservationTime: "20:00" },
    { options: { sms_reminders: true }, timezone: "Europe/Paris", reservationsSettings: { smsReminder: { enabled: true, delayMinutes: 1440 } } },
    new Date("2099-11-01"), { force: true, smsJobModel: { updateMany: async () => {}, findOne: async () => job, findOneAndUpdate: async () => { rearmed = true; } } });
  assert.equal(result, job);
  assert.equal(rearmed, false);
});

test("les anciens événements de vente à emporter restent obsolètes après réactivation", async () => {
  const inserts = [];
  const restaurant = { options: { sms_reminders: true, take_away: true }, takeAwaySettings: { smsNotifications: {
    enabled: true, enabledAt: new Date("2099-01-02"), events: { confirmed: { enabled: true } },
  } } };
  await syncTakeAwaySmsJobs({
    orderModel: { find: () => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => [{ _id: "o", restaurant_id: "r", source: "public", status: "confirmed", businessEvents: [
      { id: "old", type: "order_status", createdAt: new Date("2099-01-01"), snapshot: { status: "confirmed" } },
      { id: "new", type: "order_status", createdAt: new Date("2099-01-03"), snapshot: { status: "confirmed" } },
    ] }] }), updateOne: async () => {} },
    restaurantModel: { findById: async () => restaurant },
    smsJobModel: { updateOne: async (_, update) => inserts.push(update.$setOnInsert) },
  });
  assert.equal(inserts[0].skipReason, "event_before_activation");
  assert.equal(inserts[1].status, "scheduled");
});

test("un worker en cours relit le toggle avant tout envoi et préserve les autres crédits réservés", async () => {
  let reads = 0; let sent = 0;
  const rest = {
    _id: "r", name: "Restaurant", options: { sms_reminders: true, take_away: true },
    reservationsSettings: { smsReminder: { enabled: true, sender: { status: "approved", value: "RESTO" } } },
    takeAwaySettings: { smsNotifications: { enabled: true, events: { confirmed: { enabled: true } } } },
  };
  const job = {
    type: "take_away_confirmed", restaurantId: "r", status: "processing", createdAt: new Date(),
    eventSnapshot: { customerPhone: "0612345678", scheduledFor: new Date("2099-01-01"), fulfillmentMode: "pickup" },
    templateSnapshot: "Commande confirmee", usageState: "reserved", billingCredits: 1,
    usagePeriodId: "period", includedCreditsApplied: 1, overageCredits: 0,
    save: async () => {},
  };
  let reservedCredits = 8; // 1 pour ce job, 7 pour les autres jobs.
  const deps = {
    restaurantModel: { findById: async () => {
      const copy = structuredClone(rest);
      if (++reads > 1) copy.takeAwaySettings.smsNotifications.enabled = false;
      return copy;
    } },
    usagePeriodModel: { updateOne: async (_, update) => { reservedCredits += update.$inc.reservedCredits; } },
    destinationPolicyModel: { findOne: async () => ({
      country: "FR", enabled: true, provider: "smsmode", billingCredits: 1,
      senderMode: "registered_alpha", senderRegistrationRequired: true,
      supportsDlr: true, providerRateHt: 0.05, lastReviewedAt: new Date(),
    }) },
    getBillingContext: async () => ({ subscriptionId: "sub_existing" }),
    sendingEnabled: () => true,
    provider: { send: async () => { sent++; } },
  };
  await processClaimedJob(job, deps);
  assert.equal(sent, 0);
  assert.equal(job.skipReason, "module_disabled");
  assert.equal(reservedCredits, 7); // Seule la réservation devenue inutile est libérée.
  const cancelledDuringSave = { ...job, status: "processing", usageState: "reserved",
    providerSubmissionStartedAt: null, skipReason: "", save: async function() {
      if (this.$where) {
        assert.deepEqual(this.$where, { status: "processing", providerSubmissionStartedAt: null });
        const error = new Error("Job annulé entre la lecture et la soumission");
        error.name = "DocumentNotFoundError";
        throw error;
      }
    } };
  await processClaimedJob(cancelledDuringSave, {
    ...deps, restaurantModel: { findById: async () => rest },
  });
  assert.equal(sent, 0);
});

test("la réservation de crédits réutilise la période existante et ne restaure pas ses compteurs", async () => {
  const existing = { _id: "existing", includedCredits: 100, consumedCredits: 35, reservedCredits: 7 };
  const updates = [];
  const billing = { subscriptionId: "sub_existing", periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-11-01") };
  const periods = new Map([[billing.periodStart.toISOString(), existing]]);
  const model = {
    updateOne: async (filter, update) => {
      updates.push({ filter, update });
      const key = filter.periodStart.toISOString();
      if (!periods.has(key)) periods.set(key, { _id: "new_period", includedCredits: 100, consumedCredits: 0, reservedCredits: 0 });
    },
    findOneAndUpdate: async (filter, update) => {
      const period = periods.get(filter.periodStart.toISOString());
      const before = structuredClone(period);
      period.reservedCredits += update.$inc.reservedCredits;
      return before;
    },
  };
  const result = await reserveUsage({ restaurant: { _id: "r" }, billingContext: billing, credits: 1, usagePeriodModel: model });
  assert.equal(result.period._id, "existing");
  assert.deepEqual(existing, { _id: "existing", includedCredits: 100, consumedCredits: 35, reservedCredits: 8 });
  assert.deepEqual(Object.keys(updates[0].update), ["$setOnInsert"]);
  const next = await reserveUsage({ restaurant: { _id: "r" }, billingContext: { ...billing, periodStart: new Date("2026-11-01"), periodEnd: new Date("2026-12-01") }, credits: 1, usagePeriodModel: model });
  assert.equal(next.period._id, "new_period");
  assert.equal(next.period.consumedCredits, 0);
  assert.equal(existing.consumedCredits, 35);
  assert.equal(existing.reservedCredits, 8);
  assert.notDeepEqual(updates[0].filter, updates[1].filter);
});

test("annuler la modale depuis chaque module n’envoie aucune confirmation", async () => {
  const path = require.resolve("../../client/src/components/dashboard/_shared/use-sms-module-toggle.js");
  const source = fs.readFileSync(path, "utf8").replace(/^import.*;\n/gm, "").replace("export default function", "function");
  for (const module of ["reservations", "take_away"]) {
    const states = []; let index = 0; let requests = 0;
    const context = { process: { env: { NEXT_PUBLIC_API_URL: "mock://api" } }, useState: (initial) => {
      const slot = index++; if (!(slot in states)) states[slot] = initial;
      return [states[slot], (value) => { states[slot] = value; }];
    }, useRef: (initial) => { const slot = index++; return states[slot] ||= { current: initial }; }, useEffect: () => {},
    axios: { post: async () => { requests++; return { data: { confirmationRequired: "schedule_deactivation", commercial: {}, modules: { reservations: true, take_away: true } } }; } },
    globalThis: { crypto: { randomUUID: () => "modal-request-mock" } } };
    vm.runInNewContext(source + "\nthis.hook = useSmsModuleToggle;", context);
    const render = () => { index = 0; return context.hook({ restaurantId: "r", module, onUpdated: (data) => assert.equal(data.modules[module], true) }); };
    await render().changeModule(false);
    assert.equal(render().pending.action, "schedule_deactivation");
    render().close();
    assert.equal(render().pending, null);
    assert.equal(requests, 1);
  }
});

test("les deux interfaces confirment avec la même clé et le même choix commercial", async () => {
  const path = require.resolve("../../client/src/components/dashboard/_shared/use-sms-module-toggle.js");
  const source = fs.readFileSync(path, "utf8").replace(/^import.*;\n/gm, "").replace("export default function", "function");
  for (const module of ["reservations", "take_away"]) {
    const states = []; let index = 0; const requests = []; let updated = 0;
    const context = { process: { env: { NEXT_PUBLIC_API_URL: "mock://api" } },
      useState: (initial) => { const slot = index++; if (!(slot in states)) states[slot] = initial;
        return [states[slot], (value) => { states[slot] = value; }]; },
      useRef: (initial) => { const slot = index++; return states[slot] ||= { current: initial }; }, useEffect: () => {},
      axios: { post: async (_, body) => { requests.push(body); return { data: body.confirm
        ? { modules: { reservations: false, take_away: false }, commercial: { active: true } }
        : { confirmationRequired: "schedule_deactivation", commercial: {}, modules: { reservations: true, take_away: true } } }; } },
      globalThis: { crypto: { randomUUID: () => "same-confirmation-key" } },
    };
    vm.runInNewContext(source + "\nthis.hook = useSmsModuleToggle;", context);
    const render = () => { index = 0; return context.hook({ restaurantId: "r", module, onUpdated: () => updated++ }); };
    await render().changeModule(false);
    await render().confirm();
    assert.equal(requests[1].confirm, true);
    assert.equal(requests[1].module, module);
    assert.equal(requests[1].confirmedAction, "schedule_deactivation");
    assert.equal(requests[1].idempotencyKey, requests[0].idempotencyKey);
    assert.equal(updated, 2);
    assert.equal(render().pending, null);
  }
});
