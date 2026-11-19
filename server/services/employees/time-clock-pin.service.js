const { randomInt } = require("node:crypto");
const mongoose = require("mongoose");
const { TimeClockPin } = require("../../models/time-clock-device.model");
const { lookupPin, sealPin } = require("./time-clock-device.service");
const PIN_COUNT = 10_000;
const ROTATION_COOLDOWN_MS = 60_000;

async function withClockPinTransaction(operation) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await mongoose.connection.transaction(operation);
    } catch (error) {
      if (attempt >= 7 || error.code !== 11000 || !(error.keyPattern?.lookup || error.keyPattern?.employee)) throw error;
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
  if (!(await writeGeneratedPin(options))) throw new Error("No available initial time clock PIN");
}

async function rotateClockPin({ restaurant, changedBy, findMember }) {
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
    return { found: true, rotated };
  });
}

module.exports = { provisionInitialClockPin, rotateClockPin, withClockPinTransaction };
