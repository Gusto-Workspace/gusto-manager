const express = require("express");
const { isValidObjectId } = require("mongoose");
const { DateTime } = require("luxon");
const router = express.Router();

const authenticateToken = require("../middleware/authentificate-token");

const EmployeeModel = require("../models/employee.model");
const RestaurantModel = require("../models/restaurant.model");
const TimeClockSessionModel = require("../models/time-clock-session.model");
const TimeClockAbsence = require("../models/time-clock-absence.model");
const OwnerModel = require("../models/owner.model");
const { TimeClockPin } = require("../models/time-clock-device.model");
const {
  authenticateClockDevice, credentialIsCurrent, installClockDeviceRoutes, minimalKioskState,
} = require("./time-clock-devices.routes");
const { readPunchGrant, verifyPunchProof } = require("../services/employees/time-clock-device.service");
const {
  buildRegisterRows,
  buildRegisterHistory,
  isPlannedAbsence,
  assignPlannedServices,
  shiftAttendanceKey,
  shiftMealCount,
} = require("../services/employees/time-clock-register.service");
const {
  payrollSchedule,
  payrollDayShares,
  auditPayrollPauses,
  payrollDays,
  buildPayrollOverlapQuery,
} = require("../services/employees/time-clock-payroll.service");
const {
  buildTimeClockExportPdf,
} = require("../services/pdf/render-time-clock-export.service");
const {
  buildWorkbookBuffer,
} = require("../services/excel/render-time-clock-export-workbook.service");

const {
  ACTIONS,
  addDaysToDateKey,
  buildEmployeeRangeSummary,
  buildOverlapQuery,
  buildSummaryPayload,
  diffMinutes,
  getMonthRangeFromDateKey,
  getRangeBounds,
  isValidDateKey,
  normalizeSignaturePayload,
  serializeEvent,
  serializeSession,
  syncSessionTotals,
  toLocalDateKey,
} = require("../services/employees/time-clock.service");

function employeeWorksInRestaurant(employee, restaurantId) {
  const target = String(restaurantId);

  return Array.isArray(employee?.restaurants)
    ? employee.restaurants.some((id) => String(id) === target)
    : false;
}

function workforceAccountFilter() {
  return {
    $or: [{ accountType: "employee" }, { accountType: { $exists: false } }],
  };
}

function findRestaurantProfile(employee, restaurantId) {
  if (!Array.isArray(employee?.restaurantProfiles)) return null;

  return employee.restaurantProfiles.find(
    (profile) => String(profile.restaurant) === String(restaurantId),
  );
}

function getEmployeeSnapshot(employee, restaurantId) {
  const profile = findRestaurantProfile(employee, restaurantId);
  const snapshot = profile?.snapshot || {};

  return {
    firstname: snapshot.firstname || employee?.firstname || "",
    lastname: snapshot.lastname || employee?.lastname || "",
    email: snapshot.email || employee?.email || "",
    post: snapshot.post || employee?.post || "",
  };
}

function getSourceFromRequest(request) {
  if (request.timeClockDevice) return "kiosk";
  const source = String(request.body?.source || "").trim();
  if (["kiosk", "manager", "employee"].includes(source)) return source;

  if (request.user?.role === "owner") return "manager";
  if (request.user?.role === "employee") return "employee";

  return "kiosk";
}

function normalizeClientMutationId(value) {
  const mutationId = String(value || "").trim();
  if (!mutationId) return "";
  return mutationId.slice(0, 120);
}

function buildEvent({
  action,
  now,
  signature,
  request,
  clientMutationId = "",
}) {
  return {
    type: action,
    at: now,
    actorRole: request.user?.role === "owner" ? "owner" : "employee",
    actorId: String(request.user?.id || ""),
    clientMutationId: normalizeClientMutationId(clientMutationId),
    ...(request.timeClockDevice && {
      deviceId: String(request.timeClockDevice._id),
      deviceProof: request.body.proof,
      receivedAt: new Date(),
    }),
    signature,
    source: getSourceFromRequest(request),
  };
}

function getEffectiveActionTime(request) {
  const occurredAt = parseDateTime(request.body?.occurredAt);
  return occurredAt || new Date();
}

async function getAccessContext(request, restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId).select(
    "name owner_id employees opening_hours options.employees",
  );

  if (!restaurant) {
    return { error: { status: 404, message: "Restaurant not found" } };
  }

  if (request.user?.role === "owner") {
    if (String(restaurant.owner_id) !== String(request.user.id)) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    return { restaurant, isManager: true, currentEmployee: null };
  }

  if (request.user?.role === "employee") {
    const currentEmployee = await EmployeeModel.findById(request.user.id);

    if (
      !currentEmployee ||
      currentEmployee.accountType === "accountant" ||
      !restaurant.employees?.some((id) => String(id) === String(request.user.id)) ||
      !employeeWorksInRestaurant(currentEmployee, restaurantId)
    ) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    const currentProfile = findRestaurantProfile(currentEmployee, restaurantId);
    const isManager = currentProfile?.options?.employees === true;

    return { restaurant, isManager, currentEmployee };
  }

  if (request.user?.role === "accountant") {
    if (String(request.user.restaurantId || "") !== String(restaurantId)) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    const currentEmployee = await EmployeeModel.findById(request.user.id);
    const isListed = (restaurant.employees || []).some(
      (employeeId) => String(employeeId) === String(request.user.id),
    );

    if (
      !currentEmployee ||
      currentEmployee.accountType !== "accountant" ||
      !isListed ||
      !employeeWorksInRestaurant(currentEmployee, restaurantId)
    ) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    return {
      restaurant,
      isManager: false,
      canExportHours: true,
      currentEmployee,
    };
  }

  return { error: { status: 403, message: "Forbidden" } };
}

function canAccessTargetEmployee(accessContext, employeeId) {
  if (!accessContext?.currentEmployee) return true;
  if (accessContext?.isManager) return true;

  return String(accessContext.currentEmployee._id) === String(employeeId);
}

async function requireClockManager(req, res, next) {
  try {
    const { restaurantId } = req.params;
    if (!isValidObjectId(restaurantId)) return res.status(400).json({ message: "Restaurant invalide." });
    const access = await getAccessContext(req, restaurantId);
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });
    if (!access.isManager || access.restaurant.options?.employees !== true) {
      return res.status(403).json({ message: "Accès à la Pointeuse refusé." });
    }
    req.timeClockAccess = access;
    return next();
  } catch (error) {
    return next(error);
  }
}

function workforceRoster(restaurantId, restaurant) {
  return {
    _id: { $in: restaurant.employees || [] },
    restaurants: restaurantId,
    ...workforceAccountFilter(),
  };
}

async function getTargetEmployee(employeeId, restaurantId) {
  const employee = await EmployeeModel.findOne({
    _id: employeeId,
    ...workforceAccountFilter(),
  }).lean();

  if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
    return null;
  }

  return employee;
}

function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseParisEditTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    return parseDateTime(value);
  }
  const time = DateTime.fromISO(value, { zone: "Europe/Paris" });
  const canonical = value.length === 16 ? value + ":00" : value;
  return time.isValid && time.toFormat("yyyy-MM-dd'T'HH:mm:ss") === canonical && time.getPossibleOffsets().length === 1
    ? time.toJSDate() : null;
}

