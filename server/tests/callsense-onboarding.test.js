const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../models/callsense/callsense-onboarding.model");
const Config = require("../models/callsense/callsense-config.model");
const Restaurant = require("../models/restaurant.model");
const service = require("../services/callsense-onboarding.service");
const { encryptToken, decryptToken } = require("../services/callsense-secrets.service");
const { newDomainName } = require("../services/callsense-sip-domain.service");
const A = "aaaaaaaaaaaaaaaaaaaaaaaa", B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const accountA = `AC${"a".repeat(32)}`, accountB = `AC${"b".repeat(32)}`;
process.env.CALLSENSE_ENCRYPTION_KEY = "22".repeat(32);
const originalAttemptExists = Draft.exists;
const originalRestaurantFindById = Restaurant.findById;
Draft.exists = async () => true;
Restaurant.findById = (id) => ({ select: () => ({ lean: async () => ({ name: id === A ? "Restaurant A" : "Restaurant B" }) }) });
test.after(() => { Draft.exists = originalAttemptExists; Restaurant.findById = originalRestaurantFindById; });

test("clé absente ou invalide : erreur explicite avant accès MongoDB ou Twilio", async () => {
  const key = process.env.CALLSENSE_ENCRYPTION_KEY;
  const originalConfigExists = Config.exists;
  let calls = 0;
  Config.exists = async () => { calls++; return false; };
  const makeClient = () => { calls++; throw new Error("Client Twilio appelé"); };
  try {
    for (const value of ["", "invalide"]) {
      process.env.CALLSENSE_ENCRYPTION_KEY = value;
      await assert.rejects(service.createAccount(A, "admin", { confirm: true, makeClient }), (err) => err.status === 503 && err.expose === true && /Clé de chiffrement CallSense absente ou invalide/.test(err.message));
    }
    assert.equal(calls, 0);
  } finally { process.env.CALLSENSE_ENCRYPTION_KEY = key; Config.exists = originalConfigExists; }
});

