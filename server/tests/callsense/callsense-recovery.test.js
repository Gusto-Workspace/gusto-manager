const test = require("node:test");
const assert = require("node:assert/strict");
const Draft = require("../../models/callsense/callsense-onboarding.model");
const Config = require("../../models/callsense/callsense-config.model");
const recovery = require("../../services/callsense/callsense-recovery.service");
const A = "aaaaaaaaaaaaaaaaaaaaaaaa", B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const main = `AC${"a".repeat(32)}`, child = `AC${"b".repeat(32)}`;
const now = () => new Date("2026-11-11T12:10:00.000Z");

test("le nom mémorisé retrouve une opération incertaine sans attribuer un homonyme", async () => {
  const state = { restaurantId: A, accountOperation: "uncertain", accountRequestedName: "Gusto CallSense - Restaurant A", operationAttempts: { account: { id: "old", startedAt: new Date("2026-11-11T12:00:00Z") } }, updatedAt: new Date("2026-11-11T12:00:00Z"), audit: [] };
  const restore = store(state);
  const getMain = () => ({ sid: main, client: { api: { accounts: { list: async ({ friendlyName }) => [{ sid: child, ownerAccountSid: main, friendlyName, status: "active" }] } } } });
  try { const result = await recovery.inspect(A, "admin", "account", { getMain, now }); assert.equal(result.evidence, "ambiguous"); assert.equal(result.resources[0].sid, child); }
  finally { restore(); }
});

function setPath(target, path, value) {
  const keys = path.split("."); let object = target;
  for (const key of keys.slice(0, -1)) object = object[key] ||= {};
  object[keys.at(-1)] = value;
}
function getPath(target, path) { return path.split(".").reduce((value, key) => value?.[key], target); }
function removePath(target, path) { const keys = path.split("."); const parent = keys.length === 1 ? target : getPath(target, keys.slice(0, -1).join(".")); if (parent) delete parent[keys.at(-1)]; }
function store(state) {
  const previous = { find: Draft.findOne, update: Draft.findOneAndUpdate, config: Config.findOne };
  Draft.findOne = ({ restaurantId }) => ({ lean: async () => restaurantId === state.restaurantId ? structuredClone(state) : null });
  Config.findOne = () => ({ lean: async () => null });
  Draft.findOneAndUpdate = async (query, update) => {
    for (const [key, value] of Object.entries(query)) {
      const actual = getPath(state, key);
      if (value instanceof Date) { if (new Date(actual).getTime() !== value.getTime()) return null; }
      else if (value && typeof value === "object" && value.$in) { if (!value.$in.includes(actual ?? null)) return null; }
      else if (value === null && actual == null) continue;
      else if (actual !== value) return null;
    }
    for (const [key, value] of Object.entries(update.$set || {})) setPath(state, key, value);
    for (const key of Object.keys(update.$unset || {})) removePath(state, key);
    for (const [key, value] of Object.entries(update.$push || {})) { const list = getPath(state, key) || []; list.push(value); setPath(state, key, list); }
    state.updatedAt = now();
    return structuredClone(state);
  };
  return () => { Draft.findOne = previous.find; Draft.findOneAndUpdate = previous.update; Config.findOne = previous.config; };
}

test("inspection sans création, confirmation et reprise explicite après interruption", async () => {
  const state = { restaurantId: A, accountOperation: "pending", operationAttempts: { account: { id: "old", startedAt: new Date("2026-11-11T12:00:00Z") } }, updatedAt: new Date("2026-11-11T12:00:00Z"), audit: [] };
  const restore = store(state); let writesToTwilio = 0;
  const getMain = () => ({ sid: main, client: { api: { accounts: { list: async () => [], create: async () => { writesToTwilio++; } } } } });
  try {
    const result = await recovery.inspect(A, "admin", "account", { getMain, now });
    assert.equal(result.evidence, "absent"); assert.equal(writesToTwilio, 0);
    await assert.rejects(recovery.unlock(A, "admin", { operation: "account", inspectionId: result.id, acknowledgement: "oui", resetAbsent: true, now }));
    await recovery.unlock(A, "admin", { operation: "account", inspectionId: result.id, acknowledgement: recovery.RESET_ACK, resetAbsent: true, now, getMain });
    assert.equal(state.accountOperation, "not_started"); assert.equal(writesToTwilio, 0);
    assert.ok(state.audit.some((entry) => entry.action === "recovery_reset_account"));
    await assert.rejects(recovery.unlock(A, "admin", { operation: "account", inspectionId: result.id, acknowledgement: recovery.RESET_ACK, resetAbsent: true, now }));
  } finally { restore(); }
});

