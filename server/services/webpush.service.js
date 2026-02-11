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
  title,
  message,
  link,
  data = {},
}) {
  const subs = await PushSubscription.find({ restaurantId, module });

  const payload = JSON.stringify({ title, message, link, module, data });

  const deadEndpoints = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          payload,
        );
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          deadEndpoints.push(s.endpoint);
        }
      }
    }),
  );

  if (deadEndpoints.length) {
    await PushSubscription.deleteMany({ endpoint: { $in: deadEndpoints } });
  }
}

module.exports = { sendPushToModule };
