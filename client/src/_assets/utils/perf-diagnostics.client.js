const PERF_DIAGNOSTICS_ENABLED =
  process.env.NEXT_PUBLIC_PERF_DIAGNOSTICS === "true";

const SUMMARY_WINDOW_MS = 60 * 1000;
const TEN_SECOND_MIN_MS = 9500;
const TEN_SECOND_MAX_MS = 11500;

let currentLoad = null;
let diagnosticsCleanup = null;
let summaryStartedAt = Date.now();
let summary = createEmptySummary();

function createEmptySummary() {
  return {
    totalRequests: 0,
    restaurantFetches: 0,
    reservationsFetches: 0,
    unreadFetches: 0,
    notificationFetches: 0,
    failedRequests: 0,
    nearTenSecondRequests: 0,
    longTaskCount: 0,
    longTaskTotalMs: 0,
    longTaskMaxMs: 0,
  };
}

function nowMs() {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

function roundMs(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function logFrontend(category, payload) {
  if (!PERF_DIAGNOSTICS_ENABLED) return;

  console.info(`[PERF][${category}]`, {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

function safeWorkerPath(value) {
  if (!value || typeof window === "undefined") return null;

  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.pathname;
  } catch {
    return "unavailable";
  }
}

function getResourceTiming(requestUrl, startedAt) {
  if (
    typeof performance === "undefined" ||
    typeof performance.getEntriesByType !== "function"
  ) {
    return null;
  }

  const entries = performance.getEntriesByType("resource").filter((entry) => {
    const sameResource =
      entry.name === requestUrl || entry.name.startsWith(`${requestUrl}?`);
    return sameResource && entry.startTime >= startedAt - 5;
  });

  const entry = entries[entries.length - 1];
  if (!entry) return null;

  const requestStart = Number(entry.requestStart) || 0;
  const responseStart = Number(entry.responseStart) || 0;
  const responseEnd = Number(entry.responseEnd) || 0;
  const workerStart = Number(entry.workerStart) || 0;

  return {
    durationMs: roundMs(entry.duration),
    workerStartMs: roundMs(workerStart),
    requestStartMs: roundMs(requestStart),
    responseStartMs: roundMs(responseStart),
    responseEndMs: roundMs(responseEnd),
    ttfbMs:
      requestStart > 0 && responseStart >= requestStart
        ? roundMs(responseStart - requestStart)
        : null,
    downloadMs:
      responseStart > 0 && responseEnd >= responseStart
        ? roundMs(responseEnd - responseStart)
        : null,
    transferSize: Number(entry.transferSize) || 0,
    encodedBodySize: Number(entry.encodedBodySize) || 0,
    decodedBodySize: Number(entry.decodedBodySize) || 0,
    workerInvolved: workerStart > 0,
    timingRestricted: requestStart === 0 || responseStart === 0,
  };
}

function incrementRequestCounter(kind) {
  summary.totalRequests += 1;

  if (kind === "restaurant") summary.restaurantFetches += 1;
  if (kind === "reservations") summary.reservationsFetches += 1;
  if (kind === "unread") summary.unreadFetches += 1;
  if (kind === "notifications") summary.notificationFetches += 1;
}

function getServerRequestId(response) {
  const headers = response?.headers;
  if (!headers) return null;

  return headers["x-request-id"] || headers.get?.("x-request-id") || null;
}

function getClientOverheadMs(totalMs, resourceTiming) {
  if (!resourceTiming || !Number.isFinite(resourceTiming.durationMs)) {
    return null;
  }

  return roundMs(Math.max(0, totalMs - resourceTiming.durationMs));
}

function logServiceWorkerState(event) {
  if (!PERF_DIAGNOSTICS_ENABLED) return;

  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    logFrontend("FRONTEND", {
      event: "service_worker_state",
      trigger: event,
      supported: false,
    });
    return;
  }

  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      logFrontend("FRONTEND", {
        event: "service_worker_state",
        trigger: event,
        supported: true,
        controller: safeWorkerPath(
          navigator.serviceWorker.controller?.scriptURL,
        ),
        registrations: registrations.map((registration) => ({
          scope: safeWorkerPath(registration.scope),
          active: safeWorkerPath(registration.active?.scriptURL),
          waiting: safeWorkerPath(registration.waiting?.scriptURL),
          installing: safeWorkerPath(registration.installing?.scriptURL),
        })),
      });
    })
    .catch(() => {
      logFrontend("FRONTEND", {
        event: "service_worker_state",
        trigger: event,
        supported: true,
        registrationsAvailable: false,
      });
    });
}

function flushFrontendSummary() {
  const now = Date.now();

  logFrontend("FRONTEND-SUMMARY", {
    windowSeconds: roundMs((now - summaryStartedAt) / 1000),
    ...summary,
    longTaskTotalMs: roundMs(summary.longTaskTotalMs),
    longTaskMaxMs: roundMs(summary.longTaskMaxMs),
  });

  summary = createEmptySummary();
  summaryStartedAt = now;
}

export function isFrontendPerfDiagnosticsEnabled() {
  return PERF_DIAGNOSTICS_ENABLED;
}

export function startFrontendPerfDiagnostics() {
  if (!PERF_DIAGNOSTICS_ENABLED || typeof window === "undefined") {
    return () => {};
  }

  if (diagnosticsCleanup) return diagnosticsCleanup;

  summaryStartedAt = Date.now();
  const summaryInterval = window.setInterval(
    flushFrontendSummary,
    SUMMARY_WINDOW_MS,
  );

  let longTaskObserver = null;
  const supportsLongTasks =
    typeof PerformanceObserver !== "undefined" &&
    Array.isArray(PerformanceObserver.supportedEntryTypes) &&
    PerformanceObserver.supportedEntryTypes.includes("longtask");

  if (supportsLongTasks) {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const duration = Number(entry.duration) || 0;
          summary.longTaskCount += 1;
          summary.longTaskTotalMs += duration;
          summary.longTaskMaxMs = Math.max(summary.longTaskMaxMs, duration);
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: true });
    } catch {
      longTaskObserver = null;
    }
  }

  logFrontend("FRONTEND", {
    event: "diagnostics_started",
    summaryWindowSeconds: SUMMARY_WINDOW_MS / 1000,
    longTaskObserverSupported: Boolean(longTaskObserver),
  });
  logServiceWorkerState("diagnostics_start");

  const handleControllerChange = () => {
    logServiceWorkerState("controllerchange");
  };
  navigator.serviceWorker?.addEventListener(
    "controllerchange",
    handleControllerChange,
  );

  diagnosticsCleanup = () => {
    window.clearInterval(summaryInterval);
    longTaskObserver?.disconnect();
    navigator.serviceWorker?.removeEventListener(
      "controllerchange",
      handleControllerChange,
    );
    diagnosticsCleanup = null;
  };

  return diagnosticsCleanup;
}