function parseManualBreaks(value, parseTime = parseDateTime) {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }

  if (!Array.isArray(source)) return [];

  return source
    .map((item, index) => ({
      id: String(item?.id || "").trim(),
      startAt: parseTime(item?.startAt),
      endAt: parseTime(item?.endAt),
      index,
    }))
    .sort((left, right) => {
      const leftValue = left.startAt
        ? left.startAt.getTime()
        : Number.MAX_SAFE_INTEGER;
      const rightValue = right.startAt
        ? right.startAt.getTime()
        : Number.MAX_SAFE_INTEGER;
      return leftValue - rightValue || left.index - right.index;
    });
}

function toFilenamePart(value) {
  return String(value || "restaurant")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function resolveSelectedEmployeeIds(
  requestedEmployeeIds = [],
  fallbackEmployeeIds = [],
) {
  return Array.from(
    new Set(
      (requestedEmployeeIds.length
        ? requestedEmployeeIds
        : fallbackEmployeeIds
      ).map((value) => String(value)),
    ),
  );
}

async function loadRegisterSessions(selection, from, to, fields = "") {
  const [sessions, attendance] = await Promise.all([
    TimeClockSessionModel.find({ ...selection, ...buildPayrollOverlapQuery(from, to) }).select(fields).lean(),
    TimeClockAbsence.find({ ...selection, shiftDate: { $gte: from, $lte: to } }).lean(),
  ]);
  // Services crossing midnight still need the other shifts and sessions of their start date for matching.
  const earlierOrLaterDays = new Map();
  for (const session of sessions) {
    const date = toLocalDateKey(session.clockInAt);
    if (!date || (date >= from && date <= to)) continue;
    const employees = earlierOrLaterDays.get(date) || new Set();
    employees.add(String(session.employee));
    earlierOrLaterDays.set(date, employees);
  }
  if (!earlierOrLaterDays.size) return [sessions, attendance];

  const extraSessionFilters = [];
  const extraAttendanceFilters = [];
  for (const [date, employees] of earlierOrLaterDays) {
    const employee = { $in: [...employees] };
    const { start, endExclusive } = getRangeBounds(date, date);
    extraSessionFilters.push({ employee, clockInAt: { $gte: start, $lt: endExclusive } });
    extraAttendanceFilters.push({ employee, shiftDate: date });
  }
  const [extraSessions, extraAttendance] = await Promise.all([
    TimeClockSessionModel.find({ ...selection, $or: extraSessionFilters }).select(fields).lean(),
    TimeClockAbsence.find({ ...selection, $or: extraAttendanceFilters }).lean(),
  ]);
  const sessionMap = new Map([...sessions, ...extraSessions].map((session) => [String(session._id), session]));
  return [[...sessionMap.values()], [...attendance, ...extraAttendance]];
}

async function buildEmployeeExportReports({
  restaurantId,
  from,
  to,
  selectedEmployeeIds = [],
  openingHours = [],
}) {
  const employees = await EmployeeModel.find({
    _id: { $in: selectedEmployeeIds },
    restaurants: restaurantId,
    ...workforceAccountFilter(),
  }).lean();

  if (!employees.length) {
    return { error: { status: 404, message: "Employees not found" } };
  }

  const selection = { restaurant: restaurantId, employee: { $in: employees.map((employee) => employee._id) } };
  const [sessions, attendance] = await loadRegisterSessions(selection, from, to);
  const marks = new Map(attendance.map((entry) => [shiftAttendanceKey(entry.employee, entry.shift, entry.shiftDate), entry]));

  const sessionsByEmployeeId = new Map();
  for (const session of sessions) {
    const key = String(session.employee);
    if (!sessionsByEmployeeId.has(key)) {
      sessionsByEmployeeId.set(key, []);
    }
    sessionsByEmployeeId.get(key).push(session);
  }

  const employeeOrder = new Map(
    selectedEmployeeIds.map((id, index) => [String(id), index]),
  );
  const orderedEmployees = [...employees].sort((left, right) => {
    const leftOrder = employeeOrder.get(String(left._id));
    const rightOrder = employeeOrder.get(String(right._id));

    if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder)) {
      return leftOrder - rightOrder;
    }

    return String(left._id).localeCompare(String(right._id));
  });

  return {
    reports: orderedEmployees.map((employee) => {
      const profile = findRestaurantProfile(employee, restaurantId) || {};
      const employeeSessions = assignPlannedServices(sessionsByEmployeeId.get(String(employee._id)) || [], profile.shifts, marks);
      const absencesByDate = new Map();
      for (const shift of profile.shifts || []) {
        const date = toLocalDateKey(shift.start);
        if (marks.get(shiftAttendanceKey(employee._id, shift._id, date))?.absent && !isPlannedAbsence(shift)) {
          const items = absencesByDate.get(date) || [];
          items.push({ start: shift.start, end: shift.end });
          absencesByDate.set(date, items);
        }
      }
      const summary = buildEmployeeRangeSummary({
        employee,
        restaurantId,
        startDate: from,
        endDate: to,
        sessions: employeeSessions,
        openingHours,
      });
      const payrollByDate = payrollDays(employeeSessions, from, to);
      summary.range.days.forEach((day) => {
        day.payroll = payrollByDate.get(day.date) || [];
        day.reportedAbsences = absencesByDate.get(day.date) || [];
        day.totalPayrollMinutes = day.payroll.reduce((total, service) => total + service.timings.workedMinutes, 0);
      });
      summary.range.totalPayrollMinutes = summary.range.days.reduce((total, day) => total + day.totalPayrollMinutes, 0);

      return {
        ...summary,
        rawEmployee: employee,
        profile,
      };
    }),
  };
}

function validateManualSessionEdit(
  nextClockInAt,
  nextClockOutAt,
  breaks = [],
) {
  if (!nextClockInAt || !nextClockOutAt) {
    return "Les horaires d'entree et de sortie sont requis.";
  }

  if (nextClockOutAt <= nextClockInAt) {
    return "L'horaire de sortie doit etre apres l'horaire d'entree.";
  }

  let previousBreakEnd = null;

  for (const currentBreak of breaks) {
    if (!currentBreak?.startAt || !currentBreak?.endAt) {
      return "Chaque pause doit avoir une heure de debut et une heure de fin.";
    }

    if (currentBreak.endAt <= currentBreak.startAt) {
      return "Chaque pause doit se terminer apres son heure de debut.";
    }

    if (currentBreak.startAt < nextClockInAt) {
      return "Une pause ne peut pas commencer avant l'entree du service.";
    }

    if (currentBreak.endAt > nextClockOutAt) {
      return "Une pause ne peut pas se terminer apres la sortie du service.";
    }

    if (previousBreakEnd && currentBreak.startAt < previousBreakEnd) {
      return "Les pauses se chevauchent. Corrigez leur ordre ou leurs horaires.";
    }

    previousBreakEnd = currentBreak.endAt;
  }

  return null;
}

function buildManualBreaksPayload(session, parsedBreaks = []) {
  const existingBreaksById = new Map(
    (session?.breaks || [])
      .filter((currentBreak) => currentBreak?._id)
      .map((currentBreak) => [String(currentBreak._id), currentBreak]),
  );

  return parsedBreaks.map((item) => {
    const existingBreak = item.id ? existingBreaksById.get(item.id) : null;
    const startAt = new Date(item.startAt);
    const endAt = new Date(item.endAt);
    const sameTimes =
      existingBreak &&
      new Date(existingBreak.startAt).getTime() === startAt.getTime() &&
      new Date(existingBreak.endAt).getTime() === endAt.getTime();

    return {
      ...(existingBreak?._id ? { _id: existingBreak._id } : {}),
      startAt,
      endAt,
      durationMinutes: diffMinutes(startAt, endAt),
      startSignature: sameTimes ? existingBreak.startSignature || {} : {},
      endSignature: sameTimes ? existingBreak.endSignature || {} : {},
    };
  });
}

