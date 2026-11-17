// Local-only route test with synthetic JWT sessions and two disposable restaurants.
require("dotenv").config({ quiet: true });
process.env.JWT_SECRET = "callsense-local-integration-only";
const sessionPath = require.resolve("../../services/shared/account-session.service");
require.cache[sessionPath] = { id: sessionPath, filename: sessionPath, loaded: true, exports: { isAccountSessionValid: async () => true } };
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");
const Restaurant = require("../../models/restaurant.model");
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const service = require("../../services/callsense/callsense-onboarding.service");
const provisioning = require("../../services/callsense/callsense-provisioning.service");
const fallback = require("../../services/callsense/callsense-fallback.service");
const router = require("../../routes/callsense-onboarding.routes");

async function main() {
  if (process.env.CALLSENSE_TEST_INTEGRATION !== "1" || !process.env.CONNECTION_STRING_TEST) throw new Error("Configuration de test requise");
  await mongoose.connect(process.env.CONNECTION_STRING_TEST, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  if (!/(^|[-_])test($|[-_])/i.test(mongoose.connection.db.databaseName)) throw new Error("Base de test requise");
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const marker = `CallSense UI test ${new mongoose.Types.ObjectId()}`;
  process.env.CALLSENSE_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.CALLSENSE_PUBLIC_ORIGIN = "https://integration.gusto.example";
  const sid = (prefix) => `${prefix}${new mongoose.Types.ObjectId().toString().padStart(32, "0")}`;
  const accountSid = sid("AC"), associatedSid = sid("AC"), mainSid = sid("AC"), numberSid = sid("PN"), domainSid = sid("SD"), listSid = sid("CL"), credentialSid = sid("CR"), bundleSid = sid("BU"), fallbackUrl = `https://handler.twilio.com/twiml/${sid("EH")}`;
  const phone = `+339${String(parseInt(new mongoose.Types.ObjectId().toString().slice(-6), 16) % 100000000).padStart(8, "0")}`;
  let bundleStatus = "pending-review", domainName = "", mapped = false, username = "", purchases = 0, accounts = 0;
  let number = { sid: numberSid, accountSid, phoneNumber: phone, capabilities: { voice: true } };
  const incomingPhoneNumbers = () => ({ fetch: async () => ({ ...number }), update: async (value) => { number = { ...number, ...value }; return number; } });
  incomingPhoneNumbers.create = async () => { purchases++; return { sid: numberSid }; };
  incomingPhoneNumbers.list = async () => [];
  const domains = () => ({ fetch: async () => ({ sid: domainSid, accountSid, domainName, sipRegistration: true }), auth: { registrations: { credentialListMappings: { list: async () => mapped ? [{ sid: listSid }] : [], create: async () => { mapped = true; } } } } });
  domains.create = async (value) => { domainName = value.domainName; return { sid: domainSid }; };
  domains.list = async () => [];
  const credentials = () => ({ fetch: async () => ({ sid: credentialSid, accountSid, username }) });
  credentials.create = async (value) => { username = value.username; return { sid: credentialSid }; };
  const lists = () => ({ credentials });
  lists.create = async () => ({ sid: listSid });
  const fakeTwilio = () => ({ incomingPhoneNumbers, sip: { domains, credentialLists: lists }, api: { accounts: (sid) => ({ fetch: async () => ({ sid }) }) },
    availablePhoneNumbers: () => ({ local: { list: async () => [{ phoneNumber: phone, addressRequirements: "none", capabilities: { voice: true } }] } }),
    pricing: { v1: { phoneNumbers: { countries: () => ({ fetch: async () => ({ priceUnit: "EUR", phoneNumberPrices: [{ number_type: "local", current_price: "1.00" }, { number_type: "national", current_price: "1.00" }] }) }) } } },
    numbers: { v2: { regulatoryCompliance: { bundles: (id) => ({ fetch: async () => ({ sid: id, accountSid, status: bundleStatus, regulationSid: sid("RN") }) }), regulations: () => ({ fetch: async () => ({ isoCountry: "FR", numberType: "local", endUserType: "business" }) }) } } } });
  const accountApi = (sid) => ({ fetch: async () => ({ sid, ownerAccountSid: mainSid, status: "active", authToken: "synthetic-test-token" }) });
  accountApi.create = async () => { accounts++; return { sid: accountSid, authToken: "synthetic-test-token" }; };
  const fakeMain = () => ({ sid: mainSid, client: { api: { accounts: accountApi } } });
  for (const name of ["listNumbers", "quoteNumbers", "inspectResources"]) { const original = service[name]; service[name] = (id) => original(id, { makeTwilio: fakeTwilio }); }
  for (const name of ["buyNumber", "createDomain"]) { const original = service[name]; service[name] = (id, actor, options) => original(id, actor, { ...options, makeTwilio: fakeTwilio }); }
  { const original = service.createAccount; service.createAccount = (id, actor, options) => original(id, actor, { ...options, makeClient: fakeMain }); }
  { const original = service.associateAccount; service.associateAccount = (id, actor, options) => original(id, actor, { ...options, makeClient: fakeMain, makeTwilio: fakeTwilio }); }
  for (const name of ["configureSip", "configureWebhooks", "setStatus"]) { const original = provisioning[name]; provisioning[name] = (id, actor, options) => original(id, actor, { ...options, makeTwilio: fakeTwilio, probeFallback: async () => ({}) }); }
  fallback.probe = async (draft, url) => ({ url, sipUri: fallback.sipUri(draft) });
  let server;
  try {
    await Restaurant.collection.insertMany(ids.map((_id) => ({ _id, name: marker })));
    const app = express(); app.use(express.json()); app.use("/api", router);
    server = await new Promise((resolve, reject) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); instance.on("error", reject); });
    const request = (id, suffix, role, body, method) => fetch(`http://127.0.0.1:${server.address().port}/api/admin/restaurants/${id}/callsense-onboarding${suffix}`, {
      method: method || (body ? "PUT" : "GET"), headers: { "content-type": "application/json", ...(role ? { authorization: `Bearer ${jwt.sign({ id: "synthetic-admin", role }, process.env.JWT_SECRET)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal((await request(ids[0], "", null)).status, 403);
    assert.equal((await request(ids[0], "", "seller")).status, 403);
    await require("./callsense-check-frontend-bridge").checkFrontend(`http://127.0.0.1:${server.address().port}`, ids[0], jwt.sign({ id: "synthetic-admin", role: "admin" }, process.env.JWT_SECRET));
    for (let step = 0; step < 7; step += 1) {
      assert.equal((await request(ids[0], "/progress", "admin", { step })).status, 200);
      const state = await (await request(ids[0], "", "admin")).json();
      assert.equal(state.draft.wizardStep, step);
    }
    assert.equal((await request(ids[0], "", "admin", { terminalType: "HT813", regulatoryBundleSid: "", operator: "test" })).status, 200);
    const first = await (await request(ids[0], "", "admin")).json();
    const second = await (await request(ids[1], "", "admin")).json();
    assert.equal(first.draft.wizardStep, 6); assert.equal(first.draft.terminalType, "HT813"); assert.equal(second.draft, null);
    assert.ok(!JSON.stringify(first).includes("encryptedAuthToken"));
    const post = (suffix, body) => request(ids[0], suffix, "admin", body, "POST");
    assert.equal((await post("/account", { confirm: true })).status, 200);
    assert.equal((await post("/account", { confirm: true })).status, 409); assert.equal(accounts, 1);
    assert.equal((await request(ids[1], "/progress", "admin", { step: 0 })).status, 200);
    assert.equal((await request(ids[1], "/associate-account", "admin", { accountSid: associatedSid, confirm: true }, "POST")).status, 200);
    assert.equal((await request(ids[1], "", "admin")).status, 200);
    const otherDraft = (await (await request(ids[1], "", "admin")).json()).draft;
    assert.equal(otherDraft.accountSid, associatedSid);
    const purchase = { phoneNumber: phone, numberType: "local", amount: "1.00", currency: "EUR", confirm: true };
    assert.equal((await post("/number-purchase", purchase)).status, 409); assert.equal(purchases, 0);
    assert.equal((await request(ids[0], "", "admin", { terminalType: "HT813", regulatoryBundleSid: bundleSid, operator: "test" })).status, 200);
    const quote = await (await request(ids[0], "/number-quote", "admin")).json();
    assert.equal(quote.bundle.status, "pending-review");
    assert.equal((await post("/number-purchase", purchase)).status, 409); assert.equal(purchases, 0);
    bundleStatus = "twilio-rejected"; assert.equal((await post("/number-purchase", purchase)).status, 409); assert.equal(purchases, 0);
    bundleStatus = "twilio-approved"; assert.equal((await post("/number-purchase", purchase)).status, 200);
    assert.equal((await post("/number-purchase", purchase)).status, 409); assert.equal(purchases, 1);
    assert.equal((await post("/domain", { confirm: true })).status, 200);
    assert.equal((await post("/sip-credentials", { confirm: true })).status, 200);
    assert.equal((await post("/fallback-probe", { fallbackUrl })).status, 200);
    assert.equal((await post("/fallback-verification", { fallbackUrl, confirm: true })).status, 200);
    assert.equal((await post("/webhooks", { fallbackUrl, confirm: true })).status, 200);
    assert.equal((await post("/status", { status: "active", confirm: true })).status, 409);
    assert.equal((await post("/status", { status: "ready_for_test", confirm: true })).status, 200);
    const fields = ["terminalConnected", "operatorForwarding", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"];
    assert.equal((await request(ids[0], "/checklist", "admin", { checklist: Object.fromEntries(fields.map((key) => [key, true])) })).status, 200);
    assert.equal((await post("/status", { status: "active", confirm: true })).status, 200);
    assert.equal((await post("/status", { status: "suspended", confirm: true })).status, 200);
    assert.equal((await post("/status", { status: "ready_for_test", confirm: true })).status, 200);
    assert.equal((await Config.findOne({ restaurantId: ids[0] }).lean()).enabled, true);
    assert.equal(await Config.exists({ restaurantId: ids[1] }), null);
    const finalState = await (await request(ids[0], "", "admin")).json();
    assert.equal(finalState.draft.wizardStep, 6); assert.doesNotMatch(JSON.stringify(finalState), /synthetic-test-token|encryptedAuthToken/);
    console.log("Routes et persistance : sept étapes, sous-compte, conformité, achat, SIP, secours, webhooks, activation et suspension vérifiés avec Twilio simulé.");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await Draft.deleteMany({ restaurantId: { $in: ids } });
    await Config.deleteMany({ restaurantId: { $in: ids }, accountSid });
    await Restaurant.collection.deleteMany({ _id: { $in: ids }, name: marker });
    assert.equal(await Draft.countDocuments({ restaurantId: { $in: ids } }), 0);
    assert.equal(await Config.countDocuments({ restaurantId: { $in: ids }, accountSid }), 0);
    assert.equal(await Restaurant.countDocuments({ _id: { $in: ids }, name: marker }), 0);
    console.log("Nettoyage des données temporaires vérifié.");
  }
}
main().catch(() => { console.error("Vérification administrative échouée ; aucun détail sensible affiché."); process.exitCode = 1; }).finally(() => mongoose.disconnect());
