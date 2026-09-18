const test = require("node:test");
const assert = require("node:assert/strict");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_sms_critical";
process.env.STRIPE_SMS_FIXED_PRICE_ID ||= "price_sms_fixed";
process.env.STRIPE_SMS_METERED_PRICE_ID ||= "price_sms_metered";

const {
  DEFAULT_SMS_TEMPLATE,
  analyzeSingleSms,
  normalizeToGsm7,
} = require("../services/sms/sms-message.service");
const { computeSmsSchedule } = require("../services/sms/sms-schedule.service");
const {
  applyProviderStatus,
  buildFinalMessage,
  finalizeDueSmsDeactivations,
  processClaimedJob,
  recoverExpiredJobs,
  reportStripeUsage,
  reserveUsage,
  syncReservationSmsJob,
} = require("../services/sms/sms-reminder.service");

const FUTURE_DATE = new Date("2027-02-10T00:00:00.000Z");
const BILLING = {
  subscriptionId: "sub_sms",
  stripeCustomerId: "cus_sms",
  periodStart: new Date("2027-02-01T00:00:00.000Z"),
  periodEnd: new Date("2027-03-01T00:00:00.000Z"),
};

function reservation(overrides = {}) {
  return {
    _id: "reservation-1",
    restaurant_id: "restaurant-1",
    customerFirstName: "Alex",
    customerEmail: "",
    customerPhone: "06 12 34 56 78",
    numberOfGuests: 2,
    reservationDate: FUTURE_DATE,
    reservationTime: "20:00",
    status: "Confirmed",
    ...overrides,
  };
}

function restaurant(overrides = {}) {
  const smsReminder = {
    enabled: true,
    delayMinutes: 120,
    deliveryMode: "sms",
    internationalEnabled: false,
    template: DEFAULT_SMS_TEMPLATE,
    billingPeriodSpendingLimit: null,
    sender: { value: "SAVEURS", status: "approved" },
    ...(overrides.smsReminder || {}),
  };
  return {
    _id: "restaurant-1",
    name: "L'Atelier des saveurs",
    timezone: "Europe/Paris",
    options: { sms_reminders: true, ...(overrides.options || {}) },
    reservationsSettings: { smsReminder },
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => !["smsReminder", "options"].includes(key),
      ),
    ),
  };
}

function occurrenceKey(reservationValue, restaurantValue) {
  return computeSmsSchedule({
    reservation: reservationValue,
    restaurant: restaurantValue,
    delayMinutes:
      restaurantValue.reservationsSettings.smsReminder.delayMinutes,
    now: new Date("2027-02-01T00:00:00.000Z"),
  }).reservationStartsAt.toISOString();
}

function jobFor(reservationValue, restaurantValue) {
  return {
    _id: "job-1",
    reservationId: reservationValue._id,
    restaurantId: restaurantValue._id,
    occurrenceKey: occurrenceKey(reservationValue, restaurantValue),
    providerReference: "gusto-test-reference",
    status: "processing",
    usageState: "none",
    stripeUsageState: "not_required",
    lockedAt: new Date(),
    lockExpiresAt: new Date(),
    saveCount: 0,
    async save() {
      this.saveCount += 1;
    },
  };
}

function usageModel({ consumedCredits = 0, reservedCredits = 0 } = {}) {
  const state = {
    _id: "usage-period-1",
    consumedCredits,
    reservedCredits,
    includedCreditsConsumed: Math.min(100, consumedCredits),
    overageCredits: Math.max(0, consumedCredits - 100),
    overageAmount: Math.max(0, consumedCredits - 100) * 0.1,
  };
  return {
    state,
    async updateOne(query, update) {
      if (update.$inc) {
        for (const [key, value] of Object.entries(update.$inc)) {
          state[key] = (state[key] || 0) + value;
        }
      }
      return { modifiedCount: 1 };
    },
    async findOneAndUpdate(query, update) {
      const credits = Number(query.$expr.$lte[0].$add.at(-1));
      const maximum = Number(query.$expr.$lte[1]);
      if (state.reservedCredits + state.consumedCredits + credits > maximum) {
        return null;
      }
      const before = { ...state };
      state.reservedCredits += update.$inc.reservedCredits;
      return before;
    },
  };
}

