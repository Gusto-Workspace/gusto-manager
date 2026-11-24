const clientsPerRestaurant = new Map();
const authenticateToken = require("../../middleware/authentificate-token");
const EmployeeModel = require("../../models/employee.model");
const RestaurantModel = require("../../models/restaurant.model");
const {
  userCanAccessRestaurant,
} = require("../../middleware/authorize-restaurant-access");
const { isAccountSessionValid } = require("./account-session.service");
const {
  canAccessReservationArrivals,
  omitReservationArrival,
} = require("../reservations/reservation-arrival.service");

function addClient(restaurantId, res) {
  const key = String(restaurantId);
  if (!clientsPerRestaurant.has(key)) clientsPerRestaurant.set(key, new Set());
  clientsPerRestaurant.get(key).add(res);
}

function removeClient(restaurantId, res) {
  const key = String(restaurantId);
  const set = clientsPerRestaurant.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clientsPerRestaurant.delete(key);
}

function broadcastToRestaurant(restaurantId, payload) {
  const key = String(restaurantId);
  const set = clientsPerRestaurant.get(key);
  if (!set || set.size === 0) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  const hasArrivalFields =
    payload.reservation?.arrivalRevision !== undefined ||
    payload.reservation?.arrivedAt !== undefined;
  const lineWithoutArrival = hasArrivalFields
    ? `data: ${JSON.stringify({
        ...payload,
        reservation: omitReservationArrival(payload.reservation),
      })}\n\n`
    : line;
  const employeeId = payload.employee?._id || payload.employeeId;
  const hasPlanningShifts = payload.type === "employee_updated" ||
    ["leave_request_updated", "leave_request_deleted"].includes(payload.type);
  let lineWithoutPlanningShifts;
  for (const res of set) {
    const manager = res.locals?.gustoEventModules?.planning === true;
    const recipient = String(res.locals?.gustoEmployeeId || "");
    if (payload.recipientEmployeeId && recipient !== String(payload.recipientEmployeeId)) continue;
    if (String(payload.type).startsWith("leave_request_") && !manager && recipient !== String(employeeId)) continue;
    if (payload.notification?.type === "leave_request_created" && !manager) continue;
    if (payload.type === "planning_state_changed" && !manager) continue;
    if (payload.type === "planning_changed" && !manager && !payload.employeeIds?.includes(recipient)) continue;
    if (
      isTakeAwayPayload(payload) &&
      res.locals?.gustoEventModules?.take_away !== true
    ) {
      continue;
    }
    if (String(payload?.type || "").startsWith("callsense_") && res.locals?.gustoEventModules?.callsense !== true) continue;
    const canReadArrival = res.locals?.gustoEventModules?.reservations === true;
    if (payload.type === "reservation_arrival_updated" && !canReadArrival) continue;
    try {
      if (payload.type === "planning_changed" && !manager) {
        res.write('data: {"type":"planning_changed"}\n\n');
      } else if (hasPlanningShifts && !manager) {
        const ownsShift = employeeId && recipient === String(employeeId);
        const redacted = redactPlanningShifts(payload, ownsShift);
        if (ownsShift) res.write(`data: ${JSON.stringify(redacted)}\n\n`);
        else {
          lineWithoutPlanningShifts ??= `data: ${JSON.stringify(redacted)}\n\n`;
          res.write(lineWithoutPlanningShifts);
        }
      } else {
        res.write(canReadArrival ? line : lineWithoutArrival);
      }
    } catch (_error) {
      // Ignore broken SSE connections; cleanup happens on close events.
    }
  }
}

function redactPlanningShifts(payload, own) {
  const redact = (shifts) => shifts?.filter((shift) => own && !shift.requiresPlanningPublication).map((shift) => {
    const publicShift = shift.toObject ? shift.toObject() : { ...shift };
    return publicShift;
  });
  const employee = payload.employee && (own ? {
    ...payload.employee,
    shifts: redact(payload.employee.shifts),
    restaurantProfiles: payload.employee.restaurantProfiles?.map((profile) => ({
      ...profile,
      shifts: redact(profile.shifts),
    })),
  } : Object.fromEntries(["_id", "firstname", "lastname", "post", "profilePicture"].map((key) => [key, payload.employee[key]])));
  return { ...payload, employee, shifts: redact(payload.shifts) };
}

async function canManagePlanningEvents(user, restaurantId) {
  if (user.role === "owner") return true; // The connection already passed the restaurant ownership check.
  const restaurant = await RestaurantModel.findOne({ _id: restaurantId, employees: user.id, "options.employees": true }).select("_id").lean();
  return Boolean(restaurant && await EmployeeModel.exists({
    _id: user.id,
    restaurants: restaurantId,
    restaurantProfiles: { $elemMatch: { restaurant: restaurantId, "options.employees": true } },
  }));
}

