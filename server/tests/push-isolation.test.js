const test = require("node:test");
const assert = require("node:assert/strict");
const A = "aaaaaaaaaaaaaaaaaaaaaaaa",
  B = "bbbbbbbbbbbbbbbbbbbbbbbb",
  C = "cccccccccccccccccccccccc";
const userId = "111111111111111111111111";
const sent = [];
const webpushPath = require.resolve("web-push");
require.cache[webpushPath] = {
  id: webpushPath,
  filename: webpushPath,
  loaded: true,
  exports: {
    setVapidDetails() {},
    sendNotification: async (subscription, payload) =>
      sent.push({ subscription, payload: JSON.parse(payload) }),
  },
};
const Subscription = require("../models/push-subscription.model");
const Restaurant = require("../models/restaurant.model");
const Employee = require("../models/employee.model");
const Notification = require("../models/notification.model");
const router = require("../routes/push-subscription.routes");
const { sendPushToModule } = require("../services/webpush.service");
const { buildPushLink } = require("../services/notifications.service");
let documents = [],
  sequence = 0;
const copy = (value) => JSON.parse(JSON.stringify(value));
function matches(doc, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((part) => matches(doc, part));
    const value = doc[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$exists" in expected)
        return (value !== undefined) === expected.$exists;
      if ("$size" in expected)
        return Array.isArray(value) && value.length === expected.$size;
      if ("$in" in expected) return expected.$in.includes(value);
    }
    return Array.isArray(value)
      ? value.includes(String(expected))
      : value == expected;
  });
}
function expression(value, doc) {
  if (typeof value === "string" && value.startsWith("$"))
    return doc[value.slice(1)];
  if (Array.isArray(value)) return value.map((v) => expression(v, doc));
  if (value && typeof value === "object") {
    if (value.$ifNull) {
      const [a, b] = expression(value.$ifNull, doc);
      return a ?? b;
    }
    if (value.$setDifference) {
      const [a, b] = expression(value.$setDifference, doc);
      return a.filter((v) => !b.map(String).includes(String(v)));
    }
    if (value.toHexString) return String(value);
  }
  return value;
}
function update(doc, change, inserted = false) {
  if (Array.isArray(change)) {
    for (const stage of change)
      for (const [key, value] of Object.entries(stage.$set))
        doc[key] = expression(value, doc);
    return;
  }
  if (inserted) Object.assign(doc, copy(change.$setOnInsert || {}));
  Object.assign(doc, copy(change.$set || {}));
  for (const [key, value] of Object.entries(change.$addToSet || {})) {
    doc[key] = [
      ...new Set([
        ...(doc[key] || []),
        ...(value.$each || [value]).map(String),
      ]),
    ];
  }
}
Subscription.findOne = (filter) => ({
  lean: async () => {
    const doc = documents.find((d) => matches(d, filter));
    return doc ? copy(doc) : null;
  },
});
Subscription.find = async (filter) =>
  documents.filter((d) => matches(d, filter)).map(copy);
Subscription.updateOne = async (filter, change, options = {}) => {
  let doc = documents.find((d) => matches(d, filter));
  const inserted = !doc;
  if (!doc) {
    if (!options.upsert) return;
    if (documents.some((d) => d.endpoint === filter.endpoint))
      throw { code: 11000 };
    doc = { _id: String(++sequence) };
    documents.push(doc);
  }
  update(doc, change, inserted);
};
Subscription.updateMany = async (filter, change) =>
  documents
    .filter((d) => matches(d, filter))
    .forEach((doc) => update(doc, change));