function processDependencies({
  reservationValue,
  restaurantValue,
  policy,
  usage,
  provider,
  reportUsage,
} = {}) {
  return {
    reservationModel: { async findById() { return reservationValue; } },
    restaurantModel: { async findById() { return restaurantValue; } },
    destinationPolicyModel: { async findOne() { return policy; } },
    usagePeriodModel: usage,
    async getBillingContext() { return BILLING; },
    provider,
    sendingEnabled: () => true,
    reportUsage,
  };
}

function frenchPolicy(overrides = {}) {
  return {
    country: "FR",
    enabled: true,
    provider: "smsmode",
    senderMode: "registered_alpha",
    senderRegistrationRequired: true,
    supportsDlr: true,
    providerRateHt: 0.05,
    billingCredits: 1,
    fallbackSender: "GUSTO",
    lastReviewedAt: new Date(),
    ...overrides,
  };
}

function memorySmsJobModel() {
  const jobs = [];
  function matches(job, query) {
    return Object.entries(query).every(([key, expected]) => {
      if (key === "type") return job.type === expected;
      if (key === "status" && expected.$in) return expected.$in.includes(job.status);
      if (key === "occurrenceKey" && expected.$ne) return job.occurrenceKey !== expected.$ne;
      if (expected === null) return job[key] == null;
      return String(job[key]) === String(expected);
    });
  }
  return {
    jobs,
    async updateMany(query, update) {
      for (const item of jobs.filter((value) => matches(value, query))) {
        Object.assign(item, update.$set);
      }
      return { modifiedCount: 1 };
    },
    async findOne(query) {
      return jobs.find((value) => matches(value, query)) || null;
    },
    async findOneAndUpdate(query, update) {
      let item = jobs.find(
        (value) =>
          String(value.reservationId) === String(query.reservationId) &&
          value.type === query.type &&
          value.occurrenceKey === query.occurrenceKey,
      );
      if (!item) {
        item = {
          reservationId: query.reservationId,
          occurrenceKey: query.occurrenceKey,
          ...update.$setOnInsert,
        };
        jobs.push(item);
      }
      Object.assign(item, update.$set);
      return item;
    },
  };
}

test("bank hold programmé ne crée un SMS qu'après le statut Confirmed", async () => {
  for (const autoAccept of [true, false]) {
    const model = memorySmsJobModel();
    const venue = restaurant();
    const booking = reservation({ status: "AwaitingBankHold" });
    await syncReservationSmsJob(booking, venue, new Date("2027-02-01"), {
      smsJobModel: model,
    });
    assert.equal(model.jobs.length, 0);

    booking.status = autoAccept ? "Confirmed" : "Pending";
    await syncReservationSmsJob(booking, venue, new Date("2027-02-01"), {
      smsJobModel: model,
    });
    assert.equal(model.jobs.length, autoAccept ? 1 : 0);

    booking.status = "Confirmed";
    await syncReservationSmsJob(booking, venue, new Date("2027-02-01"), {
      smsJobModel: model,
    });
    await syncReservationSmsJob(booking, venue, new Date("2027-02-01"), {
      smsJobModel: model,
    });
    assert.equal(model.jobs.length, 1);
  }
});

test("matrice d'éligibilité: seul Confirmed planifie un rappel", async () => {
  const statuses = [
    "Confirmed",
    "Pending",
    "AwaitingBankHold",
    "Canceled",
    "Rejected",
    "Finished",
    "NoShow",
    "Waitlist",
    "Active",
    "Late",
    "Expired",
  ];
  for (const status of statuses) {
    const model = memorySmsJobModel();
    await syncReservationSmsJob(
      reservation({ status }),
      restaurant(),
      new Date("2027-02-01"),
      { smsJobModel: model },
    );
    assert.equal(model.jobs.length, status === "Confirmed" ? 1 : 0, status);
  }
});

