const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_fixture";
const Operation = require("../models/callsense/callsense-subscription-operation.model");
const Audit = require("../models/callsense/callsense-billing-audit.model");
const { reconcileCreation, reconcileExistingCreation } = require("../services/callsense-subscription-recovery.service");

test("reprise d'une création interrompue avec preuve Stripe et sans mutation Stripe", async () => {
  const original = { findById: Operation.findById, deleteOne: Operation.deleteOne, create: Audit.create };
  let lock = { _id: "restaurant", attemptId: "attempt", kind: "create", state: "pending", startedAt: new Date() };
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

test("un webhook ne libère que le verrou prouvé pour le bon restaurant et le bon abonnement", async () => {
  const original = { findById: Operation.findById, deleteOne: Operation.deleteOne, create: Audit.create };
  let deleted = 0;
  Operation.findById = () => ({ lean: async () => ({ kind: "create", attemptId: "attempt" }) });
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
