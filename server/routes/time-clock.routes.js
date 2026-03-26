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

function buildEvent({ action, now, signature, request }) {
  return {
    type: action,
    at: now,
    actorRole: request.user?.role === "owner" ? "owner" : "employee",
    actorId: String(request.user?.id || ""),
    signature,
    source: getSourceFromRequest(request),
  };
}

async function getAccessContext(request, restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId).select(
    "name owner_id employees",
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

function toFilenamePart(value) {
  return String(value || "restaurant")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function validateManualSessionEdit(session, nextClockInAt, nextClockOutAt) {
  if (!nextClockInAt || !nextClockOutAt) {
    return "Les horaires d'entree et de sortie sont requis.";
  }

  if (nextClockOutAt <= nextClockInAt) {
    return "L'horaire de sortie doit etre apres l'horaire d'entree.";
  }

  for (const currentBreak of session?.breaks || []) {
    const breakStart = currentBreak?.startAt
      ? new Date(currentBreak.startAt)
      : null;
    const breakEnd = currentBreak?.endAt ? new Date(currentBreak.endAt) : null;

    if (breakStart && breakStart < nextClockInAt) {
      return "L'horaire d'entree ne peut pas etre place apres le debut d'une pause.";
    }

    if (breakStart && breakStart > nextClockOutAt) {
      return "L'horaire de sortie ne peut pas etre place avant une pause enregistree.";
    }

    if (breakEnd && breakEnd > nextClockOutAt) {
      return "L'horaire de sortie ne peut pas etre place avant la fin d'une pause enregistree.";
    }
  }

  return null;
}

function closeOpenBreaksForManualEdit(session, nextClockOutAt) {
  for (const currentBreak of session?.breaks || []) {
    if (!currentBreak?.startAt || currentBreak?.endAt) continue;

    const breakStart = new Date(currentBreak.startAt);
    if (Number.isNaN(breakStart.getTime()) || breakStart >= nextClockOutAt) {
      return "Impossible de fermer automatiquement une pause ouverte apres l'horaire de sortie.";
    }

    currentBreak.endAt = nextClockOutAt;
    currentBreak.durationMinutes = diffMinutes(
      currentBreak.startAt,
      nextClockOutAt,
    );
  }

  return null;
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

async function getSummaryPayload({ employee, restaurantId, anchorDateKey }) {
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
  });
}

router.post(
  "/restaurants/:restaurantId/time-clock/punch",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { employeeId, action, businessDate } = req.body || {};

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

      const signature = normalizeSignaturePayload(
        req.body?.signature,
        new Date(),
      );
      if (!signature.hasSignature) {
        return res.status(400).json({ message: "Signature is required" });
      }

      const now = new Date();
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
          events: [buildEvent({ action, now, signature, request: req })],
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
          buildEvent({ action, now, signature, request: req }),
        );
        session.lastActionAt = now;
        syncSessionTotals(session, now);
        await session.save();
      }

      const refreshedEmployee = await getTargetEmployee(
        employeeId,
        restaurantId,
      );
      const summary = await getSummaryPayload({
        employee: refreshedEmployee,
        restaurantId,
        anchorDateKey: session.businessDate || toLocalDateKey(now),
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
      const reason = String(req.body?.reason || "").trim();

      const validationError = validateManualSessionEdit(
        session,
        nextClockInAt,
        nextClockOutAt,
      );
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const closeBreakError = closeOpenBreaksForManualEdit(
        session,
        nextClockOutAt,
      );
      if (closeBreakError) {
        return res.status(400).json({ message: closeBreakError });
      }

      const previousClockInAt = session.clockInAt;
      const previousClockOutAt = session.clockOutAt;

      session.clockInAt = nextClockInAt;
      session.clockOutAt = nextClockOutAt;
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

      const fallbackEmployeeIds = (
        accessContext.restaurant?.employees || []
      ).map((value) => String(value));
      const selectedEmployeeIds = Array.from(
        new Set(
          requestedEmployeeIds.length
            ? requestedEmployeeIds
            : fallbackEmployeeIds,
        ),
      );

      if (!selectedEmployeeIds.length) {
        return res.status(400).json({ message: "Aucun salarie selectionne." });
      }

      const employees = await EmployeeModel.find({
        _id: { $in: selectedEmployeeIds },
        restaurants: restaurantId,
      }).lean();

      if (!employees.length) {
        return res.status(404).json({ message: "Employees not found" });
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

      const reports = orderedEmployees.map((employee) =>
        buildEmployeeRangeSummary({
          employee,
          restaurantId,
          startDate: from,
          endDate: to,
          sessions: sessionsByEmployeeId.get(String(employee._id)) || [],
        }),
      );

      const pdfBuffer = await buildTimeClockExportPdf({
        restaurantName: accessContext.restaurant?.name || "Restaurant",
        startDate: from,
        endDate: to,
        employees: reports,
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

module.exports = router;
