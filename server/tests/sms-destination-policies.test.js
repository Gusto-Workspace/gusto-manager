const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_sms_destinations";

const SmsDestinationPolicyModel = require("../models/sms-destination-policy.model");
const {
  normalizeDestinationPolicyInput,
  serializeAdminDestinationPolicy,
} = require("../routes/admin/sms-reminders.routes");
const {
  serializeAvailableDestinationPolicies,
} = require("../routes/sms-reminders.routes");
const {
  isSmsDestinationPolicyTechnicallyReady,
  smsDestinationPolicyIsUsable,
} = require("../services/sms/sms-reminder.service");
const {
  INTERNATIONAL_SMS_POLICIES,
  buildPolicyUpdate,
} = require("../scripts/seedSmsInternationalPolicies.script");

const expectedPolicies = [
  ["BE", 0.0616, 2],
  ["CH", 0.0667, 2],
  ["LU", 0.0704, 2],
  ["DE", 0.0792, 2],
  ["GB", 0.0395, 1],
  ["ES", 0.0308, 1],
  ["IT", 0.0352, 1],
  ["NL", 0.0836, 2],
  ["PT", 0.0176, 1],
];

function readyPolicy(overrides = {}) {
  return {
    country: "FR",
    enabled: true,
    provider: "smsmode",
    senderMode: "registered_alpha",
    senderRegistrationRequired: true,
    supportsDlr: true,
    providerRateHt: 0.061,
    billingCredits: 1,
    fallbackSender: "",
    lastReviewedAt: new Date("2026-09-18T00:00:00.000Z"),
    ...overrides,
  };
}

test("le mapping UI conserve les ISO et affiche les dix noms français", async () => {
  const source = readFileSync(
    resolve(
      __dirname,
      "../../client/src/_assets/utils/sms-country-labels.js",
    ),
    "utf8",
  );
  const { getSmsCountryName } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  const names = {
    FR: "France",
    BE: "Belgique",
    CH: "Suisse",
    LU: "Luxembourg",
    DE: "Allemagne",
    GB: "Royaume-Uni",
    ES: "Espagne",
    IT: "Italie",
    NL: "Pays-Bas",
    PT: "Portugal",
  };
  for (const [country, name] of Object.entries(names)) {
    assert.equal(getSmsCountryName(country), name);
  }
  assert.equal(readyPolicy().country, "FR");

  const adminSource = readFileSync(
    resolve(
      __dirname,
      "../../client/src/components/dashboard/admin/sms/sms-monitoring.admin.component.js",
    ),
    "utf8",
  );
  const editorSource = readFileSync(
    resolve(
      __dirname,
      "../../client/src/components/dashboard/admin/sms/edit-destination-policy.admin.component.js",
    ),
    "utf8",
  );
  const restaurantSource = readFileSync(
    resolve(
      __dirname,
      "../../client/src/components/dashboard/_shared/reservations/sms-destinations-modal.reservations.component.js",
    ),
    "utf8",
  );
  assert.match(adminSource, /getSmsCountryName\(policy\.country\)/);
  assert.match(adminSource, />Configuration</);
  assert.match(adminSource, /policy\.technicalReady \? "Prête" : "À compléter"/);
  assert.match(editorSource, /getSmsCountryName\(policy\.country\)/);
  assert.match(editorSource, />Configuration technique</);
  assert.doesNotMatch(editorSource, /technicalStatus|Validation opérateur/);
  assert.match(restaurantSource, /getSmsCountryName\(destination\.country\)/);
});

test("le seed prépare exactement neuf policies inactives avec les bons tarifs", () => {
  assert.deepEqual(
    INTERNATIONAL_SMS_POLICIES.map((policy) => [
      policy.country,
      policy.providerRateHt,
      policy.billingCredits,
    ]),
    expectedPolicies,
  );
  const updates = INTERNATIONAL_SMS_POLICIES.map((policy) =>
    buildPolicyUpdate(policy, new Date("2026-09-18T00:00:00.000Z")),
  );
  assert.ok(
    updates.every((policy) => policy.enabled === false),
  );
  assert.equal(updates.find((policy) => policy.country === "BE").senderMode, "shortcode");
  assert.deepEqual(
    {
      senderMode: updates.find((policy) => policy.country === "GB").senderMode,
      senderRegistrationRequired: updates.find(
        (policy) => policy.country === "GB",
      ).senderRegistrationRequired,
    },
    { senderMode: "registered_alpha", senderRegistrationRequired: true },
  );
  assert.ok(
    updates
      .filter((policy) => !["BE", "GB"].includes(policy.country))
      .every(
        (policy) =>
          policy.senderMode === null &&
          policy.senderRegistrationRequired === null &&
          policy.supportsDlr === null,
      ),
  );
});