test("un job créé directement ignored horodate une seule fois la décision", async () => {
  const model = memorySmsJobModel();
  const venue = restaurant({ smsReminder: { deliveryMode: "eco" } });
  const booking = reservation({ customerEmail: "alex@example.com" });
  const skippedAt = new Date("2027-02-01T10:00:00.000Z");
  await syncReservationSmsJob(booking, venue, skippedAt, {
    smsJobModel: model,
  });
  assert.equal(model.jobs[0].status, "skipped");
  assert.equal(model.jobs[0].skippedAt.toISOString(), skippedAt.toISOString());

  await syncReservationSmsJob(
    booking,
    venue,
    new Date("2027-02-01T11:00:00.000Z"),
    { smsJobModel: model },
  );
  assert.equal(model.jobs[0].skippedAt.toISOString(), skippedAt.toISOString());

  model.jobs[0].skippedAt = null;
  await syncReservationSmsJob(
    booking,
    venue,
    new Date("2027-02-01T12:00:00.000Z"),
    { smsJobModel: model },
  );
  assert.equal(model.jobs[0].skippedAt, null);
});

test("mode eco avec email exploitable n'appelle ni provider ni crédits", async () => {
  const booking = reservation({ customerEmail: "alex@example.com" });
  const venue = restaurant({ smsReminder: { deliveryMode: "eco" } });
  const currentJob = jobFor(booking, venue);
  const usage = usageModel();
  let sends = 0;
  let meters = 0;
  const dependencies = processDependencies({
    reservationValue: booking,
    restaurantValue: venue,
    policy: frenchPolicy(),
    usage,
    provider: { async send() { sends += 1; } },
    reportUsage: async () => { meters += 1; },
  });
  await processClaimedJob(
    currentJob,
    dependencies,
  );
  assert.equal(currentJob.status, "skipped");
  assert.equal(currentJob.skipReason, "eco_email");
  assert.ok(currentJob.skippedAt instanceof Date);
  const skippedAt = currentJob.skippedAt.getTime();
  await processClaimedJob(currentJob, dependencies);
  assert.equal(currentJob.skippedAt.getTime(), skippedAt);
  assert.equal(sends, 0);
  assert.equal(meters, 0);
  assert.equal(currentJob.sentAt, undefined);
  assert.equal(usage.state.consumedCredits, 0);
});

test("mode eco sans email ou avec email invalide utilise une seule fois le chemin SMS", async () => {
  for (const customerEmail of ["", "adresse-invalide"] ) {
    const booking = reservation({ customerEmail });
    const venue = restaurant({ smsReminder: { deliveryMode: "eco" } });
    const currentJob = jobFor(booking, venue);
    const usage = usageModel();
    let sends = 0;
    let meters = 0;
    await processClaimedJob(
      currentJob,
      processDependencies({
        reservationValue: booking,
        restaurantValue: venue,
        policy: frenchPolicy(),
        usage,
        provider: { async send() { sends += 1; return { providerMessageId: "provider-1" }; } },
        reportUsage: async (job) => { meters += 1; job.stripeUsageState = "reported"; },
      }),
    );
    assert.equal(currentJob.status, "accepted");
    assert.ok(currentJob.sentAt instanceof Date);
    assert.equal(currentJob.sentAt.getTime(), currentJob.acceptedAt.getTime());
    assert.equal(sends, 1);
    assert.equal(meters, 1);
    assert.equal(usage.state.consumedCredits, 1);
  }
});

test("facture le nombre réel de segments GSM-7 du message final", async () => {
  const cases = [
    { units: 159, segments: 1 },
    { units: 160, segments: 1 },
    { units: 161, segments: 2 },
    { units: 306, segments: 2 },
    { units: 307, segments: 3 },
  ];
  for (const value of cases) {
    const booking = reservation();
    const venue = restaurant({
      smsReminder: { template: "a".repeat(value.units) },
    });
    const currentJob = jobFor(booking, venue);
    const usage = usageModel();
    let sends = 0;
    let meterValue = 0;
    await processClaimedJob(currentJob, processDependencies({
      reservationValue: booking,
      restaurantValue: venue,
      policy: frenchPolicy(),
      usage,
      provider: {
        async send({ message }) {
          sends += 1;
          assert.equal(message, "a".repeat(value.units));
          return { providerMessageId: `provider-${value.units}` };
        },
      },
      reportUsage: async (job) => {
        meterValue = job.billingCredits;
        job.stripeUsageState = "reported";
      },
    }));
    assert.equal(sends, 1);
    assert.equal(currentJob.segmentCount, value.segments);
    assert.equal(currentJob.billingCredits, value.segments);
    assert.equal(currentJob.providerCostSnapshot, value.segments * 0.05);
    assert.equal(usage.state.consumedCredits, value.segments);
    assert.equal(meterValue, value.segments);
  }
});

