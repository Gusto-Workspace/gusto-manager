const { randomBytes } = require("node:crypto");
const { isValidObjectId } = require("mongoose");
const Employee = require("../models/employee.model");
const Restaurant = require("../models/restaurant.model");
const { TimeClockDevice, TimeClockPin, TimeClockPinAudit } = require("../models/time-clock-device.model");
const {
  ATTEMPT_WINDOW_MS, FAILED_ATTEMPT_LIMIT, ONLINE_ATTEMPT_LIMIT, ONLINE_LIFETIME_MS, OFFLINE_LIFETIME_MS, PAIRING_LIFETIME_MS,
  isPersonalPin, issuePunchGrant, lookupPin, offlinePinTag, pairingDigest,
  revealPin, validDevicePublicKeys, wrapDevicePinKey,
} = require("../services/employees/time-clock-device.service");
const {
  activeProfileId, clockPinWriteProblem, credentialIsCurrent, rotateClockPin, workforceRoster,
} = require("../services/employees/time-clock-pin.service");
const { toLocalDateKey } = require("../services/employees/time-clock.service");
const { isSuperAdminSession } = require("../services/shared/account-session.service");

const deviceFields = "name activatedAt pairingExpiresAt revokedAt lastContactAt lastLimitedAt";
const pairingError = "Le lien d’association est invalide ou expiré.";

async function authenticateClockDevice(req, res, next) {
  try {
    const credentials = /^Device ([a-f0-9]{24})\.([\w-]{43})$/.exec(req.get("Authorization") || "");
    if (!credentials) return res.status(401).json({ message: "Associez la tablette à un restaurant." });
    const device = await TimeClockDevice.findOne({
      _id: credentials[1], tokenHash: pairingDigest(credentials[2]),
      ...(req.params.restaurantId && { restaurant: req.params.restaurantId }),
      revokedAt: null,
    }).lean();
    if (!device) return res.status(401).json({ code: "device_revoked", message: "Accès de cette tablette révoqué." });
    const restaurant = await Restaurant.findById(device.restaurant).select("employees name opening_hours options.employees").lean();
    if (!restaurant?.options?.employees) return res.status(403).json({ code: "module_unavailable", message: "La Pointeuse n’est pas disponible pour ce restaurant." });
    req.timeClockDevice = device;
    req.timeClockAccess = { restaurant };
    res.set("Cache-Control", "no-store");
    return next();
  } catch {
    return res.status(503).json({ message: "La Pointeuse est momentanément indisponible." });
  }
}

function clockRequest(handler) {
  return async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store");
      return await handler(req, res, next);
    } catch (error) {
      const problem = clockPinWriteProblem(error);
      if (problem) return res.status(409).json(problem);
      console.error("Time clock request failed", { route: req.route?.path, code: error.code || error.name });
      return res.status(503).json({ message: "La Pointeuse est momentanément indisponible." });
    }
  };
}

