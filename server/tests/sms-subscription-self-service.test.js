const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_sms_self_service";

const RestaurantModel = require("../models/restaurant.model");
const DocumentModel = require("../models/document.model");
const {
  validateSmsReactivationPrerequisites,
} = require("../services/sms/sms-reminder.service");
const {
  buildSelfServiceEmailHtml,
} = require("../services/contract-self-service.service");

const routeSource = fs.readFileSync(
  path.join(__dirname, "../routes/sms-reminders.routes.js"),
  "utf8",
);
const uiSource = fs.readFileSync(
  path.join(
    __dirname,
    "../../client/src/components/dashboard/_shared/reservations/sms-reminders.reservations.component.js",
  ),
  "utf8",
);
const adminSubscriptionSource = fs.readFileSync(
  path.join(__dirname, "../routes/admin/subscriptions.routes.js"),
  "utf8",
);
const backfillSource = fs.readFileSync(
  path.join(
    __dirname,
    "../scripts/backfillSmsSelfServiceEligibility.script.js",
  ),
  "utf8",
);

test("un restaurant neuf n’est pas éligible au self-service SMS", () => {
  const restaurant = new RestaurantModel({ name: "Test" });
  assert.equal(
    restaurant.reservationsSettings.smsReminder.selfServiceEligible,
    false,
  );
});

test("l’endpoint commercial est owner-only et refuse une première souscription", () => {
  assert.match(routeSource, /req\.user\?\.role !== "owner"/);
  assert.match(routeSource, /selfServiceEligible/);
  assert.match(routeSource, /doit d’abord être configuré par le service client/);
});