test("normalise les variables réelles avant segments, crédits et provider", async () => {
  const preservedVariables = buildFinalMessage({
    reservation: reservation({ customerFirstName: "Jörg Müller" }),
    restaurant: restaurant({ name: "Peña" }),
    settings: { template: "{firstName} chez {restaurantName}" },
    prefixRequired: false,
  });
  assert.equal(preservedVariables.message, "Jörg Müller chez Peña");
  assert.equal(preservedVariables.analysis.valid, true);

  const booking = reservation({ customerFirstName: "Chloë" });
  const venue = restaurant({
    name: "Côté Ô Saveurs",
    smsReminder: {
      template: `Rappel ${"^".repeat(75)} {firstName} chez {restaurantName}`,
    },
  });
  const currentJob = jobFor(booking, venue);
  const usage = usageModel();
  let providerBody = "";
  await processClaimedJob(currentJob, processDependencies({
    reservationValue: booking,
    restaurantValue: venue,
    policy: frenchPolicy(),
    usage,
    provider: {
      async send({ message }) {
        providerBody = message;
        return { providerMessageId: "provider-normalized" };
      },
    },
    reportUsage: async (job) => {
      job.stripeUsageState = "reported";
    },
  }));

  const expectedMessage = `Rappel ${"^".repeat(75)} Chloe chez Coté O Saveurs`;
  const expectedAnalysis = analyzeSingleSms(expectedMessage);
  assert.equal(normalizeToGsm7(expectedMessage).value, expectedMessage);
  assert.equal(expectedAnalysis.segmentCount, 2);
  assert.equal(currentJob.message, expectedMessage);
  assert.equal(providerBody, currentJob.message);
  assert.equal(currentJob.segmentCount, expectedAnalysis.segmentCount);
  assert.equal(currentJob.billingCredits, expectedAnalysis.segmentCount);
  assert.equal(usage.state.consumedCredits, expectedAnalysis.segmentCount);
});

test("un message de trois segments traverse la frontière des crédits inclus", async () => {
  const booking = reservation();
  const venue = restaurant({ smsReminder: { template: "a".repeat(307) } });
  const currentJob = jobFor(booking, venue);
  const usage = usageModel({ consumedCredits: 98 });
  let meterValue = 0;
  await processClaimedJob(currentJob, processDependencies({
    reservationValue: booking,
    restaurantValue: venue,
    policy: frenchPolicy(),
    usage,
    provider: { async send() { return { providerMessageId: "provider-quota" }; } },
    reportUsage: async (job) => {
      meterValue = job.billingCredits;
      job.stripeUsageState = "reported";
    },
  }));
  assert.equal(currentJob.includedCreditsApplied, 2);
  assert.equal(currentJob.overageCredits, 1);
  assert.equal(usage.state.consumedCredits, 101);
  assert.equal(usage.state.includedCreditsConsumed, 100);
  assert.equal(usage.state.overageCredits, 1);
  assert.equal(meterValue, 3);
});

test("frontière des 100 crédits et message multi-crédits", async () => {
  const cases = [
    { consumed: 99, credits: 1, included: 1, overage: 0 },
    { consumed: 100, credits: 1, included: 0, overage: 1 },
    { consumed: 98, credits: 3, included: 2, overage: 1 },
  ];
  for (const value of cases) {
    const usage = usageModel({ consumedCredits: value.consumed });
    const result = await reserveUsage({
      restaurant: restaurant(),
      billingContext: BILLING,
      credits: value.credits,
      usagePeriodModel: usage,
    });
    assert.equal(result.includedApplied, value.included);
    assert.equal(result.overage, value.overage);
    assert.equal(usage.state.reservedCredits, value.credits);
  }
});

