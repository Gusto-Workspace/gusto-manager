const test = require("node:test");
const assert = require("node:assert/strict");

const webPushPackagePath = require.resolve("web-push");
require.cache[webPushPackagePath] = {
  id: webPushPackagePath,
  filename: webPushPackagePath,
  loaded: true,
  exports: {
    setVapidDetails() {},
    async sendNotification() {},
  },
};

const RestaurantModel = require("../models/restaurant.model");
const EmployeeModel = require("../models/employee.model");
const {
  filterAuthorizedTakeAwaySubscriptions,
} = require("../services/webpush.service");

test("take-away push excludes subscriptions whose employee lost module access", async (t) => {
  const originalRestaurantFindById = RestaurantModel.findById;
  const originalEmployeeFind = EmployeeModel.find;
  let takeAwayEnabled = true;

  RestaurantModel.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: "restaurant-1",
        owner_id: "owner-1",
        options: { take_away: takeAwayEnabled },
      }),
    }),
  });
  EmployeeModel.find = () => ({
    select: () => ({
      lean: async () => [{ _id: "employee-allowed" }],
    }),
  });

  t.after(() => {
    RestaurantModel.findById = originalRestaurantFindById;
    EmployeeModel.find = originalEmployeeFind;
  });

  const subscriptions = [
    { endpoint: "owner", userId: "owner-1" },
    { endpoint: "allowed", userId: "employee-allowed" },
    { endpoint: "denied", userId: "employee-denied" },
    { endpoint: "legacy-without-user", userId: null },
  ];
  const filtered = await filterAuthorizedTakeAwaySubscriptions(
    "restaurant-1",
    subscriptions,
  );

  assert.deepEqual(
    filtered.subscriptions.map((subscription) => subscription.endpoint),
    ["owner", "allowed"],
  );
  assert.deepEqual(
    filtered.unauthorized.map((subscription) => subscription.endpoint),
    ["denied", "legacy-without-user"],
  );

  takeAwayEnabled = false;
  const disabled = await filterAuthorizedTakeAwaySubscriptions(
    "restaurant-1",
    subscriptions,
  );
  assert.equal(disabled.subscriptions.length, 0);
  assert.equal(disabled.unauthorized.length, subscriptions.length);
});
