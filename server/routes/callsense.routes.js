const express = require("express");
const twilio = require("twilio");
const mongoose = require("mongoose");
const authenticateToken = require("../middleware/authentificate-token");
const authenticateAdmin = require("../middleware/authenticate-admin");
const { requireAdminRole } = require("../middleware/authenticate-admin");
const { authorizeRestaurantAccess, userCanAccessRestaurant } = require("../middleware/authorize-restaurant-access");
const Config = require("../models/callsense-config.model");
const Call = require("../models/callsense-call.model");
const Restaurant = require("../models/restaurant.model");
const { validateWebhook, normalizePhone } = require("../services/callsense-core.service");
const { broadcastToRestaurant } = require("../services/sse-bus.service");
const service = require("../services/callsense.service");
const router = express.Router();

function unreadMissedFilter(restaurantId) {
  return { restaurantId, outcome: { $in: ["no-answer", "busy"] }, phase: { $not: { $gte: 3 } }, missedReadAt: null };
}

async function authorizeCallSense(req, res, next) {
  try {
    if (req.user.role === "employee" && (req.authorizedRestaurant.options?.customers !== true ||
      !(await userCanAccessRestaurant(req.user, req.authorizedRestaurant, { requiredOption: "customers" })))) return res.sendStatus(403);
    return next();
  } catch (_) { return res.sendStatus(500); }
}

function signature(req, res, next) {
  const sid = req.body?.AccountSid;
  const token = service.accountToken(sid);
  if (!validateWebhook({ authToken: token, accountSid: sid, expectedAccountSid: sid,
    signature: req.get("X-Twilio-Signature"), publicOrigin: process.env.CALLSENSE_PUBLIC_ORIGIN,
    originalUrl: req.originalUrl, body: req.body })) return res.sendStatus(403);
  return next();
}
const form = express.urlencoded({ extended: false, limit: "32kb" });
router.post("/callsense/voice", form, signature, async (req, res) => {
  const body = req.body;
  const to = normalizePhone(body.To);
  if (!to || !/^CA[a-zA-Z0-9]+$/.test(body.CallSid || "")) return res.sendStatus(400);
  const config = await service.findRoute(body.AccountSid, to);
  if (!config) return res.sendStatus(404);
  const base = process.env.CALLSENSE_PUBLIC_ORIGIN;
  const query = `restaurantId=${encodeURIComponent(String(config.restaurantId))}&parent=${encodeURIComponent(body.CallSid)}`;
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({ timeout: 25, action: `${base}/api/callsense/dial-action?${query}`, method: "POST" });
  dial.sip({ statusCallback: `${base}/api/callsense/sip-status?${query}`, statusCallbackMethod: "POST",
    statusCallbackEvent: "initiated ringing answered completed" }, config.sipUri);
  res.type("text/xml").send(response.toString());
  setImmediate(() => service.recordIncoming(config, body).catch((error) => console.error("[callsense] incoming", error.message)));
});
for (const [path, kind] of [["sip-status", "sip"], ["dial-action", "action"]]) {
  router.post(`/callsense/${path}`, form, signature, (req, res) => {
    const { restaurantId, parent } = req.query;
    if ((kind === "sip" && req.body.ParentCallSid && req.body.ParentCallSid !== parent) ||
        (kind === "action" && req.body.CallSid !== parent)) return res.sendStatus(400);
    if (kind === "action") res.type("text/xml").send(new twilio.twiml.VoiceResponse().toString());
    else res.sendStatus(200);
    setImmediate(() => service.recordCallback(kind, req.body, restaurantId, parent)
      .catch((error) => console.error("[callsense] callback", error.message)));
  });
}

router.put("/admin/restaurants/:restaurantId/callsense", authenticateAdmin, requireAdminRole, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const input = { restaurantId, enabled: req.body.enabled === true, accountSid: req.body.accountSid,
      twilioNumber: normalizePhone(req.body.twilioNumber), sipUri: req.body.sipUri };
    if (!mongoose.isValidObjectId(restaurantId) || !service.validConfig({ ...input, enabled: true }, input.accountSid, input.twilioNumber) ||
        !service.accountToken(input.accountSid) || !(await Restaurant.exists({ _id: restaurantId }))) return res.status(400).json({ message: "Configuration invalide" });
    const config = await Config.findOneAndUpdate({ restaurantId }, { $set: input }, { upsert: true, new: true, runValidators: true }).lean();
    return res.json(config);
  } catch (error) { return res.status(error.code === 11000 ? 409 : 500).json({ message: "Configuration impossible" }); }
});
router.get("/restaurants/:restaurantId/callsense/calls", authenticateToken,
  authorizeRestaurantAccess({ requiredOption: "customers" }), authorizeCallSense, async (req, res) => {
    try {
      const filter = { restaurantId: req.params.restaurantId };
      if (req.query.callId) {
        if (!mongoose.isValidObjectId(req.query.callId)) return res.sendStatus(400);
        filter._id = req.query.callId;
      }
      if (req.query.active === "true") {
        filter.outcome = { $exists: false };
        filter.createdAt = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
      }
      if (req.query.cursor && !req.query.callId && req.query.active !== "true") {
        let cursor;
        try { cursor = JSON.parse(Buffer.from(req.query.cursor, "base64url").toString("utf8")); } catch (_) { return res.sendStatus(400); }
        const date = new Date(cursor?.date);
        if (!mongoose.isValidObjectId(cursor?.id) || Number.isNaN(date.getTime())) return res.sendStatus(400);
        filter.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }];
      }
      const limit = req.query.callId ? 1 : req.query.active === "true" ? 50 : 10;
      const [calls, config] = await Promise.all([
        Call.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean(),
        Config.exists({ restaurantId: req.params.restaurantId, enabled: true }),
      ]);
      const items = calls.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor = calls.length > limit && last ? Buffer.from(JSON.stringify({ date: last.createdAt, id: String(last._id) })).toString("base64url") : null;
      return res.json({ enabled: Boolean(config), calls: items.map(service.serialize), nextCursor });
    } catch (_) { return res.sendStatus(500); }
  });

router.get("/restaurants/:restaurantId/callsense/unread-missed-count", authenticateToken,
  authorizeRestaurantAccess({ requiredOption: "customers" }), authorizeCallSense, async (req, res) => {
    try {
      const count = await Call.countDocuments(unreadMissedFilter(req.params.restaurantId));
      return res.json({ count });
    } catch (_) { return res.sendStatus(500); }
  });

router.post("/restaurants/:restaurantId/callsense/read-missed", authenticateToken,
  authorizeRestaurantAccess({ requiredOption: "customers" }), authorizeCallSense, async (req, res) => {
    try {
      const restaurantId = req.params.restaurantId;
      const readAt = new Date();
      const filter = { ...unreadMissedFilter(restaurantId), $or: [{ updatedAt: { $lte: readAt } }, { updatedAt: null }] };
      const result = await Call.updateMany(filter, { $set: { missedReadAt: readAt } }, { timestamps: false });
      broadcastToRestaurant(String(restaurantId), { type: "callsense_missed_read", restaurantId: String(restaurantId), readAt: readAt.toISOString() });
      return res.json({ ok: true, modifiedCount: result.modifiedCount || 0, readAt });
    } catch (_) { return res.sendStatus(500); }
  });

module.exports = router;