test("réservation atomique laisse un seul message atteindre le plafond", async () => {
  const venue = restaurant({ smsReminder: { billingPeriodSpendingLimit: 0.3 } });
  const usage = usageModel({ consumedCredits: 100 });
  const [first, second] = await Promise.all([
    reserveUsage({ restaurant: venue, billingContext: BILLING, credits: 3, usagePeriodModel: usage }),
    reserveUsage({ restaurant: venue, billingContext: BILLING, credits: 3, usagePeriodModel: usage }),
  ]);
  assert.equal([first, second].filter(Boolean).length, 1);
  assert.equal(usage.state.reservedCredits, 3);
});

test("message dépassant le plafond est ignoré avant tout appel provider", async () => {
  const booking = reservation();
  const venue = restaurant({
    smsReminder: {
      billingPeriodSpendingLimit: 0.1,
      template: "a".repeat(307),
    },
  });
  const currentJob = jobFor(booking, venue);
  const usage = usageModel({ consumedCredits: 99 });
  let sends = 0;
  await processClaimedJob(currentJob, processDependencies({
    reservationValue: booking,
    restaurantValue: venue,
    policy: frenchPolicy(),
    usage,
    provider: { async send() { sends += 1; } },
    reportUsage: async () => {},
  }));
  assert.equal(currentJob.status, "skipped");
  assert.equal(currentJob.skipReason, "budget_limit");
  assert.equal(sends, 0);
  assert.equal(usage.state.consumedCredits, 99);
});

test("numéros et destinations non éligibles n'appellent pas le provider", async () => {
  const cases = [
    { phone: "123", internationalEnabled: false, policy: frenchPolicy(), reason: "no_phone" },
    { phone: "+32 470 12 34 56", internationalEnabled: false, policy: frenchPolicy(), reason: "international_disabled" },
    { phone: "+32 470 12 34 56", internationalEnabled: true, policy: null, reason: "unsupported_destination" },
    { phone: "+32 470 12 34 56", internationalEnabled: true, policy: frenchPolicy({ country: "BE", supportsDlr: null }), reason: "unsupported_destination" },
  ];
  for (const value of cases) {
    const booking = reservation({ customerPhone: value.phone });
    const venue = restaurant({ smsReminder: { internationalEnabled: value.internationalEnabled } });
    const currentJob = jobFor(booking, venue);
    let sends = 0;
    await processClaimedJob(currentJob, processDependencies({
      reservationValue: booking,
      restaurantValue: venue,
      policy: value.policy,
      usage: usageModel(),
      provider: { async send() { sends += 1; } },
      reportUsage: async () => {},
    }));
    assert.equal(currentJob.skipReason, value.reason);
    assert.equal(sends, 0);
  }
});

test("policy étrangère multiplie billingCredits par le nombre de segments", async () => {
  const booking = reservation({ customerPhone: "+32 470 12 34 56" });
  const venue = restaurant({
    smsReminder: { internationalEnabled: true, template: "a".repeat(307) },
  });
  const currentJob = jobFor(booking, venue);
  const usage = usageModel({ consumedCredits: 98 });
  let sent = 0;
  let meterValue = 0;
  await processClaimedJob(currentJob, processDependencies({
    reservationValue: booking,
    restaurantValue: venue,
    policy: frenchPolicy({ country: "BE", billingCredits: 2 }),
    usage,
    provider: { async send() { sent += 1; return { providerMessageId: "be-1" }; } },
    reportUsage: async (job) => { meterValue = job.billingCredits; job.stripeUsageState = "reported"; },
  }));
  assert.equal(sent, 1);
  assert.equal(currentJob.segmentCount, 3);
  assert.equal(currentJob.billingCredits, 6);
  assert.equal(currentJob.includedCreditsApplied, 2);
  assert.equal(currentJob.overageCredits, 4);
  assert.equal(meterValue, 6);
});

