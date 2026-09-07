const test = require("node:test");
const assert = require("node:assert/strict");

const webpushServicePath = require.resolve("../services/webpush.service");
require.cache[webpushServicePath] = {
  id: webpushServicePath,
  filename: webpushServicePath,
  loaded: true,
  exports: { sendPushToModule: async () => ({ sent: 0 }) },
};

const CustomerModel = require("../models/customer.model");
const EmployeeModel = require("../models/employee.model");
const PushSubscriptionModel = require("../models/push-subscription.model");
const RestaurantModel = require("../models/restaurant.model");
const TakeAwayOrderModel = require("../models/take-away-order.model");
const {
  cleanupCompletedTakeAwayOrders,
  listImportableSourceItems,
  markCatalogSourcesDeleted,
  upsertCatalogItemFromSource,
} = require("../services/take-away.service");
const {
  onTakeAwayOrderCreated,
} = require("../services/customers.service");
const {
  buildNotificationContent,
  buildNotificationMeta,
  buildPushLink,
} = require("../services/notifications.service");
const transactionsRouter = require("../routes/transactions.routes");
const pushRouter = require("../routes/push-subscription.routes");
const {
  sanitizePublicRestaurantData,
} = require("../services/public-restaurant-serialization.service");

test("wine imports use explicit volume options without double charging", () => {
  const restaurant = {
    wine_categories: [
      {
        _id: "category-1",
        name: "Vins rouges",
        wines: [
          {
            _id: "wine-1",
            name: "Cuvée test",
            appellation: "Bordeaux",
            volumes: [
              { volume: "12 CL", price: 5 },
              { volume: "75 CL", price: 24 },
            ],
          },
        ],
        subCategories: [],
      },
    ],
    dish_categories: [],
    drink_categories: [],
    menus: [],
    takeAwayCatalog: [],
  };

  const [importable] = listImportableSourceItems(restaurant);
  assert.equal(importable.price, 0);
  assert.deepEqual(importable.options, [
    { name: "12 CL", price: 5 },
    { name: "75 CL", price: 24 },
  ]);

  const imported = upsertCatalogItemFromSource({
    restaurant,
    sourceType: "wine",
    sourceItemId: "wine-1",
    sourceCategoryId: "category-1",
  });
  assert.equal(imported.price, 0);
  assert.equal(imported.syncedWithSource, false);
  assert.deepEqual(imported.options, importable.options);
});

test("source deletion keeps every snapshot but hides it from public ordering", () => {
  const restaurant = {
    takeAwayCatalog: [
      {
        sourceType: "dish",
        sourceItemId: "dish-1",
        active: true,
        visible: true,
        syncedWithSource: true,
      },
      {
        sourceType: "dish",
        sourceItemId: "dish-1",
        active: true,
        visible: true,
      },
      {
        sourceType: "custom",
        sourceItemId: null,
        active: true,
        visible: true,
      },
    ],
  };

  assert.equal(markCatalogSourcesDeleted(restaurant, "dish", "dish-1"), 2);
  assert.equal(restaurant.takeAwayCatalog.length, 3);
  for (const item of restaurant.takeAwayCatalog.slice(0, 2)) {
    assert.equal(item.active, false);
    assert.equal(item.visible, false);
    assert.equal(item.sourceDeleted, true);
    assert.equal(item.syncedWithSource, false);
  }
  assert.equal(restaurant.takeAwayCatalog[2].active, true);
});

test("dish, menu, drink and wine sources follow the same deletion rule", () => {
  const sourceTypes = ["dish", "menu", "drink", "wine"];
  const restaurant = {
    takeAwayCatalog: sourceTypes.map((sourceType) => ({
      sourceType,
      sourceItemId: `${sourceType}-1`,
      active: true,
      visible: true,
    })),
  };

  for (const sourceType of sourceTypes) {
    assert.equal(
      markCatalogSourcesDeleted(
        restaurant,
        sourceType,
        `${sourceType}-1`,
      ),
      1,
    );
  }
  assert.equal(
    restaurant.takeAwayCatalog.every(
      (item) =>
        item.sourceDeleted === true &&
        item.active === false &&
        item.visible === false,
    ),
    true,
  );
});

