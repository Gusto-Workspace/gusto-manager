const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { Types } = require("mongoose");
const sift = require("sift").default;

process.env.JWT_SECRET = "synthetic-reservation-arrival-test";
const session = require("../../services/shared/account-session.service");
session.isAccountSessionValid = async () => true;

const providerCalls = [];
const recordProviderCall = (name) => async () => {
  providerCalls.push(name);
  return { skipped: true };
};
const webpushPath = require.resolve("../../services/shared/webpush.service");
require.cache[webpushPath] = {
  id: webpushPath,
  filename: webpushPath,
  loaded: true,
  exports: { sendPushToModule: recordProviderCall("push") },
};
const mailer = require("../../services/reservations/reservations-mailer.service");
mailer.sendReservationEmail = recordProviderCall("email");
mailer.sendRestaurantNewPublicReservationEmail = recordProviderCall("restaurant email");

const Reservation = require("../../models/reservation.model");
const Restaurant = require("../../models/restaurant.model");
const DayLock = require("../../models/reservation-day-lock.model");
const cron = require("node-cron");
const router = require("../../routes/reservations.routes");
const {
  _addClient,
  _removeClient,
} = require("../../services/shared/sse-bus.service");
const {
  getCurrentReservationServiceDay,
} = require("../../services/reservations/reservation-service-time.service");

const basePath = "/restaurants/:id/reservations";
const serviceDay = "2026-11-18";
const now = new Date("2026-11-18T11:05:00Z");
const ids = Object.fromEntries(
  ["reservation", "otherReservation", "restaurant", "otherRestaurant", "owner", "employee", "withoutAccess"]
    .map((name) => [name, new Types.ObjectId().toString()]),
);

async function request(method, path, {
  user = { role: "owner", id: ids.owner },
  body = {},
  reservationId = ids.reservation,
  query = {},
} = {}) {
  const { route } = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  const req = {
    params: { id: ids.restaurant, reservationId },
    body,
    query,
    headers: user ? { authorization: `Bearer ${jwt.sign(user, process.env.JWT_SECRET)}` } : {},
  };
  const response = { statusCode: 200, locals: {} };
  const res = {
    status(code) { response.statusCode = code; return this; },
    json(value) { response.body = JSON.parse(JSON.stringify(value)); return this; },
  };
  let index = 0;
  await (function next() {
    return route.stack[index++].handle(req, res, next);
  })();
  return response;
}

function fixture(t, status = "Confirmed") {
  t.mock.timers.enable({ apis: ["Date"], now });
  providerCalls.length = 0;
  const reservation = new Reservation({
    _id: ids.reservation,
    restaurant_id: ids.restaurant,
    customerFirstName: "Camille",
    reservationDate: serviceDay,
    reservationTime: "12:00",
    numberOfGuests: 2,
    idempotencyKey: "synthetic-booking",
    table: { name: "Table 1", seats: 2, source: "manual" },
    status,
  }).toObject();
  delete reservation.arrivedAt;
  delete reservation.arrivalRevision;
  const other = {
    ...reservation,
    _id: new Types.ObjectId(ids.otherReservation),
    restaurant_id: new Types.ObjectId(ids.otherRestaurant),
  };
  const restaurant = {
    _id: ids.restaurant,
    owner_id: ids.owner,
    options: { reservations: true },
    employees: [
      { _id: ids.employee, restaurantProfiles: [{ restaurant: ids.restaurant, options: { reservations: true } }] },
      { _id: ids.withoutAccess, restaurantProfiles: [{ restaurant: ids.restaurant, options: { reservations: false } }] },
    ],
    reservationsSettings: {
      auto_finish_reservations: true,
      table_occupancy_lunch_minutes: 60,
      same_hours_as_restaurant: false,
      reservation_hours: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        .map((day) => ({ day, hours: [{ open: "10:00", close: "15:00" }] })),
    },
  };
  t.mock.method(Restaurant, "findById", () => ({
    select() { return this; },
    populate: async () => restaurant,
    lean: async () => restaurant,
    then(resolve) { return Promise.resolve(restaurant).then(resolve); },
  }));
  t.mock.method(Restaurant, "find", () => ({
    select: () => ({ lean: async () => [restaurant] }),
  }));
  t.mock.method(Restaurant, "updateMany", async () => {});
  t.mock.method(DayLock, "findOneAndUpdate", async (_filter, update) => update.$set);
  t.mock.method(DayLock, "updateOne", async () => {});

  const writes = [];
  const matching = (filter) => [reservation, other].filter(sift(filter));
  const project = (item, projection) => {
    if (!item) return null;
    const fields = Object.entries(projection || {});
    if (fields.some(([, include]) => include === 1)) {
      return Object.fromEntries(fields
        .filter(([key, include]) => include === 1 && item[key] !== undefined)
        .map(([key]) => [key, item[key]]));
    }
    return Object.fromEntries(Object.entries(item).filter(([key]) => projection?.[key] !== 0));
  };
  t.mock.method(Reservation.collection, "findOne", async (filter, options) =>
    project(matching(filter)[0], options?.projection));
  t.mock.method(Reservation.collection, "find", (filter, options) => ({
    toArray: async () => matching(filter).map((item) => project(item, options?.projection)),
  }));
  t.mock.method(Reservation.collection, "distinct", async () => [ids.restaurant]);
  t.mock.method(Reservation.collection, "updateMany", async () => {});
  const apply = (filter, update) => {
    const item = matching(filter)[0];
    if (!item) return null;
    writes.push(update);
    Object.assign(item, update.$set);
    for (const [field, amount] of Object.entries(update.$inc || {})) {
      item[field] = (item[field] ?? 0) + amount;
    }
    return item;
  };
  t.mock.method(Reservation.collection, "findOneAndUpdate", async (filter, update, options) =>
    project(apply(filter, update), options?.projection));
  t.mock.method(Reservation.collection, "updateOne", async (filter, update) => ({
    matchedCount: apply(filter, update) ? 1 : 0,
  }));

  const listen = (allowed) => {
    const events = [];
    const client = {
      locals: { gustoEventModules: { reservations: allowed } },
      write: (line) => events.push(JSON.parse(line.slice(6))),
    };
    _addClient(ids.restaurant, client);
    t.after(() => _removeClient(ids.restaurant, client));
    return events;
  };
  return { reservation, other, writes, listen };
}

