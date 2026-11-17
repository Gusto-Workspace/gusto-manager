const test = require("node:test");
const assert = require("node:assert/strict");
const sift = require("sift").default;
const Reservation = require("../../models/reservation.model");
const Restaurant = require("../../models/restaurant.model");
const mailer = require("../../services/reservations/reservations-mailer.service");

function setup(t, documents, send) {
  const original = { find: Reservation.find, findOne: Reservation.findOne, findOneAndUpdate: Reservation.findOneAndUpdate, updateOne: Reservation.updateOne, updateMany: Reservation.updateMany, restaurant: Restaurant.findById, send: mailer.sendReservationEmail };
  const match = (filter, doc) => sift(filter)(doc);
  const apply = (doc, update) => {
    Object.assign(doc, update.$set || {});
    for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + value;
  };
  Reservation.find = (filter) => ({ select: () => ({ limit: async (n) => documents.filter((doc) => match(filter, doc)).slice(0, n).map((doc) => ({ _id: doc._id, expirationEmailIdempotencyKey: doc.expirationEmailIdempotencyKey })) }) });
  Reservation.findOneAndUpdate = async (filter, update) => {
    const doc = documents.find((item) => match(filter, item));
    if (!doc) return null;
    apply(doc, update);
    return { ...doc };
  };
  Reservation.findOne = async (filter) => documents.find((doc) => match(filter, doc)) || null;
  Reservation.updateOne = async (filter, update) => {
    const doc = documents.find((item) => match(filter, item));
    if (doc) apply(doc, update);
  };
  Reservation.updateMany = async (filter, update) => { for (const doc of documents) if (match(filter, doc)) apply(doc, update); };
  Restaurant.findById = () => ({ select: async () => ({ name: "Restaurant" }) });
  mailer.sendReservationEmail = send;
  const path = require.resolve("../../services/reservations/reservation-expiration-email.service");
  delete require.cache[path];
  t.after(() => { Object.assign(Reservation, { find: original.find, findOne: original.findOne, findOneAndUpdate: original.findOneAndUpdate, updateOne: original.updateOne, updateMany: original.updateMany }); Restaurant.findById = original.restaurant; mailer.sendReservationEmail = original.send; delete require.cache[path]; });
  return require(path).sendQueuedExpirationEmails;
}

function reservation(overrides = {}) {
  return { _id: "r1", restaurant_id: "rest1", status: "Expired", expirationEmailQueuedAt: new Date(), expirationEmailStatus: "pending", expirationEmailAttempts: 0, expirationEmailClaimedAt: null, expirationEmailNextRetryAt: null, expirationEmailSentAt: null, expirationEmailIdempotencyKey: "", ...overrides };
}

test("Brevo failure records error and retries later using the same key", async (t) => {
  const doc = reservation();
  const keys = [];
  const run = setup(t, [doc], async (type, args) => {
    assert.equal(type, "expired"); keys.push(args.idempotencyKey);
    if (keys.length === 1) throw new Error("Brevo temporairement indisponible");
    return { messageId: "accepted" };
  });
  await run();
  assert.equal(doc.expirationEmailStatus, "pending");
  assert.match(doc.expirationEmailLastError, /Brevo/);
  assert.ok(doc.expirationEmailNextRetryAt > new Date());
  await run();
  assert.equal(keys.length, 1);
  doc.expirationEmailNextRetryAt = new Date(Date.now() - 1);
  await run();
  assert.equal(doc.expirationEmailStatus, "sent");
  assert.ok(doc.expirationEmailSentAt);
  assert.equal(doc.expirationEmailAttempts, 2);
  assert.equal(keys[0], keys[1]);
  await run();
  assert.equal(keys.length, 2);
});