test("création confirmée, concurrence et isolation de deux restaurants", async () => {
  const originals = { find: Draft.findOneAndUpdate, update: Draft.updateOne, exists: Config.exists };
  const records = new Map([[A, { _id: A, restaurantId: A, accountOperation: "not_started" }], [B, { _id: B, restaurantId: B, accountOperation: "not_started" }]]);
  let calls = 0;
  Config.exists = async () => false;
  Draft.findOneAndUpdate = async (filter, update) => {
    const record = records.get(filter.restaurantId || filter._id);
    if (!record || (typeof filter.accountOperation === "string" && record.accountOperation !== filter.accountOperation) || (filter.accountSid && record.accountSid)) return null;
    Object.assign(record, update.$set);
    return { ...record };
  };
  Draft.updateOne = async () => ({});
  const names = [];
  const makeClient = () => ({ client: { api: { accounts: { create: async ({ friendlyName }) => {
    names.push(friendlyName);
    calls += 1;
    await new Promise((resolve) => setImmediate(resolve));
    return { sid: calls === 1 ? accountA : accountB, authToken: "secret-token" };
  } } } } });
  try {
    await assert.rejects(service.createAccount(A, "admin", { makeClient }), /Confirmation/);
    assert.equal(calls, 0);
    const first = service.createAccount(A, "admin", { confirm: true, makeClient });
    const repeat = service.createAccount(A, "admin", { confirm: true, makeClient });
    const results = await Promise.allSettled([first, repeat]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(calls, 1);
    await service.createAccount(B, "admin", { confirm: true, makeClient });
    assert.equal(calls, 2);
    assert.deepEqual(names, ["Gusto CallSense - Restaurant A", "Gusto CallSense - Restaurant B"]);
    assert.equal(records.get(A).accountSid, accountA);
    assert.equal(records.get(B).accountSid, accountB);
    assert.equal(decryptToken(records.get(A).encryptedAuthToken, A, accountA), "secret-token");
    assert.throws(() => decryptToken(records.get(A).encryptedAuthToken, B, accountA));
    assert.equal(results.find((result) => result.status === "fulfilled").value.encryptedAuthToken, undefined);
  } finally { Draft.findOneAndUpdate = originals.find; Draft.updateOne = originals.update; Config.exists = originals.exists; }
});

test("erreur Twilio : aucune création répétée et installation active protégée", async () => {
  const originals = { find: Draft.findOneAndUpdate, update: Draft.updateOne, exists: Config.exists };
  const record = { _id: A, restaurantId: A, accountOperation: "not_started" };
  let live = false, calls = 0;
  Config.exists = async () => live;
  Draft.findOneAndUpdate = async (filter, update) => {
    if (record.accountOperation !== filter.accountOperation) return null;
    Object.assign(record, update.$set); return { ...record };
  };
  Draft.updateOne = async (_filter, update) => { Object.assign(record, update.$set); };
  const makeClient = () => ({ client: { api: { accounts: { create: async () => { calls++; throw new Error("network"); } } } } });
  try {
    await assert.rejects(service.createAccount(A, "admin", { confirm: true, makeClient }), /incertain/);
    assert.equal(record.accountOperation, "uncertain");
    await assert.rejects(service.createAccount(A, "admin", { confirm: true, makeClient }), /déjà lancée/);
    assert.equal(calls, 1);
    live = true;
    await assert.rejects(service.createAccount(A, "admin", { confirm: true, makeClient }), /installation existante/);
    assert.equal(calls, 1);
  } finally { Draft.findOneAndUpdate = originals.find; Draft.updateOne = originals.update; Config.exists = originals.exists; }
});

test("une opération de sous-compte révoquée ne déclenche pas de création Twilio", async () => {
  const originals = { find: Draft.findOneAndUpdate, update: Draft.updateOne, exists: Config.exists, attempt: Draft.exists };
  let writes = 0;
  Config.exists = async () => false;
  Draft.findOneAndUpdate = async () => ({ _id: A });
  Draft.exists = async () => false;
  Draft.updateOne = async () => ({ matchedCount: 0 });
  const makeClient = () => ({ client: { api: { accounts: { create: async () => { writes++; } } } } });
  try {
    await assert.rejects(service.createAccount(A, "admin", { confirm: true, makeClient }), /incertain/);
    assert.equal(writes, 0);
  } finally { Draft.findOneAndUpdate = originals.find; Draft.updateOne = originals.update; Config.exists = originals.exists; Draft.exists = originals.attempt; }
});

test("association et reprise vérifient le propriétaire et les identifiants du sous-compte", async () => {
  const originals = { find: Draft.findOneAndUpdate, exists: Config.exists };
  const mainSid = `AC${"c".repeat(32)}`;
  let ownerSid = mainSid, update;
  Config.exists = async () => false;
  Draft.findOneAndUpdate = async (_filter, value) => { update = value; return { restaurantId: A, ...value.$set }; };
  const makeClient = () => ({ sid: mainSid, client: { api: { accounts: () => ({ fetch: async () => ({ ownerAccountSid: ownerSid, status: "active", authToken: "secret" }) }) } } });
  const makeTwilio = () => ({ api: { accounts: () => ({ fetch: async () => ({ sid: accountA }) }) } });
  try {
    const result = await service.associateAccount(A, "admin", { sid: accountA, confirm: true, makeClient, makeTwilio });
    assert.equal(result.accountSid, accountA);
    assert.equal(result.encryptedAuthToken, undefined);
    assert.equal(decryptToken(update.$set.encryptedAuthToken, A, accountA), "secret");
    ownerSid = accountB;
    await assert.rejects(service.associateAccount(B, "admin", { sid: accountA, confirm: true, makeClient, makeTwilio }), /sous-compte actif/);
    const key = process.env.CALLSENSE_ENCRYPTION_KEY;
    delete process.env.CALLSENSE_ENCRYPTION_KEY;
    await assert.rejects(service.createAccount(A, "admin", { confirm: true, makeClient }));
    process.env.CALLSENSE_ENCRYPTION_KEY = key;
  } finally { Draft.findOneAndUpdate = originals.find; Config.exists = originals.exists; }
});

test("recherche de numéros limitée au compte du restaurant, sans achat", async () => {
  const original = Draft.findOne;
  Draft.findOne = (filter) => ({ select: () => ({ lean: async () => ({ accountSid: filter.restaurantId === A ? accountA : accountB, encryptedAuthToken: encryptToken("secret", filter.restaurantId, filter.restaurantId === A ? accountA : accountB) }) }) });
  const calls = [];
  const makeTwilio = (sid, token) => ({ availablePhoneNumbers: (country) => ({ local: { list: async (options) => {
    calls.push({ sid, token, country, options });
    return [{ phoneNumber: "+33123456789", capabilities: { voice: true }, unrelatedSecret: "never-return" }];
  } } }) });
  try {
    const result = await service.listNumbers(A, { makeTwilio });
    await service.listNumbers(B, { makeTwilio });
    assert.deepEqual(calls.map((call) => call.sid), [accountA, accountB]);
    assert.ok(calls.every((call) => call.country === "FR" && call.options.voiceEnabled));
    assert.equal(result[0].unrelatedSecret, undefined);
  } finally { Draft.findOne = original; }
});

test("consultation des ressources et conformité sans exposition des secrets", async () => {
  const original = Draft.findOne;
  Draft.findOne = () => ({ select: () => ({ lean: async () => ({ accountSid: accountA, encryptedAuthToken: encryptToken("secret", A, accountA), regulatoryBundleSid: "BUtest" }) }) });
  const makeTwilio = (sid) => {
    assert.equal(sid, accountA);
    return { incomingPhoneNumbers: { list: async () => [{ phoneNumber: "+33123456789", sid: "PNtest", extra: "private" }] },
      sip: { domains: { list: async () => [{ domainName: "example.sip.twilio.com", sipRegistration: true }] } },
      numbers: { v2: { regulatoryCompliance: { bundles: () => ({ fetch: async () => ({ sid: "BUtest", status: "pending-review", secret: "private" }) }) } } } };
  };
  try {
    const result = await service.inspectResources(A, { makeTwilio });
    assert.equal(result.bundle.status, "pending-review");
    assert.equal(result.domains[0].sipRegistration, true);
    assert.ok(!JSON.stringify(result).includes("private"));
  } finally { Draft.findOne = original; }
});
test("inventaire : le numéro attribué absent de la liste est vérifié par SID", async () => {
  const original = Draft.findOne, pn = `PN${"c".repeat(32)}`;
  Draft.findOne = () => ({ select: () => ({ lean: async () => ({ accountSid: accountA, encryptedAuthToken: encryptToken("secret", A, accountA), phoneNumberSid: pn, twilioNumber: "+33339109767" }) }) });
  const incoming = sid => ({ fetch: async () => ({ sid, accountSid: accountA, phoneNumber: "+33339109767" }) }); incoming.list = async () => [];
  try {
    const result = await service.inspectResources(A, { makeTwilio: () => ({ incomingPhoneNumbers: incoming, sip: { domains: { list: async () => [] } } }) });
    assert.equal(result.numbers.length, 1); assert.equal(result.numbers[0].sid, pn); assert.equal(result.numbers[0].phoneNumber, "+33339109767");
  } finally { Draft.findOne = original; }
});

test("création SIP confirmée et vérifiée, sans répétition", async () => {
  const originals = { find: Draft.findOneAndUpdate, update: Draft.updateOne, exists: Config.exists };
  const record = { _id: A, restaurantId: A, accountSid: accountA, accountOperation: "completed", domainOperation: "not_started", encryptedAuthToken: encryptToken("secret", A, accountA) };
  const domainSid = `SD${"d".repeat(32)}`;
  let creates = 0;
  Config.exists = async () => false;
  Draft.findOneAndUpdate = (filter, update) => {
    const valid = record.domainOperation === filter.domainOperation;
    if (valid) Object.assign(record, update.$set);
    const promise = Promise.resolve(valid ? { ...record } : null);
    promise.select = () => promise;
    return promise;
  };
  Draft.updateOne = async (_filter, update) => { Object.assign(record, update.$set); return { matchedCount: 1 }; };
  const domains = (sid) => ({ fetch: async () => ({ sid, accountSid: accountA, domainName: newDomainName(A, accountA), sipRegistration: true }) });
  domains.create = async ({ domainName, sipRegistration }) => { creates++; assert.equal(domainName, newDomainName(A, accountA)); assert.equal(sipRegistration, true); return { sid: domainSid }; };
  const makeTwilio = () => ({ sip: { domains } });
  try {
    await assert.rejects(service.createDomain(A, "admin", { makeTwilio }), /Confirmation/);
    const result = await service.createDomain(A, "admin", { confirm: true, makeTwilio });
    assert.equal(result.domainOperation, "completed");
    assert.equal(result.sipDomainSid, domainSid);
    await assert.rejects(service.createDomain(A, "admin", { confirm: true, makeTwilio }), /déjà lancée/);
    assert.equal(creates, 1);
  } finally { Draft.findOneAndUpdate = originals.find; Draft.updateOne = originals.update; Config.exists = originals.exists; }
});
test("refus SIP 21232 explicite : reprise possible sans état incertain", async () => {
  const originals = { find: Draft.findOneAndUpdate, update: Draft.updateOne, exists: Config.exists };
  const record = { _id: A, restaurantId: A, accountSid: accountA, accountOperation: "completed", domainOperation: "not_started", encryptedAuthToken: encryptToken("secret", A, accountA) };
  Config.exists = async () => false;
  Draft.findOneAndUpdate = (_filter, update) => { Object.assign(record, update.$set); const result = Promise.resolve({ ...record }); result.select = () => result; return result; };
  Draft.updateOne = async (_filter, update) => { Object.assign(record, update.$set); return { matchedCount: 1 }; };
  const domainSid = `SD${"d".repeat(32)}`;
  let attempts = 0;
  const domains = sid => ({ fetch: async () => ({ sid, accountSid: accountA, domainName: newDomainName(A, accountA), sipRegistration: true }) });
  domains.create = async () => { if (++attempts === 1) throw Object.assign(new Error("données confidentielles"), { status: 400, code: 21232 }); return { sid: domainSid }; };
  try {
    await assert.rejects(service.createDomain(A, "admin", { confirm: true, makeTwilio: () => ({ sip: { domains } }) }), /Twilio a refusé/);
    assert.equal(record.domainOperation, "not_started"); assert.equal(record.domainFailure.phase, "creation"); assert.equal(record.domainFailure.status, 400); assert.equal(record.domainFailure.code, "21232"); assert.doesNotMatch(JSON.stringify(record.domainFailure), /confidentielles/);
    const resumed = await service.createDomain(A, "admin", { confirm: true, makeTwilio: () => ({ sip: { domains } }) });
    assert.equal(resumed.domainOperation, "completed"); assert.equal(resumed.sipDomainSid, domainSid); assert.equal(attempts, 2);
  } finally { Draft.findOneAndUpdate = originals.find; Draft.updateOne = originals.update; Config.exists = originals.exists; }
});

test("noms SIP distincts pour restaurants et sous-comptes, syntaxe et longueur DNS valides", () => {
  const names = [newDomainName(A, accountA), newDomainName(B, accountB), newDomainName(A, accountB)];
  assert.equal(new Set(names).size, names.length);
  for (const name of names) {
    assert.match(name, /^[a-z0-9-]+\.sip\.twilio\.com$/);
    assert.ok(name.split(".")[0].length <= 63);
  }
  assert.notEqual(names[0], `gusto-${A}.sip.twilio.com`);
  assert.throws(() => newDomainName(A, "ACinvalid"), /invalides/);
});

test("échec réseau SIP : conserver le verrou incertain et le nom tenté", async () => {
  const originals = { find: Draft.findOneAndUpdate, update: Draft.updateOne, exists: Config.exists };
  const record = { _id: A, accountSid: accountA, accountOperation: "completed", domainOperation: "not_started", encryptedAuthToken: encryptToken("secret", A, accountA) };
  Config.exists = async () => false;
  Draft.findOneAndUpdate = (_filter, update) => { Object.assign(record, update.$set); const result = Promise.resolve({ ...record }); result.select = () => result; return result; };
  let attemptedName;
  Draft.updateOne = async (_filter, update) => { if (update.$set["operationAttempts.domain.domainName"]) attemptedName = update.$set["operationAttempts.domain.domainName"]; Object.assign(record, update.$set); return { matchedCount: 1 }; };
  const domains = () => ({}); domains.create = async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); };
  try {
    await assert.rejects(service.createDomain(A, "admin", { confirm: true, makeTwilio: () => ({ sip: { domains } }) }), /incertain/);
    assert.equal(record.domainOperation, "uncertain");
    assert.equal(attemptedName, newDomainName(A, accountA));
    assert.equal(record.domainFailure.code, "ETIMEDOUT");
  } finally { Draft.findOneAndUpdate = originals.find; Draft.updateOne = originals.update; Config.exists = originals.exists; }
});

