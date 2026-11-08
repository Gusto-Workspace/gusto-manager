const mongoose = require("mongoose");
const Config = require("../models/callsense-config.model");
const Call = require("../models/callsense-call.model");
const Customer = require("../models/customer.model");
const Restaurant = require("../models/restaurant.model");
const { broadcastToRestaurant } = require("./sse-bus.service");
const { sendPushToModule } = require("./webpush.service");
const { normalizePhone } = require("./callsense-core.service");

function jsonEnv(name, fallback) {
  try { return JSON.parse(process.env[name] || JSON.stringify(fallback)); } catch (_) { return fallback; }
}
function accountToken(sid) {
  const accounts = jsonEnv("CALLSENSE_ACCOUNTS", {});
  return typeof accounts[sid] === "string" ? accounts[sid] : "";
}
function validConfig(config, sid, to) {
  return Boolean(to && normalizePhone(to) === to && config && config.enabled === true && config.accountSid === sid && config.twilioNumber === to &&
    mongoose.isValidObjectId(config.restaurantId) && /^sip:[a-zA-Z0-9_.!~*'()%+\-]+@[a-zA-Z0-9.\-]+(?::[0-9]+)?$/.test(config.sipUri || ""));
}
async function findRoute(sid, to) {
  let config;
  try {
    config = await Promise.race([
      Config.findOne({ twilioNumber: to }).maxTimeMS(300).lean(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("configuration timeout")), 500)),
    ]);
    // A disabled or mismatched database record must not fall back to an old route.
    return validConfig(config, sid, to) ? config : null;
  } catch (_) {
    const routes = jsonEnv("CALLSENSE_FALLBACK_ROUTES", []);
    if (!Array.isArray(routes)) return null;
    return routes.find((route) => validConfig(route, sid, to)) || null;
  }
}
function serialize(call) {
  const status = call.outcome ? (call.outcome === "completed" || call.phase >= 3 ? "completed" : call.outcome === "no-answer" ? "missed" : call.outcome) : ["incoming", "initiated", "ringing", "answered"][call.phase || 0];
  return { id: String(call._id), restaurantId: String(call.restaurantId), callSid: call.callSid,
    childCallSid: call.childCallSid || null, from: call.from || null, to: call.to || null,
    customerId: call.customerId ? String(call.customerId) : null, customerName: call.customerName || "",
    customerFirstName: call.customerFirstName || "", customerLastName: call.customerLastName || "",
    match: call.match || "unknown", status, outcome: call.outcome || null, duration: call.duration ?? null,
    read: !["missed", "busy"].includes(status) || Boolean(call.missedReadAt),
    readAt: call.missedReadAt || null,
    answeredAt: call.answeredAt || null, createdAt: call.createdAt, updatedAt: call.updatedAt };
}
async function findCustomer(restaurantId, phone) {
  if (!phone) return { match: "unknown" };
  const suffix = phone.slice(-7);
  const candidates = await Customer.find({ restaurant_id: restaurantId, phoneNorm: { $regex: `${suffix}$` } })
    .select("_id firstName lastName phone phoneNorm").lean();
  const matches = candidates.filter((customer) => normalizePhone(customer.phoneNorm || customer.phone) === phone);
  if (matches.length !== 1) return { match: matches.length ? "ambiguous" : "unknown" };
  return { match: "recognized", customerId: matches[0]._id,
    customerFirstName: matches[0].firstName || "", customerLastName: matches[0].lastName || "",
    customerName: [matches[0].firstName, matches[0].lastName].filter(Boolean).join(" ") };
}
function publish(call) {
  broadcastToRestaurant(String(call.restaurantId), { type: "callsense_updated", restaurantId: String(call.restaurantId), call: serialize(call) });
}
async function notify(call, kind = "incoming") {
  const missed = kind === "missed";
  const claim = missed
    ? { missedPushClaimed: { $ne: true }, outcome: "no-answer", sipFinalStatus: "no-answer", phase: { $not: { $gte: 3 } }, sipResponseCode: { $ne: "603" } }
    : { pushClaimed: { $ne: true }, outcome: { $exists: false }, phase: { $not: { $gte: 3 } } };
  const claimed = await Call.findOneAndUpdate({ _id: call._id, ...claim }, { $set: { [missed ? "missedPushClaimed" : "pushClaimed"]: true } }, { new: true }).lean();
  if (!claimed) return;
  const restaurant = await Restaurant.findById(call.restaurantId).select("_id owner_id options.reservations");
  // The reservations webapp is owner-only in the existing client guard.
  if (!restaurant || restaurant.options?.reservations !== true) return;
  await sendPushToModule({
    restaurantId: call.restaurantId, module: "reservations", type: missed ? "callsense_missed" : "callsense_incoming", title: missed ? "Appel manqué — Gusto CallSense" : "Appel entrant — Gusto CallSense",
    message: call.customerName ? [call.customerName, call.from].filter(Boolean).join(" — ") : call.from || "Numéro inconnu",
    link: `/dashboard/webapp/reservations/phone?callId=${encodeURIComponent(String(call._id))}`,
    data: { callId: String(call._id), tag: `callsense:${String(call._id)}` },
    filterSubscriptions: async (subs) => {
      return subs.filter((sub) => sub.userId && String(sub.userId) === String(restaurant.owner_id));
    },
  });
}
async function recordIncoming(config, body) {
  const from = normalizePhone(body.From);
  const key = { callSid: body.CallSid, restaurantId: config.restaurantId, accountSid: config.accountSid };
  let call;
  try {
    call = await Call.findOneAndUpdate(key, { $setOnInsert: key, $set: { from, to: config.twilioNumber } }, { upsert: true, new: true, setDefaultsOnInsert: false }).lean();
  } catch (error) { if (error.code === 11000) call = await Call.findOneAndUpdate(key, { $set: { from, to: config.twilioNumber } }, { new: true }).lean(); else throw error; }
  if (!call) return;
  try {
    const customer = await findCustomer(config.restaurantId, from);
    call = await Call.findOneAndUpdate(key, { $set: { ...customer, incomingReceived: true } }, { new: true }).lean();
  } catch (error) {
    console.error("[callsense] customer lookup", error.message);
    call = await Call.findOneAndUpdate(key, { $set: { incomingReceived: true } }, { new: true }).lean();
  }
  if (!call) return;
  publish(call);
  if (call.outcome === "no-answer") await notify(call, "missed");
  else await notify(call);
}
async function recordCallback(kind, body, restaurantId, parentSid) {
  if (!mongoose.isValidObjectId(restaurantId) || !/^CA[a-zA-Z0-9]+$/.test(parentSid || "")) return;
  const key = { callSid: parentSid, restaurantId, accountSid: body.AccountSid };
  const update = { $set: {} };
  if (kind === "sip") {
    const phase = { initiated: 1, ringing: 2, answered: 3, "in-progress": 3, completed: 3 }[body.CallStatus];
    if (phase) update.$max = { phase };
    if (["answered", "in-progress"].includes(body.CallStatus)) update.$min = { answeredAt: new Date() };
    if (["completed", "no-answer", "busy", "failed", "canceled"].includes(body.CallStatus)) {
      update.$set.sipCompleted = true;
      update.$set.sipFinalStatus = body.CallStatus;
    }
    if (body.SipResponseCode) update.$set.sipResponseCode = String(body.SipResponseCode);
    if (body.CallSid && body.CallSid !== parentSid) update.$set.childCallSid = body.CallSid;
  } else {
    const status = body.DialCallStatus;
    if (!["completed", "busy", "no-answer", "failed", "canceled"].includes(status)) return;
    // First Dial result wins, atomically; a replay cannot reopen or overwrite it.
    key.outcome = { $exists: false };
    update.$set.outcome = status;
    if (body.SipResponseCode || body.DialSipResponseCode) update.$set.sipResponseCode = String(body.SipResponseCode || body.DialSipResponseCode);
    const duration = Number(body.DialCallDuration);
    if (body.DialCallDuration !== undefined && Number.isFinite(duration) && duration >= 0) update.$set.duration = duration;
    if (body.DialCallSid) update.$set.childCallSid = body.DialCallSid;
  }
  // Incoming creation and callbacks can race. Upsert by the unique parent SID;
  // retry a duplicate after the concurrent creator wins.
  const base = { callSid: parentSid, restaurantId, accountSid: body.AccountSid };
  update.$setOnInsert = base;
  let call;
  try { call = await Call.findOneAndUpdate(key, update, { upsert: true, new: true, setDefaultsOnInsert: false }).lean(); }
  catch (error) {
    if (error.code !== 11000) throw error;
    call = await Call.findOneAndUpdate(key, { ...update, $setOnInsert: undefined }, { new: true }).lean();
  }
  if (call) {
    publish(call);
    if (call.outcome === "no-answer" && call.incomingReceived) await notify(call, "missed");
  }
}
module.exports = { accountToken, validConfig, findRoute, serialize, findCustomer, recordIncoming, recordCallback, notify };