test("le GET des paramètres SMS ne promeut plus l’éligibilité en écrivant Mongo", () => {
  const getHandlerSource = routeSource.slice(
    routeSource.indexOf('router.get("/restaurants/:id/sms-reminders"'),
    routeSource.indexOf('router.post(\n  "/restaurants/:id/sms-subscription/actions"'),
  );
  assert.doesNotMatch(getHandlerSource, /restaurant\.save\(/);
  assert.doesNotMatch(getHandlerSource, /selfServiceEligible\s*=\s*true/);
});

test("l’éligibilité est posée par les flows admin et le backfill contrôlé", () => {
  assert.match(adminSubscriptionSource, /smsReminder\.selfServiceEligible": true/);
  assert.match(backfillSource, /"options\.sms_reminders": true/);
  assert.match(backfillSource, /"scheduled", "effective", "cancelled"/);
  assert.match(backfillSource, /sender\.status": "approved"/);
  assert.match(backfillSource, /selfServiceEligible": \{ \$ne: true \}/);
});

test("le backend reconstruit les Prices SMS sans accepter de prix client", () => {
  assert.match(routeSource, /process\.env\.STRIPE_SMS_FIXED_PRICE_ID/);
  assert.match(routeSource, /process\.env\.STRIPE_SMS_METERED_PRICE_ID/);
  assert.doesNotMatch(routeSource, /req\.body\?\.(priceId|amount|effectiveAt)/);
});

test("la résiliation et son annulation réutilisent le Subscription Schedule existant", () => {
  assert.match(routeSource, /scheduleSmsDeactivation/);
  assert.match(routeSource, /releaseGustoSmsDeactivationSchedule/);
  assert.match(routeSource, /schedule_deactivation/);
  assert.match(routeSource, /cancel_deactivation/);
});

test("l’annulation produit une nouvelle acceptation et un email sans signature", () => {
  assert.match(routeSource, /actionType = "SMS_DEACTIVATION_CANCELLED"/);
  assert.match(routeSource, /finalizeSelfServiceAmendment/);
  const contractServiceSource = fs.readFileSync(
    path.join(__dirname, "../services/contract-self-service.service.js"),
    "utf8",
  );
  assert.match(contractServiceSource, /createWhenUnchanged: true/);
  const html = buildSelfServiceEmailHtml({
    selfServiceAcceptance: {
      actionType: "SMS_DEACTIVATION_CANCELLED",
      effectiveAt: new Date("2026-10-15T00:00:00.000Z"),
    },
  });
  assert.match(html, /résiliation programmée.*a été annulée/i);
  assert.match(html, /avenant est joint/i);
  assert.doesNotMatch(html, /signer|signature/i);
});

test("la réactivation refuse un Sender ID invalide lorsque la policy l’exige", () => {
  const result = validateSmsReactivationPrerequisites({
    settings: {
      sender: { value: "SAVEURS", status: "rejected" },
      internationalEnabled: false,
    },
    policies: [
      {
        country: "FR",
        enabled: true,
        billingCredits: 1,
        senderMode: "registered_alpha",
        senderRegistrationRequired: true,
        providerRateHt: 0.05,
        lastReviewedAt: new Date(),
      },
    ],
  });
  assert.equal(result.code, "SMS_SENDER_REVALIDATION_REQUIRED");
  assert.match(result.message, /reconfiguré et validé/i);
});

test("la réactivation accepte une policy exploitable sans Sender ID obligatoire", () => {
  const result = validateSmsReactivationPrerequisites({
    settings: {
      sender: { value: "", status: "rejected" },
      internationalEnabled: false,
    },
    policies: [
      {
        country: "FR",
        enabled: true,
        billingCredits: 1,
        senderMode: "provider_default",
        senderRegistrationRequired: false,
        providerRateHt: 0.05,
        lastReviewedAt: new Date(),
      },
    ],
  });
  assert.equal(result, null);
});

test("la réactivation refuse une configuration pays absente ou incomplète", () => {
  const result = validateSmsReactivationPrerequisites({
    settings: { sender: { value: "SAVEURS", status: "approved" } },
    policies: [],
  });
  assert.equal(result.code, "SMS_CONFIGURATION_REQUIRED");
  assert.match(result.message, /configuration SMS.*service client/i);
});

test("l’éligibilité acquise subsiste après désactivation et rejet ultérieur du Sender", () => {
  const restaurant = new RestaurantModel({ name: "Test" });
  restaurant.reservationsSettings.smsReminder.selfServiceEligible = true;
  restaurant.reservationsSettings.smsReminder.sender = {
    value: "SAVEURS",
    status: "rejected",
  };
  restaurant.options.sms_reminders = false;
  assert.equal(
    restaurant.reservationsSettings.smsReminder.selfServiceEligible,
    true,
  );
});

test("la réactivation utilise la déduplication fixe plus metered du catalogue", () => {
  assert.match(routeSource, /buildSubscriptionItemUpdatePayload/);
  assert.match(routeSource, /proration_behavior: "create_prorations"/);
  assert.match(routeSource, /sms-self-service-\$\{idempotencyKey\}/);
});

test("l’opération persistée protège les retries et garde l’échec documentaire récupérable", () => {
  const restaurant = new RestaurantModel({ name: "Test" });
  Object.assign(
    restaurant.reservationsSettings.smsReminder.selfServiceOperation,
    {
    idempotencyKey: "operation-idempotente-1",
    action: "reactivate",
    status: "document_failed",
    },
  );
  assert.equal(
    restaurant.reservationsSettings.smsReminder.selfServiceOperation.status,
    "document_failed",
  );
  assert.match(routeSource, /operation\?\.status === "completed"/);
  assert.match(routeSource, /operation\?\.status === "document_failed"/);
});

test("un document self-service accepté est final et ne contient aucune preuve graphique", () => {
  const document = new DocumentModel({
    type: "CONTRACT",
    docNumber: "WD-C-SELF-A1",
    status: "ACCEPTED",
    contractKind: "AMENDMENT",
    party: { restaurantName: "Test", email: "owner@example.com" },
    acceptanceMode: "SELF_SERVICE",
    selfServiceAcceptance: {
      actionType: "SMS_REACTIVATED",
      acceptedAt: new Date(),
      effectiveAt: new Date(),
      acceptedByUserId: "owner-1",
      restaurantId: "507f1f77bcf86cd799439011",
      idempotencyKey: "operation-idempotente-2",
      previousCommercialSnapshot: {},
      newCommercialSnapshot: {},
    },
  });
  assert.equal(document.validateSync(), undefined);
  assert.equal(document.status, "ACCEPTED");
  assert.equal(document.signature.signatureImageHash, "");
});

test("l’UI explicite les trois actions et la valeur contractuelle du clic", () => {
  assert.match(uiSource, /Confirmer la résiliation/);
  assert.match(uiSource, /Annuler la résiliation/);
  assert.match(uiSource, /Confirmer la réactivation/);
  assert.match(uiSource, /vous acceptez la modification de votre abonnement/);
  assert.match(uiSource, /Résiliation programmée/);
});

test("le flow admin classique continue de préparer un brouillon d’avenant", () => {
  assert.match(adminSubscriptionSource, /prepareSubscriptionAmendment/);
  assert.match(adminSubscriptionSource, /brouillon d'avenant/);
  assert.doesNotMatch(adminSubscriptionSource, /finalizeSelfServiceAmendment/);
});
