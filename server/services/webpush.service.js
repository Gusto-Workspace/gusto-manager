const crypto = require("crypto");
const webpush = require("web-push");
const PushSubscription = require("../models/push-subscription.model");

const MAX_PROVIDER_BODY_LOG_LENGTH = 1200;

// configure VAPID une seule fois
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

function hashEndpoint(endpoint) {
  return crypto
    .createHash("sha256")
    .update(String(endpoint || ""))
    .digest("hex")
    .slice(0, 12);
}

function sanitizeProviderValue(
  value,
  subscription,
  additionalSensitiveValues = [],
) {
  if (value === null || value === undefined || value === "") return null;

  let text;
  try {
    text =
      typeof value === "string"
        ? value
        : Buffer.isBuffer(value)
          ? value.toString("utf8")
          : JSON.stringify(value);
  } catch (_error) {
    text = String(value);
  }

  const sensitiveValues = [
    subscription?.endpoint,
    subscription?.keys?.p256dh,
    subscription?.keys?.auth,
    ...additionalSensitiveValues,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  for (const sensitiveValue of sensitiveValues) {
    text = text.split(sensitiveValue).join("[redacted]");
  }

  if (text.length > MAX_PROVIDER_BODY_LOG_LENGTH) {
    return `${text.slice(0, MAX_PROVIDER_BODY_LOG_LENGTH)}…[truncated]`;
  }

  return text;
}

function writePushDiagnostic(level, event, details) {
  const writer = level === "error" ? console.error : console.info;
  writer(`[${event}] ${JSON.stringify(details)}`);
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
  const subs = await PushSubscription.find({ restaurantId, module });

  const payload = JSON.stringify({ title, message, link, module, data });
  const notificationId = String(data?.notificationId || "").trim() || null;

  const attempts = await Promise.all(
    subs.map(async (subscription) => {
      const sentAt = new Date().toISOString();
      const startedAt = Date.now();
      const endpointHash = hashEndpoint(subscription.endpoint);

      try {
        const response = await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload,
        );

        const statusCode = Number(response?.statusCode) || null;
        writePushDiagnostic("info", "webpush-attempt", {
          sentAt,
          restaurantId: String(restaurantId),
          module,
          type: type || null,
          notificationId,
          endpointHash,
          result: "accepted",
          statusCode,
          status:
            statusCode === 201
              ? "201 / push accepté"
              : `${statusCode || "sans statut"} / push accepté`,
          durationMs: Date.now() - startedAt,
          providerBody: sanitizeProviderValue(
            response?.body,
            subscription,
          ),
        });

        return { sent: true, remove: false, endpoint: subscription.endpoint };
      } catch (err) {
        const statusCode = Number(err?.statusCode || err?.status) || null;
        const remove = statusCode === 404 || statusCode === 410;

        writePushDiagnostic("error", "webpush-attempt", {
          sentAt,
          restaurantId: String(restaurantId),
          module,
          type: type || null,
          notificationId,
          endpointHash,
          result: "rejected",
          statusCode,
          status: `${statusCode || "sans statut"} / push refusé`,
          errorName: sanitizeProviderValue(err?.name, subscription),
          errorMessage: sanitizeProviderValue(err?.message, subscription),
          providerBody: sanitizeProviderValue(err?.body, subscription),
          durationMs: Date.now() - startedAt,
          scheduledForRemoval: remove,
        });

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
    } catch (err) {
      writePushDiagnostic("error", "webpush-cleanup-error", {
        sentAt: new Date().toISOString(),
        restaurantId: String(restaurantId),
        module,
        type: type || null,
        notificationId,
        requestedRemovals: deadEndpoints.length,
        errorName: sanitizeProviderValue(
          err?.name || "Error",
          null,
          deadEndpoints,
        ),
        errorMessage: sanitizeProviderValue(
          err?.message || "Subscription cleanup failed",
          null,
          deadEndpoints,
        ),
      });
    }
  }

  const summary = {
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

  writePushDiagnostic("info", "webpush-summary", summary);
  return summary;
}

module.exports = { sendPushToModule };
