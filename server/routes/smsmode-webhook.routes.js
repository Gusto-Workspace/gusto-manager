const crypto = require("crypto");
const express = require("express");
const SmsJobModel = require("../models/sms-job.model");
const { applyProviderStatus } = require("../services/sms/sms-reminder.service");

function signatureIsValid(rawBody, received) {
  const secret = String(process.env.SMSMODE_WEBHOOK_SECRET || "");
  if (!secret || !received || !Buffer.isBuffer(rawBody)) return false;
  const normalized = String(received).replace(/^sha256=/i, "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(normalized, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function createSmsmodeWebhookRouter({
  smsJobModel = SmsJobModel,
  applyStatus = applyProviderStatus,
} = {}) {
  const router = express.Router();
  router.post("/smsmode/dlr", express.raw({ type: "*/*", limit: "256kb" }), async (req, res) => {
    if (!signatureIsValid(req.body, req.get("X-Smsmode-256"))) return res.status(401).json({ message: "Invalid signature" });
    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch (_) {
      return res.status(400).json({ message: "Invalid JSON" });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ message: "Invalid JSON" });
    }
    if (!payload.messageId && !payload.refClient) {
      return res.status(200).json({ received: true });
    }
    const job = await smsJobModel.findOne({
      $or: [
        ...(payload.messageId ? [{ providerMessageId: payload.messageId }] : []),
        ...(payload.refClient ? [{ providerReference: payload.refClient }] : []),
      ],
    });
    res.status(200).json({ received: true });
    if (job) {
      applyStatus(job, payload).catch((error) =>
        console.error("[smsmode-dlr]", String(job._id), error?.message || error),
      );
    }
  });
  return router;
}

module.exports = createSmsmodeWebhookRouter();
module.exports.createSmsmodeWebhookRouter = createSmsmodeWebhookRouter;
module.exports.signatureIsValid = signatureIsValid;
