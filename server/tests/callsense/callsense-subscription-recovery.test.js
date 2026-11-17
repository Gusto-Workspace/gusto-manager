const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_fixture";
const Operation = require("../../models/callsense/callsense-subscription-operation.model");
const Audit = require("../../models/callsense/callsense-billing-audit.model");
const { reconcileCreation, reconcileExistingCreation, reconcileExistingMutation } = require("../../services/callsense/callsense-subscription-recovery.service");

test("reprise d'une modification incertaine : preuve Stripe puis synchronisation avant déverrouillage", async (t) => {
  let lock = { kind: "update", state: "uncertain", attemptId: "attempt", startedAt: new Date() };
  const subscription = { id: "sub_test", metadata: { restaurantId: "restaurant" } };
  t.mock.method(Operation, "findById", () => ({ lean: async () => lock }));
  t.mock.method(Operation, "deleteOne", async () => { lock = null; return { deletedCount: 1 }; });
  t.mock.method(Audit, "create", async () => {});
  const stripe = { events: { list: async () => ({ data: [{ type: "customer.subscription.updated", data: { object: { id: "sub_test" } }, request: { idempotency_key: "callsense-subscription-attempt" } }], has_more: false }) } };
  await assert.rejects(reconcileExistingMutation({ restaurantId: "restaurant", subscription, stripe, synchronize: async () => { throw Error("Mongo indisponible"); } }), /Mongo/);
  assert.ok(lock);
  assert.equal(await reconcileExistingMutation({ restaurantId: "restaurant", subscription, stripe, synchronize: async () => { assert.ok(lock); } }), true);
  assert.equal(lock, null);
});

test("une résiliation identifiée est reprise sur l'état Stripe sans dépendre d'une clé d'événement", async (t) => {
  let lock = { kind: "update", action: "cancel", subscriptionId: "sub_test", state: "uncertain", attemptId: "attempt" };
  let synchronized = 0;
  t.mock.method(Operation, "findById", () => ({ lean: async () => lock }));
  t.mock.method(Operation, "deleteOne", async (filter) => { assert.equal(filter.subscriptionId, "sub_test"); lock = null; return { deletedCount: 1 }; });
  t.mock.method(Audit, "create", async () => {});
  const stripe = { events: { list: async () => { throw Error("lecture d'événement inutile"); } } };
  const subscription = { id: "sub_test", status: "canceled", metadata: { restaurantId: "restaurant" } };
  assert.equal(await reconcileExistingMutation({ restaurantId: "restaurant", subscription, stripe, synchronize: async () => { assert.ok(lock); synchronized++; } }), true);
  assert.equal(lock, null); assert.equal(synchronized, 1);
  assert.equal(await reconcileExistingMutation({ restaurantId: "restaurant", subscription, stripe, synchronize: async () => { synchronized++; } }), false);
  assert.equal(synchronized, 1);
});

test("reprise d'une création interrompue avec preuve Stripe et sans mutation Stripe", async () => {
  const original = { findById: Operation.findById, deleteOne: Operation.deleteOne, create: Audit.create };
  let lock = { _id: "restaurant", attemptId: "attempt", kind: "create", state: "uncertain", startedAt: new Date() };
  const audits = [];
  const subscription = { id: "sub_one", metadata: { restaurantId: "restaurant" } };
  const event = { type: "customer.subscription.created", data: { object: { id: subscription.id } }, request: { idempotency_key: "callsense-subscription-attempt" } };
  let lists = 0;
  const stripe = { events: { list: async () => { lists++; return { data: [event], has_more: false }; } }, subscriptions: { create: () => { throw Error("création interdite"); } } };
  Operation.findById = () => ({ lean: async () => lock && { ...lock } });
  Operation.deleteOne = async (filter) => { if (lock?.attemptId !== filter.attemptId) return { deletedCount: 0 }; lock = null; return { deletedCount: 1 }; };
  Audit.create = async (audit) => { audits.push(audit); };
  try {
    assert.equal(await reconcileExistingCreation({ restaurantId: "restaurant", subscription, stripe }), true);
    assert.equal(lock, null);
    assert.equal(audits[0].reference, subscription.id);
    assert.equal(await reconcileExistingCreation({ restaurantId: "restaurant", subscription, stripe }), false);
    assert.equal(lists, 1);
  } finally { Operation.findById = original.findById; Operation.deleteOne = original.deleteOne; Audit.create = original.create; }
});

test("un événement Stripe ne libère que le verrou prouvé pour le bon restaurant et le bon abonnement", async () => {
  const original = { findById: Operation.findById, deleteOne: Operation.deleteOne, create: Audit.create };
  let deleted = 0;
  Operation.findById = () => ({ lean: async () => ({ kind: "create", state: "uncertain", attemptId: "attempt" }) });
  Operation.deleteOne = async () => { deleted++; return { deletedCount: 1 }; };
  Audit.create = async () => {};
  const subscription = { id: "sub_one", metadata: { restaurantId: "restaurant" } };
  const event = { type: "customer.subscription.created", data: { object: { id: "sub_one" } }, request: { idempotency_key: "callsense-subscription-attempt" } };
  try {
    assert.equal(await reconcileCreation({ restaurantId: "autre", subscription, event }), false);
    assert.equal(await reconcileCreation({ restaurantId: "restaurant", subscription, event: { ...event, request: { idempotency_key: "wrong" } } }), false);
    assert.equal(await reconcileCreation({ restaurantId: "restaurant", subscription, event: { ...event, data: { object: { id: "sub_other" } } } }), false);
    assert.equal(deleted, 0);
    assert.equal(await reconcileCreation({ restaurantId: "restaurant", subscription, event }), true);
    assert.equal(deleted, 1);
  } finally { Operation.findById = original.findById; Operation.deleteOne = original.deleteOne; Audit.create = original.create; }
});

test("un événement Stripe ne libère pas une création encore en cours", async (t) => {
  let deletes = 0;
  t.mock.method(Operation, "findById", () => ({ lean: async () => ({ kind: "create", state: "pending", attemptId: "attempt" }) }));
  t.mock.method(Operation, "deleteOne", async () => { deletes++; return { deletedCount: 1 }; });
  const subscription = { id: "sub_one", metadata: { restaurantId: "restaurant" } };
  const event = { type: "customer.subscription.created", data: { object: { id: "sub_one" } }, request: { idempotency_key: "callsense-subscription-attempt" } };
  assert.equal(await reconcileCreation({ restaurantId: "restaurant", subscription, event }), false);
  assert.equal(deletes, 0);
});
