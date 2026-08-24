const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const { monitorEventLoopDelay, performance } = require("perf_hooks");

const PERF_DIAGNOSTICS_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.PERF_DIAGNOSTICS || "")
    .trim()
    .toLowerCase(),
);
const DEFAULT_WINDOW_MS = 60_000;
const MAX_DURATION_SAMPLES_PER_ROUTE = 500;
const MAX_RESTAURANTS_PER_WINDOW = 200;
const NS_PER_MS = 1e6;
const BYTES_PER_MB = 1024 * 1024;

const requestStorage = new AsyncLocalStorage();
const activeRunsByJob = new Map();

let httpWindow = createHttpWindow();
let publicWindow = createPublicWindow();
let detailLogWindow = new Map();
let serverProbe = null;

function isPerfDiagnosticsEnabled() {
  return PERF_DIAGNOSTICS_ENABLED;
}

function perfNowMs() {
  return performance.now();
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function bytesToMb(value) {
  return round(Number(value || 0) / BYTES_PER_MB);
}

function getPerfMemorySnapshot() {
  const memory = process.memoryUsage();
  return {
    rssMb: bytesToMb(memory.rss),
    heapUsedMb: bytesToMb(memory.heapUsed),
    heapTotalMb: bytesToMb(memory.heapTotal),
    externalMb: bytesToMb(memory.external),
    arrayBuffersMb: bytesToMb(memory.arrayBuffers),
  };
}

function perfLog(category, payload = {}) {
  if (!PERF_DIAGNOSTICS_ENABLED) return;

  const normalizedCategory = String(category || "SERVER")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-");

  try {
    console.log(
      `[PERF][${normalizedCategory}] ${JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
      })}`,
    );
  } catch (error) {
    console.log(
      `[PERF][${normalizedCategory}] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        diagnosticsLogError: error?.name || "Error",
      })}`,
    );
  }
}

function createPerfRun(job, category = "CRON") {
  if (!PERF_DIAGNOSTICS_ENABLED) {
    return {
      enabled: false,
      job,
      category,
    };
  }

  const activeRunsBeforeStart = activeRunsByJob.get(job) || 0;
  const handle = {
    enabled: true,
    job,
    category,
    runId: crypto.randomUUID(),
    activeRunsBeforeStart,
    overlap: activeRunsBeforeStart > 0,
    startedAtMs: perfNowMs(),
    startedAt: new Date().toISOString(),
    finished: false,
  };

  activeRunsByJob.set(job, activeRunsBeforeStart + 1);
  perfLog(category, {
    event: "start",
    job,
    runId: handle.runId,
    startedAt: handle.startedAt,
    activeRunsBeforeStart,
    overlap: handle.overlap,
    memory: getPerfMemorySnapshot(),
  });

  return handle;
}

function finishPerfRun(handle, payload = {}) {
  if (!handle?.enabled || handle.finished) return;

  handle.finished = true;
  const activeRuns = Math.max(0, (activeRunsByJob.get(handle.job) || 1) - 1);
  if (activeRuns === 0) {
    activeRunsByJob.delete(handle.job);
  } else {
    activeRunsByJob.set(handle.job, activeRuns);
  }

  perfLog(handle.category, {
    event: "end",
    job: handle.job,
    runId: handle.runId,
    startedAt: handle.startedAt,
    activeRunsBeforeStart: handle.activeRunsBeforeStart,
    overlap: handle.overlap,
    durationMs: round(perfNowMs() - handle.startedAtMs),
    ...payload,
    memory: payload.memory || getPerfMemorySnapshot(),
  });
}

function getPerfRequestContext() {
  return PERF_DIAGNOSTICS_ENABLED ? requestStorage.getStore() || null : null;
}

function getPerfRequestId() {
  return getPerfRequestContext()?.requestId || null;
}

function setPerfRequestMetrics(metrics = {}) {
  const context = getPerfRequestContext();
  if (!context) return;
  Object.assign(context.metrics, metrics);
}

function addPerfRequestMetric(name, value) {
  const context = getPerfRequestContext();
  if (!context || !Number.isFinite(value)) return;
  context.metrics[name] = round((context.metrics[name] || 0) + value);
}

async function measurePerfPhase(name, operation, target = null) {
  if (!PERF_DIAGNOSTICS_ENABLED) return operation();

  const startedAtMs = perfNowMs();
  try {
    return await operation();
  } finally {
    const durationMs = round(perfNowMs() - startedAtMs);
    if (target && typeof target === "object") {
      target[name] = durationMs;
    } else {
      setPerfRequestMetrics({ [name]: durationMs });
    }
  }
}

function sanitizeRequestId(candidate) {
  const value = String(candidate || "").trim();
  if (/^[A-Za-z0-9._:-]{1,128}$/.test(value)) return value;
  return crypto.randomUUID();
}

function getRequestPath(req) {
  return String(req.originalUrl || req.url || "").split("?")[0];
}

function classifyHttpRoute(req) {
  const method = String(req.method || "GET").toUpperCase();
  const path = getRequestPath(req);

  if (method === "GET" && /^\/api\/events\/[^/]+$/.test(path)) {
    return "sse";
  }
  if (method === "GET" && path === "/api/owner/restaurants") {
    return "ownerRestaurantsList";
  }
  if (method === "GET" && /^\/api\/owner\/restaurants\/[^/]+$/.test(path)) {
    return "ownerRestaurant";
  }
  if (
    method === "GET" &&
    /^\/api\/public\/restaurants\/[^/]+\/reservations$/.test(path)
  ) {
    return "publicReservations";
  }
  if (
    method === "GET" &&
    /^\/api\/restaurants\/[^/]+\/reservations$/.test(path)
  ) {
    return "managerReservations";
  }
  if (
    method === "GET" &&
    /^\/api\/restaurants\/[^/]+\/notifications\/unread-counts$/.test(path)
  ) {
    return "unreadCounts";
  }
  if (method === "GET" && /^\/api\/restaurants\/[^/]+$/.test(path)) {
    return "publicRestaurant";
  }
  if (method !== "GET" && path.includes("/reservations")) {
    if (/\/waitlist(?:\/|$)|\/waitlist-offers\//.test(path)) {
      return "reservationMutationWaitlist";
    }
    if (/\/bank-hold\/(capture|release|cancel|authorize)/.test(path)) {
      return "reservationMutationBankHold";
    }
    if (method === "DELETE") return "reservationMutationDelete";
    if (
      method === "POST" &&
      /^\/api\/(?:dashboard\/)?restaurants\/[^/]+\/reservations$/.test(path)
    ) {
      return "reservationMutationCreate";
    }
    if (/\/status(?:\/|$)/.test(path)) return "reservationMutationStatus";
    return "reservationMutationOther";
  }

  return "other";
}

function getRequestRestaurantId(req) {
  const path = getRequestPath(req);
  const match = path.match(
    /^\/api\/(?:public\/)?(?:owner\/|dashboard\/)?restaurants\/([0-9a-fA-F]{24})(?:\/|$)/,
  );
  if (match) return match[1];

  const paramId = String(req.params?.restaurantId || req.params?.id || "");
  return /^[0-9a-fA-F]{24}$/.test(paramId) ? paramId : null;
}

function categorizeUserAgent(userAgent) {
  const value = String(userAgent || "").toLowerCase();
  if (!value) return "unknown";
  if (/(bot|crawler|spider|slurp|headless|lighthouse)/.test(value))
    return "bot";
  if (/(mobile|iphone|ipod|android|ipad|tablet)/.test(value)) return "mobile";
  if (/(mozilla|chrome|safari|firefox|edge|opera)/.test(value))
    return "desktop";
  return "unknown";
}

function createHttpWindow() {
  return {
    startedAtMs: Date.now(),
    totalRequests: 0,
    routes: new Map(),
  };
}

function createPublicWindow() {
  return {
    startedAtMs: Date.now(),
    requests: 0,
    restaurantRequests: 0,
    reservationListRequests: 0,
    byRestaurant: new Map(),
  };
}

function addDurationSample(routeStats, durationMs) {
  routeStats.seen += 1;
  if (routeStats.samples.length < MAX_DURATION_SAMPLES_PER_ROUTE) {
    routeStats.samples.push(durationMs);
    return;
  }

  routeStats.samples[(routeStats.seen - 1) % MAX_DURATION_SAMPLES_PER_ROUTE] =
    durationMs;
}

function recordHttpRequest({ route, durationMs, statusCode }) {
  if (!PERF_DIAGNOSTICS_ENABLED) return;

  httpWindow.totalRequests += 1;
  const routeStats = httpWindow.routes.get(route) || {
    count: 0,
    errors: 0,
    seen: 0,
    maxMs: 0,
    samples: [],
  };
  routeStats.count += 1;
  if (statusCode >= 500) routeStats.errors += 1;
  routeStats.maxMs = Math.max(routeStats.maxMs, durationMs);
  addDurationSample(routeStats, durationMs);
  httpWindow.routes.set(route, routeStats);
}

function recordPublicRequest(route, restaurantId) {
  if (!PERF_DIAGNOSTICS_ENABLED) return;
  if (route !== "publicRestaurant" && route !== "publicReservations") return;

  publicWindow.requests += 1;
  if (route === "publicRestaurant") publicWindow.restaurantRequests += 1;
  if (route === "publicReservations") publicWindow.reservationListRequests += 1;

  const key = restaurantId || "unknown";
  const trackedKey =
    publicWindow.byRestaurant.has(key) ||
    publicWindow.byRestaurant.size < MAX_RESTAURANTS_PER_WINDOW
      ? key
      : "other";
  const restaurantStats = publicWindow.byRestaurant.get(trackedKey) || {
    restaurantRequests: 0,
    reservationListRequests: 0,
  };
  if (route === "publicRestaurant") restaurantStats.restaurantRequests += 1;
  if (route === "publicReservations") {
    restaurantStats.reservationListRequests += 1;
  }
  publicWindow.byRestaurant.set(trackedKey, restaurantStats);
}

function shouldLogPerfDetail(
  key,
  {
    durationMs = 0,
    statusCode = 200,
    normalLimit = 20,
    slowLimit = 60,
    slowThresholdMs = 1000,
  } = {},
) {
  if (!PERF_DIAGNOSTICS_ENABLED) return false;

  const normalizedKey = String(key || "other");
  const isSlowOrError =
    Number(statusCode) >= 500 || Number(durationMs) >= slowThresholdMs;
  const decisionType = isSlowOrError ? "slow" : "normal";
  const context = getPerfRequestContext();
  if (context && !context.detailLogDecisions) {
    context.detailLogDecisions = new Map();
  }
  const cachedDecision = context?.detailLogDecisions?.get(
    `${normalizedKey}:${decisionType}`,
  );
  if (cachedDecision !== undefined) return cachedDecision;

  const counters = detailLogWindow.get(normalizedKey) || {
    normal: 0,
    slow: 0,
  };
  const limit = isSlowOrError ? slowLimit : normalLimit;
  const shouldLog = counters[decisionType] < limit;
  if (shouldLog) counters[decisionType] += 1;
  detailLogWindow.set(normalizedKey, counters);
  context?.detailLogDecisions?.set(
    `${normalizedKey}:${decisionType}`,
    shouldLog,
  );

  return shouldLog;
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return null;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * ratio) - 1),
  );
  return round(sortedValues[index]);
}