test("completed-order cleanup respects enablement and the configured delay", async (t) => {
  const originalDeleteMany = TakeAwayOrderModel.deleteMany;
  let receivedFilter = null;
  TakeAwayOrderModel.deleteMany = async (filter) => {
    receivedFilter = filter;
    return { deletedCount: 3 };
  };
  t.after(() => {
    TakeAwayOrderModel.deleteMany = originalDeleteMany;
  });

  const disabled = await cleanupCompletedTakeAwayOrders({
    _id: "restaurant-1",
    takeAwaySettings: { completedOrderAutoDeleteEnabled: false },
  });
  assert.deepEqual(disabled, { enabled: false, deleted: 0 });
  assert.equal(receivedFilter, null);

  const now = new Date("2026-09-07T12:00:00.000Z");
  const enabled = await cleanupCompletedTakeAwayOrders(
    {
      _id: "restaurant-1",
      takeAwaySettings: {
        completedOrderAutoDeleteEnabled: true,
        completedOrderAutoDeleteMinutes: 60,
      },
    },
    { now },
  );
  assert.deepEqual(enabled, { enabled: true, deleted: 3 });
  assert.equal(receivedFilter.restaurant_id, "restaurant-1");
  assert.equal(receivedFilter.status, "completed");
  assert.equal(
    receivedFilter.$or[0].completedAt.$lte.toISOString(),
    "2026-09-07T11:00:00.000Z",
  );

  await cleanupCompletedTakeAwayOrders(
    {
      _id: "restaurant-legacy",
      takeAwaySettings: {
        completedOrderAutoDeleteEnabled: false,
        completedOrderAutoDeleteMinutes: 259200,
        completedOrderAutoDeleteDays: 2,
      },
    },
    { now },
  );
  assert.equal(
    receivedFilter.$or[0].completedAt.$lte.toISOString(),
    "2026-09-05T12:00:00.000Z",
  );
});

test("CRM take-away history stores a durable item count summary", async (t) => {
  const originalUpdateOne = CustomerModel.updateOne;
  let update = null;
  CustomerModel.updateOne = async (_filter, nextUpdate) => {
    update = nextUpdate;
    return { modifiedCount: 0 };
  };
  t.after(() => {
    CustomerModel.updateOne = originalUpdateOne;
  });

  await onTakeAwayOrderCreated("customer-1", {
    _id: "order-1",
    orderNumber: "TA-1",
    items: [{ quantity: 2 }, { quantity: 3 }],
  });
  assert.equal(update.$push.lastTakeAwayOrders.$each[0].itemCount, 5);
});

test("take-away notifications carry the day and order id to every target", () => {
  const data = {
    _id: "order-1",
    orderNumber: "TA-1",
    scheduledFor: "2026-09-08T18:30:00.000Z",
  };
  assert.equal(
    buildNotificationContent({ type: "takeaway_order_created", data }).link,
    "/dashboard/take-away?day=2026-09-08&orderId=order-1",
  );
  assert.equal(
    buildPushLink({ module: "take_away", data, notificationId: "notif-1" }),
    "/dashboard/take-away?day=2026-09-08&orderId=order-1&notificationId=notif-1",
  );
  assert.equal(
    buildNotificationMeta({ type: "takeaway_order_created", data })
      .scheduledFor,
    data.scheduledFor,
  );
});

test("the lifecycle runs completed-order cleanup server-side", async (t) => {
  const cronPath = require.resolve("node-cron");
  const servicePath = require.resolve("../services/take-away.service");
  const lifecyclePath = require.resolve(
    "../services/cron-job/take-away-lifecycle.service",
  );
  const originalCronCache = require.cache[cronPath];
  const originalServiceExports = require.cache[servicePath].exports;
  let cleanupCalls = 0;

  require.cache[cronPath] = {
    id: cronPath,
    filename: cronPath,
    loaded: true,
    exports: { schedule: () => ({}) },
  };
  require.cache[servicePath].exports = {
    ...originalServiceExports,
    expirePendingTakeAwayOrders: async () => ({ expired: 0 }),
    replayPendingTakeAwayEffects: async () => ({ replayed: 0 }),
    cleanupConfiguredCompletedTakeAwayOrders: async () => {
      cleanupCalls += 1;
      return { checked: 1, deleted: 2 };
    },
  };
  delete require.cache[lifecyclePath];
  t.after(() => {
    delete require.cache[lifecyclePath];
    require.cache[servicePath].exports = originalServiceExports;
    if (originalCronCache) require.cache[cronPath] = originalCronCache;
    else delete require.cache[cronPath];
  });

  const runLifecycle = require(lifecyclePath);
  const result = await runLifecycle();
  assert.equal(cleanupCalls, 1);
  assert.deepEqual(result.cleanup, { checked: 1, deleted: 2 });
});

