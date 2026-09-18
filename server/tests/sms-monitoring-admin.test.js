const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_sms_monitoring";

const SmsJobModel = require("../models/sms-job.model");
const {
  serializeAdminSmsJob,
} = require("../routes/admin/sms-reminders.routes");

const clientRoot = resolve(
  __dirname,
  "../../client/src/components/dashboard/admin/sms",
);
const labelsSource = readFileSync(
  resolve(clientRoot, "sms-job-labels.admin.utils.js"),
  "utf8",
);
const labelsPromise = import(
  `data:text/javascript;base64,${Buffer.from(labelsSource).toString("base64")}`
);

test("le SmsJob et l'API admin exposent les timestamps de suivi en ISO", () => {
  assert.ok(SmsJobModel.schema.path("cancelledAt"));
  assert.ok(SmsJobModel.schema.path("skippedAt"));

  const serialized = serializeAdminSmsJob({
    _id: "job-monitoring",
    scheduledAt: new Date("2026-09-17T18:15:00.000Z"),
    providerSubmissionStartedAt: new Date("2026-09-17T18:15:30.000Z"),
    sentAt: new Date("2026-09-17T18:16:00.000Z"),
    acceptedAt: new Date("2026-09-17T18:16:00.000Z"),
    deliveredAt: new Date("2026-09-17T18:16:20.000Z"),
    failedAt: null,
    cancelledAt: null,
    skippedAt: new Date("2026-09-17T18:17:00.000Z"),
  });

  assert.equal(serialized.scheduledAt, "2026-09-17T18:15:00.000Z");
  assert.equal(
    serialized.providerSubmissionStartedAt,
    "2026-09-17T18:15:30.000Z",
  );
  assert.equal(serialized.sentAt, "2026-09-17T18:16:00.000Z");
  assert.equal(serialized.acceptedAt, "2026-09-17T18:16:00.000Z");
  assert.equal(serialized.deliveredAt, "2026-09-17T18:16:20.000Z");
  assert.equal(serialized.failedAt, null);
  assert.equal(serialized.cancelledAt, null);
  assert.equal(serialized.skippedAt, "2026-09-17T18:17:00.000Z");
  assert.equal(serializeAdminSmsJob({ status: "skipped" }).skippedAt, null);
});

test("le frontend formate le suivi et retient un seul événement selon le statut", async () => {
  const { formatSmsTrackingDate, getSmsJobTracking } = await labelsPromise;
  const monitoringSource = readFileSync(
    resolve(clientRoot, "sms-monitoring.admin.component.js"),
    "utf8",
  );

  assert.equal(
    formatSmsTrackingDate(
      "2026-09-17T18:15:00.000Z",
      "Europe/Paris",
    ),
    "17/09/2026 à 20:15",
  );
  assert.equal(formatSmsTrackingDate(null), "—");
  const timestamps = {
    scheduledAt: "scheduled-at",
    sentAt: "sent-at",
    acceptedAt: "accepted-at",
    deliveredAt: "delivered-at",
    cancelledAt: "cancelled-at",
    failedAt: "failed-at",
    skippedAt: "skipped-at",
    providerSubmissionStartedAt: "attempted-at",
  };
  assert.deepEqual(getSmsJobTracking({ status: "scheduled", ...timestamps }), {
    label: "Programmé",
    value: "scheduled-at",
  });
  for (const status of ["processing", "accepted"]) {
    assert.deepEqual(getSmsJobTracking({ status, ...timestamps }), {
      label: "Envoyé",
      value: "sent-at",
    });
  }
  assert.deepEqual(getSmsJobTracking({ status: "delivered", ...timestamps }), {
    label: "Livré",
    value: "delivered-at",
  });
  assert.deepEqual(getSmsJobTracking({ status: "cancelled", ...timestamps }), {
    label: "Annulé",
    value: "cancelled-at",
  });
  assert.deepEqual(getSmsJobTracking({ status: "failed", ...timestamps }), {
    label: "Échec",
    value: "failed-at",
  });
  assert.deepEqual(getSmsJobTracking({ status: "skipped", ...timestamps }), {
    label: "Ignoré",
    value: "skipped-at",
  });
  const skippedWithoutTimestamp = getSmsJobTracking({ status: "skipped" });
  assert.equal(
    `${skippedWithoutTimestamp.label} : ${formatSmsTrackingDate(skippedWithoutTimestamp.value)}`,
    "Ignoré : —",
  );
  const skippedWithTimestamp = getSmsJobTracking({
    status: "skipped",
    skippedAt: "2026-09-18T08:02:00.000Z",
  });
  assert.equal(
    `${skippedWithTimestamp.label} : ${formatSmsTrackingDate(skippedWithTimestamp.value, "Europe/Paris")}`,
    "Ignoré : 18/09/2026 à 10:02",
  );
  assert.deepEqual(getSmsJobTracking({ status: "uncertain", ...timestamps }), {
    label: "Tentative",
    value: "attempted-at",
  });
  assert.equal(getSmsJobTracking({ status: "uncertain" }), null);
  assert.match(monitoringSource, />Suivi</);
  assert.match(monitoringSource, /getSmsJobTracking\(job\)/);
});

test("la colonne Crédits affiche uniquement une consommation réellement engagée", async () => {
  const { formatSmsConsumedCredits } = await labelsPromise;
  const monitoringSource = readFileSync(
    resolve(clientRoot, "sms-monitoring.admin.component.js"),
    "utf8",
  );
  const notBilledCases = [
    { status: "skipped", billingCredits: 1, stripeUsageState: "not_required" },
    { status: "cancelled", billingCredits: 1, stripeUsageState: "not_required" },
    { status: "scheduled", billingCredits: 1, stripeUsageState: "not_required" },
    { status: "failed", billingCredits: 1, stripeUsageState: "not_required" },
  ];
  for (const job of notBilledCases) {
    const snapshot = { ...job };
    assert.equal(formatSmsConsumedCredits(job), "—");
    assert.deepEqual(job, snapshot);
  }

  assert.equal(
    formatSmsConsumedCredits({
      billingCredits: 1,
      stripeUsageState: "reported",
    }),
    "1",
  );
  assert.equal(
    formatSmsConsumedCredits({
      billingCredits: 2,
      stripeUsageState: "reported",
    }),
    "2",
  );
  for (const stripeUsageState of ["pending", "uncertain", "failed"]) {
    assert.equal(
      formatSmsConsumedCredits({ billingCredits: 3, stripeUsageState }),
      "3",
    );
  }
  assert.match(monitoringSource, /formatSmsConsumedCredits\(job\)/);
  assert.doesNotMatch(monitoringSource, /job\.billingCredits \|\| 0/);
});
