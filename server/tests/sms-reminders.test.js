const test = require("node:test");
const assert = require("node:assert/strict");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_sms_reminders";

const {
  DEFAULT_SMS_TEMPLATE,
  LEGACY_DEFAULT_SMS_TEMPLATE,
  analyzeSingleSms,
  normalizeDefaultSmsTemplate,
  renderSmsTemplate,
  validateSmsTemplate,
} = require("../services/sms/sms-message.service");
const { computeSmsSchedule } = require("../services/sms/sms-schedule.service");
const {
  buildStripeMeterEventParams,
} = require("../services/sms/sms-meter.service");
const {
  ACCEPTED_RECONCILIATION_WINDOW_MS,
  PROVIDER_RECONCILIATION_INTERVAL_MS,
  reconcileProviderStatuses,
  sendingIsEnabled,
} = require("../services/sms/sms-reminder.service");

test("active l'envoi uniquement avec SMS_SENDING_ENABLED=true", () => {
  const previousSmsSendingEnabled = process.env.SMS_SENDING_ENABLED;
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "development";
    process.env.SMS_SENDING_ENABLED = "true";
    assert.equal(sendingIsEnabled(), true);

    process.env.NODE_ENV = "production";
    process.env.SMS_SENDING_ENABLED = "false";
    assert.equal(sendingIsEnabled(), false);

    delete process.env.SMS_SENDING_ENABLED;
    assert.equal(sendingIsEnabled(), false);
  } finally {
    if (previousSmsSendingEnabled === undefined) {
      delete process.env.SMS_SENDING_ENABLED;
    } else {
      process.env.SMS_SENDING_ENABLED = previousSmsSendingEnabled;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("réconcilie les statuts provider sans renvoi ni double consommation", async () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  const makeJob = ({ id, status, acceptedAt, lastCheckedAt }) => ({
    _id: id,
    status,
    provider: "smsmode",
    providerMessageId: `provider_${id}`,
    providerReference: `reference_${id}`,
    acceptedAt: acceptedAt || null,
    providerStatusLastCheckedAt: lastCheckedAt || null,
    usageState: "consumed",
    stripeUsageState: "reported",
    deliveredAt: null,
    failedAt: null,
    saveCount: 0,
    async save() {
      this.saveCount += 1;
    },
  });
  const recentAcceptedAt = new Date(now.getTime() - 60 * 60 * 1000);
  const uncertain = makeJob({ id: "uncertain", status: "uncertain" });
  const delivered = makeJob({
    id: "delivered",
    status: "accepted",
    acceptedAt: recentAcceptedAt,
  });
  const enroute = makeJob({
    id: "enroute",
    status: "accepted",
    acceptedAt: recentAcceptedAt,
  });
  const undeliverable = makeJob({
    id: "undeliverable",
    status: "accepted",
    acceptedAt: recentAcceptedAt,
  });
  const alreadyDelivered = makeJob({
    id: "already_delivered",
    status: "delivered",
    acceptedAt: recentAcceptedAt,
  });
  const alreadyFailed = makeJob({
    id: "already_failed",
    status: "failed",
    acceptedAt: recentAcceptedAt,
  });
  const tooOld = makeJob({
    id: "too_old",
    status: "accepted",
    acceptedAt: new Date(
      now.getTime() - ACCEPTED_RECONCILIATION_WINDOW_MS - 1,
    ),
  });
  const checkedRecently = makeJob({
    id: "checked_recently",
    status: "accepted",
    acceptedAt: recentAcceptedAt,
    lastCheckedAt: new Date(
      now.getTime() - PROVIDER_RECONCILIATION_INTERVAL_MS + 1,
    ),
  });
  const calls = [];
  const responses = {
    provider_uncertain: { status: "ENROUTE" },
    provider_delivered: {
      status: {
        value: "DELIVERED",
        deliveryDate: "2026-09-17T11:59:00.000Z",
      },
    },
    provider_enroute: { status: "ENROUTE" },
    provider_undeliverable: {
      status: { value: "UNDELIVERABLE", detail: "destination_unreachable" },
    },
  };
  const provider = {
    async reconcile({ providerMessageId }) {
      calls.push(providerMessageId);
      return responses[providerMessageId] || null;
    },
  };

  await reconcileProviderStatuses({
    now,
    provider,
    jobs: [
      uncertain,
      delivered,
      enroute,
      undeliverable,
      alreadyDelivered,
      alreadyFailed,
      tooOld,
      checkedRecently,
    ],
  });

  assert.deepEqual(calls.sort(), [
    "provider_delivered",
    "provider_enroute",
    "provider_uncertain",
    "provider_undeliverable",
  ]);
  assert.equal(uncertain.status, "accepted");
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.deliveredAt.toISOString(), "2026-09-17T11:59:00.000Z");
  assert.equal(enroute.status, "accepted");
  assert.equal(undeliverable.status, "failed");
  assert.equal(alreadyDelivered.saveCount, 0);
  assert.equal(alreadyFailed.saveCount, 0);
  assert.equal(tooOld.saveCount, 0);
  assert.equal(checkedRecently.saveCount, 0);
  assert.equal(delivered.usageState, "consumed");
  assert.equal(delivered.stripeUsageState, "reported");
  assert.equal(undeliverable.usageState, "consumed");
  assert.equal(undeliverable.stripeUsageState, "reported");

  const deliveredAt = delivered.deliveredAt.getTime();
  await reconcileProviderStatuses({ now, provider, jobs: [delivered] });
  assert.equal(calls.length, 4);
  assert.equal(delivered.deliveredAt.getTime(), deliveredAt);
});

test("compte les caractères GSM-7 étendus comme deux septets", () => {
  const result = analyzeSingleSms("{}[]^~|€");
  assert.equal(result.encoding, "gsm7");
  assert.equal(result.units, 16);
  assert.equal(result.valid, true);
});

test("refuse Unicode et emoji en V1", () => {
  assert.equal(analyzeSingleSms("Bonjour 😊").valid, false);
  assert.equal(analyzeSingleSms("Rappel 漢").valid, false);
});

test("refuse un message GSM-7 de plus de 160 septets", () => {
  assert.equal(analyzeSingleSms("a".repeat(160)).valid, true);
  assert.equal(analyzeSingleSms("a".repeat(161)).reason, "message_too_long");
});

test("substitue toutes les variables autorisées", () => {
  assert.equal(
    renderSmsTemplate("{firstName} {date} {time} {guests} {restaurantName}", {
      firstName: "Léa",
      date: "20/09/2026",
      time: "20:00",
      guests: 4,
      restaurantName: "Gusto",
    }),
    "Léa 20/09/2026 20:00 4 Gusto",
  );
});

test("refuse les variables inconnues et les modèles structurellement trop longs", () => {
  assert.throws(() => validateSmsTemplate("Bonjour {unknown}"), /non autorisées/);
  assert.throws(() => validateSmsTemplate("a".repeat(161)), /dépasse un segment/);
});

test("utilise le nouveau template SMS convivial dans un seul segment", () => {
  const message = renderSmsTemplate(DEFAULT_SMS_TEMPLATE, {
    firstName: "Alexandre",
    date: "31/12/2026",
    time: "20:30",
    guests: 12,
    restaurantName: "Le Restaurant",
  });
  const analysis = analyzeSingleSms(message);

  assert.equal(
    DEFAULT_SMS_TEMPLATE,
    "Bonjour {firstName}, pour rappel, votre table chez {restaurantName} est réservée le {date} à {time} pour {guests} pers. A bientot !",
  );
  assert.equal(analysis.encoding, "gsm7");
  assert.equal(analysis.segmentCount, 1);
  assert.equal(analysis.valid, true);
  assert.equal(validateSmsTemplate(DEFAULT_SMS_TEMPLATE), DEFAULT_SMS_TEMPLATE);

  const compactFallback = analyzeSingleSms(
    "Le Restaurant: Rappel reservation le 31/12/2026 a 20:30, 12 pers.",
  );
  assert.equal(compactFallback.segmentCount, 1);
  assert.equal(compactFallback.valid, true);
  assert.ok(compactFallback.units < analysis.units);
});

test("remplace uniquement l'ancien template par défaut", () => {
  const customTemplate =
    "Bonjour {firstName}, votre réservation chez {restaurantName} est confirmée.";

  assert.equal(
    normalizeDefaultSmsTemplate(LEGACY_DEFAULT_SMS_TEMPLATE),
    DEFAULT_SMS_TEMPLATE,
  );
  assert.equal(normalizeDefaultSmsTemplate(customTemplate), customTemplate);
});

test("calcule 1440 minutes réelles à travers le passage heure d'hiver", () => {
  const result = computeSmsSchedule({
    reservation: {
      reservationDate: new Date("2026-10-25T00:00:00.000Z"),
      reservationTime: "20:00",
    },
    restaurant: {},
    delayMinutes: 1440,
    now: new Date("2026-10-20T00:00:00.000Z"),
  });
  assert.equal(result.reservationStartsAt.toISOString(), "2026-10-25T19:00:00.000Z");
  assert.equal(result.scheduledAt.toISOString(), "2026-10-24T19:00:00.000Z");
});

test("envoie immédiatement si le délai théorique est passé dans la fenêtre", () => {
  const now = new Date("2026-09-16T16:00:00.000Z"); // 18:00 Paris
  const result = computeSmsSchedule({
    reservation: { reservationDate: new Date("2026-09-16T00:00:00.000Z"), reservationTime: "20:00" },
    restaurant: {},
    delayMinutes: 1440,
    now,
  });
  assert.equal(result.scheduledAt.toISOString(), now.toISOString());
});

test("transmet au Meter Stripe tous les crédits du SMS sans déduire l'inclus", () => {
  const params = buildStripeMeterEventParams(
    {
      _id: "job-101",
      billingCredits: 3,
      includedCreditsApplied: 2,
      overageCredits: 1,
      acceptedAt: new Date("2026-09-16T18:00:00.000Z"),
    },
    { stripeCustomerId: "cus_test" },
  );

  assert.equal(params.identifier, "gusto_sms_job-101");
  assert.equal(params.payload.value, "3");
  assert.equal(params.payload.stripe_customer_id, "cus_test");
});