function flushHttpSummaries() {
  if (!PERF_DIAGNOSTICS_ENABLED) return;

  const completedHttpWindow = httpWindow;
  const completedPublicWindow = publicWindow;
  httpWindow = createHttpWindow();
  publicWindow = createPublicWindow();
  detailLogWindow = new Map();

  const routes = {};
  for (const [route, stats] of completedHttpWindow.routes.entries()) {
    const samples = stats.samples.slice().sort((a, b) => a - b);
    routes[route] = {
      count: stats.count,
      errors: stats.errors,
      sampleSize: samples.length,
      p50Ms: percentile(samples, 0.5),
      p95Ms: percentile(samples, 0.95),
      p99Ms: percentile(samples, 0.99),
      maxMs: round(stats.maxMs),
    };
  }

  const routeCount = (route) =>
    completedHttpWindow.routes.get(route)?.count || 0;
  const reservationMutations = Array.from(
    completedHttpWindow.routes.entries(),
  ).reduce(
    (count, [route, stats]) =>
      count + (route.startsWith("reservationMutation") ? stats.count : 0),
    0,
  );

  perfLog("HTTP-SUMMARY", {
    windowMs: Date.now() - completedHttpWindow.startedAtMs,
    totalRequests: completedHttpWindow.totalRequests,
    ownerRestaurant: routeCount("ownerRestaurant"),
    managerReservations: routeCount("managerReservations"),
    unreadCounts: routeCount("unreadCounts"),
    publicRestaurant: routeCount("publicRestaurant"),
    publicReservations: routeCount("publicReservations"),
    reservationMutations,
    routes,
  });

  const topRestaurants = Array.from(
    completedPublicWindow.byRestaurant.entries(),
  )
    .map(([restaurantId, stats]) => ({
      restaurantId,
      ...stats,
      requests: stats.restaurantRequests + stats.reservationListRequests,
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 10);

  perfLog("PUBLIC", {
    event: "traffic-summary",
    windowMs: Date.now() - completedPublicWindow.startedAtMs,
    requests: completedPublicWindow.requests,
    restaurantRequests: completedPublicWindow.restaurantRequests,
    reservationListRequests: completedPublicWindow.reservationListRequests,
    topRestaurants,
  });
}

function getResponseBytes(res) {
  const value = Number(res.getHeader("Content-Length"));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function perfHttpMiddleware(req, res, next) {
  if (!PERF_DIAGNOSTICS_ENABLED) return next();

  const requestId = sanitizeRequestId(
    req.get("x-request-id") ||
      req.get("x-correlation-id") ||
      req.get("rndr-id"),
  );
  const startedAtMs = perfNowMs();
  const startedAt = new Date().toISOString();
  const route = classifyHttpRoute(req);
  const restaurantId = getRequestRestaurantId(req);
  const context = {
    requestId,
    startedAtMs,
    startedAt,
    route,
    restaurantId,
    metrics: {},
  };

  req.perfRequestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const originalJson = res.json;
  res.json = function instrumentedJson(body) {
    const serializationStartedAtMs = perfNowMs();
    try {
      return originalJson.call(this, body);
    } finally {
      addPerfRequestMetric(
        "resJsonSyncMs",
        perfNowMs() - serializationStartedAtMs,
      );
    }
  };

  let finalized = false;
  const finalize = (event) => {
    if (finalized) return;
    finalized = true;

    const durationMs = round(perfNowMs() - startedAtMs);
    const currentRoute = classifyHttpRoute(req);
    const currentRestaurantId = getRequestRestaurantId(req) || restaurantId;
    const responseBytes = getResponseBytes(res);

    recordHttpRequest({
      route: currentRoute,
      durationMs,
      statusCode: res.statusCode,
    });
    recordPublicRequest(currentRoute, currentRestaurantId);

    const isReservationMutation = currentRoute.startsWith(
      "reservationMutation",
    );
    const normalLimit =
      currentRoute === "publicReservations" ||
      currentRoute === "publicRestaurant"
        ? 10
        : isReservationMutation
          ? 100
          : 30;
    const shouldLogDetail =
      currentRoute !== "sse" &&
      shouldLogPerfDetail(currentRoute, {
        durationMs,
        statusCode: res.statusCode,
        normalLimit,
        slowLimit: isReservationMutation ? 100 : 60,
      });
    if (shouldLogDetail) {
      perfLog("HTTP", {
        event,
        requestId,
        startedAt,
        method: req.method,
        route: currentRoute,
        restaurantId: currentRestaurantId,
        status: res.statusCode,
        totalMs: durationMs,
        responseBytes,
        ...context.metrics,
      });
    }
  };

  res.once("finish", () => finalize("finish"));
  res.once("close", () => finalize("close"));

  return requestStorage.run(context, next);
}

function createPerfEventLoopRunProbe({ resolution = 20 } = {}) {
  if (!PERF_DIAGNOSTICS_ENABLED) {
    return {
      enabled: false,
      finish: () => ({}),
    };
  }

  const histogram = monitorEventLoopDelay({ resolution });
  let completedSnapshot = null;
  histogram.enable();

  return {
    enabled: true,
    finish() {
      if (completedSnapshot) return completedSnapshot;
      histogram.disable();
      completedSnapshot = {
        eventLoopMeanMs: round(histogram.mean / NS_PER_MS),
        eventLoopP50Ms: round(histogram.percentile(50) / NS_PER_MS),
        eventLoopP95Ms: round(histogram.percentile(95) / NS_PER_MS),
        eventLoopP99Ms: round(histogram.percentile(99) / NS_PER_MS),
        eventLoopMaxMs: round(histogram.max / NS_PER_MS),
      };
      return completedSnapshot;
    },
  };
}

function startPerfEventLoopProbe({ intervalMs = DEFAULT_WINDOW_MS } = {}) {
  if (!PERF_DIAGNOSTICS_ENABLED || serverProbe) return serverProbe;

  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let previousCpuUsage = process.cpuUsage();
  let previousSnapshotAtMs = perfNowMs();

  const interval = setInterval(() => {
    const snapshotAtMs = perfNowMs();
    const elapsedMs = snapshotAtMs - previousSnapshotAtMs;
    const cpuUsage = process.cpuUsage(previousCpuUsage);
    const cpuTotalMicros = cpuUsage.user + cpuUsage.system;

    perfLog("SERVER", {
      windowMs: round(elapsedMs),
      ...getPerfMemorySnapshot(),
      cpuUserMs: round(cpuUsage.user / 1000),
      cpuSystemMs: round(cpuUsage.system / 1000),
      cpuProcessPercentOfOneCoreApprox:
        elapsedMs > 0
          ? round((cpuTotalMicros / (elapsedMs * 1000)) * 100)
          : null,
      eventLoopMeanMs: round(histogram.mean / NS_PER_MS),
      eventLoopP50Ms: round(histogram.percentile(50) / NS_PER_MS),
      eventLoopP95Ms: round(histogram.percentile(95) / NS_PER_MS),
      eventLoopP99Ms: round(histogram.percentile(99) / NS_PER_MS),
      eventLoopMaxMs: round(histogram.max / NS_PER_MS),
    });

    flushHttpSummaries();
    histogram.reset();
    previousCpuUsage = process.cpuUsage();
    previousSnapshotAtMs = perfNowMs();
  }, intervalMs);
  interval.unref?.();

  serverProbe = {
    histogram,
    interval,
    stop() {
      clearInterval(interval);
      histogram.disable();
      serverProbe = null;
    },
  };

  perfLog("SERVER", {
    event: "diagnostics-enabled",
    intervalMs,
    cpuMetric:
      "process CPU time divided by wall time; approximately percent of one CPU core",
  });

  return serverProbe;
}

module.exports = {
  addPerfRequestMetric,
  categorizeUserAgent,
  createPerfEventLoopRunProbe,
  createPerfRun,
  finishPerfRun,
  flushHttpSummaries,
  getPerfMemorySnapshot,
  getPerfRequestContext,
  getPerfRequestId,
  isPerfDiagnosticsEnabled,
  measurePerfPhase,
  perfHttpMiddleware,
  perfLog,
  perfNowMs,
  setPerfRequestMetrics,
  shouldLogPerfDetail,
  startPerfEventLoopProbe,
};
