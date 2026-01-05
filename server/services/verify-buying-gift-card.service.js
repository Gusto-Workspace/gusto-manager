const crypto = require("crypto");

function verifyPurchaseProof(req, res, next) {
  try {
    const timestamp = req.headers["x-gusto-timestamp"];
    const signature = req.headers["x-gusto-signature"];

    if (!timestamp || !signature) {
      return res.status(401).json({ error: "Missing proof" });
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      return res.status(401).json({ error: "Invalid proof timestamp" });
    }

    const ageMs = Math.abs(Date.now() - ts);
    if (ageMs > 5 * 60 * 1000) {
      return res.status(401).json({ error: "Proof expired" });
    }

    const { paymentIntentId, amount } = req.body;

    const amt = Number(amount);
    if (!paymentIntentId || !Number.isFinite(amt) || amt <= 0) {
      return res
        .status(400)
        .json({ error: "paymentIntentId and amount (>0) are required" });
    }

    const payload = {
      paymentIntentId,
      amount: amt,
      restaurantId: String(req.params.id),
      giftId: String(req.params.giftId),
    };

    const secret = process.env.GUSTO_SHARED_SECRET;
    if (!secret) {
      return res
        .status(500)
        .json({ error: "Server misconfigured (missing GUSTO_SHARED_SECRET)" });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${JSON.stringify(payload)}`)
      .digest("hex");

    const expBuf = Buffer.from(expected);
    const sigBuf = Buffer.from(signature);

    if (expBuf.length !== sigBuf.length) {
      return res.status(401).json({ error: "Invalid proof" });
    }

    const ok = crypto.timingSafeEqual(expBuf, sigBuf);
    if (!ok) {
      return res.status(401).json({ error: "Invalid proof" });
    }

    req.purchaseProof = payload;
    next();
  } catch (err) {
    console.error("verifyPurchaseProof error:", err);
    return res.status(401).json({ error: "Invalid proof" });
  }
}

module.exports = { verifyPurchaseProof };
