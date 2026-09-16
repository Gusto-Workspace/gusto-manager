const crypto = require("crypto");
const express = require("express");
const SmsJobModel = require("../models/sms-job.model");
const { applyProviderStatus } = require("../services/sms/sms-reminder.service");

const router = express.Router();

function signatureIsValid(rawBody, received) {
  const secret = String(process.env.SMSMODE_WEBHOOK_SECRET || "");
  if (!secret || !received) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const normalized = String(received).replace(/^sha256=/i, "").trim().toLowerCase();
  const left = Buffer.from(expected, "hex");
  const right = /^[a-f0-9]{64}$/.test(normalized) ? Buffer.from(normalized, "hex") : Buffer.alloc(0);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

router.post("/smsmode/dlr", express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
  if (!signatureIsValid(req.body, req.get("X-Smsmode-256"))) return res.status(401).json({ message: "Invalid signature" });
  let payload;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch (_) {
    return res.status(400).json({ message: "Invalid JSON" });
  }
  if (!payload.messageId && !payload.refClient) {
    return res.status(200).json({ received: true });
  }
  const job = await SmsJobModel.findOne({
    $or: [
      ...(payload.messageId ? [{ providerMessageId: payload.messageId }] : []),
      ...(payload.refClient ? [{ providerReference: payload.refClient }] : []),
    ],
  });
  res.status(200).json({ received: true });
  if (job) {
    applyProviderStatus(job, payload).catch((error) =>
      console.error("[smsmode-dlr]", String(job._id), error?.message || error),
    );
  }
});

module.exports = router;