function serializeAdjustmentBreaks(breaks = []) {
  return (breaks || []).map((item) => ({
    startAt: item?.startAt || null,
    endAt: item?.endAt || null,
    durationMinutes: Number(
      item?.durationMinutes || diffMinutes(item?.startAt, item?.endAt),
    ),
  }));
}

function sessionOverlapsDateRange(session, startDateKey, endDateKey) {
  const overlapQuery = buildOverlapQuery(startDateKey, endDateKey);
  if (!overlapQuery) return false;

  const sessionStart = parseDateTime(session?.clockInAt);
  const sessionEnd = session?.clockOutAt
    ? parseDateTime(session.clockOutAt)
    : null;

  return Boolean(
    sessionStart &&
      sessionStart < overlapQuery.clockInAt.$lt &&
      (!sessionEnd || sessionEnd >= overlapQuery.$or[1].clockOutAt.$gte),
  );
}

async function getSummaryPayload({
  employee,
  restaurantId,
  anchorDateKey,
  openingHours = [],
}) {
  const monthRange = getMonthRangeFromDateKey(anchorDateKey);
  const overlapQuery = buildOverlapQuery(
    monthRange.startDate,
    monthRange.endDate,
  );

  const [monthSessions, recentSessions, activeSession] = await Promise.all([
    TimeClockSessionModel.find({
      restaurant: restaurantId,
      employee: employee._id,
      ...(overlapQuery || {}),
    })
      .sort({ clockInAt: -1 })
      .lean(),
    TimeClockSessionModel.find({
      restaurant: restaurantId,
      employee: employee._id,
    })
      .sort({ clockInAt: -1 })
      .limit(20)
      .lean(),
    TimeClockSessionModel.findOne({
      restaurant: restaurantId,
      employee: employee._id,
      status: { $in: ["open", "on_break"] },
    })
      .sort({ clockInAt: -1 })
      .lean(),
  ]);

  const monthList = [...monthSessions];
  if (
    activeSession &&
    !monthList.some(
      (session) => String(session._id) === String(activeSession._id),
    )
  ) {
    if (
      sessionOverlapsDateRange(
        activeSession,
        monthRange.startDate,
        monthRange.endDate,
      )
    ) {
      monthList.unshift(activeSession);
    }
  }

  return buildSummaryPayload({
    employee,
    restaurantId,
    anchorDateKey,
    monthSessions: monthList,
    recentSessions,
    activeSession,
    openingHours,
  });
}

function toKioskStatePayload(summary) {
  return {
    employee: summary?.employee || null,
    anchorDate: summary?.anchorDate || null,
    state: summary?.state || {
      situation: "off",
      availableActions: [ACTIONS.CLOCK_IN],
      activeSession: null,
    },
    day: summary?.day || null,
    lastUpdatedAt: summary?.lastUpdatedAt || new Date().toISOString(),
  };
}

