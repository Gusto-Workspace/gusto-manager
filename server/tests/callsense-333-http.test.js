// End-to-end purchase path with the real Twilio serializer and an intercepted
// transport. All database and Twilio reads are simulated; no socket is opened.
const test = require("node:test");
const assert = require("node:assert/strict");
const twilio = require("twilio");
const RequestClient = require("twilio/lib/base/RequestClient");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const { encryptToken } = require("../services/callsense-secrets.service");
const service = require("../services/callsense-onboarding.service");

test("achat +333 : formulaire HTTP Twilio réel intercepté sans réseau", async t => {
  const originalKey = process.env.CALLSENSE_ENCRYPTION_KEY;
  process.env.CALLSENSE_ENCRYPTION_KEY = "a1".repeat(32);
  t.after(() => { if (originalKey === undefined) delete process.env.CALLSENSE_ENCRYPTION_KEY; else process.env.CALLSENSE_ENCRYPTION_KEY = originalKey; });
  const restaurantId = "69c69539571da19061ac7fda", accountSid = "TWILIO_IDENTIFIER_REMOVED_1", bundleSid = "TWILIO_IDENTIFIER_REMOVED_6", addressSid = "TWILIO_IDENTIFIER_REMOVED_5", number = "+33339109448", documentSid = `RD${"1".repeat(32)}`;
  const state = { _id: "draft", restaurantId, accountSid, regulatoryBundleSid: bundleSid, numberOperation: "not_started", automation: { maxAmount: "1.50", currency: "USD" }, encryptedAuthToken: encryptToken("faux-jeton", restaurantId, accountSid) };
  let intercepted, writes = 0;
  const http = new RequestClient();
  http.axios = async request => { if (intercepted) throw new Error("unexpected second HTTP request"); intercepted = request; return { status: 400, data: { code: 21649, message: "fake refusal" }, headers: {} }; };
  const sdk = twilio(accountSid, "faux-jeton", { httpClient: http });
  const incoming = () => ({ fetch: async () => { throw new Error("Aucun numéro ne doit être acheté"); } });
  incoming.create = params => sdk.incomingPhoneNumbers.create(params);
  incoming.list = async () => [];
  const address = { sid: addressSid, accountSid, validated: true, isoCountry: "FR", city: "Paris" };
  const addresses = () => ({ fetch: async () => address }); addresses.list = async () => [address];
  const fakeClient = { incomingPhoneNumbers: incoming, addresses,
    availablePhoneNumbers: country => { assert.equal(country, "FR"); return { local: { list: async options => { assert.equal(options.voiceEnabled, true); assert.equal(options.contains, number); return [{ phoneNumber: number, beta: false, capabilities: { voice: true }, addressRequirements: "local" }]; } } }; },
    pricing: { v1: { phoneNumbers: { countries: () => ({ fetch: async () => ({ priceUnit: "USD", phoneNumberPrices: [{ number_type: "local", current_price: "1.35" }, { number_type: "national", current_price: "1.35" }] }) }) } } },
    numbers: { v2: { regulatoryCompliance: { bundles: () => ({ fetch: async () => ({ sid: bundleSid, accountSid, status: "twilio-approved", regulationSid: "RN-fictif" }), itemAssignments: { list: async () => [{ objectSid: documentSid, accountSid, bundleSid }] } }), supportingDocuments: sid => ({ fetch: async () => ({ sid, accountSid, status: "approved", attributes: { address_sids: [addressSid] } }) }), regulations: () => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }) } } } };
  t.mock.method(Draft, "findOne", () => ({ select: () => ({ lean: async () => ({ ...state }) }) }));
  t.mock.method(Draft, "findOneAndUpdate", async (_filter, update) => { Object.assign(state, update.$set); return { ...state }; });
  t.mock.method(Draft, "updateOne", async (_filter, update) => { Object.assign(state, update.$set); writes++; return { modifiedCount: 1 }; });
  t.mock.method(Draft, "exists", async () => true);
  t.mock.method(Config, "exists", async () => false);
  await assert.rejects(service.buyNumber(restaurantId, "admin-fictif", { phoneNumber: number, numberType: "local", amount: "1.35", currency: "USD", confirm: true, addressSid, makeTwilio: sid => { assert.equal(sid, accountSid); return fakeClient; } }), /dossier de conformité/);
  assert.equal(intercepted.method, "post");
  assert.equal(intercepted.url, `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`);
  assert.equal(intercepted.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(typeof intercepted.data, "string");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(intercepted.data)), { PhoneNumber: number, BundleSid: bundleSid, AddressSid: addressSid });
  assert.equal(writes, 1); assert.equal(state.numberOperation, "not_started"); assert.equal(state.lastNumberRejection.code, 21649);
});

