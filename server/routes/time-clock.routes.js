const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authentificate-token");

const EmployeeModel = require("../models/employee.model");
const RestaurantModel = require("../models/restaurant.model");
const TimeClockSessionModel = require("../models/time-clock-session.model");

const {
  ACTIONS,
  buildSummaryPayload,
  diffMinutes,
  getMonthRangeFromDateKey,
  isValidDateKey,
  normalizeSignaturePayload,
  syncSessionTotals,
  toDateKey,
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
    "owner_id employees",
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

    if (!currentEmployee || !employeeWorksInRestaurant(currentEmployee, restaurantId)) {
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

async function getSummaryPayload({ employee, restaurantId, anchorDateKey }) {
  const monthRange = getMonthRangeFromDateKey(anchorDateKey);

  const [monthSessions, recentSessions, activeSession] = await Promise.all([
    TimeClockSessionModel.find({
      restaurant: restaurantId,
      employee: employee._id,
      businessDate: {
        $gte: monthRange.startDate,
        $lte: monthRange.endDate,
      },
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
    activeSession.businessDate >= monthRange.startDate &&
    activeSession.businessDate <= monthRange.endDate &&
    !monthList.some(
      (session) => String(session._id) === String(activeSession._id),
    )
  ) {
    monthList.unshift(activeSession);
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

      const signature = normalizeSignaturePayload(req.body?.signature, new Date());
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
          : toDateKey(now);

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

        session.events.push(buildEvent({ action, now, signature, request: req }));
        session.lastActionAt = now;
        syncSessionTotals(session, now);
        await session.save();
      }

      const refreshedEmployee = await getTargetEmployee(employeeId, restaurantId);
      const summary = await getSummaryPayload({
        employee: refreshedEmployee,
        restaurantId,
        anchorDateKey: session.businessDate || toDateKey(now),
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
        : toDateKey(new Date());

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
        : toDateKey(new Date());

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

module.exports = router;