test("association d'un numéro du sous-compte et refus d'un numéro étranger", async () => {
  const originalFind = Draft.findOne, originalUpdate = Draft.findOneAndUpdate, originalExists = Config.exists;
  const pn = `PN${"c".repeat(32)}`;
  let account = accountA;
  Draft.findOne = () => ({ select: () => ({ lean: async () => ({ accountSid: accountA, encryptedAuthToken: encryptToken("secret", A, accountA) }) }) });
  Draft.findOneAndUpdate = async (_filter, update) => ({ restaurantId: A, ...update.$set });
  Config.exists = async () => false;
  const makeTwilio = () => ({ incomingPhoneNumbers: (sid) => ({ fetch: async () => ({ sid, accountSid: account, phoneNumber: "+33123456789", capabilities: { voice: true } }) }) });
  try {
    const result = await service.associateNumber(A, "admin", { sid: pn, confirm: true, makeTwilio });
    assert.equal(result.twilioNumber, "+33123456789");
    account = accountB;
    await assert.rejects(service.associateNumber(A, "admin", { sid: pn, confirm: true, makeTwilio }), /sous-compte/);
    await assert.rejects(service.associateNumber(A, "admin", { sid: pn, makeTwilio }), /confirmation/i);
  } finally { Draft.findOne = originalFind; Draft.findOneAndUpdate = originalUpdate; Config.exists = originalExists; }
});