test("les routes manuelle et automatique envoient le même formulaire Twilio", async t => {
  const previousKey = process.env.CALLSENSE_ENCRYPTION_KEY;
  process.env.CALLSENSE_ENCRYPTION_KEY = "a1".repeat(32);
  t.after(() => { if (previousKey === undefined) delete process.env.CALLSENSE_ENCRYPTION_KEY; else process.env.CALLSENSE_ENCRYPTION_KEY = previousKey; });
  const provisioning = require("../services/callsense-provisioning.service"), Restaurant = require("../models/restaurant.model"), router = require("../routes/callsense-onboarding.routes");
  const restaurantId = "69c69539571da19061ac7fda", accountSid = "TWILIO_IDENTIFIER_REMOVED_1", bundleSid = "TWILIO_IDENTIFIER_REMOVED_6", addressSid = "TWILIO_IDENTIFIER_REMOVED_5", number = "+33339109448", documentSid = `RD${"1".repeat(32)}`;
  const requests = [], http = new RequestClient();
  http.axios = async request => { requests.push({ method: request.method, url: request.url, type: request.headers["Content-Type"], body: request.data }); return { status: 400, data: { code: 21649, message: "refus simulé" }, headers: {} }; };
  const sdk = twilio(accountSid, "faux-jeton", { httpClient: http });
  const incoming = () => ({ fetch: async () => { throw new Error("unexpected fetch"); } }); incoming.create = params => sdk.incomingPhoneNumbers.create(params); incoming.list = async () => [];
  const address = { sid: addressSid, accountSid, validated: true, isoCountry: "FR", city: "Paris" }, addresses = () => ({ fetch: async () => address }); addresses.list = async () => [address];
  const client = { incomingPhoneNumbers: incoming, addresses,
    availablePhoneNumbers: () => ({ local: { list: async () => [{ phoneNumber: number, beta: false, capabilities: { voice: true }, addressRequirements: "local" }] } }),
    pricing: { v1: { phoneNumbers: { countries: () => ({ fetch: async () => ({ priceUnit: "USD", phoneNumberPrices: [{ number_type: "local", current_price: "1.35" }, { number_type: "national", current_price: "1.35" }] }) }) } } },
    numbers: { v2: { regulatoryCompliance: { bundles: () => ({ fetch: async () => ({ sid: bundleSid, accountSid, status: "twilio-approved", regulationSid: "RN-fictif" }), itemAssignments: { list: async () => [{ objectSid: documentSid, accountSid, bundleSid }] } }), supportingDocuments: sid => ({ fetch: async () => ({ sid, accountSid, status: "approved", attributes: { address_sids: [addressSid] } }) }), regulations: () => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }) } } } };
  const makeTwilio = sid => { assert.equal(sid, accountSid); return client; };
  const fresh = () => ({ _id: "draft", restaurantId, accountSid, regulatoryBundleSid: bundleSid, regulatoryAddress: { sid: addressSid }, numberOperation: "not_started", accountOperation: "completed", automation: { maxAmount: "1.50", currency: "USD", functionAccepted: true }, encryptedAuthToken: encryptToken("faux-jeton", restaurantId, accountSid) });
  let state = fresh(), purchaseCalls = 0;
  const apply = update => { for (const [key, value] of Object.entries(update.$set || {})) { const parts = key.split("."); if (parts.length === 2) { state[parts[0]] ||= {}; state[parts[0]][parts[1]] = value; } else state[key] = value; } for (const key of Object.keys(update.$unset || {})) delete state[key]; };
  t.mock.method(Draft, "findOne", () => ({ lean: async () => ({ ...state }), select: () => ({ lean: async () => ({ ...state }) }) }));
  t.mock.method(Draft, "findOneAndUpdate", async (filter, update) => { if (filter.$or?.some(item => item.numberOperation) && state.numberOperation !== "not_started") return null; apply(update); return { ...state }; });
  t.mock.method(Draft, "updateOne", async (_filter, update) => { apply(update); return { matchedCount: 1, modifiedCount: 1 }; });
  t.mock.method(Draft, "exists", async () => true);
  t.mock.method(Config, "exists", async () => false);
  t.mock.method(Config, "findOne", () => ({ lean: async () => null }));
  t.mock.method(Restaurant, "findById", () => ({ select: () => ({ lean: async () => ({ name: "Fictif", address: { line1: "1 rue", zipCode: "75001", city: "Paris", country: "France" }, phone: "+33123456789", email: "test@example.test" }) }) }));
  const originalBuy = service.buyNumber, originalQuote = service.quoteNumbers, originalRun = provisioning.runOnboarding;
  t.mock.method(service, "buyNumber", async (id, actor, options) => { purchaseCalls++; return originalBuy(id, actor, { ...options, makeTwilio }); });
  t.mock.method(provisioning, "queueTechnical", async () => { state.automation.status = "running"; state.automation.phase = "technical"; state.automation.resumeMode = "technical"; return state; });
  const onboarding = { quoteNumbers: (id, options) => originalQuote(id, { ...options, makeTwilio }), buyNumber: (...args) => service.buyNumber(...args), inspectCompliance: async () => ({ bundle: { sid: bundleSid, status: "twilio-approved", compatible: true } }) };
  t.mock.method(provisioning, "runOnboarding", (id, actor, options) => originalRun(id, actor, { ...options, onboarding }));
  const invoke = async (suffix, body) => { const layer = router.stack.find(item => item.route?.path?.endsWith(suffix)); const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } }; await layer.route.stack.at(-1).handle({ params: { restaurantId }, user: { id: "admin-fictif" }, body }, res); return res; };
  const manual = await invoke("/number-purchase", { phoneNumber: number, numberType: "local", amount: "1.35", currency: "USD", addressSid, confirm: true, technicalConfirm: true, functionConfirm: true });
  assert.equal(manual.code, 409); assert.equal(state.numberOperation, "not_started");
  state = fresh();
  const automatic = await invoke("/automation", { confirm: true, maxAmount: "1.50", currency: "USD", functionConsent: true });
  assert.equal(automatic.code, 200); assert.equal(automatic.value.status, "error"); assert.equal(state.numberOperation, "not_started");
  assert.equal(purchaseCalls, 2); assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0].method, "post"); assert.equal(requests[0].type, "application/x-www-form-urlencoded");
  assert.equal(requests[0].url, `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(requests[0].body)), { PhoneNumber: number, BundleSid: bundleSid, AddressSid: addressSid });
  state = fresh(); state.numberOperation = "uncertain";
  const lockedManual = await invoke("/number-purchase", { phoneNumber: number, numberType: "local", amount: "1.35", currency: "USD", addressSid, confirm: true, technicalConfirm: true, functionConfirm: true });
  assert.equal(lockedManual.code, 409);
  state = fresh(); state.numberOperation = "uncertain";
  const lockedAutomatic = await invoke("/automation", { confirm: true, maxAmount: "1.50", currency: "USD", functionConsent: true });
  assert.equal(lockedAutomatic.value.phase, "number"); assert.equal(lockedAutomatic.value.status, "waiting");
  assert.equal(requests.length, 2);
});