Subscription.findOneAndUpdate = (filter, change) => ({
  lean: async () => {
    const doc = documents.find((d) => matches(d, filter));
    if (!doc) return null;
    update(doc, change);
    return copy(doc);
  },
});
Subscription.deleteOne = async (filter) => {
  const i = documents.findIndex((d) => matches(d, filter));
  if (i >= 0) documents.splice(i, 1);
};
Subscription.deleteMany = async (filter) => {
  const before = documents.length;
  documents = documents.filter((d) => !matches(d, filter));
  return { deletedCount: before - documents.length };
};
Restaurant.findOne = (filter) => ({
  select: async () =>
    [A, B].includes(String(filter._id))
      ? { _id: filter._id, options: { take_away: true } }
      : null,
});
Restaurant.findById = (id) => ({
  select: () => ({
    lean: async () => ({
      _id: id,
      owner_id: userId,
      options: { take_away: true },
    }),
  }),
});
Employee.find = () => ({ select: () => ({ lean: async () => [] }) });

async function call(
  path,
  body,
  user = { id: userId, role: "owner" },
  params = {},
) {
  const route = router.stack.find((layer) => layer.route?.path === path).route;
  assert.equal(route.stack[0].handle.name, "authenticateToken");
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  await route.stack.at(-1).handle({ body, user, params }, res);
  return res;
}
const input = (restaurantId, extra = {}) => ({
  restaurantId,
  module: "reservations",
  subscription: {
    endpoint: "endpoint-1",
    keys: { auth: "synthetic-auth", p256dh: "synthetic-key" },
  },
  ...extra,
});

test("one endpoint retains A and B, routes both, and can disable A without disabling B", async () => {
  documents = [];
  sent.length = 0;
  assert.equal((await call("/push/subscribe", input(A))).statusCode, 200);
  assert.equal((await call("/push/subscribe", input(B))).statusCode, 200);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].restaurantId, A);
  assert.deepEqual(documents[0].restaurantIds, [A, B]);
  for (const restaurantId of [A, B]) {
    const result = await sendPushToModule({
      restaurantId,
      module: "reservations",
      title: "Test",
      link: "/dashboard/webapp/reservations?reservationId=r1",
      data: { notificationId: "n1" },
    });
    assert.equal(result.sent, 1);
    assert.equal(sent.at(-1).payload.restaurantId, restaurantId);
    assert.equal(sent.at(-1).payload.data.restaurantId, restaurantId);
    assert.equal(sent.at(-1).payload.userId, userId);
    assert.equal(
      new URL(sent.at(-1).payload.link, "https://example.com").searchParams.get(
        "reservationId",
      ),
      "r1",
    );
  }
  const disabled = await call("/push/unsubscribe", {
    restaurantId: A,
    module: "reservations",
    endpoint: "endpoint-1",
  });
  assert.equal(disabled.body.hasOtherRestaurants, true);
  assert.deepEqual(documents[0].restaurantIds, [B]);
  assert.equal(
    (await sendPushToModule({ restaurantId: A, module: "reservations" })).sent,
    0,
  );
  assert.equal(
    (await sendPushToModule({ restaurantId: B, module: "reservations" })).sent,
    1,
  );
});

test("legacy primary association is backfilled once and survives refreshes without duplicates", async () => {
  documents = [
    {
      _id: "legacy",
      endpoint: "endpoint-1",
      module: "reservations",
      userId,
      restaurantId: A,
      keys: {},
    },
  ];
  assert.equal(
    (await sendPushToModule({ restaurantId: A, module: "reservations" })).sent,
    1,
  );
  for (let n = 0; n < 3; n++) await call("/push/subscribe", input(B));
  assert.deepEqual(documents[0].restaurantIds, [A, B]);
  await call("/push/unsubscribe", {
    restaurantId: A,
    module: "reservations",
    endpoint: "endpoint-1",
  });
  await call("/push/subscribe", input(B));
  assert.deepEqual(documents[0].restaurantIds, [B]);
});