function isTakeAwayPayload(payload) {
  return (
    String(payload?.type || "").startsWith("takeaway_") ||
    payload?.module === "take_away" ||
    payload?.notification?.module === "take_away"
  );
}

async function canAccessTakeAwayEvents(user, restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId)
    .select("_id owner_id employees options.take_away")
    .populate("employees", "restaurantProfiles");

  if (!restaurant || restaurant.options?.take_away !== true) return false;
  return userCanAccessRestaurant(user, restaurant, {
    requiredOption: "take_away",
  });
}

async function canAccessCallSenseEvents(user, restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId)
    .select("_id owner_id employees options.customers")
    .populate("employees", "restaurantProfiles");
  if (!restaurant) return false;
  if (user.role === "employee" && restaurant.options?.customers !== true) return false;
  return userCanAccessRestaurant(user, restaurant, { requiredOption: "customers" });
}

async function canAccessRestaurantEvents(user, restaurantId) {
  if (user?.role === "owner") {
    return Boolean(
      await RestaurantModel.exists({ _id: restaurantId, owner_id: user.id }),
    );
  }

  if (user?.role === "employee") {
    if (String(user.restaurantId || "") !== String(restaurantId)) return false;
    return Boolean(
      await EmployeeModel.exists({
        _id: user.id,
        restaurants: restaurantId,
      }),
    );
  }

  return false;
}

async function isEventSessionAuthorized(
  user,
  restaurantId,
  {
    validateSession = isAccountSessionValid,
    validateAccess = canAccessRestaurantEvents,
  } = {},
) {
  return (
    (await validateSession(user)) && (await validateAccess(user, restaurantId))
  );
}

/**
 * Monte la route SSE (même headers / keep-alive / CORS que ton code actuel).
 * @param {import('express').Application|import('express').Router} appOrRouter
 * @param {{ path?: string, allowOrigin?: string, heartbeatMs?: number }} opts
 */

function mountSseRoute(appOrRouter, opts = {}) {
  const {
    path = "/api/events/:restaurantId",
    allowOrigin = process.env.APP_URL?.replace(/\/+$/, ""),
    heartbeatMs = 25000,
  } = opts;

  appOrRouter.get(path, authenticateToken, async (req, res) => {
    const { restaurantId } = req.params;

    try {
      if (!(await canAccessRestaurantEvents(req.user, restaurantId))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.locals.gustoEventModules = {
        ...(res.locals.gustoEventModules || {}),
        take_away: await canAccessTakeAwayEvents(req.user, restaurantId),
        callsense: await canAccessCallSenseEvents(req.user, restaurantId),
        reservations: await canAccessReservationArrivals(req.user, restaurantId),
        planning: await canManagePlanningEvents(req.user, restaurantId),
      };
      res.locals.gustoEmployeeId = req.user.role === "employee" ? req.user.id : null;
    } catch {
      return res.status(500).json({ message: "Server error" });
    }

    // headers SSE
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": allowOrigin,
    });
    res.flushHeaders?.();

    // ping pour garder la connexion vivante
    let accessCheckInProgress = false;
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(keepAlive);
      removeClient(restaurantId, res);
    };

    const keepAlive = setInterval(async () => {
      if (accessCheckInProgress || closed) return;
      accessCheckInProgress = true;

      try {
        const stillHasAccess = await isEventSessionAuthorized(
          req.user,
          restaurantId,
        );

        if (!stillHasAccess) {
          res.write(
            `event: auth_error\ndata: ${JSON.stringify({ message: "Session revoked" })}\n\n`,
          );
          close();
          return res.end();
        }

        res.locals.gustoEventModules = {
          ...(res.locals.gustoEventModules || {}),
          take_away: await canAccessTakeAwayEvents(req.user, restaurantId),
          callsense: await canAccessCallSenseEvents(req.user, restaurantId),
          reservations: await canAccessReservationArrivals(req.user, restaurantId),
          planning: await canManagePlanningEvents(req.user, restaurantId),
        };

        res.write(":\n\n");
      } catch (_error) {
        close();
        try {
          res.end();
        } catch (_endError) {
          // Response already closed.
        }
      } finally {
        accessCheckInProgress = false;
      }
    }, heartbeatMs);

    addClient(restaurantId, res);

    req.on("close", () => {
      close();
      try {
        res.end();
      } catch (_error) {
        // Ignore end failures on already-closed responses.
      }
    });
  });
}

module.exports = {
  // public
  mountSseRoute,
  broadcastToRestaurant,

  // pour tests si besoin
  _addClient: addClient,
  _removeClient: removeClient,
  _clientsPerRestaurant: clientsPerRestaurant,
  _canAccessRestaurantEvents: canAccessRestaurantEvents,
  _canAccessTakeAwayEvents: canAccessTakeAwayEvents,
  _canAccessCallSenseEvents: canAccessCallSenseEvents,
  _isTakeAwayPayload: isTakeAwayPayload,
  _isEventSessionAuthorized: isEventSessionAuthorized,
};
