const {
  isPerfDiagnosticsEnabled,
  perfLog,
} = require("./perf-diagnostics.service");

const clientsPerRestaurant = new Map();
const SSE_SUMMARY_WINDOW_MS = 60_000;

let sseWindow = createSseWindow();

function createSseWindow() {
  return {
    opens: 0,
    closes: 0,
    broadcasts: 0,
    broadcastRecipients: 0,
    backpressureEvents: 0,
    heartbeatWrites: 0,
    writeErrors: 0,
    maxWritableLengthBytes: 0,
  };
}

function observeWrite(res, accepted) {
  if (!isPerfDiagnosticsEnabled()) return;
  if (accepted === false) sseWindow.backpressureEvents += 1;
  const writableLength = Number(res?.writableLength || 0);
  if (Number.isFinite(writableLength)) {
    sseWindow.maxWritableLengthBytes = Math.max(
      sseWindow.maxWritableLengthBytes,
      writableLength,
    );
  }
}

function getActiveConnectionCount() {
  let activeConnections = 0;
  for (const clients of clientsPerRestaurant.values()) {
    activeConnections += clients.size;
  }
  return activeConnections;
}

function flushSseSummary() {
  if (!isPerfDiagnosticsEnabled()) return;

  const completedWindow = sseWindow;
  sseWindow = createSseWindow();
  const topRestaurants = Array.from(clientsPerRestaurant.entries())
    .map(([restaurantId, clients]) => ({
      restaurantId,
      activeConnections: clients.size,
    }))
    .sort((a, b) => b.activeConnections - a.activeConnections)
    .slice(0, 10);

  perfLog("SSE", {
    event: "summary",
    windowMs: SSE_SUMMARY_WINDOW_MS,
    activeConnections: getActiveConnectionCount(),
    restaurantsWithConnections: clientsPerRestaurant.size,
    opensLast60s: completedWindow.opens,
    closesLast60s: completedWindow.closes,
    broadcastsLast60s: completedWindow.broadcasts,
    averageRecipientsPerBroadcast:
      completedWindow.broadcasts > 0
        ? Math.round(
            (completedWindow.broadcastRecipients / completedWindow.broadcasts) *
              100,
          ) / 100
        : 0,
    backpressureEventsLast60s: completedWindow.backpressureEvents,
    heartbeatWritesLast60s: completedWindow.heartbeatWrites,
    writeErrorsLast60s: completedWindow.writeErrors,
    maxWritableLengthBytes: completedWindow.maxWritableLengthBytes,
    topRestaurants,
  });
}

if (isPerfDiagnosticsEnabled()) {
  const sseSummaryInterval = setInterval(
    flushSseSummary,
    SSE_SUMMARY_WINDOW_MS,
  );
  sseSummaryInterval.unref?.();
}

function addClient(restaurantId, res) {
  const key = String(restaurantId);
  if (!clientsPerRestaurant.has(key)) clientsPerRestaurant.set(key, new Set());
  const clients = clientsPerRestaurant.get(key);
  const wasAlreadyRegistered = clients.has(res);
  clients.add(res);
  if (isPerfDiagnosticsEnabled() && !wasAlreadyRegistered) {
    sseWindow.opens += 1;
  }
}

function removeClient(restaurantId, res) {
  const key = String(restaurantId);
  const set = clientsPerRestaurant.get(key);
  if (!set) return;
  const removed = set.delete(res);
  if (isPerfDiagnosticsEnabled() && removed) sseWindow.closes += 1;
  if (set.size === 0) clientsPerRestaurant.delete(key);
}

function broadcastToRestaurant(restaurantId, payload) {
  const key = String(restaurantId);
  const set = clientsPerRestaurant.get(key);
  if (isPerfDiagnosticsEnabled()) {
    sseWindow.broadcasts += 1;
    sseWindow.broadcastRecipients += set?.size || 0;
  }
  if (!set || set.size === 0) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      const accepted = res.write(line);
      if (isPerfDiagnosticsEnabled()) observeWrite(res, accepted);
    } catch (_error) {
      if (isPerfDiagnosticsEnabled()) sseWindow.writeErrors += 1;
      // Ignore broken SSE connections; cleanup happens on close events.
    }
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
        const accepted = res.write(":\n\n");
        if (isPerfDiagnosticsEnabled()) {
          sseWindow.heartbeatWrites += 1;
          observeWrite(res, accepted);
        }
      } catch (_error) {
        if (isPerfDiagnosticsEnabled()) sseWindow.writeErrors += 1;
        // Ignore keep-alive write failures for clients that are disconnecting.
      }
    }, heartbeatMs);

    addClient(restaurantId, res);

    req.on("close", () => {
      clearInterval(keepAlive);
      removeClient(restaurantId, res);
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
  _flushSseSummary: flushSseSummary,
};
