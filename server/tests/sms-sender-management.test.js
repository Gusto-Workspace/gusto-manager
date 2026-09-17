const test = require("node:test");
const assert = require("node:assert/strict");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_sender_management";

const {
  applyRestaurantSmsSettings,
  serializeSettings,
} = require("../routes/sms-reminders.routes");
const {
  configureAdminSender,
  resolveAdminSenderUpdate,
  verifyConfiguredSender,
} = require("../routes/admin/sms-reminders.routes");
const {
  DEFAULT_SMS_TEMPLATE,
} = require("../services/sms/sms-message.service");

function restaurantSettings() {
  return {
    enabled: false,
    delayMinutes: 1440,
    deliveryMode: "sms_always",
    template: DEFAULT_SMS_TEMPLATE,
    internationalEnabled: false,
    billingPeriodSpendingLimit: null,
    sender: { value: "SAVEURS", status: "approved" },
    commercialDeactivation: { status: "none" },
  };
}

function validRestaurantPayload(overrides = {}) {
  return {
    enabled: true,
    delayMinutes: 120,
    deliveryMode: "eco",
    template: DEFAULT_SMS_TEMPLATE,
    internationalEnabled: true,
    billingPeriodSpendingLimit: 10,
    ...overrides,
  };
}

test("la sauvegarde restaurateur sans sender conserve le Sender ID existant", () => {
  const settings = restaurantSettings();
  applyRestaurantSmsSettings(settings, validRestaurantPayload());

  assert.deepEqual(settings.sender, {
    value: "SAVEURS",
    status: "approved",
  });
  assert.deepEqual(settings.commercialDeactivation, { status: "none" });
  assert.equal(settings.enabled, true);
  assert.equal(settings.delayMinutes, 120);
});

test("un sender forgé dans la requête restaurateur est ignoré", () => {
  const settings = restaurantSettings();
  applyRestaurantSmsSettings(
    settings,
    validRestaurantPayload({
      sender: { value: "PIRATE", status: "rejected" },
    }),
  );

  assert.deepEqual(settings.sender, {
    value: "SAVEURS",
    status: "approved",
  });
  assert.equal(Object.hasOwn(serializeSettings(settings), "sender"), false);
});

test("l'admin configure un Sender ID absent avec le statut pending", () => {
  assert.deepEqual(resolveAdminSenderUpdate({}, { value: " SAVEURS " }), {
    value: "SAVEURS",
    status: "pending",
  });
});

test("l'admin modifie un Sender ID approved et le replace en pending", () => {
  assert.deepEqual(
    resolveAdminSenderUpdate(
      { value: "SAVEURS", status: "approved" },
      { value: "ATELIER" },
    ),
    { value: "ATELIER", status: "pending" },
  );
});

test("une sauvegarde admin sans changement conserve approved", () => {
  assert.deepEqual(
    resolveAdminSenderUpdate(
      { value: "SAVEURS", status: "approved" },
      { value: " SAVEURS " },
    ),
    { value: "SAVEURS", status: "approved" },
  );
});

test("l'admin peut rejeter mais pas approuver sans vérification smsmode", () => {
  const sender = { value: "SAVEURS", status: "pending" };
  assert.throws(
    () => resolveAdminSenderUpdate(sender, { status: "approved" }),
    /vérification auprès de smsmode/,
  );
  assert.equal(
    resolveAdminSenderUpdate(sender, { status: "rejected" }).status,
    "rejected",
  );
});

function fakeRestaurant(sender = {}) {
  return {
    reservationsSettings: { smsReminder: { sender: { ...sender } } },
    saveCount: 0,
    async save() {
      this.saveCount += 1;
    },
  };
}

test("configure SAVEURS et l'approuve si smsmode le confirme", async () => {
  const restaurant = fakeRestaurant();
  const result = await configureAdminSender(
    restaurant,
    { value: "SAVEURS" },
    {
      async senderExists(value) {
        assert.equal(value, "SAVEURS");
        return { exists: true, channelId: "channel-1", channelName: "main" };
      },
    },
  );

  assert.deepEqual(result.sender, { value: "SAVEURS", status: "approved" });
  assert.equal(result.verification.status, "verified");
  assert.equal(restaurant.saveCount, 2);
});

test("configure RESTOB et le conserve pending s'il est absent de smsmode", async () => {
  const restaurant = fakeRestaurant();
  const result = await configureAdminSender(
    restaurant,
    { value: "RESTOB" },
    { async senderExists() { return { exists: false }; } },
  );

  assert.deepEqual(result.sender, { value: "RESTOB", status: "pending" });
  assert.equal(result.verification.status, "not_found");
});

test("une nouvelle vérification approuve un Sender ID devenu disponible", async () => {
  const restaurant = fakeRestaurant({ value: "RESTOB", status: "pending" });
  const result = await verifyConfiguredSender(restaurant, {
    async senderExists() { return { exists: true }; },
  });

  assert.equal(result.sender.status, "approved");
  assert.equal(restaurant.reservationsSettings.smsReminder.sender.status, "approved");
});

test("une indisponibilité smsmode conserve la valeur et le statut pending", async () => {
  const restaurant = fakeRestaurant({ value: "SAVEURS", status: "approved" });
  const result = await configureAdminSender(
    restaurant,
    { value: "ATELIER" },
    { async senderExists() { throw new Error("timeout"); } },
  );

  assert.deepEqual(result.sender, { value: "ATELIER", status: "pending" });
  assert.equal(result.verification.status, "unavailable");
  assert.equal(restaurant.reservationsSettings.smsReminder.sender.value, "ATELIER");
});

test("une même valeur approved n'est pas revérifiée", async () => {
  const restaurant = fakeRestaurant({ value: "SAVEURS", status: "approved" });
  let calls = 0;
  const result = await configureAdminSender(
    restaurant,
    { value: " SAVEURS " },
    { async senderExists() { calls += 1; } },
  );

  assert.equal(result.sender.status, "approved");
  assert.equal(result.verification.status, "not_required");
  assert.equal(calls, 0);
});

test("une valeur modifiée présente/absente finit approved/pending", async () => {
  for (const exists of [true, false]) {
    const restaurant = fakeRestaurant({ value: "SAVEURS", status: "approved" });
    const result = await configureAdminSender(
      restaurant,
      { value: "ATELIER" },
      { async senderExists() { return { exists }; } },
    );
    assert.equal(result.sender.status, exists ? "approved" : "pending");
  }
});

test("la route admin refuse les Sender IDs vides ou invalides", () => {
  assert.throws(
    () => resolveAdminSenderUpdate({}, { value: "" }),
    /3 à 11 caractères/,
  );
  assert.throws(
    () => resolveAdminSenderUpdate({}, { value: "BEAUCOUP-TROP-LONG" }),
    /3 à 11 caractères/,
  );
  assert.throws(
    () => resolveAdminSenderUpdate({}, { status: "approved" }),
    /3 à 11 caractères/,
  );
});