export async function measureFrontendRequest({
  name,
  kind = "other",
  requestUrl,
  request,
  loadId = null,
  reason = "unknown",
  restaurantId = null,
}) {
  if (!PERF_DIAGNOSTICS_ENABLED) return request();

  const requestId = createId("frontend-request");
  const startedAt = nowMs();
  incrementRequestCounter(kind);

  logFrontend("FRONTEND", {
    event: "fetch_start",
    requestId,
    loadId,
    name,
    reason,
    restaurantId,
  });

  try {
    const response = await request();
    const totalMs = nowMs() - startedAt;
    const resourceTiming = getResourceTiming(requestUrl, startedAt);
    const nearTenSecondThreshold =
      totalMs >= TEN_SECOND_MIN_MS && totalMs <= TEN_SECOND_MAX_MS;

    if (nearTenSecondThreshold) summary.nearTenSecondRequests += 1;

    logFrontend("FRONTEND", {
      event: "fetch_end",
      requestId,
      loadId,
      name,
      reason,
      restaurantId,
      status: response?.status ?? null,
      serverRequestId: getServerRequestId(response),
      totalMs: roundMs(totalMs),
      clientOverheadMs: getClientOverheadMs(totalMs, resourceTiming),
      nearTenSecondThreshold,
      resourceTimingAvailable: Boolean(resourceTiming),
      resourceTiming,
    });

    return response;
  } catch (error) {
    const totalMs = nowMs() - startedAt;
    const resourceTiming = getResourceTiming(requestUrl, startedAt);
    const nearTenSecondThreshold =
      totalMs >= TEN_SECOND_MIN_MS && totalMs <= TEN_SECOND_MAX_MS;

    summary.failedRequests += 1;
    if (nearTenSecondThreshold) summary.nearTenSecondRequests += 1;

    logFrontend("FRONTEND", {
      event: "fetch_error",
      requestId,
      loadId,
      name,
      reason,
      restaurantId,
      status: error?.response?.status ?? null,
      serverRequestId: getServerRequestId(error?.response),
      totalMs: roundMs(totalMs),
      clientOverheadMs: getClientOverheadMs(totalMs, resourceTiming),
      nearTenSecondThreshold,
      resourceTimingAvailable: Boolean(resourceTiming),
      resourceTiming,
    });

    throw error;
  }
}

