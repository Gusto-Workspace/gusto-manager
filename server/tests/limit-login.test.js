const assert = require("node:assert/strict");
const test = require("node:test");

const limitLogin = require("../middleware/limit-login");
const { resetLoginLimiterForTests } = require("../middleware/limit-login");

function invokeLimiter() {
  const req = {
    ip: "203.0.113.10",
    body: { email: "owner@example.com" },
  };
  const result = { nextCalled: false, status: null, body: null, headers: {} };
  const res = {
    set(name, value) {
      result.headers[name] = value;
    },
    status(value) {
      result.status = value;
      return this;
    },
    json(value) {
      result.body = value;
      return this;
    },
  };

  limitLogin(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

test("login limiter rejects repeated attempts from the same source/account", () => {
  resetLoginLimiterForTests();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    assert.equal(invokeLimiter().nextCalled, true);
  }

  const blocked = invokeLimiter();
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers["Retry-After"]) > 0);

  resetLoginLimiterForTests();
});
