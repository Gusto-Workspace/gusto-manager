const crypto = require("crypto");

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

function verifyGiftCardServiceSignature(req, res, next) {
  const timestamp = String(req.headers["x-gusto-timestamp"] || "");
  const signature = String(req.headers["x-gusto-signature"] || "");
  const secret = process.env.GUSTO_SHARED_SECRET;
  const timestampNumber = Number(timestamp);

  if (!secret) {
    return res.status(500).json({
      error: "Server misconfigured",
      code: "SERVICE_SIGNATURE_NOT_CONFIGURED",
    });
  }
  if (
    !signature ||
    !Number.isFinite(timestampNumber) ||
    Math.abs(Date.now() - timestampNumber) > MAX_SIGNATURE_AGE_MS
  ) {
    return res
      .status(401)
      .json({ error: "Invalid signature", code: "INVALID_SIGNATURE" });
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${JSON.stringify(req.body || {})}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return res
      .status(401)
      .json({ error: "Invalid signature", code: "INVALID_SIGNATURE" });
  }

  return next();
}

module.exports = { verifyGiftCardServiceSignature };