export function beginFrontendLoad(reason = "unknown", restaurantId = null) {
  if (!PERF_DIAGNOSTICS_ENABLED) return null;

  currentLoad = {
    loadId: createId("frontend-load"),
    reason,
    restaurantId,
    startedAt: nowMs(),
  };

  logFrontend("FRONTEND", {
    event: "load_start",
    loadId: currentLoad.loadId,
    reason,
    restaurantId,
  });

  return currentLoad.loadId;
}

export function markFrontendLoadPhase(
  loadId,
  phase,
  { reason = null, restaurantId = null, ...metrics } = {},
) {
  if (!PERF_DIAGNOSTICS_ENABLED) return;

  if (currentLoad?.loadId === loadId) {
    if (restaurantId) currentLoad.restaurantId = restaurantId;
    if (reason) currentLoad.reason = reason;
  }

  const load =
    currentLoad?.loadId === loadId
      ? currentLoad
      : { loadId, reason, restaurantId, startedAt: null };

  logFrontend("FRONTEND", {
    event: "load_phase",
    loadId: loadId || load?.loadId || null,
    reason: reason || load?.reason || "unknown",
    restaurantId: restaurantId || load?.restaurantId || null,
    phase,
    elapsedMs: load?.startedAt ? roundMs(nowMs() - load.startedAt) : null,
    ...metrics,
  });
}

export function markFrontendDataLoadingFalse(loadId, metrics = {}) {
  if (!PERF_DIAGNOSTICS_ENABLED) return;

  markFrontendLoadPhase(loadId, "data_loading_false", metrics);
  logServiceWorkerState("data_loading_false");
}

export function markFrontendSplashHidden() {
  if (!PERF_DIAGNOSTICS_ENABLED) return;

  logFrontend("FRONTEND", {
    event: "splash_hidden",
    loadId: currentLoad?.loadId || null,
    reason: currentLoad?.reason || "unknown",
    restaurantId: currentLoad?.restaurantId || null,
    elapsedMs: currentLoad?.startedAt
      ? roundMs(nowMs() - currentLoad.startedAt)
      : null,
  });
}

export function startFrontendAutomationRun({
  type,
  restaurantId = null,
  reservationListLength = 0,
}) {
  if (!PERF_DIAGNOSTICS_ENABLED) return null;

  return {
    runId: createId("frontend-automation"),
    type,
    restaurantId,
    reservationListLength,
    startedAt: nowMs(),
    scanDurationMs: null,
    candidateCount: 0,
    mutationCount: 0,
    refetchCount: 0,
    errorCount: 0,
    completedMutationCount: 0,
    scanFinished: false,
    logged: false,
  };
}

export function recordFrontendAutomationCandidate(run) {
  if (run) run.candidateCount += 1;
}

export function recordFrontendAutomationMutation(run) {
  if (run) run.mutationCount += 1;
}

export function recordFrontendAutomationRefetch(run) {
  if (run) run.refetchCount += 1;
}

export function recordFrontendAutomationError(run) {
  if (run) run.errorCount += 1;
}

function logAutomationRunIfComplete(run) {
  if (
    !run ||
    run.logged ||
    !run.scanFinished ||
    run.completedMutationCount < run.mutationCount
  ) {
    return;
  }

  run.logged = true;
  logFrontend("FRONTEND-AUTOMATION", {
    runId: run.runId,
    type: run.type,
    restaurantId: run.restaurantId,
    reservationListLength: run.reservationListLength,
    scanDurationMs: run.scanDurationMs,
    candidateCount: run.candidateCount,
    mutationCount: run.mutationCount,
    refetchCount: run.refetchCount,
    errorCount: run.errorCount,
    totalDurationMs: roundMs(nowMs() - run.startedAt),
  });
}

export function finishFrontendAutomationScan(run) {
  if (!run) return;

  run.scanDurationMs = roundMs(nowMs() - run.startedAt);
  run.scanFinished = true;
  logAutomationRunIfComplete(run);
}

export function completeFrontendAutomationMutation(run) {
  if (!run) return;

  run.completedMutationCount += 1;
  logAutomationRunIfComplete(run);
}