test("le modèle représente une configuration incomplète sans statut manuel", () => {
  const incomplete = new SmsDestinationPolicyModel({
    country: "CH",
    providerRateHt: 0.0667,
    billingCredits: 2,
    lastReviewedAt: new Date(),
  });
  assert.equal(incomplete.senderMode, null);
  assert.equal(incomplete.senderRegistrationRequired, null);
  assert.equal(incomplete.supportsDlr, null);
  assert.equal(SmsDestinationPolicyModel.schema.path("technicalStatus"), undefined);
});

test("la readiness technique est calculée à partir de tous les champs requis", () => {
  const france = readyPolicy();
  assert.equal(isSmsDestinationPolicyTechnicallyReady(france), true);
  for (const overrides of [
    { provider: "" },
    { providerRateHt: null },
    { billingCredits: 0 },
    { senderMode: null },
    { senderRegistrationRequired: null },
    { supportsDlr: null },
    { lastReviewedAt: null },
  ]) {
    assert.equal(
      isSmsDestinationPolicyTechnicallyReady(readyPolicy(overrides)),
      false,
    );
  }
  assert.equal(
    isSmsDestinationPolicyTechnicallyReady(
      readyPolicy({
        senderMode: "shortcode",
        senderRegistrationRequired: false,
        fallbackSender: "",
      }),
    ),
    false,
  );
  assert.equal(
    isSmsDestinationPolicyTechnicallyReady(
      readyPolicy({
        senderMode: "shortcode",
        senderRegistrationRequired: false,
        fallbackSender: "12345",
      }),
    ),
    true,
  );
  assert.equal(
    isSmsDestinationPolicyTechnicallyReady(
      readyPolicy({
        senderMode: "registered_alpha",
        senderRegistrationRequired: false,
      }),
    ),
    false,
  );
});

test("les policies internationales du seed restent automatiquement à compléter", () => {
  const updates = INTERNATIONAL_SMS_POLICIES.map((policy) =>
    buildPolicyUpdate(policy, new Date("2026-09-18T00:00:00.000Z")),
  );
  assert.ok(
    updates.every(
      (policy) => !isSmsDestinationPolicyTechnicallyReady(policy),
    ),
  );
  assert.equal(isSmsDestinationPolicyTechnicallyReady(readyPolicy()), true);
  assert.equal(serializeAdminDestinationPolicy(readyPolicy()).technicalReady, true);
  assert.equal(
    serializeAdminDestinationPolicy({
      ...updates[0],
      technicalStatus: "validated",
    }).technicalReady,
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      serializeAdminDestinationPolicy({
        ...updates[0],
        technicalStatus: "validated",
      }),
      "technicalStatus",
    ),
    false,
  );
});

test("l’API refuse une activation incomplète même avec un statut forgé", () => {
  const input = {
    enabled: true,
    technicalStatus: "validated",
    senderMode: "shortcode",
    senderRegistrationRequired: false,
    supportsDlr: true,
    providerRateHt: 0.0616,
    billingCredits: 2,
    fallbackSender: "",
    lastReviewedAt: "2026-09-18",
  };
  assert.throws(
    () => normalizeDestinationPolicyInput("BE", input),
    (error) =>
      error.code === "SMS_DESTINATION_NOT_READY" &&
      error.statusCode === 409,
  );

  const prepared = normalizeDestinationPolicyInput("BE", {
    ...input,
    enabled: false,
  });
  assert.equal(prepared.country, "BE");
  assert.equal(
    Object.prototype.hasOwnProperty.call(prepared, "technicalStatus"),
    false,
  );
});

test("le worker et l’API restaurateur excluent les policies incomplètes ou inactives", () => {
  const incomplete = readyPolicy({
    country: "BE",
    supportsDlr: null,
  });
  const inactive = readyPolicy({ country: "GB", enabled: false });
  const france = readyPolicy();
  assert.equal(smsDestinationPolicyIsUsable(incomplete), false);
  assert.equal(smsDestinationPolicyIsUsable(inactive), false);
  assert.equal(smsDestinationPolicyIsUsable(france), true);
  assert.deepEqual(
    serializeAvailableDestinationPolicies([incomplete, inactive, france]).map(
      (policy) => policy.country,
    ),
    ["FR"],
  );
});