test("module, user, and unauthorized restaurant cannot silently reassign an endpoint", async () => {
  documents = [];
  await call("/push/subscribe", input(A));
  const snapshot = copy(documents);
  assert.equal(
    (await call("/push/subscribe", input(B, { module: "gift_cards" })))
      .statusCode,
    409,
  );
  assert.equal(
    (
      await call("/push/subscribe", input(B), {
        id: "222222222222222222222222",
        role: "owner",
      })
    ).statusCode,
    409,
  );
  assert.equal((await call("/push/subscribe", input(C))).statusCode, 403);
  assert.equal(
    (await call("/push/subscribe", input(A, { module: "manager" }))).statusCode,
    400,
  );
  assert.deepEqual(documents, snapshot);
});

test("a concurrent unsubscribe is not undone by legacy array backfill", async () => {
  documents = [
    {
      _id: "legacy-race",
      endpoint: "endpoint-1",
      module: "reservations",
      userId,
      restaurantId: A,
      keys: {},
    },
  ];
  const original = Subscription.updateOne;
  let interrupted = false;
  Subscription.updateOne = async (filter, change, options) => {
    if (!interrupted && filter.restaurantIds?.$exists === false) {
      interrupted = true;
      documents[0].restaurantIds = []; // another request atomically disabled A
    }
    return original(filter, change, options);
  };
  try {
    assert.equal((await call("/push/subscribe", input(B))).statusCode, 200);
    assert.equal(interrupted, true);
    assert.deepEqual(documents[0].restaurantIds, [B]);
  } finally {
    Subscription.updateOne = original;
  }
});

test("targeted legacy take-away migration transfers all authorized restaurants before retiring its record", async () => {
  documents = [
    {
      _id: "legacy",
      endpoint: "old-endpoint",
      module: "take_away",
      userId,
      restaurantId: A,
      restaurantIds: [A, B, C],
      keys: {},
    },
  ];
  const result = await call(
    "/push/subscribe",
    input(A, { module: "take_away", previousEndpoint: "old-endpoint" }),
  );
  assert.equal(result.statusCode, 200);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].endpoint, "endpoint-1");
  assert.deepEqual(documents[0].restaurantIds, [A, B]);
});

test("losing take-away access to A removes only A from a multi-restaurant endpoint", async () => {
  documents = [
    {
      _id: "bad-user",
      endpoint: "endpoint-1",
      module: "take_away",
      userId: "222222222222222222222222",
      restaurantId: A,
      restaurantIds: [A, B],
      keys: {},
    },
  ];
  const result = await sendPushToModule({
    restaurantId: A,
    module: "take_away",
  });
  assert.equal(result.sent, 0);
  assert.deepEqual(documents[0].restaurantIds, [B]);
});

test("historical notification context is exposed only to authorized restaurant users", async () => {
  Notification.findById = () => ({
    select: () => ({
      lean: async () => ({ restaurantId: A, module: "reservations" }),
    }),
  });
  const found = await call(
    "/push/notifications/:notificationId/context",
    {},
    undefined,
    { notificationId: "old" },
  );
  assert.deepEqual(found.body, { restaurantId: A, module: "reservations" });
  Notification.findById = () => ({
    select: () => ({
      lean: async () => ({ restaurantId: C, module: "reservations" }),
    }),
  });
  assert.equal(
    (
      await call("/push/notifications/:notificationId/context", {}, undefined, {
        notificationId: "old",
      })
    ).statusCode,
    404,
  );
});

test("push deep links retain the notification, entity, date and restaurant", () => {
  for (const [module, entity] of [
    ["reservations", "reservationId"],
    ["gift_cards", "purchaseId"],
    ["take_away", "orderId"],
  ]) {
    const link = buildPushLink({
      module,
      restaurantId: A,
      notificationId: "n1",
      data: {
        _id: "entity-1",
        reservationDate: "2026-10-26",
        scheduledFor: "2026-10-26",
      },
    });
    const url = new URL(link, "https://example.com");
    assert.equal(url.searchParams.get("restaurantId"), A);
    assert.equal(url.searchParams.get("notificationId"), "n1");
    assert.equal(url.searchParams.get(entity), "entity-1");
  }
});
