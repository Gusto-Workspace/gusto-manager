const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authentificate-token");

const EmployeeModel = require("../models/employee.model");
const RestaurantModel = require("../models/restaurant.model");
const TimeClockSessionModel = require("../models/time-clock-session.model");
const {
  buildTimeClockExportPdf,
} = require("../services/pdf/render-time-clock-export.service");
const {
  buildWorkbookBuffer,
} = require("../services/excel/render-time-clock-export-workbook.service");

const {
  ACTIONS,
  buildEmployeeRangeSummary,
  buildOverlapQuery,
  buildSummaryPayload,
  diffMinutes,
  getMonthRangeFromDateKey,
  isValidDateKey,
  normalizeSignaturePayload,
  syncSessionTotals,
  toLocalDateKey,
} = require("../services/time-clock.service");

function employeeWorksInRestaurant(employee, restaurantId) {
  const target = String(restaurantId);

  return Array.isArray(employee?.restaurants)
    ? employee.restaurants.some((id) => String(id) === target)
    : false;
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

function buildEvent({ action, now, signature, request, clientMutationId = "" }) {
  return {
    type: action,
    at: now,
    actorRole: request.user?.role === "owner" ? "owner" : "employee",
    actorId: String(request.user?.id || ""),
    clientMutationId: normalizeClientMutationId(clientMutationId),
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
    "name owner_id employees opening_hours",
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
      !employeeWorksInRestaurant(currentEmployee, restaurantId)
    ) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    const currentProfile = findRestaurantProfile(currentEmployee, restaurantId);
    const isManager = currentProfile?.options?.employees === true;

    return { restaurant, isManager, currentEmployee };
  }

  return { error: { status: 403, message: "Forbidden" } };
}

function canAccessTargetEmployee(accessContext, employeeId) {
  if (!accessContext?.currentEmployee) return true;
  if (accessContext?.isManager) return true;

  return String(accessContext.currentEmployee._id) === String(employeeId);
}

async function getTargetEmployee(employeeId, restaurantId) {
  const employee = await EmployeeModel.findById(employeeId).lean();

  if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
    return null;
  }

  return employee;
}

function parseDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseManualBreaks(value) {
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
      startAt: parseDateTime(item?.startAt),
      endAt: parseDateTime(item?.endAt),
      index,
    }))
    .sort((left, right) => {
      const leftValue = left.startAt ? left.startAt.getTime() : Number.MAX_SAFE_INTEGER;
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

function resolveSelectedEmployeeIds(requestedEmployeeIds = [], fallbackEmployeeIds = []) {
  return Array.from(
    new Set(
      (requestedEmployeeIds.length ? requestedEmployeeIds : fallbackEmployeeIds).map(
        (value) => String(value),
      ),
    ),
  );
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
  }).lean();

  if (!employees.length) {
    return { error: { status: 404, message: "Employees not found" } };
  }

  const overlapQuery = buildOverlapQuery(from, to);
  const sessions = await TimeClockSessionModel.find({
    restaurant: restaurantId,
    employee: { $in: employees.map((employee) => employee._id) },
    ...(overlapQuery || {}),
  })
    .sort({ employee: 1, clockInAt: 1 })
    .lean();

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
      const summary = buildEmployeeRangeSummary({
        employee,
        restaurantId,
        startDate: from,
        endDate: to,
        sessions: sessionsByEmployeeId.get(String(employee._id)) || [],
        openingHours,
      });

      return {
        ...summary,
        rawEmployee: employee,
        profile: findRestaurantProfile(employee, restaurantId) || {},
      };
    }),
  };
}

function validateManualSessionEdit(
  session,
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
    EmployeeModel.find({ _id: { $in: targetIds } }).lean(),
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
        .sort((left, right) => new Date(right.clockInAt) - new Date(left.clockInAt))[0] ||
      null;

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
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { employeeId, action, businessDate } = req.body || {};
      const clientMutationId = normalizeClientMutationId(
        req.body?.clientMutationId,
      );

      if (!employeeId) {
        return res.status(400).json({ message: "employeeId is required" });
      }

      if (!Object.values(ACTIONS).includes(action)) {
        return res.status(400).json({ message: "Invalid action" });
      }

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

      const now = getEffectiveActionTime(req);
      const signature = normalizeSignaturePayload(
        req.body?.signature,
        now,
      );
      if (!signature.hasSignature) {
        return res.status(400).json({ message: "Signature is required" });
      }

      if (clientMutationId) {
        const existingSession = await TimeClockSessionModel.findOne({
          restaurant: restaurantId,
          "events.clientMutationId": clientMutationId,
        });

        if (existingSession) {
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

        const sessionDate = isValidDateKey(businessDate)
          ? businessDate
          : toLocalDateKey(now);

        session = new TimeClockSessionModel({
          restaurant: restaurantId,
          employee: employeeId,
          employeeSnapshot: getEmployeeSnapshot(employee, restaurantId),
          businessDate: sessionDate,
          status: "open",
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
        session.lastActionAt = now;
        syncSessionTotals(session, now);
        await session.save();
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
      console.error("Error creating time-clock punch:", error);
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

      const employeeIds = accessContext.currentEmployee && !accessContext.isManager
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

router.patch(
  "/restaurants/:restaurantId/time-clock/sessions/:sessionId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, sessionId } = req.params;

      const accessContext = await getAccessContext(req, restaurantId);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      if (!accessContext.isManager) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const session = await TimeClockSessionModel.findOne({
        _id: sessionId,
        restaurant: restaurantId,
      });

      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const employee = await getTargetEmployee(session.employee, restaurantId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const nextClockInAt = parseDateTime(req.body?.clockInAt);
      const nextClockOutAt = parseDateTime(req.body?.clockOutAt);
      const nextBreaksInput =
        req.body?.breaks === undefined
          ? parseManualBreaks(
              (session.breaks || []).map((currentBreak) => ({
                id: currentBreak?._id ? String(currentBreak._id) : "",
                startAt: currentBreak?.startAt,
                endAt: currentBreak?.endAt,
              })),
            )
          : parseManualBreaks(req.body?.breaks);
      const reason = String(req.body?.reason || "").trim();

      const validationError = validateManualSessionEdit(
        session,
        nextClockInAt,
        nextClockOutAt,
        nextBreaksInput,
      );
      if (validationError) {
        return res.status(400).json({ message: validationError });
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
      session.employeeSnapshot = getEmployeeSnapshot(employee, restaurantId);
      session.lastActionAt = new Date();
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
        employee,
        restaurantId,
        anchorDateKey,
        openingHours: accessContext.restaurant?.opening_hours || [],
      });

      return res.json({
        sessionId: String(session._id),
        summary,
      });
    } catch (error) {
      console.error("Error updating time-clock session:", error);
      return res.status(500).json({ message: "Internal server error" });
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

      if (!accessContext.isManager) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const requestedEmployeeIds = Array.isArray(req.body?.employeeIds)
        ? req.body.employeeIds.map((value) => String(value))
        : [];
      const fallbackEmployeeIds = (accessContext.restaurant?.employees || []).map(
        (value) => String(value),
      );
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

      if (!accessContext.isManager) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const requestedEmployeeIds = Array.isArray(req.body?.employeeIds)
        ? req.body.employeeIds.map((value) => String(value))
        : [];
      const fallbackEmployeeIds = (accessContext.restaurant?.employees || []).map(
        (value) => String(value),
      );
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

module.exports = router;