test("achat exige confirmation, prix cohérent et Bundle approuvé ; sans doublon", async () => {
  const originalFind = Draft.findOne, originalUpdate = Draft.findOneAndUpdate, originalExists = Config.exists, originalWrite = Draft.updateOne;
  const pn = `PN${"c".repeat(32)}`, bundleSid = `BU${"e".repeat(32)}`;
  const state = { _id: A, restaurantId: A, accountSid: accountA, encryptedAuthToken: encryptToken("secret", A, accountA), regulatoryBundleSid: bundleSid, numberOperation: "not_started" };
  let purchases = 0, bundleStatus = "twilio-approved", regulationCountry = "FR", available = true, locality = "Paris", candidateNumber = "+33123456789", failPurchase = false, requirement = "none", rejectAddress = false, rejectionCode = 21631, existingNumbers = [];
  const addressSid = `AD${"f".repeat(32)}`;
  const searches = [];
  Draft.findOne = () => ({ select: () => ({ lean: async () => ({ ...state }) }) });
  Draft.findOneAndUpdate = async (filter, update) => {
    if (filter.$or && state.numberOperation !== "not_started" && state.numberOperation !== undefined) return null;
    if (filter.numberOperation && filter.numberOperation !== state.numberOperation) return null;
    Object.assign(state, update.$set); return { ...state };
  };
  Draft.updateOne = async (_filter, update) => { Object.assign(state, update.$set); return { modifiedCount: 1 }; };
  Config.exists = async () => false;
  const incomingPhoneNumbers = (sid) => ({ fetch: async () => ({ sid, accountSid: accountA, phoneNumber: candidateNumber, capabilities: { voice: true } }) });
  let purchaseBody;
  incomingPhoneNumbers.create = async (body) => { purchases++; purchaseBody = body; if (failPurchase) throw Object.assign(new Error("secret externe"), { status: 503, code: 21631 }); if (rejectAddress) throw Object.assign(new Error("refus"), { status: 400, code: rejectionCode }); return { sid: pn }; };
  incomingPhoneNumbers.list = async () => { if (existingNumbers === null) throw new Error("indisponible"); return existingNumbers; };
  let addressRows = [{ sid: addressSid, accountSid: accountA, validated: true, isoCountry: "FR", city: "Paris" }];
  const addresses = (sid) => ({ fetch: async () => addressRows.find(row => row.sid === sid) });
  addresses.list = async () => addressRows;
  const makeTwilio = () => ({ incomingPhoneNumbers, addresses,
    availablePhoneNumbers: () => ({ local: { list: async (options) => { searches.push(options); return available && (!options.contains || candidateNumber.includes(options.contains)) ? [{ phoneNumber: candidateNumber, locality, capabilities: { voice: true }, addressRequirements: requirement, beta: false }, { phoneNumber: "+33912345678", locality: "France", capabilities: { voice: true }, addressRequirements: "local", beta: false }, { phoneNumber: "+33111111111", locality: "Paris", capabilities: { voice: true }, addressRequirements: "local", beta: true }] : [{ phoneNumber: "+33123450000", locality: "Paris", capabilities: { voice: true }, addressRequirements: requirement, beta: false }]; } } }),
    pricing: { v1: { phoneNumbers: { countries: () => ({ fetch: async () => ({ priceUnit: "EUR", phoneNumberPrices: [{ number_type: "local", current_price: "1.00" }, { number_type: "national", current_price: "1.00" }] }) }) } } },
    numbers: { v2: { regulatoryCompliance: { bundles: () => ({ fetch: async () => ({ sid: bundleSid, accountSid: accountA, status: bundleStatus, regulationSid: "RNtest" }), itemAssignments: { list: async () => [{ objectSid: `RD${"a".repeat(32)}`, accountSid: accountA, bundleSid }] } }), supportingDocuments: sid => ({ fetch: async () => ({ sid, accountSid: accountA, status: "approved", attributes: { address_sids: [addressSid] } }) }), regulations: () => ({ fetch: async () => ({ isoCountry: regulationCountry, numberType: "local", endUserType: "business" }) }) } } } });
  const params = { phoneNumber: "+33123456789", numberType: "local", amount: "1.00", currency: "EUR", makeTwilio };
  try {
    await assert.rejects(service.buyNumber(A, "admin", params), /Confirmation/);
    await assert.rejects(service.buyNumber(A, "admin", { ...params, phoneNumber: "+33973921894", confirm: true }), /01 à 05/);
    assert.equal(purchases, 0);
    state.regulatoryBundleSid = "";
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true }), /approuvé/);
    assert.equal(purchases, 0);
    state.regulatoryBundleSid = bundleSid;
    bundleStatus = "pending-review";
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true }), /approuvé/);
    assert.equal(purchases, 0);
    bundleStatus = "twilio-rejected";
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true }), /approuvé/);
    assert.equal(purchases, 0);
    bundleStatus = "twilio-approved";
    locality = "Dole"; candidateNumber = "+33339960186";
    const pilotQuote = await service.quoteNumbers(A, { makeTwilio, numberPrefix: "+333" });
    assert.deepEqual(pilotQuote.numbers.map(number => number.phoneNumber), [candidateNumber]); assert.equal(searches.at(-1).contains, "+333");
    const nationalQuote = await service.quoteNumbers(A, { makeTwilio });
    assert.deepEqual(nationalQuote.numbers.map(number => number.phoneNumber), [candidateNumber]);
    assert.equal(searches.at(-1).inLocality, undefined); assert.equal(purchases, 0);
    locality = "Paris"; candidateNumber = "+33123456789";
    available = false;
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true }), /Numéro ou prix modifié/);
    assert.equal(state.numberOperation, "not_started"); assert.equal(purchases, 0);
    available = true;
    state.automation = { maxAmount: "0.95", currency: "EUR" };
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true }), /plafond mensuel/); assert.equal(purchases, 0);
    state.automation = { maxAmount: "2.00", currency: "USD" };
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true }), /plafond mensuel/); assert.equal(purchases, 0);
    state.automation = { maxAmount: "1.50", currency: "EUR" };
    await assert.rejects(service.buyNumber(A, "admin", { ...params, amount: "1.01", confirm: true }), /Numéro ou prix modifié/);
    await assert.rejects(service.buyNumber(A, "admin", { ...params, currency: "USD", confirm: true }), /Numéro ou prix modifié/);
    assert.equal(state.numberOperation, "not_started"); assert.equal(purchases, 0);
    regulationCountry = "BE";
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true }), /compatible/);
    assert.equal(purchases, 0);
    regulationCountry = "FR";
    const originalLog = console.error, logs = [];
    console.error = (...args) => logs.push(args.join(" "));
    try {
      failPurchase = true;
      await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true }), /Achat incertain/);
      assert.equal(state.numberOperation, "uncertain");
      assert.match(logs.join(" "), /achat_twilio/); assert.match(logs.join(" "), /21631/); assert.doesNotMatch(logs.join(" "), /secret externe/);
    } finally { console.error = originalLog; }
    failPurchase = false; purchases = 0; state.numberOperation = "not_started";
    requirement = "local";
    addressRows = [];
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true }), /adresse française du dossier approuvé/); assert.equal(purchases, 0);
    addressRows = [{ sid: addressSid, accountSid: accountA, validated: true, isoCountry: "FR", city: "Paris" }, { sid: `AD${"1".repeat(32)}`, accountSid: accountA, validated: true, isoCountry: "FR", city: "Paris" }];
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true, addressSid: `AD${"1".repeat(32)}` }), /ne correspond pas au justificatif/); assert.equal(purchases, 0);
    addressRows = [addressRows[0]];
    rejectAddress = true;
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true, addressSid, addressConfirmed: true }), /Achat refusé par Twilio/);
    assert.equal(state.numberOperation, "not_started"); assert.equal(purchaseBody.addressSid, addressSid); assert.equal(purchaseBody.bundleSid, bundleSid);
    rejectionCode = 21649;
    candidateNumber = "+33339960186"; locality = "Dole";
    await assert.rejects(service.buyNumber(A, "admin", { ...params, phoneNumber: candidateNumber, confirm: true, addressSid }), /dossier de conformité/);
    assert.equal(purchaseBody.phoneNumber, candidateNumber); assert.equal(purchaseBody.addressSid, addressSid); assert.equal(purchaseBody.bundleSid, bundleSid);
    assert.equal(state.lastNumberRejection.phoneNumber, candidateNumber); assert.equal(state.lastNumberRejection.code, 21649); assert.match(state.lastNumberRejection.reason, /Bundle/);
    candidateNumber = "+33123456789"; locality = "Paris";
    assert.equal(state.numberOperation, "not_started");
    existingNumbers = [{ sid: pn }];
    const oldLog = console.error; console.error = () => {};
    try { await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true, addressSid }), /Achat incertain/); assert.equal(state.numberOperation, "uncertain"); } finally { console.error = oldLog; }
    existingNumbers = null; state.numberOperation = "not_started";
    console.error = () => {};
    try { await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true, addressSid }), /Achat incertain/); assert.equal(state.numberOperation, "uncertain"); } finally { console.error = oldLog; }
    existingNumbers = []; state.numberOperation = "not_started";
    rejectAddress = false; purchases = 0;
    const result = await service.buyNumber(A, "admin", { ...params, confirm: true });
    assert.equal(result.numberOperation, "completed");
    assert.ok(searches.every((search) => search.inLocality === undefined));
    await assert.rejects(service.buyNumber(A, "admin", { ...params, confirm: true, addressSid, addressConfirmed: true }), /déjà lancé/);
    assert.equal(purchases, 1);
    delete state.phoneNumberSid; delete state.twilioNumber; state.numberOperation = "not_started";
    candidateNumber = "+33339960186"; locality = "Dole";
    const differentArea = await service.buyNumber(A, "admin", { ...params, phoneNumber: candidateNumber, confirm: true });
    assert.equal(differentArea.numberOperation, "completed"); assert.equal(purchaseBody.phoneNumber, candidateNumber); assert.equal(purchaseBody.bundleSid, bundleSid); assert.equal(purchaseBody.addressSid, addressSid); assert.equal(purchases, 2);
  } finally { Draft.findOne = originalFind; Draft.findOneAndUpdate = originalUpdate; Draft.updateOne = originalWrite; Config.exists = originalExists; }
});

