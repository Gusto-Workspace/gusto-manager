const webpush = require("web-push");
const PushSubscription = require("../models/push-subscription.model");
const RestaurantModel = require("../models/restaurant.model");
const EmployeeModel = require("../models/employee.model");

// configure VAPID une seule fois
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

async function filterAuthorizedTakeAwaySubscriptions(
  restaurantId,
  subscriptions,
) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  const restaurant = await RestaurantModel.findById(restaurantId)
    .select("_id owner_id options.take_away")
    .lean();

  if (!restaurant || restaurant.options?.take_away !== true) {
    return { subscriptions: [], unauthorized: list };
  }

  const ownerId = String(restaurant.owner_id || "");
  const employeeIds = Array.from(
    new Set(
      list
        .map((subscription) => String(subscription.userId || ""))
        .filter((userId) => userId && userId !== ownerId),
    ),
  );
  const allowedEmployees = employeeIds.length
    ? await EmployeeModel.find({
        _id: { $in: employeeIds },
        restaurants: restaurantId,
        restaurantProfiles: {
          $elemMatch: {
            restaurant: restaurantId,
            "options.take_away": true,
          },
        },
      })
        .select("_id")
        .lean()
    : [];
  const allowedUserIds = new Set([
    ownerId,
    ...allowedEmployees.map((employee) => String(employee._id)),
  ]);

  return list.reduce(
    (result, subscription) => {
      if (allowedUserIds.has(String(subscription.userId || ""))) {
        result.subscriptions.push(subscription);
      } else {
        result.unauthorized.push(subscription);
      }
      return result;
    },
    { subscriptions: [], unauthorized: [] },
  );
}

async function sendPushToModule({
  restaurantId,
  module,
  type,
  title,
  message,
  link,
  data = {},
}) {
  let subs = await PushSubscription.find({ restaurantId, module });
  let unauthorizedEndpoints = [];

  if (module === "take_away") {
    const filtered = await filterAuthorizedTakeAwaySubscriptions(
      restaurantId,
      subs,
    );
    subs = filtered.subscriptions;
    unauthorizedEndpoints = filtered.unauthorized.map(
      (subscription) => subscription.endpoint,
    );
  }

  const payload = JSON.stringify({ title, message, link, module, data });
  const notificationId = String(data?.notificationId || "").trim() || null;

  const attempts = await Promise.all(
    subs.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload,
        );
        return { sent: true, remove: false, endpoint: subscription.endpoint };
      } catch (err) {
        const statusCode = Number(err?.statusCode || err?.status) || null;
        const remove = statusCode === 404 || statusCode === 410;
        return { sent: false, remove, endpoint: subscription.endpoint };
      }
    }),
  );

  const deadEndpoints = Array.from(
    new Set([
      ...unauthorizedEndpoints,
      ...attempts
        .filter((attempt) => attempt.remove)
        .map((attempt) => attempt.endpoint),
    ]),
  );
  let removed = 0;

  if (deadEndpoints.length) {
    try {
      const deletionResult = await PushSubscription.deleteMany({
        endpoint: { $in: deadEndpoints },
      });
      removed = Number(deletionResult?.deletedCount || 0);
    } catch (_error) {
      // L’envoi reste non bloquant si le nettoyage des abonnements échoue.
    }
  }

  return {
    sentAt: new Date().toISOString(),
    restaurantId: String(restaurantId),
    module,
    type: type || null,
    notificationId,
    total: attempts.length,
    sent: attempts.filter((attempt) => attempt.sent).length,
    failed: attempts.filter((attempt) => !attempt.sent).length,
    removed,
  };
}

module.exports = {
  sendPushToModule,
  filterAuthorizedTakeAwaySubscriptions,
};