async function buildKioskStatesPayload({
  restaurantId,
  employeeIds = [],
  anchorDateKey,
  openingHours = [],
}) {
  const targetIds = Array.from(
    new Set(
      (employeeIds || [])
        .map((employeeId) => String(employeeId || "").trim())
        .filter(Boolean),
    ),
  );

  if (!targetIds.length) {
    return {
      anchorDate: anchorDateKey,
      statesByEmployee: {},
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  const overlapQuery = buildOverlapQuery(anchorDateKey, anchorDateKey);

  const [employees, sessions] = await Promise.all([
    EmployeeModel.find({
      _id: { $in: targetIds },
      ...workforceAccountFilter(),
    }).lean(),
    TimeClockSessionModel.find({
      restaurant: restaurantId,
      employee: { $in: targetIds },
      ...(overlapQuery || {}),
    })
      .sort({ clockInAt: 1 })
      .lean(),
  ]);

  const sessionsByEmployee = new Map();

  for (const session of sessions) {
    const employeeId = String(session?.employee || "");
    if (!employeeId) continue;

    const current = sessionsByEmployee.get(employeeId) || [];
    current.push(session);
    sessionsByEmployee.set(employeeId, current);
  }

  const statesByEmployee = {};
  const now = new Date();

  for (const employee of employees) {
    if (!employeeWorksInRestaurant(employee, restaurantId)) continue;

    const employeeId = String(employee?._id || "");
    const employeeSessions = sessionsByEmployee.get(employeeId) || [];
    const activeSession =
      [...employeeSessions]
        .filter((session) => ["open", "on_break"].includes(session?.status))
        .sort(
          (left, right) => new Date(right.clockInAt) - new Date(left.clockInAt),
        )[0] || null;

    const summary = buildSummaryPayload({
      employee,
      restaurantId,
      anchorDateKey,
      monthSessions: employeeSessions,
      recentSessions: [],
      activeSession,
      now,
      openingHours,
    });

    statesByEmployee[employeeId] = toKioskStatePayload(summary);
  }

  return {
    anchorDate: anchorDateKey,
    statesByEmployee,
    lastUpdatedAt: now.toISOString(),
  };
}

router.post(
  "/restaurants/:restaurantId/time-clock/punch",
  (req, res, next) => req.get("Authorization")?.startsWith("Device ")
    ? authenticateClockDevice(req, res, next) : authenticateToken(req, res, next),
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { employeeId, action, businessDate } = req.body || {};
      const clientMutationId = normalizeClientMutationId(
        req.body?.clientMutationId,
      );
      const device = req.timeClockDevice;

      if (!isValidObjectId(employeeId) || typeof employeeId !== "string") {
        return res.status(400).json({ message: "employeeId is required" });
      }

      if (!Object.values(ACTIONS).includes(action)) {
        return res.status(400).json({ message: "Invalid action" });
      }

      const accessContext = device ? req.timeClockAccess : await getAccessContext(req, restaurantId);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }
      const mutationKey = clientMutationId ? `${String(accessContext.restaurant._id)}:${clientMutationId}` : "";

      if (!device && !canAccessTargetEmployee(accessContext, employeeId)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const employee = await getTargetEmployee(employeeId, restaurantId);
      if (!employee && !device) {
        return res.status(404).json({ message: "Employee not found" });
      }

      if (device && !verifyPunchProof(device, req.body)) {
        return res.status(422).json({ message: "La preuve de ce pointage est invalide." });
      }

      const now = getEffectiveActionTime(req);
      const signature = normalizeSignaturePayload(req.body?.signature, now);
      if (!signature.hasSignature) {
        return res.status(400).json({ message: "Signature is required" });
      }

      if (clientMutationId) {
        const existingSession = await TimeClockSessionModel.findOne({
          restaurant: restaurantId,
          employee: employeeId,
          "events.clientMutationId": clientMutationId,
        });

        if (existingSession) {
          if (device) {
            const matches = existingSession.events.some((event) => event.clientMutationId === clientMutationId &&
              event.deviceId === String(device._id) && event.deviceProof === req.body.proof);
            if (!matches) return res.status(409).json({ message: "Cette référence de pointage est déjà utilisée." });
            const states = employee && await buildKioskStatesPayload({
              restaurantId, employeeIds: [employeeId], anchorDateKey: toLocalDateKey(new Date()),
              openingHours: accessContext.restaurant.opening_hours,
            });
            return res.json({
              sessionId: String(existingSession._id), idempotentReplay: true,
              kiosk: minimalKioskState(states?.statesByEmployee[employeeId]),
            });
          }
          const existingEmployee = await getTargetEmployee(
            existingSession.employee,
            restaurantId,
          );

          if (!existingEmployee) {
            return res.status(404).json({ message: "Employee not found" });
          }

          const summary = await getSummaryPayload({
            employee: existingEmployee,
            restaurantId,
            anchorDateKey:
              existingSession.businessDate ||
              (isValidDateKey(businessDate)
                ? businessDate
                : toLocalDateKey(now)),
            openingHours: accessContext.restaurant?.opening_hours || [],
          });

          return res.status(200).json({
            sessionId: String(existingSession._id),
            summary,
            idempotentReplay: true,
          });
        }
      }

      if (device) {
        const grant = readPunchGrant(device, req.body);
        const credential = grant && await TimeClockPin.findOne({
          restaurant: restaurantId, employee: employeeId, revision: grant.revision,
        }).select("profile").lean();
        const onRoster = accessContext.restaurant.employees?.some((id) => String(id) === employeeId);
        if (!onRoster || !credentialIsCurrent(credential, employee, restaurantId)) {
          return res.status(422).json({ message: "L’autorisation de ce pointage a expiré ou a été révoquée." });
        }
        req.user = { role: "employee", id: employeeId };
      }

      const activeSession = await TimeClockSessionModel.findOne({
        restaurant: restaurantId,
        employee: employeeId,
        status: { $in: ["open", "on_break"] },
      }).sort({ clockInAt: -1 });

      let session = activeSession;

      if (action === ACTIONS.CLOCK_IN) {
        if (session) {
          return res.status(409).json({
            message: "Un pointage est deja en cours pour ce salarie.",
          });
        }

        if (device && await TimeClockSessionModel.exists({
          restaurant: restaurantId, employee: employeeId, clockOutAt: { $gt: now },
        })) {
          return res.status(409).json({ message: "Ce pointage précède un service déjà enregistré." });
        }

        const sessionDate = !device && isValidDateKey(businessDate)
          ? businessDate
          : toLocalDateKey(now);

        session = new TimeClockSessionModel({
          restaurant: restaurantId,
          employee: employeeId,
          employeeSnapshot: getEmployeeSnapshot(employee, restaurantId),
          businessDate: sessionDate,
          status: "open",
          activeSlot: true,
          ...(mutationKey && { mutationKeys: [mutationKey] }),
          clockInAt: now,
          clockOutAt: null,
          breaks: [],
          events: [
            buildEvent({
              action,
              now,
              signature,
              request: req,
              clientMutationId,
            }),
          ],
          source: getSourceFromRequest(req),
          lastActionAt: now,
        });

        syncSessionTotals(session, now);
        await session.save();
      } else {
        if (!session) {
          return res.status(409).json({
            message: "Aucune session active pour ce salarie.",
          });
        }

        const previousActionAt = parseDateTime(
          session?.lastActionAt || session?.clockInAt,
        );
        if (previousActionAt && now < previousActionAt) {
          return res.status(409).json({
            message:
              "Cet horaire est anterieur a la derniere action connue pour ce salarie.",
          });
        }

        if (action === ACTIONS.BREAK_START) {
          if (session.status !== "open") {
            return res.status(409).json({
              message: "Une pause est deja en cours pour ce salarie.",
            });
          }

          session.breaks.push({
            startAt: now,
            endAt: null,
            durationMinutes: 0,
            startSignature: signature,
            endSignature: { hasSignature: false, strokes: [], signedAt: null },
          });
          session.status = "on_break";
        }

        if (action === ACTIONS.BREAK_END) {
          if (session.status !== "on_break") {
            return res.status(409).json({
              message: "Aucune pause active pour ce salarie.",
            });
          }

          const currentBreak = session.breaks[session.breaks.length - 1];
          if (!currentBreak || currentBreak.endAt) {
            return res.status(409).json({
              message: "Aucune pause active pour ce salarie.",
            });
          }

          currentBreak.endAt = now;
          currentBreak.durationMinutes = diffMinutes(currentBreak.startAt, now);
          currentBreak.endSignature = signature;
          session.status = "open";
        }

        if (action === ACTIONS.CLOCK_OUT) {
          if (session.status !== "open") {
            return res.status(409).json({
              message: "La pause doit etre terminee avant la sortie.",
            });
          }

          session.clockOutAt = now;
          session.status = "closed";
          session.activeSlot = undefined;
        }

        session.events.push(
          buildEvent({
            action,
            now,
            signature,
            request: req,
            clientMutationId,
          }),
        );
        if (mutationKey) session.mutationKeys = [...(session.mutationKeys || []), mutationKey];
        session.lastActionAt = now;
        syncSessionTotals(session, now);
        await session.save();
      }

      if (device) {
        const states = await buildKioskStatesPayload({
          restaurantId, employeeIds: [employeeId], anchorDateKey: toLocalDateKey(new Date()),
          openingHours: accessContext.restaurant.opening_hours,
        });
        return res.status(action === ACTIONS.CLOCK_IN ? 201 : 200).json({
          sessionId: String(session._id), kiosk: minimalKioskState(states.statesByEmployee[employeeId]),
        });
      }

      const refreshedEmployee = await getTargetEmployee(
        employeeId,
        restaurantId,
      );
      const responseAnchorDateKey = isValidDateKey(businessDate)
        ? businessDate
        : toLocalDateKey(now);
      const summary = await getSummaryPayload({
        employee: refreshedEmployee,
        restaurantId,
        anchorDateKey: responseAnchorDateKey,
        openingHours: accessContext.restaurant?.opening_hours || [],
      });

      return res.status(action === ACTIONS.CLOCK_IN ? 201 : 200).json({
        sessionId: String(session._id),
        summary,
      });
    } catch (error) {
      if (error.name === "VersionError" || error.code === 11000) {
        return res.status(503).json({ message: "Pointage concurrent. Réessayez dans un instant." });
      }
      console.error("Error creating time-clock punch", { code: error.code || error.name });
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.get(
  "/restaurants/:restaurantId/time-clock/kiosk/states",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const anchorDateKey = isValidDateKey(req.query?.anchorDate)
        ? String(req.query.anchorDate)
        : toLocalDateKey(new Date());

      const accessContext = await getAccessContext(req, restaurantId);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const employeeIds =
        accessContext.currentEmployee && !accessContext.isManager
          ? [String(accessContext.currentEmployee._id)]
          : (accessContext.restaurant?.employees || []).map((employeeId) =>
              String(employeeId),
            );

      const payload = await buildKioskStatesPayload({
        restaurantId,
        employeeIds,
        anchorDateKey,
        openingHours: accessContext.restaurant?.opening_hours || [],
      });

      return res.json(payload);
    } catch (error) {
      console.error("Error fetching time-clock kiosk states:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.get(
  "/restaurants/:restaurantId/time-clock/me/summary",
  authenticateToken,
  async (req, res) => {
    try {
      if (req.user?.role !== "employee") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { restaurantId } = req.params;
      const anchorDateKey = isValidDateKey(req.query?.anchorDate)
        ? String(req.query.anchorDate)
        : toLocalDateKey(new Date());

      const accessContext = await getAccessContext(req, restaurantId);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const employee = await getTargetEmployee(req.user.id, restaurantId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const summary = await getSummaryPayload({
        employee,
        restaurantId,
        anchorDateKey,
        openingHours: accessContext.restaurant?.opening_hours || [],
      });

      return res.json(summary);
    } catch (error) {
      console.error("Error fetching time-clock self summary:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.get(
  "/restaurants/:restaurantId/time-clock/employees/:employeeId/summary",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const anchorDateKey = isValidDateKey(req.query?.anchorDate)
        ? String(req.query.anchorDate)
        : toLocalDateKey(new Date());

      const accessContext = await getAccessContext(req, restaurantId);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      if (!canAccessTargetEmployee(accessContext, employeeId)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const employee = await getTargetEmployee(employeeId, restaurantId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const summary = await getSummaryPayload({
        employee,
        restaurantId,
        anchorDateKey,
        openingHours: accessContext.restaurant?.opening_hours || [],
      });

      return res.json(summary);
    } catch (error) {
      console.error("Error fetching time-clock summary:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.get(
  "/restaurants/:restaurantId/time-clock/register",
  authenticateToken,
  requireClockManager,
  async (req, res, next) => {
    try {
      const { restaurantId } = req.params;
      const { restaurant } = req.timeClockAccess;
      const { from, to, employeeId, view = "days" } = req.query;
      const bounds = getRangeBounds(from, to);
      if (!["days", "history"].includes(view) || !bounds || to > addDaysToDateKey(from, 30) ||
          (employeeId && (typeof employeeId !== "string" || !isValidObjectId(employeeId)))) {
        return res.status(400).json({ message: "Sélectionnez une période de 31 jours maximum." });
      }

      const dateFilter = { $gte: bounds.start, $lt: bounds.endExclusive };
      const selection = { restaurant: restaurantId, ...(employeeId && { employee: employeeId }) };
      const fields = "-events.signature -breaks.startSignature -breaks.endSignature -mutationKeys";
      const records = view === "history" ? Promise.all([
        TimeClockSessionModel.find({
          ...selection,
          $or: ["events.at", "adjustments.editedAt", "payrollAdjustments.editedAt", "reviews.at"].map((field) => ({ [field]: dateFilter })),
        }).select(fields).lean(),
        TimeClockAbsence.find({ ...selection, "changes.at": dateFilter }).lean(),
      ]) : loadRegisterSessions(selection, from, to, fields);
      const [employees, [sessions, absences]] = await Promise.all([
        EmployeeModel.find(workforceRoster(restaurantId, restaurant))
          .select(view === "history" ? "firstname lastname post restaurantProfiles.restaurant restaurantProfiles.snapshot"
            : "firstname lastname post restaurantProfiles.restaurant restaurantProfiles.snapshot restaurantProfiles.shifts").lean(),
        records,
      ]);

      const selected = employeeId ? employees.filter((employee) => String(employee._id) === employeeId) : employees;
      const roster = employees.map((employee) => {
        const { firstname, lastname, post } = getEmployeeSnapshot(employee, restaurantId);
        return { id: String(employee._id), firstname, lastname, post };
      });
      res.set("Cache-Control", "no-store");
      if (view === "history") {
        const entries = buildRegisterHistory({ sessions, employees: selected, absences, restaurantId, ...bounds });
        const owner = entries.some((entry) => entry.actorRole === "owner" && entry.actorId === String(restaurant.owner_id))
          ? await OwnerModel.findById(restaurant.owner_id).select("firstname lastname").lean()
          : null;
        const names = new Map(roster.map(({ id, firstname, lastname }) => [id, [firstname, lastname].filter(Boolean).join(" ")]));
        if (owner) names.set(String(restaurant.owner_id), [owner.firstname, owner.lastname].filter(Boolean).join(" "));
        return res.json({ roster, history: entries.map((entry) => ({ ...entry, actorName: names.get(entry.actorId) || "" })) });
      }

      return res.json({
        roster,
        rows: buildRegisterRows({
          employees: selected, sessions, absences, restaurantId, startDate: from, endDate: to, openingHours: restaurant.opening_hours,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/time-clock/register/review",
  authenticateToken,
  requireClockManager,
  async (req, res, next) => {
    try {
      const { restaurantId } = req.params;
      const { from, to, employeeId } = req.body || {};
      const bounds = isValidDateKey(from) && isValidDateKey(to) ? getRangeBounds(from, to) : null;
      if (!bounds || to > addDaysToDateKey(from, 30) ||
          (employeeId === undefined ? from !== to : typeof employeeId !== "string" || !isValidObjectId(employeeId))) {
        return res.status(400).json({ message: "Sélectionnez une journée ou une période pour un salarié." });
      }
      const { restaurant } = req.timeClockAccess;
      const selection = { restaurant: restaurantId, ...(employeeId && { employee: employeeId }) };
      const actor = { at: new Date(), actorId: String(req.user.id), actorRole: req.user.role };
      const validatedCount = await TimeClockSessionModel.db.transaction(async (transaction) => {
        const sessions = await TimeClockSessionModel.find({
          ...selection, status: "closed", ...buildPayrollOverlapQuery(from, to),
        }).session(transaction);
        const absences = await TimeClockAbsence.find({
          ...selection, absent: true, validated: { $ne: true }, shiftDate: { $gte: from, $lte: to },
        }).session(transaction);
        const planned = new Set();
        if (absences.length) {
          const workforce = workforceRoster(restaurantId, restaurant);
          const employeeIds = new Set(absences.map((item) => String(item.employee)));
          const employees = await EmployeeModel.find({
            ...workforce, _id: { $in: workforce._id.$in.filter((id) => employeeIds.has(String(id))) },
          }).select("restaurantProfiles.restaurant restaurantProfiles.shifts").session(transaction).lean();
          for (const employee of employees) {
            const profile = findRestaurantProfile(employee, restaurantId);
            for (const shift of profile?.shifts || []) {
              if (!isPlannedAbsence(shift)) planned.add(shiftAttendanceKey(employee._id, shift._id, toLocalDateKey(shift.start)));
            }
          }
        }
        let count = 0;
        for (const session of sessions) {
          if (session.reviews.at(-1)?.type === "validated") continue;
          const sessionDate = session.businessDate || toLocalDateKey(session.clockInAt);
          const inRange = (sessionDate >= from && sessionDate <= to) ||
            (session.clockInAt < bounds.endExclusive && session.clockOutAt > bounds.start) ||
            (session.payroll?.clockInAt < bounds.endExclusive && session.payroll?.clockOutAt > bounds.start);
          if (!inRange) continue;
          session.reviews.push({ ...actor, type: "validated" });
          await session.save({ session: transaction });
          count += 1;
        }
        for (const absence of absences) {
          if (!planned.has(shiftAttendanceKey(absence.employee, absence.shift, absence.shiftDate))) continue;
          absence.validated = true;
          absence.revision += 1;
          absence.changes.push({ ...actor, validated: true });
          await absence.save({ session: transaction });
          count += 1;
        }
        return count;
      });
      return res.json({ validatedCount });
    } catch (error) {
      if (error.name === "VersionError") return res.status(409).json({ message: "Les services ont changé. Actualisez les données." });
      return next(error);
    }
  },
);

router.get(
  "/restaurants/:restaurantId/time-clock/sessions/:sessionId/events",
  authenticateToken,
  requireClockManager,
  async (req, res, next) => {
    try {
      const { restaurantId, sessionId } = req.params;
      if (!isValidObjectId(sessionId)) {
        return res.status(400).json({ message: "Identifiant de pointage invalide." });
      }
      const session = await TimeClockSessionModel.findOne({ _id: sessionId, restaurant: restaurantId })
        .select("events").lean();
      if (!session) return res.status(404).json({ message: "Pointage introuvable." });

      const events = (session.events || []).map(serializeEvent).sort((a, b) => new Date(a.at) - new Date(b.at));
      res.set("Cache-Control", "no-store");
      return res.json({ events });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  "/restaurants/:restaurantId/time-clock/sessions/:sessionId/review",
  authenticateToken,
  requireClockManager,
  async (req, res, next) => {
    try {
      const { restaurantId, sessionId } = req.params;
      if (!isValidObjectId(sessionId) || typeof req.body?.validated !== "boolean") {
        return res.status(400).json({ message: "État de validation invalide." });
      }
      const session = await TimeClockSessionModel.findOne({ _id: sessionId, restaurant: restaurantId });
      if (!session) return res.status(404).json({ message: "Pointage introuvable." });
      const { validated, expectedUpdatedAt, expectedRevision } = req.body;
      if ((session.reviews.at(-1)?.type === "validated") === validated) return res.json({ validated });
      if (expectedUpdatedAt !== session.updatedAt?.toISOString() || session.status !== "closed" ||
          (expectedRevision !== undefined && expectedRevision !== (session.__v ?? 0))) {
        return res.status(409).json({ message: "Ce pointage est incomplet ou a changé. Actualisez les données." });
      }
      session.reviews.push({ type: validated ? "validated" : "reopened", at: new Date(), actorId: req.user.id, actorRole: req.user.role });
      await session.save();
      return res.json({ validated });
    } catch (error) {
      if (error.name === "VersionError") return res.status(409).json({ message: "Le pointage a changé. Actualisez les données." });
      return next(error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/time-clock/sessions/:sessionId/notes",
  authenticateToken,
  requireClockManager,
  async (req, res, next) => {
    const conflict = "Le service a changé. Actualisez les données avant d’ajouter la note.";
    try {
      const { restaurantId, sessionId } = req.params;
      const { note, expectedRevision, expectedUpdatedAt } = req.body || {};
      if (!isValidObjectId(sessionId) || !validServiceText(note) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return res.status(400).json({ message: "Vérifiez le contenu de la note et le service." });
      }
      const session = await TimeClockSessionModel.findOne({ _id: sessionId, restaurant: restaurantId });
      if (!session) return res.status(404).json({ message: "Pointage introuvable." });
      if (expectedRevision !== (session.__v ?? 0) || expectedUpdatedAt !== (session.updatedAt?.toISOString() || null)) {
        return res.status(409).json({ message: conflict });
      }
      if (!session.payrollAdjustments) session.payrollAdjustments = [];
      session.payrollAdjustments.push({
        isNote: true, reason: note.trim(), editedAt: new Date(),
        editedByRole: req.user.role, editedById: String(req.user.id),
      });
      await session.save();
      return res.status(201).json({ changed: true });
    } catch (error) {
      if (error.name === "VersionError") return res.status(409).json({ message: conflict });
      return next(error);
    }
  },
);

router.patch(
  "/restaurants/:restaurantId/time-clock/sessions/:sessionId",
  authenticateToken,
  requireClockManager,
  async (req, res) => {
    try {
      const { restaurantId, sessionId } = req.params;

      const accessContext = req.timeClockAccess;

      const session = await TimeClockSessionModel.findOne({
        _id: sessionId,
        restaurant: restaurantId,
      });

      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const employee = await getTargetEmployee(session.employee, restaurantId);
      if (req.body?.expectedUpdatedAt && req.body.expectedUpdatedAt !== session.updatedAt?.toISOString()) {
        return res.status(409).json({ message: "Le pointage a changé. Actualisez les données." });
      }

      const parseTime = req.body?.wallTimeZone === "Europe/Paris" ? parseParisEditTime : parseDateTime;
      const nextClockInAt = parseTime(req.body?.clockInAt);
      const nextClockOutAt = parseTime(req.body?.clockOutAt);
      const nextBreaksInput =
        req.body?.breaks === undefined
          ? parseManualBreaks(
              (session.breaks || []).map((currentBreak) => ({
                id: currentBreak?._id ? String(currentBreak._id) : "",
                startAt: currentBreak?.startAt,
                endAt: currentBreak?.endAt,
              })),
            )
          : parseManualBreaks(req.body?.breaks, parseTime);
      const reason = String(req.body?.reason || "").trim();

      const validationError = validateManualSessionEdit(
        nextClockInAt,
        nextClockOutAt,
        nextBreaksInput,
      );
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }
      if (reason.length > 2000 || nextClockOutAt > new Date() || (req.body?.wallTimeZone && !reason)) {
        return res.status(400).json({ message: "Vérifiez la date de sortie et le motif de correction." });
      }
      if (await TimeClockSessionModel.exists({
        _id: { $ne: session._id }, restaurant: restaurantId, employee: session.employee,
        clockInAt: { $lt: nextClockOutAt },
        $or: [{ clockOutAt: null }, { clockOutAt: { $gt: nextClockInAt } }],
      })) {
        return res.status(409).json({ message: "Ces horaires chevauchent un autre pointage." });
      }

      const previousClockInAt = session.clockInAt;
      const previousClockOutAt = session.clockOutAt;
      const previousBreaks = serializeAdjustmentBreaks(session.breaks || []);
      const nextBreaks = buildManualBreaksPayload(session, nextBreaksInput);

      session.clockInAt = nextClockInAt;
      session.clockOutAt = nextClockOutAt;
      session.breaks = nextBreaks;
      session.businessDate = toLocalDateKey(nextClockInAt);
      session.status = "closed";
      session.activeSlot = undefined;
      if (employee) session.employeeSnapshot = getEmployeeSnapshot(employee, restaurantId);
      session.lastActionAt = new Date();
      if (session.reviews.at(-1)?.type === "validated") {
        session.reviews.push({ type: "reopened", at: new Date(), actorId: req.user.id, actorRole: req.user.role });
      }
      session.adjustments.push({
        editedAt: new Date(),
        editedByRole: req.user?.role === "owner" ? "owner" : "employee",
        editedById: String(req.user?.id || ""),
        reason,
        previousClockInAt,
        previousClockOutAt,
        clockInAt: nextClockInAt,
        clockOutAt: nextClockOutAt,
        previousBreaks,
        breaks: serializeAdjustmentBreaks(nextBreaks),
      });

      syncSessionTotals(session, new Date());
      await session.save();

      const anchorDateKey = isValidDateKey(req.body?.anchorDate)
        ? String(req.body.anchorDate)
        : session.businessDate || toLocalDateKey(nextClockInAt);

      const summary = await getSummaryPayload({
        employee: employee || { _id: session.employee, ...session.employeeSnapshot.toObject() },
        restaurantId,
        anchorDateKey,
        openingHours: accessContext.restaurant?.opening_hours || [],
      });

      return res.json({
        sessionId: String(session._id),
        summary,
      });
    } catch (error) {
      if (error.name === "VersionError") return res.status(409).json({ message: "Le pointage a changé. Actualisez les données." });
      console.error("Error updating time-clock session:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

function validMealCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validServiceText(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
}

async function savePlannedAttendance(req, res, next) {
  const conflict = "Ce service a changé. Fermez la correction et actualisez les données.";
  try {
    const { restaurantId, employeeId, shiftId } = req.params;
    const { absent, mealCount, validated, reason, note, expectedRevision, shiftDate } = req.body || {};
    const { restaurant } = req.timeClockAccess;
    const isReview = validated !== undefined;
    const isNote = note !== undefined;
    const invalidChange = isReview
      ? typeof validated !== "boolean" || absent !== undefined || mealCount !== undefined || isNote
      : isNote ? !validServiceText(note) || absent !== undefined || mealCount !== undefined
        : (absent === undefined && mealCount === undefined) ||
        (absent !== undefined && typeof absent !== "boolean") || (mealCount !== undefined && !validMealCount(mealCount)) ||
        !validServiceText(reason);
    if (!isValidObjectId(employeeId) || !isValidObjectId(shiftId) || !isValidDateKey(shiftDate) ||
        !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || invalidChange) {
      return res.status(400).json({ message: "Vérifiez les données du service." });
    }
    if (!restaurant.employees?.some((id) => String(id) === employeeId)) {
      return res.status(404).json({ message: "Service prévu introuvable." });
    }
    const employee = await getTargetEmployee(employeeId, restaurantId);
    const shift = findRestaurantProfile(employee, restaurantId)?.shifts?.find((item) => String(item._id) === shiftId);
    if (!shift || isPlannedAbsence(shift)) return res.status(404).json({ message: "Service prévu introuvable." });
    if (shiftDate !== toLocalDateKey(shift.start)) {
      return res.status(409).json({ message: "La date du service a changé. Actualisez les données." });
    }
    if (absent === true && new Date(shift.start) > new Date()) {
      return res.status(409).json({ message: "Une absence peut être constatée dès le début du service prévu." });
    }

    const key = { restaurant: restaurantId, employee: employeeId, shift: shiftId, shiftDate };
    const current = await TimeClockAbsence.findOne(key).lean();
    if ((current?.revision || 0) !== expectedRevision) return res.status(409).json({ message: conflict });
    if (isReview && !current?.absent) {
      return res.status(409).json({ message: "Constatez l’absence avant de valider ce service sans pointage." });
    }
    const fields = {};
    const audit = { at: new Date(), actorId: String(req.user.id), actorRole: req.user.role };
    const changes = [];
    if (isNote) changes.push({ ...audit, isNote: true, reason: note.trim() });
    if (isReview && Boolean(current.validated) !== validated) {
      fields.validated = validated;
      changes.push({ ...audit, validated });
    }
    if (absent !== undefined && Boolean(current?.absent) !== absent) {
      fields.absent = absent;
      changes.push({ ...audit, absent, reason: reason.trim() });
    }
    if (mealCount !== undefined && current?.mealCount !== mealCount) {
      fields.mealCount = mealCount;
      changes.push({ ...audit, mealCount, previousMealCount: shiftMealCount(shift, restaurant.opening_hours, current), reason: reason.trim() });
    }
    if (!changes.length) return res.json({ changed: false });
    const reopened = !isReview && !isNote && Boolean(current?.validated);
    if (reopened) {
      fields.validated = false;
      changes.push({ ...audit, validated: false });
    }
    if (!current) {
      await TimeClockAbsence.create({ ...key, ...fields, revision: 1, changes });
    } else {
      const result = await TimeClockAbsence.updateOne({ ...key, revision: expectedRevision }, {
        ...(Object.keys(fields).length && { $set: fields }),
        $inc: { revision: 1 }, $push: { changes: { $each: changes } },
      });
      if (!result.modifiedCount) return res.status(409).json({ message: conflict });
    }
    return res.json({ changed: true, ...fields, ...(reopened && { reopened }) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: conflict });
    return next(error);
  }
}

router.put(
  "/restaurants/:restaurantId/time-clock/employees/:employeeId/shifts/:shiftId/absence",
  authenticateToken,
  requireClockManager,
  savePlannedAttendance,
);

router.put(
  "/restaurants/:restaurantId/time-clock/employees/:employeeId/shifts/:shiftId/attendance",
  authenticateToken,
  requireClockManager,
  savePlannedAttendance,
);

async function getSessionWithPlannedService(session, restaurantId, now) {
  const date = toLocalDateKey(session.clockInAt);
  const bounds = getRangeBounds(date, date);
  if (!bounds) return session;
  const employee = await getTargetEmployee(session.employee, restaurantId);
  const shifts = findRestaurantProfile(employee, restaurantId)?.shifts || [];
  const candidates = shifts.filter((shift) => toLocalDateKey(shift.start) === date && !isPlannedAbsence(shift));
  if (!candidates.length) return session;
  const [siblings, attendance] = await Promise.all([
    TimeClockSessionModel.find({
      _id: { $ne: session._id },
      restaurant: restaurantId,
      employee: session.employee,
      clockInAt: { $gte: bounds.start, $lt: bounds.endExclusive },
    }).select("employee clockInAt clockOutAt").lean(),
    TimeClockAbsence.find({ restaurant: restaurantId, employee: session.employee, shiftDate: date }).lean(),
  ]);
  const marks = new Map(attendance.map((item) => [shiftAttendanceKey(item.employee, item.shift, item.shiftDate), item]));
  return assignPlannedServices([...siblings, session.toObject()], candidates, marks, now)
    .find((item) => String(item._id) === String(session._id)) || session;
}

router.put(
  "/restaurants/:restaurantId/time-clock/sessions/:sessionId/payroll",
  authenticateToken,
  requireClockManager,
  async (req, res, next) => {
    try {
      const { restaurantId, sessionId } = req.params;
      const { reset = false, reason, expectedUpdatedAt, expectedRevision, absent, mealCount } = req.body || {};
      if (!isValidObjectId(sessionId) || typeof reset !== "boolean" ||
          (absent !== undefined && typeof absent !== "boolean") ||
          (mealCount !== undefined && !validMealCount(mealCount)) ||
          typeof reason !== "string" || !reason.trim() || reason.length > 2000 ||
          !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return res.status(400).json({ message: "Vérifiez le motif et les données de correction." });
      }

      const session = await TimeClockSessionModel.findOne({ _id: sessionId, restaurant: restaurantId });
      if (!session) return res.status(404).json({ message: "Pointage introuvable." });
      if (expectedRevision !== (session.__v ?? 0) ||
          expectedUpdatedAt !== (session.updatedAt?.toISOString() || null)) {
        return res.status(409).json({ message: "Le pointage a changé. Fermez la correction et actualisez les données." });
      }
      const adjustsPayroll = mealCount === undefined || reset ||
        ["clockInAt", "clockOutAt", "breaks", "pause", "absent"].some((field) => req.body[field] !== undefined);
      const mealsChanged = mealCount !== undefined && mealCount !== session.mealCountOverride;
      const at = new Date();
      const assigned = adjustsPayroll || (mealsChanged && session.mealCountOverride == null)
        ? await getSessionWithPlannedService(session, restaurantId, at) : session;
      const previous = adjustsPayroll ? payrollSchedule(assigned) : null;
      if (adjustsPayroll && !previous) return res.status(409).json({ message: "Terminez le pointage avant de modifier les heures rémunérées." });

      let payroll;
      if (adjustsPayroll && !reset) {
        const parseTime = (value) => {
          if (typeof value !== "string") return null;
          if (req.body.wallTimeZone === "Europe/Paris" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
            return parseParisEditTime(value);
          }
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
          const date = DateTime.fromISO(value, { setZone: true });
          return date.isValid ? date.toJSDate() : null;
        };
        const clockInAt = req.body.clockInAt === undefined ? previous.clockInAt : parseTime(req.body.clockInAt);
        const clockOutAt = req.body.clockOutAt === undefined ? previous.clockOutAt : parseTime(req.body.clockOutAt);
        const { breaks: requestedBreaks, pause } = req.body;
        if (requestedBreaks !== undefined && !Array.isArray(requestedBreaks)) {
          return res.status(400).json({ message: "La liste des pauses rémunérées est requise." });
        }
        const breaks = requestedBreaks
          ? parseManualBreaks(requestedBreaks, parseTime)
          : previous.breaks.map((entry) => ({
            startAt: new Date(Math.max(+new Date(entry.startAt), +new Date(clockInAt))),
            endAt: new Date(Math.min(+new Date(entry.endAt), +new Date(clockOutAt))),
          })).filter((entry) => entry.startAt < entry.endAt);
        const validationError = validateManualSessionEdit(clockInAt, clockOutAt, breaks);
        if (validationError) return res.status(400).json({ message: validationError });
        const maxDuration = Math.max(48 * 60 * 60 * 1000, session.clockOutAt - session.clockInAt);
        if (clockOutAt > new Date() || clockOutAt - clockInAt > maxDuration) {
          return res.status(400).json({ message: "Vérifiez la date de fin et la durée du service rémunéré." });
        }
        payroll = payrollSchedule(assigned, {
          clockInAt, clockOutAt, breaks, absent: absent ?? previous.absent,
          usePlannedPause: requestedBreaks === undefined && previous.usePlannedPause,
        });
        const dayShares = payrollDayShares(payroll);
        const capacity = new Map(dayShares.map((item) => [item.date, item.grossMinutes]));
        const pauses = new Map(requestedBreaks ? [] : previous.pauseMinutesByDay
          .filter(({ date }) => capacity.has(date))
          .map(({ date, minutes }) => [date, Math.min(minutes, capacity.get(date))]));
        if (pause !== undefined) {
          if (!capacity.has(pause?.date) || !Number.isSafeInteger(pause.minutes) ||
              pause.minutes < 0 || pause.minutes > capacity.get(pause.date)) {
            return res.status(400).json({ message: "La pause doit être comprise entre zéro et la durée rémunérée du jour." });
          }
          const calculated = dayShares.find((item) => item.date === pause.date).breakMinutes;
          if (pause.minutes === calculated) pauses.delete(pause.date);
          else pauses.set(pause.date, pause.minutes);
        }
        payroll.pauseMinutesByDay = [...pauses].sort(([a], [b]) => a.localeCompare(b))
          .map(([date, minutes]) => ({ date, minutes }));
      }

      const current = adjustsPayroll ? (payroll || payrollSchedule(assigned, null)) : null;
      const payrollChanged = adjustsPayroll && (reset ? Boolean(session.payroll) : JSON.stringify(previous) !== JSON.stringify(current));
      if (!payrollChanged && !mealsChanged) {
        return res.json({ changed: false, manual: Boolean(session.payroll) });
      }
      const actorId = String(req.user.id);
      const actorRole = req.user.role;
      if (!session.payrollAdjustments) session.payrollAdjustments = [];
      const audit = { editedAt: at, editedById: actorId, editedByRole: actorRole, reason: reason.trim() };
      if (payrollChanged) {
        session.payroll = payroll;
        session.payrollAdjustments.push({
          ...audit, reset,
          previousClockInAt: previous.clockInAt, previousClockOutAt: previous.clockOutAt, previousBreaks: previous.breaks,
          previousAbsent: previous.absent, previousPauseMinutesByDay: auditPayrollPauses(previous),
          ...current,
          pauseMinutesByDay: auditPayrollPauses(current),
        });
      }
      if (mealsChanged) {
        const previousMealCount = serializeSession(assigned, { now: at, openingHours: req.timeClockAccess.restaurant.opening_hours }).mealAllowance.count;
        session.mealCountOverride = mealCount;
        session.payrollAdjustments.push({ ...audit, previousMealCount, mealCount });
      }
      const reopened = session.reviews.at(-1)?.type === "validated";
      if (reopened) session.reviews.push({ type: "reopened", at, actorId, actorRole });
      await session.save();
      return res.json({ changed: true, manual: Boolean(session.payroll), reopened });
    } catch (error) {
      if (error.name === "VersionError") return res.status(409).json({ message: "Le pointage a changé. Fermez la correction et actualisez les données." });
      return next(error);
    }
  },
);

router.post(
  "/restaurants/:restaurantId/time-clock/export/pdf",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const from = isValidDateKey(req.body?.from)
        ? String(req.body.from)
        : null;
      const to = isValidDateKey(req.body?.to) ? String(req.body.to) : null;

      if (!from || !to || from > to) {
        return res.status(400).json({
          message: "Les dates de debut et de fin sont invalides.",
        });
      }

      const accessContext = await getAccessContext(req, restaurantId);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      if (!accessContext.isManager && !accessContext.canExportHours) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const requestedEmployeeIds = Array.isArray(req.body?.employeeIds)
        ? req.body.employeeIds.map((value) => String(value))
        : [];
      const fallbackEmployeeIds = (
        accessContext.restaurant?.employees || []
      ).map((value) => String(value));
      const selectedEmployeeIds = resolveSelectedEmployeeIds(
        requestedEmployeeIds,
        fallbackEmployeeIds,
      );

      if (!selectedEmployeeIds.length) {
        return res.status(400).json({ message: "Aucun salarie selectionne." });
      }

      const exportData = await buildEmployeeExportReports({
        restaurantId,
        from,
        to,
        selectedEmployeeIds,
        openingHours: accessContext.restaurant?.opening_hours || [],
      });
      if (exportData.error) {
        return res
          .status(exportData.error.status)
          .json({ message: exportData.error.message });
      }

      const pdfBuffer = await buildTimeClockExportPdf({
        restaurantName: accessContext.restaurant?.name || "Restaurant",
        startDate: from,
        endDate: to,
        employees: exportData.reports.map((report) => ({
          employee: report.employee,
          range: report.range,
        })),
      });

      const safeRestaurantName = toFilenamePart(accessContext.restaurant?.name);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="heures-${safeRestaurantName}-${from}-au-${to}.pdf"`,
      );

      return res.send(pdfBuffer);
    } catch (error) {
      console.error("Error exporting time-clock pdf:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.post(
  "/restaurants/:restaurantId/time-clock/export/excel",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const from = isValidDateKey(req.body?.from)
        ? String(req.body.from)
        : null;
      const to = isValidDateKey(req.body?.to) ? String(req.body.to) : null;

      if (!from || !to || from > to) {
        return res.status(400).json({
          message: "Les dates de debut et de fin sont invalides.",
        });
      }

      const accessContext = await getAccessContext(req, restaurantId);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      if (!accessContext.isManager && !accessContext.canExportHours) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const requestedEmployeeIds = Array.isArray(req.body?.employeeIds)
        ? req.body.employeeIds.map((value) => String(value))
        : [];
      const fallbackEmployeeIds = (
        accessContext.restaurant?.employees || []
      ).map((value) => String(value));
      const selectedEmployeeIds = resolveSelectedEmployeeIds(
        requestedEmployeeIds,
        fallbackEmployeeIds,
      );

      if (!selectedEmployeeIds.length) {
        return res.status(400).json({ message: "Aucun salarie selectionne." });
      }

      const exportData = await buildEmployeeExportReports({
        restaurantId,
        from,
        to,
        selectedEmployeeIds,
        openingHours: accessContext.restaurant?.opening_hours || [],
      });
      if (exportData.error) {
        return res
          .status(exportData.error.status)
          .json({ message: exportData.error.message });
      }

      const workbookBuffer = buildWorkbookBuffer({
        restaurantName: accessContext.restaurant?.name || "Restaurant",
        startDate: from,
        endDate: to,
        reports: exportData.reports,
      });

      const safeRestaurantName = toFilenamePart(accessContext.restaurant?.name);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="heures-${safeRestaurantName}-${from}-au-${to}.xlsx"`,
      );

      return res.send(workbookBuffer);
    } catch (error) {
      console.error("Error exporting time-clock workbook:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router._timeClockSecurity = {
  getAccessContext,
  workforceAccountFilter,
};

installClockDeviceRoutes(router, {
  authenticateToken, requireClockManager, getAccessContext, workforceRoster, buildKioskStatesPayload,
});

module.exports = router;