const arrivalRequest = (arrived, options) =>
  request("put", `${basePath}/:reservationId/arrival`, { ...options, body: { arrived } });

test("arrival writes only its own fields, is idempotent and broadcasts only to authorized devices", async (t) => {
  const { reservation, writes, listen } = fixture(t, "Late");
  const firstDevice = listen(true);
  const secondDevice = listen(true);
  const outOfModule = listen(false);
  const employee = { role: "employee", id: ids.employee };

  const [first, doubleTap] = await Promise.all([
    arrivalRequest(true),
    arrivalRequest(true, { user: employee }),
  ]);
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first, doubleTap);
  assert.equal(first.body.arrival.arrivedAt, now.toISOString());
  assert.deepEqual(writes[0], { $set: { arrivedAt: now }, $inc: { arrivalRevision: 1 } });
  assert.equal(writes.length, 1);
  assert.equal(reservation.status, "Late");
  assert.equal(firstDevice[0].type, "reservation_arrival_updated");
  assert.deepEqual(firstDevice, secondDevice);
  assert.deepEqual(outOfModule, []);

  t.mock.timers.tick(60_000);
  assert.deepEqual(await arrivalRequest(true), first);
  const cleared = await arrivalRequest(false);
  assert.deepEqual(cleared.body.arrival, {
    reservationId: ids.reservation, arrivedAt: null, arrivalRevision: 2,
  });
  assert.deepEqual(await arrivalRequest(false), cleared);
  assert.equal(writes.length, 2);
  assert.equal(firstDevice.length, 2);
  assert.deepEqual(providerCalls, []);
});

test("validates role, live employee permission, restaurant and current service day", async (t) => {
  const { reservation, writes, other } = fixture(t);
  assert.equal((await arrivalRequest(true, { user: null })).statusCode, 403);
  assert.equal((await arrivalRequest(true, { user: { role: "owner", id: ids.otherRestaurant } })).statusCode, 403);
  assert.equal((await arrivalRequest(true, {
    user: { role: "employee", id: ids.withoutAccess, restaurantId: ids.restaurant, options: { reservations: true } },
  })).statusCode, 403);
  assert.equal((await arrivalRequest(true, { reservationId: ids.otherReservation })).statusCode, 404);
  assert.equal((await arrivalRequest("true")).statusCode, 400);
  assert.equal(other.arrivedAt, undefined);
  reservation.status = "Pending";
  assert.equal((await arrivalRequest(true)).statusCode, 409);
  reservation.status = "Active";
  t.mock.timers.setTime(Date.parse("2026-11-19T01:00:00Z"));
  assert.equal(getCurrentReservationServiceDay(), serviceDay);
  assert.equal((await arrivalRequest(true)).statusCode, 200);
  assert.equal(reservation.status, "Active");
  t.mock.timers.setTime(Date.parse("2026-11-19T05:00:00Z"));
  assert.equal(getCurrentReservationServiceDay(), "2026-11-19");
  assert.equal((await arrivalRequest(true)).statusCode, 409);
  assert.equal(writes.length, 1);
});

