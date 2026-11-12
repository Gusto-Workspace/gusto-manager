const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "callsense-test-only-secret";
const sessionPath = require.resolve("../services/account-session.service");
require.cache[sessionPath] = { id: sessionPath, filename: sessionPath, loaded: true, exports: { isAccountSessionValid: async () => true } };
const Restaurant = require("../models/restaurant.model");
const router = require("../routes/callsense-onboarding.routes");
const provisioning = require("../services/callsense-provisioning.service");
const A = "aaaaaaaaaaaaaaaaaaaaaaaa";

test("les contrôles administrateur refusent propriétaires, vendeurs et requêtes anonymes", async () => {
  const path = `/admin/restaurants/${A}/callsense-onboarding/sip-secret`;
  const middleware = router.stack.filter((layer) => !layer.route && layer.regexp.test(path)).map((layer) => layer.handle);
  assert.equal(middleware.length, 3);
  const original = Restaurant.exists;
  Restaurant.exists = async ({ _id }) => _id === A;
  async function request(role, restaurantId = A) {
    const req = { params: { restaurantId }, headers: role ? { authorization: `Bearer ${jwt.sign({ id: "administrator", role }, process.env.JWT_SECRET)}` } : {} };
    for (const handler of middleware) {
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("middleware timeout")), 1000);
        const finish = (value) => { clearTimeout(timeout); resolve(value); };
        const res = { status(code) { this.code = code; return this; }, json() { finish(this.code || 200); }, sendStatus(code) { finish(code); } };
        try { Promise.resolve(handler(req, res, () => finish("next"))).catch(reject); } catch (err) { reject(err); }
      });
      if (result !== "next") return result;
    }
    return 200;
  }
  try {
    assert.equal(await request(), 403);
    assert.equal(await request("owner"), 403);
    assert.equal(await request("employee"), 403);
    assert.equal(await request("seller"), 403);
    assert.equal(await request("admin"), 200);
    assert.equal(await request("admin", "invalid"), 400);
  } finally { Restaurant.exists = original; }
});

test("consultation SIP : confirmation, absence de cache et limitation par administrateur", async () => {
  const route = router.stack.find(layer => layer.route?.path?.endsWith("/sip-secret"));
  const handlers = route.route.stack.map(layer => layer.handle);
  const original = provisioning.revealSip; let reads = 0;
  provisioning.revealSip = async () => { reads++; return { password: "fake-secret" }; };
  async function request(confirm) {
    const req = { user: { id: "rate-test-admin" }, params: { restaurantId: A }, body: { confirm } };
    const headers = {}, response = { code: 200, set(key, value) { headers[key] = value; return this; }, status(code) { this.code = code; return this; }, sendStatus(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    for (const handler of handlers) { let advanced = false; await handler(req, response, () => { advanced = true; }); if (!advanced) break; }
    return { response, headers };
  }
  try {
    const denied = await request(false); assert.equal(denied.response.code, 400); assert.equal(reads, 0); assert.match(denied.headers["Cache-Control"], /no-store/);
    const first = await request(true), second = await request(true); assert.equal(first.response.code, 200); assert.equal(second.response.code, 200); assert.equal(reads, 2); assert.match(first.headers["Cache-Control"], /no-store/);
    for (let i = 0; i < 7; i++) await request(true);
    const limited = await request(true); assert.equal(limited.response.code, 429); assert.equal(reads, 9); assert.match(limited.headers["Cache-Control"], /no-store/);
  } finally { provisioning.revealSip = original; }
});
