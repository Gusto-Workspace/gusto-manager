const { randomInt } = require("node:crypto");
const mongoose = require("mongoose");
const { TimeClockPin, TimeClockPinAudit } = require("../../models/time-clock-device.model");
const { lookupPin, sealPin } = require("./time-clock-device.service");
const PIN_COUNT = 10_000;
const ROTATION_COOLDOWN_MS = 60_000;

function activeProfileId(employee, restaurantId) {
  return String((employee.restaurantProfiles || []).find(
    (profile) => String(profile.restaurant) === String(restaurantId),
  )?._id || "");
}

function credentialIsCurrent(credential, employee, restaurantId) {
  return Boolean(credential && employee && credential.profile === activeProfileId(employee, restaurantId));
}

function workforceAccountFilter() {
  return { $or: [{ accountType: "employee" }, { accountType: { $exists: false } }] };
}

function workforceRoster(restaurantId, restaurant) {
  return {
    _id: { $in: restaurant.employees || [] },
    restaurants: restaurantId,
    ...workforceAccountFilter(),
  };
}

function isClockPinCollision(error) {
  return error.code === 11000 && Boolean(error.keyPattern?.lookup || error.keyPattern?.employee);
}

function clockPinWriteProblem(error) {
  if (error.code === "time_clock_pin_exhausted") {
    return { code: error.code, message: "Aucun code PIN disponible dans ce restaurant." };
  }
  if (isClockPinCollision(error)) {
    return { code: "time_clock_pin_conflict", message: "Attribution du PIN en conflit. Réessayez." };
  }
  return null;
}

async function withClockPinTransaction(operation) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await mongoose.connection.transaction(operation);
    } catch (error) {
      if (attempt >= 7 || !isClockPinCollision(error)) throw error;
    }
  }
}

async function findAvailablePin(restaurant, session) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pin = String(randomInt(PIN_COUNT)).padStart(4, "0");
    if (!(await TimeClockPin.exists({ restaurant, lookup: lookupPin(restaurant, pin) }).session(session))) return pin;
  }
  const reserved = new Set(await TimeClockPin.distinct("lookup", { restaurant }).session(session));
  const available = [];
  for (let number = 0; number < PIN_COUNT; number += 1) {
    const pin = String(number).padStart(4, "0");
    if (!reserved.has(lookupPin(restaurant, pin))) available.push(pin);
  }
  return available.length ? available[randomInt(available.length)] : null;
}

async function writeGeneratedPin({ restaurant, employee, profile, changedBy, session, lastRotatedAt }) {
  const pin = await findAvailablePin(restaurant, session);
  if (pin === null) return false;
  await TimeClockPin.updateOne(
    { restaurant, employee },
    {
      $set: {
        ...sealPin({ restaurant, employee, profile, pin, changedBy }),
        ...(lastRotatedAt && { lastRotatedAt }),
      },
      ...(!lastRotatedAt && { $unset: { lastRotatedAt: 1 } }),
    },
    { upsert: true, session },
  );
  return true;
}

async function provisionInitialClockPin(options) {
  if (!(await writeGeneratedPin(options))) {
    throw Object.assign(new Error("No available initial time clock PIN"), { code: "time_clock_pin_exhausted" });
  }
}

async function provisionMissingClockPin({ restaurant, employee, profile, changedBy, session }) {
  const current = await TimeClockPin.findOne({ restaurant, employee }).select("profile").session(session).lean();
  if (current) return current.profile === profile ? "already_configured" : "profile_mismatch";

  const pin = await findAvailablePin(restaurant, session);
  if (pin === null) return "capacity_exhausted";
  await TimeClockPin.create([{
    restaurant, employee, ...sealPin({ restaurant, employee, profile, pin, changedBy }),
  }], { session });
  return "assigned";
}

async function rotateClockPin({ restaurant, changedBy, actorRole, findMember }) {
  return withClockPinTransaction(async (session) => {
    const member = await findMember(session);
    if (!member) return { found: false };
    const existing = await TimeClockPin.findOne({ restaurant, employee: member.id }).select("lastRotatedAt").session(session).lean();
    const now = new Date();
    const remaining = existing?.lastRotatedAt ? +existing.lastRotatedAt + ROTATION_COOLDOWN_MS - +now : 0;
    if (remaining > 0) return { retryAfter: Math.ceil(remaining / 1000) };
    const rotated = await writeGeneratedPin({
      restaurant, employee: member.id, profile: member.profile, changedBy, session, lastRotatedAt: now,
    });
    if (rotated) {
      await TimeClockPinAudit.create([{
        restaurant, employee: member.id, actor: changedBy, actorRole, action: "reset", at: now,
      }], { session });
    }
    return { found: true, rotated };
  });
}

module.exports = {
  activeProfileId, credentialIsCurrent, workforceAccountFilter, workforceRoster,
  clockPinWriteProblem, PIN_COUNT, provisionInitialClockPin, provisionMissingClockPin, rotateClockPin, withClockPinTransaction,
};