test("authenticated list includes arrival, public detail and idempotent booking omit it", async (t) => {
  fixture(t);
  await arrivalRequest(true);
  const { body: { reservations } } = await request("get", basePath, {
    query: { from: serviceDay, to: serviceDay },
  });
  assert.equal(reservations[0].arrivedAt, now.toISOString());
  const publicDetail = await request("get", "/reservations/:reservationId", { user: null });
  const retry = await request("post", basePath, {
    user: null,
    body: { idempotencyKey: "synthetic-booking" },
  });
  for (const response of [publicDetail, retry]) {
    assert.ok(response.body.reservation);
    assert.equal("arrivedAt" in response.body.reservation, false);
    assert.equal("arrivalRevision" in response.body.reservation, false);
  }
});

for (const status of ["Canceled", "NoShow"]) {
  test(`${status} clears the recorded arrival in the same write`, async (t) => {
    const { reservation, writes, listen } = fixture(t);
    await arrivalRequest(true);
    const allowed = listen(true);
    const denied = listen(false);
    const result = await request("put", `${basePath}/:reservationId/status`, { body: { status } });
    assert.equal(result.statusCode, 200);
    assert.equal(reservation.status, status);
    assert.equal(reservation.arrivedAt, null);
    assert.equal(writes.at(-1).$set.status, status);
    assert.equal(writes.at(-1).$set.arrivedAt, null);
    assert.equal(writes.at(-1).$inc.arrivalRevision, 1);
    assert.equal(allowed[0].reservation.arrivalRevision, 2);
    assert.equal("arrivalRevision" in denied[0].reservation, false);
  });
}

test("a change of booking day clears the arrival, a normal edit preserves it", async (t) => {
  const { reservation, writes } = fixture(t);
  await arrivalRequest(true);
  const editPath = `${basePath}/:reservationId`;
  const normalEdit = await request("put", editPath, {
    body: { commentary: "Note locale", arrivedAt: null, arrivalRevision: 500 },
  });
  assert.equal(normalEdit.statusCode, 200);
  assert.equal(reservation.arrivedAt.toISOString(), now.toISOString());
  assert.equal(reservation.arrivalRevision, 1);
  const dateEdit = await request("put", editPath, { body: { reservationDate: "2026-11-19" } });
  assert.equal(dateEdit.statusCode, 200, JSON.stringify(dateEdit.body));
  assert.equal(writes.at(-1).$set.reservationDate.toISOString(), "2026-11-19T00:00:00.000Z");
  assert.equal(writes.at(-1).$set.arrivedAt, null);
  assert.equal(reservation.arrivalRevision, 2);
});

test("the auto-finish job and an arrival can overlap without overwriting either", async (t) => {
  const { reservation, writes } = fixture(t);
  t.mock.method(cron, "schedule", () => {});
  const runReservationLifecycle = require("../../services/cron-job/reservation-lifecycle.service");
  let notifyFinishWrite;
  const finishWrite = new Promise((resolve) => { notifyFinishWrite = resolve; });
  let releaseFinishWrite;
  const resumeFinish = new Promise((resolve) => { releaseFinishWrite = resolve; });
  const update = Reservation.collection.findOneAndUpdate;
  t.mock.method(Reservation.collection, "findOneAndUpdate", async (...args) => {
    if (args[1].$set.status === "Finished") {
      notifyFinishWrite();
      await resumeFinish;
    }
    return update(...args);
  });
  t.mock.timers.tick(2 * 60 * 60_000);
  const job = runReservationLifecycle();
  await Promise.race([finishWrite, job]);
  assert.equal(reservation.status, "Confirmed");
  try {
    assert.equal((await arrivalRequest(true)).statusCode, 200);
  } finally {
    releaseFinishWrite();
  }
  await job;
  assert.equal(reservation.status, "Finished");
  assert.equal(reservation.arrivedAt.toISOString(), new Date().toISOString());
  assert.equal(writes.at(-1).$set.status, "Finished");
  assert.equal("arrivedAt" in writes.at(-1).$set, false);
  assert.equal((await arrivalRequest(true)).statusCode, 409);
  assert.equal((await arrivalRequest(false)).statusCode, 200);
  assert.equal(reservation.status, "Finished");
});

test("manual finish works for a legacy reservation without an arrival", async (t) => {
  const { reservation } = fixture(t);
  const result = await request("put", `${basePath}/:reservationId/status`, { body: { status: "Finished" } });
  assert.equal(result.statusCode, 200);
  assert.equal(reservation.status, "Finished");
  assert.equal(reservation.arrivedAt, undefined);
});