test("le SDK Twilio sérialise les trois paramètres d’achat sans requête réseau", async () => {
  const twilio = require("twilio"), sid = `AC${"a".repeat(32)}`, bundleSid = `BU${"b".repeat(32)}`, addressSid = `AD${"c".repeat(32)}`;
  let request;
  const client = twilio(sid, "jeton-fictif", { httpClient: { request: async options => { request = options; return { statusCode: 201, body: { sid: `PN${"d".repeat(32)}`, account_sid: sid, phone_number: "+33339960186" } }; } } });
  await client.incomingPhoneNumbers.create({ phoneNumber: "+33339960186", bundleSid, addressSid });
  assert.equal(request.method, "post"); assert.match(request.uri, new RegExp(`/Accounts/${sid}/IncomingPhoneNumbers\\.json$`));
  assert.deepEqual(request.data, { PhoneNumber: "+33339960186", BundleSid: bundleSid, AddressSid: addressSid });
});

test("réconciliation d'un domaine existant après résultat incertain", async () => {
  const originalFind = Draft.findOne, originalUpdate = Draft.findOneAndUpdate, originalExists = Config.exists;
  const sd = `SD${"d".repeat(32)}`;
  const draft = { accountSid: accountA, encryptedAuthToken: encryptToken("secret", A, accountA), domainOperation: "uncertain" };
  Draft.findOne = () => ({ select: () => ({ lean: async () => draft }) });
  Draft.findOneAndUpdate = async (_filter, update) => ({ restaurantId: A, ...update.$set });
  Config.exists = async () => false;
  let name = `gusto-${A}.sip.twilio.com`;
  const makeTwilio = () => ({ sip: { domains: (sid) => ({ fetch: async () => ({ sid, accountSid: accountA, domainName: name, sipRegistration: true }) }) } });
  try {
    assert.equal((await service.associateDomain(A, "admin", { sid: sd, confirm: true, makeTwilio })).domainOperation, "completed");
    name = `gusto-${B}.sip.twilio.com`;
    await assert.rejects(service.associateDomain(A, "admin", { sid: sd, confirm: true, makeTwilio }), /en attente/);
  } finally { Draft.findOne = originalFind; Draft.findOneAndUpdate = originalUpdate; Config.exists = originalExists; }
});