test("compte existant : rapprochement sans réinitialisation et isolation", async () => {
  const state = { restaurantId: A, accountOperation: "uncertain", operationAttempts: { account: { id: "old", startedAt: new Date("2026-11-11T12:00:00Z") } }, updatedAt: new Date("2026-11-11T12:00:00Z"), audit: [] };
  const restore = store(state);
  const getMain = () => ({ sid: main, client: { api: { accounts: { list: async () => [{ sid: child, ownerAccountSid: main, friendlyName: `Gusto CallSense ${A}`, status: "active", authToken: "do-not-return" }] } } } });
  try {
    await assert.rejects(recovery.inspect(B, "admin", "account", { getMain, now }));
    const result = await recovery.inspect(A, "admin", "account", { getMain, now });
    assert.equal(result.evidence, "found"); assert.equal(result.resources[0].sid, child);
    assert.ok(!JSON.stringify(result).includes("do-not-return"));
    await assert.rejects(recovery.unlock(A, "admin", { operation: "account", inspectionId: result.id, acknowledgement: recovery.RESET_ACK, resetAbsent: true, now }), /absence/);
    await recovery.unlock(A, "admin", { operation: "account", inspectionId: result.id, acknowledgement: recovery.ACK, now });
    assert.equal(state.accountOperation, "uncertain"); assert.equal(state.operationAttempts.account, undefined);
  } finally { restore(); }
});

test("une opération récente ou une vérification périmée ne peut pas être débloquée", async () => {
  const state = { restaurantId: A, accountOperation: "pending", operationAttempts: { account: { id: "old", startedAt: new Date("2026-11-11T12:09:30Z") } }, updatedAt: new Date("2026-11-11T12:09:30Z"), audit: [] };
  const restore = store(state);
  const getMain = () => ({ sid: main, client: { api: { accounts: { list: async () => [] } } } });
  try {
    const result = await recovery.inspect(A, "admin", "account", { getMain, now });
    await assert.rejects(recovery.unlock(A, "admin", { operation: "account", inspectionId: result.id, acknowledgement: recovery.ACK, now }), /attendez/);
    const later = () => new Date("2026-11-11T12:20:01Z");
    await assert.rejects(recovery.unlock(A, "admin", { operation: "account", inspectionId: result.id, acknowledgement: recovery.ACK, now: later }), /expirée/);
    assert.equal(state.accountOperation, "pending");
  } finally { restore(); }
});

test("l'absence est revérifiée juste avant la réinitialisation", async () => {
  const state = { restaurantId: A, accountOperation: "uncertain", operationAttempts: { account: { id: "old", startedAt: new Date("2026-11-11T12:00:00Z") } }, updatedAt: new Date("2026-11-11T12:00:00Z"), audit: [] };
  const restore = store(state); let reads = 0;
  const getMain = () => ({ sid: main, client: { api: { accounts: { list: async () => ++reads === 1 ? [] : [{ sid: child, ownerAccountSid: main, friendlyName: `Gusto CallSense ${A}`, status: "active" }] } } } });
  try {
    const result = await recovery.inspect(A, "admin", "account", { getMain, now });
    assert.equal(result.evidence, "absent");
    await assert.rejects(recovery.unlock(A, "admin", { operation: "account", inspectionId: result.id, acknowledgement: recovery.RESET_ACK, resetAbsent: true, now, getMain }), /situation Twilio/);
    assert.equal(state.accountOperation, "uncertain"); assert.equal(reads, 2);
  } finally { restore(); }
});

test("recherche des ressources numéro, domaine et SIP sans mutation Twilio", async () => {
  const pn = `PN${"c".repeat(32)}`, sd = `SD${"d".repeat(32)}`, cl = `CL${"e".repeat(32)}`, cr = `CR${"f".repeat(32)}`;
  const state = { restaurantId: A, accountSid: child, numberOperation: "pending", domainOperation: "pending", sipCredentialOperation: "uncertain", pendingNumber: "+33123456789", sipDomainSid: sd, sipUsername: `g${A}`, operationAttempts: {}, updatedAt: new Date("2026-11-11T12:00:00Z"), audit: [] };
  const restore = store(state);
  const lists = () => ({ credentials: { list: async () => [{ sid: cr, username: `g${A}`, password: "not-returned" }] } });
  lists.list = async () => [{ sid: cl, friendlyName: `Gusto CallSense ${A}` }];
  const domains = () => ({ auth: { registrations: { credentialListMappings: { list: async () => [{ sid: cl }] } } } });
  domains.list = async () => [{ sid: sd, domainName: `gusto-${A}.sip.twilio.com`, sipRegistration: true }];
  const getClient = async () => ({ draft: { accountSid: child }, client: {
    incomingPhoneNumbers: { list: async () => [{ sid: pn, accountSid: child, phoneNumber: "+33123456789" }, { sid: "wrong", accountSid: main, phoneNumber: "+33123456789" }] },
    sip: { domains, credentialLists: lists },
  } });
  try {
    let result = await recovery.inspect(A, "admin", "number", { getClient, now });
    assert.equal(result.evidence, "found"); assert.equal(result.resources[0].sid, pn); assert.equal(result.resources.length, 1);
    result = await recovery.inspect(A, "admin", "domain", { getClient, now });
    assert.equal(result.evidence, "found"); assert.equal(result.resources[0].sid, sd);
    result = await recovery.inspect(A, "admin", "sip", { getClient, now });
    assert.equal(result.evidence, "found"); assert.equal(result.resources[0].credentials[0].sid, cr);
    assert.ok(!JSON.stringify(result).includes("not-returned"));
  } finally { restore(); }
});