test("Stripe take-away charges are visible even after order cleanup", () => {
  const transaction = transactionsRouter.formatChargeForDashboard({
    charge: {
      id: "ch_1",
      amount: 3250,
      currency: "eur",
      created: 1788782400,
      status: "succeeded",
      refunded: true,
      refunds: { data: [{ created: 1788782500 }] },
      payment_intent: {
        id: "pi_1",
        metadata: {
          type: "takeaway_order",
          restaurantId: "restaurant-1",
          orderId: "order-1",
          orderNumber: "TA-20260907-TEST",
        },
      },
    },
    expectedRestaurantId: "restaurant-1",
  });

  assert.equal(transaction.type, "take_away_order");
  assert.equal(transaction.orderNumber, "TA-20260907-TEST");
  assert.equal(transaction.grossAmount, "32.50");
  assert.equal(transaction.takeAwayOrder.orderId, "order-1");
  assert.equal(transaction.refunded, true);
  assert.equal(transaction.refundedAt, 1788782500);
});

test("take-away push checks restaurant and employee module rights", async (t) => {
  const originalRestaurantFindOne = RestaurantModel.findOne;
  const originalEmployeeExists = EmployeeModel.exists;
  assert.equal(
    PushSubscriptionModel.schema.path("module").enumValues.includes("take_away"),
    true,
  );
  let restaurantTakeAwayEnabled = true;
  let employeeAllowed = true;
  RestaurantModel.findOne = () => ({
    select: async () => ({
      _id: "restaurant-1",
      options: { take_away: restaurantTakeAwayEnabled },
    }),
  });
  EmployeeModel.exists = async (filter) =>
    employeeAllowed &&
    filter.restaurantProfiles.$elemMatch["options.take_away"] === true;
  t.after(() => {
    RestaurantModel.findOne = originalRestaurantFindOne;
    EmployeeModel.exists = originalEmployeeExists;
  });

  assert.equal(
    await pushRouter.userCanAccessRestaurant(
      { id: "employee-1", role: "employee" },
      "restaurant-1",
      "take_away",
    ),
    true,
  );
  employeeAllowed = false;
  assert.equal(
    await pushRouter.userCanAccessRestaurant(
      { id: "employee-1", role: "employee" },
      "restaurant-1",
      "take_away",
    ),
    false,
  );
  restaurantTakeAwayEnabled = false;
  assert.equal(
    await pushRouter.userCanAccessRestaurant(
      { id: "owner-1", role: "owner" },
      "restaurant-1",
      "take_away",
    ),
    false,
  );
});

test("public restaurant serialization preserves website fields and removes internals", () => {
  const publicRestaurant = sanitizePublicRestaurantData({
    _id: "restaurant-1",
    name: "Restaurant test",
    dish_categories: [{ name: "Carte" }],
    menus: [{ name: "Menu" }],
    giftCards: [{ value: 50 }],
    options: { reservations: true },
    reservationsSettings: {
      auto_accept: true,
      reservation_hours: [{ day: "monday" }],
      email_templates: { confirmed: { subject: "Interne" } },
      deletion_duration: true,
    },
    stripeSecretKey: "encrypted-secret",
    stripeCustomerId: "cus_1",
    owner_id: "owner-1",
    employees: ["employee-1"],
    purchasesGiftCards: [{ customerEmail: "private@example.com" }],
    giftCardSold: { totalSold: 1 },
    takeAwaySettings: { enabled: true },
    takeAwayCatalog: [{ name: "Masqué", visible: false }],
  });

  assert.equal(publicRestaurant.name, "Restaurant test");
  assert.equal(publicRestaurant.dish_categories.length, 1);
  assert.equal(publicRestaurant.menus.length, 1);
  assert.equal(publicRestaurant.giftCards.length, 1);
  assert.equal(publicRestaurant.reservationsSettings.auto_accept, true);
  assert.equal(publicRestaurant.reservationsSettings.reservation_hours.length, 1);
  for (const field of [
    "stripeSecretKey",
    "stripeCustomerId",
    "owner_id",
    "employees",
    "purchasesGiftCards",
    "giftCardSold",
    "takeAwaySettings",
    "takeAwayCatalog",
  ]) {
    assert.equal(Object.hasOwn(publicRestaurant, field), false);
  }
  assert.equal(
    Object.hasOwn(publicRestaurant.reservationsSettings, "email_templates"),
    false,
  );
});