function installClockDeviceRoutes(router, { authenticateToken, requireClockManager, getAccessContext, buildKioskStatesPayload }) {
  const manager = "/restaurants/:restaurantId/time-clock";
  const kiosk = "/time-clock/device";
  const managerHandlers = [authenticateToken, requireClockManager];
  const memberFields = "firstname lastname restaurantProfiles.restaurant restaurantProfiles._id";
  const employeePinRoute = `${manager}/employees/:employeeId/pin`;

  function readEmployeePin({ reveal = false } = {}) {
    return clockRequest(async (req, res) => {
      res.set("Cache-Control", "private, no-store");
      const { restaurantId, employeeId } = req.params;
      if (!isValidObjectId(employeeId)) return res.status(400).json({ message: "Salarié invalide." });
      const roster = workforceRoster(restaurantId, req.timeClockAccess.restaurant);
      const employee = await Employee.findOne({ ...roster, _id: { ...roster._id, $eq: employeeId } })
        .select(memberFields).lean();
      if (!employee) return res.status(404).json({ message: "Salarié introuvable dans ce restaurant." });
      const credential = await TimeClockPin.findOne({ restaurant: restaurantId, employee: employee._id })
        .select(reveal ? "restaurant employee profile sealedPin" : "profile").lean();
      if (!credentialIsCurrent(credential, employee, restaurantId)) return res.json({ configured: false });
      if (!reveal) return res.json({ configured: true });

      const pin = revealPin(credential);
      await TimeClockPinAudit.create({ restaurant: restaurantId, employee: employee._id, actor: req.user.id, actorRole: "owner", action: "viewed" });
      return res.json({ configured: true, pin });
    });
  }

  function requireClockOwner(req, res, next) {
    if (req.user.role !== "owner" || isSuperAdminSession(req.user)) {
      return res.status(403).json({ message: "Consultation du PIN réservée au propriétaire." });
    }
    return next();
  }

  router.get(employeePinRoute, ...managerHandlers, readEmployeePin());
  router.get(`${employeePinRoute}/reveal`, authenticateToken, requireClockOwner, requireClockManager, readEmployeePin({ reveal: true }));

  router.get(`${manager}/devices`, ...managerHandlers, clockRequest(async (req, res) => {
    const { restaurantId } = req.params;
    const devices = await TimeClockDevice.find({
      restaurant: restaurantId, revokedAt: null,
      $or: [{ activatedAt: { $exists: true } }, { pairingExpiresAt: { $gt: new Date() } }],
    }).select(deviceFields).sort({ createdAt: -1 }).lean();
    return res.json({ devices });
  }));

  const selfRoute = `${manager}/me/pin`;
  const selfPinAccess = clockRequest(async (req, res, next) => {
    const { restaurantId } = req.params;
    if (!isValidObjectId(restaurantId) || req.user.role !== "employee" || req.user.restaurantId !== restaurantId) {
      return res.status(403).json({ message: "Accès au code PIN refusé." });
    }
    const access = await getAccessContext(req, restaurantId);
    if (access.error || !access.currentEmployee || !access.restaurant.options?.employees) {
      return res.status(403).json({ message: "Accès au code PIN refusé." });
    }
    req.clockPinEmployee = access.currentEmployee;
    return next();
  });
  const selfHandlers = [authenticateToken, selfPinAccess];

  router.get(selfRoute, ...selfHandlers, clockRequest(async (req, res) => {
    const { restaurantId } = req.params;
    const employee = req.clockPinEmployee;
    const reveal = req.query?.reveal === "true";
    const credential = await TimeClockPin.findOne({ restaurant: restaurantId, employee: employee._id })
      .select(reveal ? "restaurant employee profile sealedPin" : "profile").lean();
    const configured = credentialIsCurrent(credential, employee, restaurantId);
    res.set("Cache-Control", "private, no-store");
    return res.json({ configured, ...(reveal && configured && { pin: revealPin(credential) }) });
  }));

  async function regenerate(req, res, employeeId) {
    if (isSuperAdminSession(req.user)) return res.status(403).json({ message: "Réinitialisation réservée aux comptes autorisés." });
    const restaurantId = req.params.restaurantId;
    if (Object.keys(req.body || {}).length || !isValidObjectId(employeeId)) {
      return res.status(400).json({ message: "Le code est généré automatiquement." });
    }
    const outcome = await rotateClockPin({
      restaurant: restaurantId,
      changedBy: String(req.user.id),
      actorRole: req.user.role,
      findMember: async (session) => {
        const restaurant = await Restaurant.findOne({
          _id: restaurantId, employees: employeeId, "options.employees": true,
        }).select("employees").session(session).lean();
        if (!restaurant) return null;
        const roster = workforceRoster(restaurantId, restaurant);
        const employee = await Employee.findOne({ ...roster, _id: { ...roster._id, $eq: employeeId } })
          .select(memberFields).session(session).lean();
        return employee ? { id: employee._id, profile: activeProfileId(employee, restaurantId) } : null;
      },
    });
    if (outcome.retryAfter) {
      res.set("Retry-After", String(outcome.retryAfter));
      return res.status(429).json({ message: "Attendez avant de générer un nouveau code." });
    }
    if (!outcome.found) return res.status(404).json({ message: "Salarié introuvable dans ce restaurant." });
    if (!outcome.rotated) return res.status(409).json({ code: "time_clock_pin_exhausted", message: "Aucun code disponible dans ce restaurant." });
    return res.json({ configured: true });
  }

  router.post(`${selfRoute}/regenerate`, ...selfHandlers, clockRequest((req, res) =>
    regenerate(req, res, req.clockPinEmployee._id)));
  router.post(`${employeePinRoute}/regenerate`, ...managerHandlers, clockRequest((req, res) =>
    regenerate(req, res, req.params.employeeId)));

  router.post(`${manager}/devices`, ...managerHandlers, clockRequest(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length > 60) return res.status(400).json({ message: "Donnez un nom à la tablette (60 caractères maximum)." });
    const code = randomBytes(24).toString("base64url");
    const pairingExpiresAt = new Date(Date.now() + PAIRING_LIFETIME_MS);
    await TimeClockDevice.create({ restaurant: req.params.restaurantId, name, pairingHash: pairingDigest(code), pairingExpiresAt });
    return res.status(201).json({ code, pairingExpiresAt });
  }));

  router.delete(`${manager}/devices/:deviceId`, ...managerHandlers, clockRequest(async (req, res) => {
    const { restaurantId, deviceId } = req.params;
    if (!isValidObjectId(deviceId)) return res.status(400).json({ message: "Tablette invalide." });
    const result = await TimeClockDevice.updateOne(
      { _id: deviceId, restaurant: restaurantId, revokedAt: null },
      { $set: { revokedAt: new Date() }, $unset: { pairingHash: 1, tokenHash: 1 } },
    );
    if (!result.matchedCount) return res.status(404).json({ message: "Tablette introuvable." });
    return res.status(204).end();
  }));

  router.post(`${kiosk}/pair`, clockRequest(async (req, res) => {
    const { code, signingKey, wrappingKey } = req.body || {};
    if (typeof code !== "string" || !/^[\w-]{32}$/.test(code) || !validDevicePublicKeys(signingKey, wrappingKey)) {
      return res.status(400).json({ message: pairingError });
    }
    const now = new Date();
    const token = randomBytes(32).toString("base64url");
    const device = await TimeClockDevice.findOneAndUpdate(
      { pairingHash: pairingDigest(code), pairingExpiresAt: { $gt: now }, revokedAt: null },
      { $set: { activatedAt: now, tokenHash: pairingDigest(token), signingKey, wrappingKey }, $unset: { pairingHash: 1 } },
      { new: true },
    ).lean();
    if (!device) return res.status(404).json({ message: pairingError });
    return res.status(201).json({ id: String(device._id), restaurantId: String(device.restaurant), token, pinKey: wrapDevicePinKey(device) });
  }));

  router.post(`${kiosk}/vault`, authenticateClockDevice, clockRequest(async (req, res) => {
    const device = req.timeClockDevice;
    const { restaurant } = req.timeClockAccess;
    const restaurantId = String(device.restaurant);
    const now = new Date();
    const [members, pins] = await Promise.all([
      Employee.find(workforceRoster(restaurantId, restaurant)).select(memberFields).lean(),
      TimeClockPin.find({ restaurant: restaurantId }).lean(),
    ]);
    const byId = new Map(members.map((member) => [String(member._id), member]));
    const validPins = pins.filter((pin) => credentialIsCurrent(pin, byId.get(String(pin.employee)), restaurantId));
    const employeeIds = validPins.map((pin) => String(pin.employee));
    const states = await buildKioskStatesPayload({ restaurantId, employeeIds, anchorDateKey: toLocalDateKey(now), openingHours: restaurant.opening_hours });
    const entries = validPins.map((pin) => ({
      tag: offlinePinTag(device, pin),
      grant: issuePunchGrant(device, pin, now, true),
      kiosk: minimalKioskState(states.statesByEmployee[String(pin.employee)]),
    })).filter((entry) => entry.kiosk);
    await TimeClockDevice.updateOne({ _id: device._id }, { $set: { lastContactAt: now } });
    return res.json({ asOf: +now, expiresAt: +now + OFFLINE_LIFETIME_MS, entries });
  }));

  router.post(`${kiosk}/identify`, authenticateClockDevice, clockRequest(async (req, res) => {
    const device = req.timeClockDevice;
    const { restaurant } = req.timeClockAccess;
    const now = new Date();
    const until = new Date(+now + ATTEMPT_WINDOW_MS);
    const sameWindow = { $gt: ["$attemptWindowUntil", now] };
    const attempt = await TimeClockDevice.findOneAndUpdate(
      { _id: device._id, revokedAt: null, $expr: { $or: [
        { $lte: [{ $ifNull: ["$attemptWindowUntil", new Date(0)] }, now] },
        { $and: [{ $lt: ["$attempts", ONLINE_ATTEMPT_LIMIT] }, { $lt: ["$failedAttempts", FAILED_ATTEMPT_LIMIT] }] },
      ] } },
      [{ $set: {
        attemptWindowUntil: { $cond: [sameWindow, "$attemptWindowUntil", until] },
        attempts: { $cond: [sameWindow, { $add: ["$attempts", 1] }, 1] },
        failedAttempts: { $cond: [sameWindow, { $add: ["$failedAttempts", 1] }, 1] },
      } }], { new: true },
    ).select("attemptWindowUntil").lean();
    if (!attempt) {
      await TimeClockDevice.updateOne({ _id: device._id, revokedAt: null }, { $set: { lastLimitedAt: now } });
      res.set("Retry-After", String(Math.ceil(ATTEMPT_WINDOW_MS / 1000)));
      return res.status(429).json({ message: "Trop de tentatives. Réessayez dans quelques minutes." });
    }

    const { pin } = req.body || {};
    const restaurantId = String(device.restaurant);
    const credential = isPersonalPin(pin)
      ? await TimeClockPin.findOne({ restaurant: restaurantId, lookup: lookupPin(restaurantId, pin) }).lean() : null;
    const roster = workforceRoster(restaurantId, restaurant);
    const employee = credential ? await Employee.findOne({ ...roster, _id: { $eq: credential.employee, ...roster._id } }).select(memberFields).lean() : null;
    if (!credentialIsCurrent(credential, employee, restaurantId)) {
      return res.status(401).json({ message: "Code PIN non reconnu." });
    }
    await TimeClockDevice.updateOne(
      { _id: device._id, attemptWindowUntil: attempt.attemptWindowUntil },
      { $inc: { failedAttempts: -1 }, $set: { lastContactAt: now } },
    );
    const { statesByEmployee } = await buildKioskStatesPayload({
      restaurantId, employeeIds: [String(employee._id)], anchorDateKey: toLocalDateKey(now), openingHours: restaurant.opening_hours,
    });
    const state = minimalKioskState(statesByEmployee[String(employee._id)]);
    if (!state) return res.status(401).json({ message: "Code PIN non reconnu." });
    return res.json({ grant: issuePunchGrant(device, credential, now, false), expiresAt: +now + ONLINE_LIFETIME_MS, kiosk: state });
  }));
}

function minimalKioskState(summary) {
  if (!summary?.employee) return null;
  const { employee, anchorDate, state, lastUpdatedAt } = summary;
  const active = state.activeSession;
  return {
    employee: { id: employee.id, firstname: employee.firstname, lastname: employee.lastname },
    anchorDate, lastUpdatedAt,
    state: {
      situation: state.situation, availableActions: state.availableActions,
      activeSession: active ? {
        id: active.id, businessDate: active.businessDate, clockInAt: active.clockInAt,
        status: active.status, totals: active.totals,
        breaks: active.breaks.map(({ id, startAt, endAt }) => ({ id, startAt, endAt })),
      } : null,
    },
  };
}

module.exports = { authenticateClockDevice, installClockDeviceRoutes, minimalKioskState };