test("inspection d'une installation historique interdite", async () => {
  const state = { restaurantId: A, activationOperation: "pending", updatedAt: new Date("2026-11-11T12:00:00Z"), audit: [] };
  const restore = store(state);
  Config.findOne = () => ({ lean: async () => ({ managedByOnboarding: false }) });
  try { await assert.rejects(recovery.inspect(A, "admin", "activation", { now }), /historique protégée/); }
  finally { restore(); }
});

test("Twilio indisponible ne prouve jamais une absence", async () => {
  const state = { restaurantId: A, accountOperation: "uncertain", operationAttempts: { account: { id: "old", startedAt: new Date("2026-11-11T12:00:00Z") } }, updatedAt: new Date("2026-11-11T12:00:00Z"), audit: [] };
  const restore = store(state);
  const getMain = () => ({ sid: main, client: { api: { accounts: { list: async () => { throw new Error("network"); } } } } });
  try {
    const result = await recovery.inspect(A, "admin", "account", { getMain, now });
    assert.equal(result.evidence, "unknown"); assert.match(result.notice, /indisponible/);
    await assert.rejects(recovery.unlock(A, "admin", { operation: "account", inspectionId: result.id, acknowledgement: recovery.RESET_ACK, resetAbsent: true, now, getMain }), /absence/);
    assert.equal(state.accountOperation, "uncertain");
  } finally { restore(); }
});

test("reprise d'activation synchronise l'état avec la configuration gérée", async () => {
  const state = { restaurantId: A, activationOperation: "pending", activationOperationId: "old", operationAttempts: { activation: { id: "old", startedAt: new Date("2026-11-11T12:00:00Z") } }, serviceStatus: "preparing", updatedAt: new Date("2026-11-11T12:00:00Z"), audit: [] };
  const restore = store(state);
  Config.findOne = () => ({ lean: async () => ({ managedByOnboarding: true, enabled: true, provisioningStatus: "ready_for_test" }) });
  try {
    const result = await recovery.inspect(A, "admin", "activation", { now });
    assert.equal(result.evidence, "found");
    await recovery.unlock(A, "admin", { operation: "activation", inspectionId: result.id, acknowledgement: recovery.ACK, now });
    assert.equal(state.activationOperation, "idle");
    assert.equal(state.serviceStatus, "ready_for_test");
    assert.equal(state.activationOperationId, undefined);
  } finally { restore(); }
});

test("une opération historique pending sans identifiant reste récupérable", async () => {
  const state = { restaurantId: A, accountOperation: "pending", updatedAt: new Date("2026-11-11T12:00:00Z"), audit: [] };
  const restore = store(state);
  const getMain = () => ({ sid: main, client: { api: { accounts: { list: async () => [{ sid: child, ownerAccountSid: main, friendlyName: `Gusto CallSense ${A}`, status: "active" }] } } } });
  try {
    const result = await recovery.inspect(A, "admin", "account", { getMain, now });
    assert.equal(result.evidence, "found");
    await recovery.unlock(A, "admin", { operation: "account", inspectionId: result.id, acknowledgement: recovery.ACK, now });
    assert.equal(state.accountOperation, "uncertain");
  } finally { restore(); }
});

test("une création SIP partielle exige deux vérifications et une confirmation distincte", async () => {
  const cl = `CL${"e".repeat(32)}`, sd = `SD${"d".repeat(32)}`;
  const state = { restaurantId: A, accountSid: child, sipCredentialOperation: "uncertain", sipCredentialListSid: cl, sipDomainSid: sd, sipUsername: `g${A}`, operationAttempts: { sip: { id: "old", startedAt: new Date("2026-11-11T12:00:00Z") } }, updatedAt: new Date("2026-11-11T12:00:00Z"), audit: [] };
  const restore = store(state); let mutations = 0;
  const lists = () => ({ fetch: async () => ({ sid: cl }), credentials: { list: async () => [], create: async () => { mutations++; } } });
  const domains = () => ({ auth: { registrations: { credentialListMappings: { list: async () => [] } } } });
  const getClient = async () => ({ draft: { accountSid: child }, client: { sip: { credentialLists: lists, domains } } });
  try {
    const result = await recovery.inspect(A, "admin", "sip", { getClient, now });
    assert.equal(result.evidence, "partial");
    await recovery.unlock(A, "admin", { operation: "sip", inspectionId: result.id, acknowledgement: recovery.RESET_ACK, resetAbsent: true, now, getClient });
    assert.equal(state.sipCredentialOperation, "uncertain"); assert.equal(state.sipResumeAuthorized, true); assert.equal(mutations, 0);
  } finally { restore(); }
});