test("an interrupted stale lock is reclaimed; concurrent workers send only once", async (t) => {
  const doc = reservation({ expirationEmailStatus: "processing", expirationEmailAttempts: 1, expirationEmailClaimedAt: new Date(Date.now() - 11 * 60 * 1000), expirationEmailLockToken: "old", expirationEmailIdempotencyKey: "7a505488-13ec-4d49-9b0e-9a1e3857e22d" });
  let calls = 0;
  const run = setup(t, [doc], async (_, args) => { calls++; assert.equal(args.idempotencyKey, doc.expirationEmailIdempotencyKey); return {}; });
  await Promise.all([run(), run()]);
  assert.equal(calls, 1);
  assert.equal(doc.expirationEmailStatus, "sent");
  assert.equal(doc.expirationEmailAttempts, 2);
});

test("only genuinely expired queued reservations can send and the final interrupted attempt stops", async (t) => {
  const docs = [reservation({ _id: "confirmed", status: "Confirmed" }), reservation({ _id: "canceled", status: "Canceled", bankHold: { status: "authorized" } }), reservation({ _id: "bank", status: "Canceled", bankHold: { status: "expired" } }), reservation({ _id: "last", expirationEmailStatus: "processing", expirationEmailAttempts: 8, expirationEmailClaimedAt: new Date(Date.now() - 11 * 60 * 1000) })];
  const calls = [];
  const run = setup(t, docs, async (_, { reservation: item }) => { calls.push(item._id); return {}; });
  await run();
  assert.deepEqual(calls, ["bank"]);
  assert.equal(docs[3].expirationEmailStatus, "exhausted");
  assert.match(docs[3].expirationEmailLastError, /interrompue/);
});

test("the final failed attempt is recorded and is not retried", async (t) => {
  const doc = reservation({ expirationEmailAttempts: 7 });
  let calls = 0;
  const run = setup(t, [doc], async () => { calls++; throw new Error("Indisponible"); });
  await run();
  await run();
  assert.equal(calls, 1);
  assert.equal(doc.expirationEmailAttempts, 8);
  assert.equal(doc.expirationEmailStatus, "exhausted");
  assert.equal(doc.expirationEmailLastError, "Indisponible");
});

test("a Brevo idempotency duplicate confirms a previously accepted attempt", async (t) => {
  const doc = reservation();
  const run = setup(t, [doc], async () => { throw { response: { body: { code: "duplicate_parameter", message: "idempotency key already used" } } }; });
  await run();
  assert.equal(doc.expirationEmailStatus, "sent");
  assert.match(doc.expirationEmailLastError, /idempotence/);
});

test("an invalid address is recorded without retrying and missing Brevo configuration is retried", async (t) => {
  const docs = [reservation({ _id: "invalid" }), reservation({ _id: "config" })];
  const run = setup(t, docs, async (_, { reservation: item }) => ({ skipped: true, reason: item._id === "invalid" ? "invalid_email" : "missing_brevo_key" }));
  await run();
  assert.equal(docs[0].expirationEmailStatus, "skipped");
  assert.equal(docs[1].expirationEmailStatus, "pending");
  assert.ok(docs[1].expirationEmailNextRetryAt > new Date());
});

test("a reservation whose status changes before sending is skipped", async (t) => {
  const doc = reservation();
  let calls = 0;
  const run = setup(t, [doc], async () => { calls++; });
  Restaurant.findById = () => ({ select: async () => { doc.status = "Confirmed"; return { name: "Restaurant" }; } });
  await run();
  assert.equal(calls, 0);
  assert.equal(doc.expirationEmailStatus, "skipped");
});

test("reservation mailer passes the stable key to Brevo for expiration emails", async (t) => {
  const sdk = require("sib-api-v3-sdk");
  const original = sdk.ApiClient.instance.callApi;
  const oldKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "test-key";
  let payload;
  sdk.ApiClient.instance.callApi = async (...args) => { payload = args[7]; return { data: { messageId: "mock" } }; };
  t.after(() => { sdk.ApiClient.instance.callApi = original; if (oldKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = oldKey; });
  await mailer.sendReservationEmail("expired", { reservation: { customerEmail: "client@example.test", reservationDate: new Date(), reservationTime: "19:00", numberOfGuests: 2 }, restaurantName: "Restaurant", idempotencyKey: "dff3511b-5051-427b-a5c9-3c02bc08250b" });
  assert.equal(payload.headers.idempotencyKey, "dff3511b-5051-427b-a5c9-3c02bc08250b");
});
