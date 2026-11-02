const crypto = require("crypto");

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

function createServiceSignature({ timestamp, payload, secret }) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${JSON.stringify(payload || {})}`)
    .digest("hex");
}

function verifyServiceSignature(req, res, next) {
  const timestamp = String(req.headers["x-gusto-timestamp"] || "");
  const signature = String(req.headers["x-gusto-signature"] || "");
  const secret = process.env.GUSTO_SHARED_SECRET;
  const timestampNumber = Number(timestamp);

  function reject(status, code, message) {
    if (req.path === "/take-away/stripe-events") {
      const safeId = (value) => typeof value === "string" && /^[A-Za-z0-9_]{1,100}$/.test(value) ? value : null;
      console.error("[take-away-service-auth-error]", {
        eventId: safeId(req.body?.event?.id),
        orderId: safeId(req.body?.event?.data?.object?.metadata?.orderId),
        code,
        status,
      });
    }
    return res.status(status).json({ error: message, code });
  }

  if (!secret) {
    return reject(500, "SERVICE_SIGNATURE_NOT_CONFIGURED", "Server misconfigured");
  }
  if (
    !signature ||
    !Number.isFinite(timestampNumber) ||
    Math.abs(Date.now() - timestampNumber) > MAX_SIGNATURE_AGE_MS
  ) {
    return reject(401, "INVALID_SIGNATURE", "Invalid signature");
  }

  const expected = createServiceSignature({
    timestamp,
    payload: req.body,
    secret,
  });
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return reject(401, "INVALID_SIGNATURE", "Invalid signature");
  }

  return next();
}

module.exports = {
  MAX_SIGNATURE_AGE_MS,
  createServiceSignature,
  verifyServiceSignature,
};
