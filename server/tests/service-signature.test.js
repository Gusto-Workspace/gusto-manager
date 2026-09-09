const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_SIGNATURE_AGE_MS,
  createServiceSignature,
  verifyServiceSignature,
} = require("../middleware/service-signature");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function signedRequest(payload, secret, timestamp = String(Date.now())) {
  return {
    body: payload,
    headers: {
      "x-gusto-timestamp": timestamp,
      "x-gusto-signature": createServiceSignature({
        timestamp,
        payload,
        secret,
      }),
    },
  };
}

test("the shared service signature accepts an intact payload", (t) => {
  const previousSecret = process.env.GUSTO_SHARED_SECRET;
  process.env.GUSTO_SHARED_SECRET = "test-shared-secret";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.GUSTO_SHARED_SECRET;
    else process.env.GUSTO_SHARED_SECRET = previousSecret;
  });
  const req = signedRequest(
    { restaurantId: "restaurant-1", event: { id: "evt_1" } },
    process.env.GUSTO_SHARED_SECRET,
  );
  const res = responseRecorder();
  let nextCalls = 0;

  verifyServiceSignature(req, res, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
});

test("the shared service signature rejects an invalid signature", (t) => {
  const previousSecret = process.env.GUSTO_SHARED_SECRET;
  process.env.GUSTO_SHARED_SECRET = "test-shared-secret";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.GUSTO_SHARED_SECRET;
    else process.env.GUSTO_SHARED_SECRET = previousSecret;
  });
  const req = signedRequest(
    { restaurantId: "restaurant-1", event: { id: "evt_1" } },
    process.env.GUSTO_SHARED_SECRET,
  );
  req.headers["x-gusto-signature"] = "invalid";
  const res = responseRecorder();

  verifyServiceSignature(req, res, () => {
    assert.fail("an invalid signature must not reach the handler");
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_SIGNATURE");
});

test("the shared service signature rejects an altered payload", (t) => {
  const previousSecret = process.env.GUSTO_SHARED_SECRET;
  process.env.GUSTO_SHARED_SECRET = "test-shared-secret";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.GUSTO_SHARED_SECRET;
    else process.env.GUSTO_SHARED_SECRET = previousSecret;
  });
  const req = signedRequest(
    { restaurantId: "restaurant-1", event: { id: "evt_1" } },
    process.env.GUSTO_SHARED_SECRET,
  );
  req.body.event.id = "evt_tampered";
  const res = responseRecorder();
  let nextCalls = 0;

  verifyServiceSignature(req, res, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_SIGNATURE");
});

test("the shared service signature rejects stale replays", (t) => {
  const previousSecret = process.env.GUSTO_SHARED_SECRET;
  process.env.GUSTO_SHARED_SECRET = "test-shared-secret";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.GUSTO_SHARED_SECRET;
    else process.env.GUSTO_SHARED_SECRET = previousSecret;
  });
  const timestamp = String(Date.now() - MAX_SIGNATURE_AGE_MS - 1);
  const req = signedRequest(
    { restaurantId: "restaurant-1", event: { id: "evt_1" } },
    process.env.GUSTO_SHARED_SECRET,
    timestamp,
  );
  const res = responseRecorder();

  verifyServiceSignature(req, res, () => {
    assert.fail("a stale signature must not reach the handler");
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_SIGNATURE");
});
