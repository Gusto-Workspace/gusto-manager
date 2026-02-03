const clientsPerRestaurant = new Map();

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
    } catch {}
  }
}

/**
 * Monte la route SSE (même headers / keep-alive / CORS que ton code actuel).
 * @param {import('express').Application|import('express').Router} appOrRouter
 * @param {{ path?: string, allowOrigin?: string, heartbeatMs?: number }} opts
 */

function mountSseRoute(appOrRouter, opts = {}) {
  const {
    path = "/api/events/:restaurantId",
    allowOrigin = "http://localhost:8002",
    heartbeatMs = 25000,
  } = opts;

  appOrRouter.get(path, (req, res) => {
    const { restaurantId } = req.params;

    // headers SSE
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": allowOrigin,
    });
    res.flushHeaders?.();

    // ping pour garder la connexion vivante
    const keepAlive = setInterval(() => {
      try {
        res.write(":\n\n");
      } catch {}
    }, heartbeatMs);

    addClient(restaurantId, res);

    req.on("close", () => {
      clearInterval(keepAlive);
      removeClient(restaurantId, res);
      try {
        res.end();
      } catch {}
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
};
