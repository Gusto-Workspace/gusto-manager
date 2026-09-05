const clientsPerRestaurant = new Map();
const authenticateToken = require("../middleware/authentificate-token");
const EmployeeModel = require("../models/employee.model");
const RestaurantModel = require("../models/restaurant.model");
const { isAccountSessionValid } = require("./account-session.service");

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
  for (const res of set) {
    try {
      res.write(line);
    } catch (_error) {
      // Ignore broken SSE connections; cleanup happens on close events.
    }
  }
}

async function canAccessRestaurantEvents(user, restaurantId) {
  if (user?.role === "owner") {
    return Boolean(
      await RestaurantModel.exists({ _id: restaurantId, owner_id: user.id }),
    );
  }

  if (user?.role === "employee") {
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
    } catch {
      return res.status(500).json({ message: "Server error" });
    }

    // headers SSE
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
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
  _isEventSessionAuthorized: isEventSessionAuthorized,
};