test("registered_alpha bloque les Sender IDs absents/non approuvés", async () => {
  for (const status of [null, "pending", "rejected", "approved"]) {
    const booking = reservation();
    const venue = restaurant({
      smsReminder: {
        sender: status ? { value: "SAVEURS", status } : undefined,
      },
    });
    const currentJob = jobFor(booking, venue);
    const usage = usageModel();
    let sends = 0;
    await processClaimedJob(currentJob, processDependencies({
      reservationValue: booking,
      restaurantValue: venue,
      policy: frenchPolicy(),
      usage,
      provider: { async send() { sends += 1; return { providerMessageId: "sender-1" }; } },
      reportUsage: async (job) => { job.stripeUsageState = "reported"; },
    }));
    assert.equal(sends, status === "approved" ? 1 : 0);
    assert.equal(usage.state.consumedCredits, status === "approved" ? 1 : 0);
    if (status !== "approved") assert.equal(currentJob.skipReason, "sender_not_approved");
  }
});

test("rejet provider libère la réservation, résultat incertain la conserve", async () => {
  for (const certain of [true, false]) {
    const booking = reservation();
    const venue = restaurant({ smsReminder: { template: "a".repeat(161) } });
    const currentJob = jobFor(booking, venue);
    const usage = usageModel();
    await processClaimedJob(currentJob, processDependencies({
      reservationValue: booking,
      restaurantValue: venue,
      policy: frenchPolicy(),
      usage,
      provider: {
        async send() {
          const error = new Error(certain ? "rejected" : "timeout");
          if (certain) error.response = { status: 400 };
          throw error;
        },
      },
      reportUsage: async () => {},
    }));
    assert.equal(currentJob.status, certain ? "failed" : "uncertain");
    assert.equal(currentJob.usageState, certain ? "released" : "reserved");
    assert.equal(currentJob.billingCredits, 2);
    assert.equal(usage.state.reservedCredits, certain ? 0 : 2);
    assert.equal(usage.state.consumedCredits, 0);
  }
});

test("un message GSM-7 long est conservé sans fallback compact", () => {
  const longRestaurantName = "Restaurant extraordinairement long ".repeat(12);
  const result = buildFinalMessage({
    reservation: reservation({ customerFirstName: "Alexandre".repeat(30) }),
    restaurant: restaurant({ name: longRestaurantName }),
    settings: { template: DEFAULT_SMS_TEMPLATE },
    prefixRequired: true,
  });
  assert.equal(result.analysis.encoding, "gsm7");
  assert.equal(result.analysis.valid, true);
  assert.ok(result.analysis.segmentCount > 1);
  assert.ok(result.analysis.units > 160);
  assert.match(result.message, /pour rappel, votre table chez/);
  assert.ok(result.message.startsWith(`${longRestaurantName}: Bonjour`));
});

test("une variable réelle non convertible bloque l'envoi avant les crédits", async () => {
  const booking = reservation({ customerFirstName: "Alex 😊" });
  const venue = restaurant({
    smsReminder: { template: "Bonjour {firstName}" },
  });
  const result = buildFinalMessage({
    reservation: booking,
    restaurant: venue,
    settings: venue.reservationsSettings.smsReminder,
    prefixRequired: false,
  });
  assert.equal(result.analysis.valid, false);
  assert.equal(result.message, "Bonjour Alex 😊");

  const currentJob = jobFor(booking, venue);
  const usage = usageModel();
  let sends = 0;
  let meters = 0;
  await processClaimedJob(currentJob, processDependencies({
    reservationValue: booking,
    restaurantValue: venue,
    policy: frenchPolicy(),
    usage,
    provider: { async send() { sends += 1; } },
    reportUsage: async () => { meters += 1; },
  }));
  assert.equal(currentJob.status, "skipped");
  assert.equal(currentJob.skipReason, "invalid_message");
  assert.equal(sends, 0);
  assert.equal(meters, 0);
  assert.equal(usage.state.reservedCredits, 0);
  assert.equal(usage.state.consumedCredits, 0);
});

