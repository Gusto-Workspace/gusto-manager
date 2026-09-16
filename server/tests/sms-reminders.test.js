const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeSingleSms, renderSmsTemplate, validateSmsTemplate } = require("../services/sms/sms-message.service");
const { computeSmsSchedule } = require("../services/sms/sms-schedule.service");
const {
  buildStripeMeterEventParams,
} = require("../services/sms/sms-meter.service");

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
