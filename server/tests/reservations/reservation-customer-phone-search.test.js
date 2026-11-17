const test = require("node:test");
const assert = require("node:assert/strict");
const sift = require("sift").default;
const Customer = require("../../models/customer.model");
const router = require("../../routes/customers.routes");
const handler = router.stack.find((layer) => layer.route?.path === "/restaurants/:id/reservation-customers").route.stack.at(-1).handle;

test("phone prefixes match French formats progressively while retaining international prefixes and restaurant isolation", async (t) => {
  const original = Customer.find;
  const records = [
    { _id: "local", restaurant_id: "a", firstName: "Jean", phoneNorm: "0612345678" },
    { _id: "international", restaurant_id: "a", firstName: "Jane", phoneNorm: "+33612345678" },
    { _id: "digits", restaurant_id: "a", phoneNorm: "33612345678" },
    { _id: "uk", restaurant_id: "a", phoneNorm: "+447911123456" },
    { _id: "other", restaurant_id: "b", phoneNorm: "+33612345678" },
    { _id: "email", restaurant_id: "a", emailNorm: "john@example.com" },
    { _id: "name-only", restaurant_id: "a", firstName: "Émilie", lastName: "Louchart", emailNorm: "emilie@example.com", phoneNorm: "+33699999999" },
    { _id: "email-match", restaurant_id: "a", firstName: "Paul", lastName: "Dupont", emailNorm: "paul.lou@example.com" },
    { _id: "foreign", restaurant_id: "b", firstName: "Émilie", emailNorm: "lo@example.com" },
  ];
  Customer.find = (filter) => ({ select: () => ({ limit: () => ({ lean: async () => records.filter(sift(filter)) }) }) });
  t.after(() => { Customer.find = original; });
  async function search(query, field) {
    let result;
    await handler({ params: { id: "a" }, query: { query, field } }, { json(value) { result = value.customers; } });
    return result.map((item) => item._id).sort();
  }
  for (const query of ["0612345678", "+33612345678", "33612345678", "06 12 34 56 78", "0033612"]) {
    assert.deepEqual(await search(query, "phone"), ["digits", "international", "local"], query);
  }
  assert.deepEqual(await search("06", "phone"), ["digits", "international", "local", "name-only"]);
  assert.deepEqual(await search("+4479", "phone"), ["uk"]);
  assert.deepEqual(await search("4479", "phone"), ["uk"]);
  assert.deepEqual(await search("00", "phone"), ["international", "name-only", "uk"]);
  assert.deepEqual(await search("lo", "email"), ["email-match"]);
  assert.deepEqual(await search("lo", "lastName"), ["name-only"]);
  assert.deepEqual(await search("emil", "firstName"), ["name-only"]);
  assert.deepEqual(await search("ÉMILI", "firstName"), ["name-only"]);
  assert.deepEqual(await search("lo", "firstName"), []);
  assert.deepEqual(await search("john@", "email"), ["email"]);
  assert.deepEqual(await search("Jean", "firstName"), ["local"]);
  assert.deepEqual(await search("lo", "phone"), []);
  assert.deepEqual(await search("Jean"), ["local"]);
});