test("checklist valide les champs et protège une installation existante", async () => {
  const router = require("../routes/callsense-onboarding.routes");
  const handler = router.stack.find((layer) => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/checklist").route.stack.at(-1).handle;
  const originalFind = Draft.findOneAndUpdate, originalDraft = Draft.findOne, originalRestaurant = Restaurant.findById, originalConfig = Config.findOne;
  let live = false, updates = 0;
  Config.findOne = () => ({ lean: async () => live ? { managedByOnboarding: false } : null });
  Restaurant.findById = () => ({ select: () => ({ lean: async () => ({ name: "Test", address: { line1: "1 rue", zipCode: "75001", city: "Paris", country: "France" }, phone: "01", email: "a@b.fr" }) }) });
  Draft.findOne = () => ({ lean: async () => ({ accountSid: accountA, regulatoryBundleSid: "BUtest", regulatoryApproval: { bundleSid: "BUtest", accountSid: accountA, status: "twilio-approved", compatible: true }, phoneNumberSid: "PNtest", twilioNumber: "+33123456789", numberOperation: "completed", sipDomain: "test", sipUsername: "user", sipCredentialOperation: "completed", fallbackFunction: { operation: "completed", url: "https://example.test" }, fallbackProbeAt: new Date(), fallbackProbeUrl: "https://example.test", fallbackProbeSipUri: "sip:user@test", webhookOperation: "completed", forwardingScenario: "direct", checklist: { terminalConnected: true } }) });
  Draft.findOneAndUpdate = async (filter, update) => { updates++; assert.equal(filter.restaurantId, A); return { restaurantId: A, checklist: update.$set.checklist }; };
  const checklist = Object.fromEntries(["terminalConnected", "operatorForwarding", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"].map((key) => [key, false]));
  const req = { params: { restaurantId: A }, user: { id: "admin" }, body: { checklist } };
  const response = () => ({ status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  try {
    let res = response(); await handler(req, res); assert.equal(res.value.checklist.incomingTest, false); assert.equal(updates, 1);
    res = response(); await handler({ ...req, body: { checklist: { ...checklist, incomingTest: "true" } } }, res); assert.equal(res.code, 400); assert.equal(updates, 1);
    res = response(); await handler({ ...req, body: { checklist: { ...checklist, fallbackTest: true } } }, res); assert.equal(res.code, 409); assert.match(res.value.message, /Confirmez d’abord/); assert.equal(updates, 1);
    live = true; res = response(); await handler(req, res); assert.equal(res.code, 409); assert.equal(updates, 1);
  } finally { Draft.findOneAndUpdate = originalFind; Draft.findOne = originalDraft; Restaurant.findById = originalRestaurant; Config.findOne = originalConfig; }
});

test("checklist : persistance et rechargement des seuls essais validés, secours confirmé séparément", async () => {
  const router = require("../routes/callsense-onboarding.routes");
  const handler = router.stack.find(layer => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/checklist").route.stack.at(-1).handle;
  const old = { find: Draft.findOne, update: Draft.findOneAndUpdate, restaurant: Restaurant.findById, config: Config.findOne };
  const url = "https://example.twil.io/fallback";
  const draft = { restaurantId: A, accountSid: accountA, regulatoryBundleSid: "BUtest", regulatoryApproval: { bundleSid: "BUtest", accountSid: accountA, status: "twilio-approved", compatible: true }, phoneNumberSid: "PNtest", twilioNumber: "+33300000000", numberOperation: "completed", sipDomain: "test", sipUsername: "user", sipCredentialOperation: "completed", fallbackFunction: { operation: "completed", url }, fallbackProbeAt: new Date(), fallbackProbeUrl: url, fallbackProbeSipUri: "sip:user@test", voiceFallbackUrl: url, webhookOperation: "completed", forwardingScenario: "direct", checklist: { terminalConnected: true } };
  Config.findOne = () => ({ lean: async () => ({ managedByOnboarding: true, provisioningStatus: "ready_for_test", enabled: false }) });
  Restaurant.findById = () => ({ select: () => ({ lean: async () => ({ name: "Test", address: { line1: "1 rue", zipCode: "75001", city: "Paris", country: "FR" }, phone: "01", email: "a@b.fr" }) }) });
  Draft.findOne = () => ({ lean: async () => structuredClone(draft) });
  Draft.findOneAndUpdate = async (_filter, update) => { draft.checklist = structuredClone(update.$set.checklist); return structuredClone(draft); };
  const fields = ["terminalConnected", "operatorForwarding", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"];
  const checklist = Object.fromEntries(fields.map(key => [key, ["terminalConnected", "incomingTest", "popupTest", "fallbackBackendOutage", "missedTest"].includes(key)]));
  const req = { params: { restaurantId: A }, user: { id: "admin" }, body: { checklist } };
  const response = () => ({ status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  try {
    let res = response(); await handler(req, res); assert.equal(res.value.checklist.fallbackBackendOutage, true);
    let reloaded = await Draft.findOne({ restaurantId: A }).lean(); assert.deepEqual(reloaded.checklist, checklist);
    res = response(); await handler({ ...req, body: { checklist: { ...checklist, fallbackTest: true } } }, res); assert.equal(res.code, 409);
    reloaded = await Draft.findOne({ restaurantId: A }).lean(); assert.deepEqual(reloaded.checklist, checklist);
    draft.verifiedFallbackUrl = url; draft.checklist.fallbackTest = true;
    res = response(); await handler({ ...req, body: { checklist: { ...checklist, fallbackTest: true } } }, res);
    assert.equal(res.value.checklist.fallbackTest, true); assert.equal((await Draft.findOne({ restaurantId: A }).lean()).checklist.outgoingTest, false);
  } finally { Draft.findOne = old.find; Draft.findOneAndUpdate = old.update; Restaurant.findById = old.restaurant; Config.findOne = old.config; }
});

test("erreur Twilio brute masquée dans la réponse administrative", async () => {
  const router = require("../routes/callsense-onboarding.routes");
  const handler = router.stack.find((layer) => layer.route?.path === "/admin/restaurants/:restaurantId/callsense-onboarding/resources").route.stack.at(-1).handle;
  const original = service.inspectResources;
  service.inspectResources = async () => { throw Object.assign(new Error("secret-in-external-error"), { status: 400 }); };
  const res = { status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  try {
    await handler({ params: { restaurantId: A } }, res);
    assert.equal(res.code, 500); assert.ok(!JSON.stringify(res.value).includes("secret-in-external-error"));
  } finally { service.inspectResources = original; }
});
