const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET ||= "sse-auth-test-secret";

const jwt = require("jsonwebtoken");
const express = require("express");
const OwnerModel = require("../models/owner.model");
const authenticateToken = require("../middleware/authentificate-token");

const {
  _addClient: addClient,
  _isTakeAwayPayload: isTakeAwayPayload,
  _isEventSessionAuthorized: isEventSessionAuthorized,
  _removeClient: removeClient,
  broadcastToRestaurant,
  mountSseRoute,
} = require("../services/sse-bus.service");

test("SSE route is mounted behind JWT authentication", () => {
  const app = express();
  mountSseRoute(app);
  const routeLayer = app._router.stack.find(
    (layer) => layer.route?.path === "/api/events/:restaurantId",
  );

  assert.ok(routeLayer);
  assert.equal(routeLayer.route.stack[0].handle, authenticateToken);
});

test("SSE rejects a revoked session before checking restaurant access", async () => {
  let accessWasChecked = false;
  const authorized = await isEventSessionAuthorized(
    { id: "owner-id", role: "owner", sessionVersion: 2 },
    "restaurant-id",
    {
      validateSession: async () => false,
      validateAccess: async () => {
        accessWasChecked = true;
        return true;
      },
    },
  );

  assert.equal(authorized, false);
  assert.equal(accessWasChecked, false);
});

test("SSE requires both a valid session and restaurant access", async () => {
  const authorized = await isEventSessionAuthorized(
    { id: "employee-id", role: "employee", sessionVersion: 4 },
    "restaurant-id",
    {
      validateSession: async () => true,
      validateAccess: async () => false,
    },
  );

  assert.equal(authorized, false);
});

test("SSE take-away events are delivered only to clients with module rights", () => {
  const restaurantId = "sse-take-away-restaurant";
  const allowedWrites = [];
  const deniedWrites = [];
  const allowedResponse = {
    locals: { gustoEventModules: { take_away: true } },
    write: (value) => allowedWrites.push(value),
  };
  const deniedResponse = {
    locals: { gustoEventModules: { take_away: false } },
    write: (value) => deniedWrites.push(value),
  };

  addClient(restaurantId, allowedResponse);
  addClient(restaurantId, deniedResponse);
  try {
    const takeAwayPayload = {
      type: "takeaway_order_created",
      order: { _id: "order-1" },
    };
    assert.equal(isTakeAwayPayload(takeAwayPayload), true);
    broadcastToRestaurant(restaurantId, takeAwayPayload);
    broadcastToRestaurant(restaurantId, {
      type: "reservation_created",
      reservation: { _id: "reservation-1" },
    });

    assert.equal(allowedWrites.length, 2);
    assert.equal(deniedWrites.length, 1);
    assert.match(deniedWrites[0], /reservation_created/);
  } finally {
    removeClient(restaurantId, allowedResponse);
    removeClient(restaurantId, deniedResponse);
  }
});

test("authentication middleware rejects a JWT with a revoked version", async () => {
  const originalFindById = OwnerModel.findById;
  let receivedProjection;
  let leanWasCalled = false;
  OwnerModel.findById = () => ({
    select(projection) {
      receivedProjection = projection;
      return {
        lean: async () => {
          leanWasCalled = true;
          return { _id: "owner-id", sessionVersion: 5 };
        },
      };
    },
  });

  try {
    const token = jwt.sign(
      { id: "owner-id", role: "owner", sessionVersion: 4 },
      process.env.JWT_SECRET,
    );
    const req = { headers: { authorization: `Bearer ${token}` } };
    const result = { status: null, body: null, nextCalled: false };
    const res = {
      status(value) {
        result.status = value;
        return this;
      },
      json(value) {
        result.body = value;
        return this;
      },
    };

    await authenticateToken(req, res, () => {
      result.nextCalled = true;
    });

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 403);
    assert.equal(result.body.message, "Session revoked");
    assert.deepEqual(receivedProjection, { _id: 1, sessionVersion: 1 });
    assert.equal(leanWasCalled, true);
  } finally {
    OwnerModel.findById = originalFindById;
  }
});