test("replanification, changement de délai, désactivation et réactivation restent idempotents", async () => {
  const model = memorySmsJobModel();
  const venue = restaurant();
  const booking = reservation();
  const initialSyncAt = new Date("2027-02-01T10:00:00.000Z");
  await syncReservationSmsJob(booking, venue, initialSyncAt, { smsJobModel: model });
  const firstScheduledAt = model.jobs[0].scheduledAt.toISOString();
  venue.reservationsSettings.smsReminder.delayMinutes = 360;
  await syncReservationSmsJob(booking, venue, initialSyncAt, { force: true, smsJobModel: model });
  assert.equal(model.jobs.length, 1);
  assert.notEqual(model.jobs[0].scheduledAt.toISOString(), firstScheduledAt);

  const scheduledBeforeReschedule = model.jobs[0].scheduledAt.toISOString();
  const rescheduledAt = new Date("2027-02-01T11:30:00.000Z");
  booking.reservationTime = "21:00";
  await syncReservationSmsJob(booking, venue, rescheduledAt, { force: true, smsJobModel: model });
  assert.equal(model.jobs.filter((value) => value.status === "scheduled").length, 1);
  assert.equal(model.jobs.filter((value) => value.status === "cancelled").length, 1);
  const cancelledJob = model.jobs.find((value) => value.status === "cancelled");
  assert.equal(cancelledJob.scheduledAt.toISOString(), scheduledBeforeReschedule);
  assert.equal(cancelledJob.cancelledAt.toISOString(), rescheduledAt.toISOString());

  venue.reservationsSettings.smsReminder.enabled = false;
  await syncReservationSmsJob(booking, venue, new Date("2027-02-01T12:00:00.000Z"), { smsJobModel: model });
  assert.equal(model.jobs.filter((value) => value.status === "scheduled").length, 0);
  venue.reservationsSettings.smsReminder.enabled = true;
  await syncReservationSmsJob(booking, venue, new Date("2027-02-01T12:00:00.000Z"), { force: true, smsJobModel: model });
  assert.equal(model.jobs.filter((value) => value.status === "scheduled").length, 1);
});

test("plage 08h-21h et too_late restent inchangés", () => {
  const cases = [
    { time: "23:15", expected: "2027-02-10T20:00:00.000Z" },
    { time: "01:00", expected: "2027-02-09T20:00:00.000Z" },
    { time: "08:30", expected: "2027-02-10T07:00:00.000Z" },
  ];
  for (const value of cases) {
    const result = computeSmsSchedule({
      reservation: reservation({ reservationTime: value.time }),
      restaurant: restaurant(),
      delayMinutes: 120,
      now: new Date("2027-02-01T00:00:00.000Z"),
    });
    assert.equal(result.scheduledAt.toISOString(), value.expected);
  }
  const tooLate = computeSmsSchedule({
    reservation: reservation({ reservationTime: "08:00" }),
    restaurant: restaurant(),
    delayMinutes: 120,
    now: new Date("2027-02-10T07:00:00.000Z"),
  });
  assert.equal(tooLate.skipReason, "too_late");
});

test("désactivation commerciale attend la disparition des Prices SMS", async () => {
  const deactivation = { status: "scheduled", stripeScheduleId: "sub_sched", effectiveAt: new Date("2027-02-01") };
  const venue = restaurant({ smsReminder: { commercialDeactivation: deactivation } });
  let updates = 0;
  let cancellations = 0;
  let effectiveUpdate = null;
  let dueRestaurants = [];
  const restaurantModel = {
    find() { return { async select() { return dueRestaurants; } }; },
    async updateOne(_query, update) { updates += 1; effectiveUpdate = update; return { modifiedCount: 1 }; },
  };
  const smsJobModel = { async updateMany() { cancellations += 1; } };
  await finalizeDueSmsDeactivations(new Date("2027-01-01"), {
    restaurantModel,
    smsJobModel,
    findSubscription: async () => ({ subscription: { items: { data: [] } } }),
  });
  assert.equal(updates, 0);
  assert.equal(cancellations, 0);

  dueRestaurants = [venue];
  await finalizeDueSmsDeactivations(new Date("2027-02-02"), {
    restaurantModel,
    smsJobModel,
    findSubscription: async () => ({ subscription: { items: { data: [{ price: { id: process.env.STRIPE_SMS_FIXED_PRICE_ID } }] } } }),
  });
  assert.equal(updates, 0);
  assert.equal(cancellations, 0);

  await finalizeDueSmsDeactivations(new Date("2027-02-02"), {
    restaurantModel,
    smsJobModel,
    findSubscription: async () => ({ subscription: { items: { data: [] } } }),
  });
  assert.equal(updates, 1);
  assert.equal(cancellations, 1);
  assert.equal(
    effectiveUpdate.$set["options.sms_reminders"],
    false,
  );
  assert.equal(
    Object.keys(effectiveUpdate.$set).some((path) => path.includes("sender")),
    false,
  );
  assert.deepEqual(
    venue.reservationsSettings.smsReminder.sender,
    { value: "SAVEURS", status: "approved" },
  );
});

