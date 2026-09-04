const webpush = require("web-push");
const PushSubscription = require("../models/push-subscription.model");

// configure VAPID une seule fois
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

async function sendPushToModule({
  restaurantId,
  module,
  type,
  title,
  message,
  link,
  data = {},
}) {
  const subs = await PushSubscription.find({ restaurantId, module });

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

  const deadEndpoints = attempts
    .filter((attempt) => attempt.remove)
    .map((attempt) => attempt.endpoint);
  let removed = 0;

  if (deadEndpoints.length) {
    try {
      const deletionResult = await PushSubscription.deleteMany({
        endpoint: { $in: deadEndpoints },
      });
      removed = Number(deletionResult?.deletedCount || 0);
    } catch (_error) {}
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

module.exports = { sendPushToModule };
