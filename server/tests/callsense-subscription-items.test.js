const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STRIPE_API_SECRET_KEY = "sk_test_catalog";
process.env.STRIPE_SMS_METERED_PRICE_ID = "sms_meter";
const { buildSubscriptionItemUpdatePayload, buildSubscriptionSummaryFromItems, isCallSenseMeteredComponent, catalogCodeAllowsOffered, buildSmsDeactivationPhaseItems, hasExistingCallSensePair } = require("../services/stripe-subscription-catalog.service");
const { offerIds } = require("../services/callsense-usage.service");
const ids = offerIds();
const plan = { subscriptionItemId: "si_plan", priceId: "plan", kind: "plan", quantity: 1 };
const fixed = { subscriptionItemId: "si_fixed", priceId: ids.fixed, kind: "addon", code: "callsense", quantity: 1 };
const meter = { subscriptionItemId: "si_meter", priceId: ids.metered, kind: "addon", code: "callsense", technical: true };
const sms = { subscriptionItemId: "si_sms", priceId: "sms_meter", kind: "addon", code: "sms_reminders", technical: true };
const selected = { plan: { priceId: "plan" }, addons: [{ priceId: ids.fixed, code: "callsense", quantity: 1 }] };

test("CallSense ajoute, conserve et retire exactement ses deux lignes", () => {
  const add = buildSubscriptionItemUpdatePayload({ currentSummary: buildSubscriptionSummaryFromItems([plan]), selection: selected });
  assert.deepEqual(add.slice(-2), [{ price: ids.fixed, quantity: 1 }, { price: ids.metered }]);
  const existing = buildSubscriptionSummaryFromItems([plan, fixed, meter, sms]);
  assert.equal(hasExistingCallSensePair(existing), true);
  assert.equal(hasExistingCallSensePair(buildSubscriptionSummaryFromItems([plan, fixed])), false);
  assert.equal(hasExistingCallSensePair(buildSubscriptionSummaryFromItems([plan, fixed, meter, { ...meter, subscriptionItemId: "duplicate" }])), false);
  const keep = buildSubscriptionItemUpdatePayload({ currentSummary: existing, selection: selected });
  assert.equal(keep.filter((item) => item.id === "si_meter" && !item.deleted).length, 1);
  const remove = buildSubscriptionItemUpdatePayload({ currentSummary: existing, selection: { plan: selected.plan, addons: [] } });
  assert.ok(remove.some((item) => item.id === "si_fixed" && item.deleted));
  assert.ok(remove.some((item) => item.id === "si_meter" && item.deleted));
});

test("la désactivation SMS conserve les deux lignes CallSense", () => {
  const phase = buildSmsDeactivationPhaseItems({ items: { data: [
    { price: { id: ids.fixed, recurring: { usage_type: "licensed" } }, quantity: 1 },
    { price: { id: ids.metered, recurring: { usage_type: "metered" } } },
    { price: { id: "sms_meter", recurring: { usage_type: "metered" } } },
  ] } });
  assert.deepEqual(phase, [{ price: ids.fixed, quantity: 1 }, { price: ids.metered }]);
  assert.equal(isCallSenseMeteredComponent({ id: ids.metered }, {}), true);
  assert.equal(catalogCodeAllowsOffered("callsense"), false);
});