test("DLR dupliqués delivered/failed ne consomment ni ne facturent deux fois", async () => {
  const delivered = {
    status: "accepted",
    providerMessageId: "provider-delivered",
    usageState: "consumed",
    stripeUsageState: "reported",
    deliveredAt: null,
    saveCount: 0,
    async save() { this.saveCount += 1; },
  };
  const payload = { status: { value: "DELIVERED", deliveryDate: "2027-02-10T18:00:00.000Z" } };
  await applyProviderStatus(delivered, payload);
  const deliveredAt = delivered.deliveredAt.toISOString();
  assert.equal(deliveredAt, "2027-02-10T18:00:00.000Z");
  const saveCount = delivered.saveCount;
  await applyProviderStatus(delivered, payload);
  assert.equal(delivered.deliveredAt.toISOString(), deliveredAt);
  assert.equal(delivered.saveCount, saveCount);

  const failed = {
    status: "accepted",
    usageState: "consumed",
    stripeUsageState: "reported",
    saveCount: 0,
    async save() { this.saveCount += 1; },
  };
  const failure = { status: { value: "UNDELIVERABLE", detail: "rejected" } };
  await applyProviderStatus(failed, failure);
  const failedSaveCount = failed.saveCount;
  await applyProviderStatus(failed, failure);
  assert.equal(failed.status, "failed");
  assert.ok(failed.failedAt instanceof Date);
  assert.equal(failed.saveCount, failedSaveCount);
});

test("crash après soumission devient uncertain sans retry aveugle", async () => {
  const calls = [];
  await recoverExpiredJobs({
    async updateMany(query, update) { calls.push({ query, update }); },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].update.$set.status, "uncertain");
  assert.equal(calls[1].query.providerSubmissionStartedAt.$ne, null);
});

test("Meter Event est brut, déterministe et idempotent", async () => {
  let events = 0;
  let parameters;
  const currentJob = {
    _id: "meter-job",
    billingCredits: 3,
    acceptedAt: new Date("2027-02-10T18:00:00.000Z"),
    stripeUsageState: "pending",
    async save() {},
  };
  const stripe = {
    billing: { meterEvents: { async create(params, options) {
      events += 1;
      parameters = { params, options };
      return { identifier: params.identifier };
    } } },
  };
  await reportStripeUsage(currentJob, BILLING, stripe);
  await reportStripeUsage(currentJob, BILLING, stripe);
  assert.equal(events, 1);
  assert.equal(parameters.params.payload.value, "3");
  assert.equal(parameters.params.identifier, "gusto_sms_meter-job");
  assert.equal(parameters.options.idempotencyKey, "gusto_sms_meter-job");
});

test("comptage GSM-7 exact distingue caractères standards, extension et Unicode", () => {
  assert.equal(analyzeSingleSms("ABC xyz 123").units, 11);
  assert.equal(analyzeSingleSms("{}[]^~|€").units, 16);
  assert.equal(analyzeSingleSms("Bonjour 😊").encoding, "unicode");
  assert.equal(analyzeSingleSms("Bonjour 😊").valid, false);
});
