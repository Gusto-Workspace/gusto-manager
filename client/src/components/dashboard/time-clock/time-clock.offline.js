import axios from "axios";

import { TIME_CLOCK_ACTIONS, cloneSignatureStrokes, toLocalDateKey } from "./time-clock.utils";

const STORAGE_KEY = "gm:timeClock:offline:v1";
const MAX_FAILED_PUNCHES = 20;

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cloneJson(value) {
  return safeParse(JSON.stringify(value), null);
}

function readStore() {
  if (typeof window === "undefined") {
    return { version: 1, restaurants: {} };
  }

  let rawValue = null;
  try {
    rawValue = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { version: 1, restaurants: {} };
  }

  const parsed = safeParse(rawValue, null);
  if (!parsed || typeof parsed !== "object") {
    return { version: 1, restaurants: {} };
  }

  return {
    version: 1,
    restaurants:
      parsed?.restaurants && typeof parsed.restaurants === "object"
        ? parsed.restaurants
        : {},
  };
}

function writeStore(store) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function normalizeRestaurantId(restaurantId) {
  return String(restaurantId || "").trim();
}

function updateRestaurantEntry(restaurantId, updater) {
  const targetId = normalizeRestaurantId(restaurantId);
  if (!targetId) return null;

  const store = readStore();
  const currentEntry = store.restaurants?.[targetId] || {
    restaurant: null,
    user: null,
    anchorDate: "",
    statesByEmployee: {},
    pendingPunches: [],
    failedPunches: [],
    lastSuccessfulSyncAt: null,
    updatedAt: null,
  };

  const nextEntry = updater(cloneJson(currentEntry) || currentEntry);
  if (!nextEntry) return null;

  store.restaurants = {
    ...(store.restaurants || {}),
    [targetId]: {
      ...nextEntry,
      updatedAt: new Date().toISOString(),
    },
  };

  writeStore(store);
  return store.restaurants[targetId];
}

function pickRestaurantSnapshot(restaurant) {
  if (!restaurant?._id) return null;

  return {
    _id: restaurant._id,
    name: restaurant.name || "",
    options: restaurant.options || {},
    employees: Array.isArray(restaurant.employees) ? restaurant.employees : [],
  };
}

function pickUserSnapshot(user) {
  if (!user?.id && !user?._id) return null;

  return {
    id: String(user.id || user._id),
    role: user.role || "",
    options: user.options || {},
  };
}

function buildEmployeeDisplay(employee) {
  return {
    id: String(employee?._id || employee?.id || ""),
    firstname:
      employee?.firstname ||
      employee?.employeeSnapshot?.firstname ||
      employee?.snapshot?.firstname ||
      "",
    lastname:
      employee?.lastname ||
      employee?.employeeSnapshot?.lastname ||
      employee?.snapshot?.lastname ||
      "",
    email:
      employee?.email ||
      employee?.employeeSnapshot?.email ||
      employee?.snapshot?.email ||
      "",
    post:
      employee?.post ||
      employee?.employeeSnapshot?.post ||
      employee?.snapshot?.post ||
      "",
  };
}

function buildClientMutationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `tc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function diffMinutes(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function buildFallbackKioskState(employee, anchorDate) {
  return {
    employee: buildEmployeeDisplay(employee),
    anchorDate,
    state: {
      situation: "off",
      availableActions: [TIME_CLOCK_ACTIONS.CLOCK_IN],
      activeSession: null,
    },
    day: {
      date: anchorDate,
      sessions: [],
      totalGrossMinutes: 0,
      totalBreakMinutes: 0,
      totalWorkedMinutes: 0,
      sessionCount: 0,
      anomalies: [],
    },
    lastUpdatedAt: null,
  };
}

function ensureKioskState(baseState, employee, anchorDate) {
  const fallback = buildFallbackKioskState(employee, anchorDate);
  const next = cloneJson(baseState) || fallback;

  return {
    ...fallback,
    ...next,
    employee: next?.employee || fallback.employee,
    anchorDate: next?.anchorDate || fallback.anchorDate,
    state: {
      ...fallback.state,
      ...(next?.state || {}),
    },
    day: {
      ...fallback.day,
      ...(next?.day || {}),
      date: next?.day?.date || fallback.day.date,
      sessions: Array.isArray(next?.day?.sessions) ? next.day.sessions : [],
      anomalies: Array.isArray(next?.day?.anomalies) ? next.day.anomalies : [],
    },
  };
}

function advanceActiveStateTo(kioskState, targetTime) {
  const next = ensureKioskState(kioskState, kioskState?.employee, kioskState?.anchorDate);
  const activeSession = next?.state?.activeSession;
  const state = next?.state?.situation;
  const target = new Date(targetTime);
  const baseline = next?.lastUpdatedAt ? new Date(next.lastUpdatedAt) : null;

  if (
    !activeSession ||
    !baseline ||
    Number.isNaN(target.getTime()) ||
    Number.isNaN(baseline.getTime()) ||
    target <= baseline
  ) {
    if (!next.lastUpdatedAt && !Number.isNaN(target.getTime())) {
      next.lastUpdatedAt = target.toISOString();
    }
    return next;
  }

  const delta = diffMinutes(baseline, target);
  if (!delta) {
    next.lastUpdatedAt = target.toISOString();
    return next;
  }

  if (state === "working") {
    next.day.totalGrossMinutes += delta;
    next.day.totalWorkedMinutes += delta;
    activeSession.totals = {
      ...(activeSession.totals || {}),
      grossMinutes: Number(activeSession?.totals?.grossMinutes || 0) + delta,
      breakMinutes: Number(activeSession?.totals?.breakMinutes || 0),
      workedMinutes: Number(activeSession?.totals?.workedMinutes || 0) + delta,
    };
  } else if (state === "on_break") {
    next.day.totalGrossMinutes += delta;
    next.day.totalBreakMinutes += delta;
    activeSession.totals = {
      ...(activeSession.totals || {}),
      grossMinutes: Number(activeSession?.totals?.grossMinutes || 0) + delta,
      breakMinutes: Number(activeSession?.totals?.breakMinutes || 0) + delta,
      workedMinutes: Number(activeSession?.totals?.workedMinutes || 0),
    };
  }

  next.lastUpdatedAt = target.toISOString();
  return next;
}

function buildSignaturePayload(signatureStrokes, occurredAt) {
  const strokes = cloneSignatureStrokes(signatureStrokes);

  return {
    strokes,
    signedAt: occurredAt,
  };
}

function buildOfflineEvent(queueItem) {
  return {
    id: queueItem.clientMutationId,
    type: queueItem.action,
    at: queueItem.occurredAt,
    actorRole: "employee",
    actorId: "",
    source: "kiosk",
    signature: buildSignaturePayload(
      queueItem?.signature?.strokes || [],
      queueItem.occurredAt,
    ),
  };
}

function applyQueuedPunchToKioskState(baseState, queueItem, employee) {
  const anchorDate = queueItem?.businessDate || baseState?.anchorDate;
  const next = advanceActiveStateTo(
    ensureKioskState(baseState, employee, anchorDate),
    queueItem?.occurredAt,
  );

  const action = queueItem?.action;
  const activeSession = next?.state?.activeSession;

  if (action === TIME_CLOCK_ACTIONS.CLOCK_IN) {
    if (activeSession) return next;

    next.day.sessionCount = Number(next?.day?.sessionCount || 0) + 1;
    next.state.situation = "working";
    next.state.availableActions = [
      TIME_CLOCK_ACTIONS.BREAK_START,
      TIME_CLOCK_ACTIONS.CLOCK_OUT,
    ];
    next.state.activeSession = {
      id: `offline_${queueItem.clientMutationId}`,
      businessDate: anchorDate,
      status: "open",
      situation: "working",
      availableActions: [
        TIME_CLOCK_ACTIONS.BREAK_START,
        TIME_CLOCK_ACTIONS.CLOCK_OUT,
      ],
      clockInAt: queueItem.occurredAt,
      clockOutAt: null,
      employeeSnapshot: buildEmployeeDisplay(employee),
      totals: {
        grossMinutes: 0,
        breakMinutes: 0,
        workedMinutes: 0,
      },
      anomalies: [],
      breaks: [],
      events: [buildOfflineEvent(queueItem)],
      adjustments: [],
      isManuallyEdited: false,
      lastActionAt: queueItem.occurredAt,
    };
    next.lastUpdatedAt = queueItem.occurredAt;
    return next;
  }

  if (!activeSession) return next;

  if (action === TIME_CLOCK_ACTIONS.BREAK_START) {
    if (next.state.situation !== "working") return next;

    activeSession.breaks = Array.isArray(activeSession.breaks)
      ? activeSession.breaks
      : [];
    activeSession.breaks.push({
      id: `offline_break_${queueItem.clientMutationId}`,
      startAt: queueItem.occurredAt,
      endAt: null,
      durationMinutes: 0,
      isActive: true,
      startSignature: buildSignaturePayload(
        queueItem?.signature?.strokes || [],
        queueItem.occurredAt,
      ),
      endSignature: null,
    });
    activeSession.events = Array.isArray(activeSession.events)
      ? [...activeSession.events, buildOfflineEvent(queueItem)]
      : [buildOfflineEvent(queueItem)];
    activeSession.status = "on_break";
    activeSession.situation = "on_break";
    activeSession.availableActions = [TIME_CLOCK_ACTIONS.BREAK_END];
    activeSession.lastActionAt = queueItem.occurredAt;
    next.state.situation = "on_break";
    next.state.availableActions = [TIME_CLOCK_ACTIONS.BREAK_END];
    next.lastUpdatedAt = queueItem.occurredAt;
    return next;
  }

  if (action === TIME_CLOCK_ACTIONS.BREAK_END) {
    if (next.state.situation !== "on_break") return next;

    const currentBreak = Array.isArray(activeSession.breaks)
      ? activeSession.breaks[activeSession.breaks.length - 1]
      : null;
    if (currentBreak && !currentBreak.endAt) {
      currentBreak.endAt = queueItem.occurredAt;
      currentBreak.durationMinutes = diffMinutes(
        currentBreak.startAt,
        queueItem.occurredAt,
      );
      currentBreak.isActive = false;
      currentBreak.endSignature = buildSignaturePayload(
        queueItem?.signature?.strokes || [],
        queueItem.occurredAt,
      );
    }

    activeSession.events = Array.isArray(activeSession.events)
      ? [...activeSession.events, buildOfflineEvent(queueItem)]
      : [buildOfflineEvent(queueItem)];
    activeSession.status = "open";
    activeSession.situation = "working";
    activeSession.availableActions = [
      TIME_CLOCK_ACTIONS.BREAK_START,
      TIME_CLOCK_ACTIONS.CLOCK_OUT,
    ];
    activeSession.lastActionAt = queueItem.occurredAt;
    next.state.situation = "working";
    next.state.availableActions = [
      TIME_CLOCK_ACTIONS.BREAK_START,
      TIME_CLOCK_ACTIONS.CLOCK_OUT,
    ];
    next.lastUpdatedAt = queueItem.occurredAt;
    return next;
  }

  if (action === TIME_CLOCK_ACTIONS.CLOCK_OUT) {
    if (next.state.situation !== "working") return next;

    activeSession.events = Array.isArray(activeSession.events)
      ? [...activeSession.events, buildOfflineEvent(queueItem)]
      : [buildOfflineEvent(queueItem)];
    activeSession.clockOutAt = queueItem.occurredAt;
    activeSession.status = "closed";
    activeSession.situation = "off";
    activeSession.availableActions = [TIME_CLOCK_ACTIONS.CLOCK_IN];
    activeSession.lastActionAt = queueItem.occurredAt;
    next.state.situation = "off";
    next.state.availableActions = [TIME_CLOCK_ACTIONS.CLOCK_IN];
    next.state.activeSession = null;
    next.lastUpdatedAt = queueItem.occurredAt;
  }

  return next;
}

function sortPendingPunches(pendingPunches = []) {
  return [...pendingPunches].sort((left, right) => {
    const leftAt = new Date(left?.occurredAt || left?.queuedAt || 0).getTime();
    const rightAt = new Date(right?.occurredAt || right?.queuedAt || 0).getTime();

    if (leftAt !== rightAt) return leftAt - rightAt;
    return String(left?.clientMutationId || "").localeCompare(
      String(right?.clientMutationId || ""),
    );
  });
}

export function isTimeClockOfflineCapable() {
  return typeof window !== "undefined";
}

export function cacheTimeClockRestaurantSnapshot({ restaurant, user }) {
  const restaurantSnapshot = pickRestaurantSnapshot(restaurant);
  if (!restaurantSnapshot?._id) return null;

  return updateRestaurantEntry(restaurantSnapshot._id, (entry) => ({
    ...entry,
    restaurant: restaurantSnapshot,
    user: pickUserSnapshot(user) || entry.user || null,
  }));
}

export function getTimeClockOfflineBootstrap({ restaurantId = "" } = {}) {
  const store = readStore();
  const entries = Object.entries(store.restaurants || {});
  if (!entries.length) return null;

  const targetRestaurantId = normalizeRestaurantId(restaurantId);

  let selectedEntry = null;
  if (targetRestaurantId) {
    selectedEntry = store.restaurants?.[targetRestaurantId] || null;
  }

  if (!selectedEntry) {
    selectedEntry = [...entries]
      .sort(
        (left, right) =>
          new Date(right?.[1]?.updatedAt || 0) - new Date(left?.[1]?.updatedAt || 0),
      )
      .map(([, entry]) => entry)[0];
  }

  return selectedEntry ? cloneJson(selectedEntry) : null;
}

export function readTimeClockOfflineEntry(restaurantId) {
  const targetRestaurantId = normalizeRestaurantId(restaurantId);
  if (!targetRestaurantId) return null;

  const store = readStore();
  const entry = store.restaurants?.[targetRestaurantId];
  return entry ? cloneJson(entry) : null;
}

export function cacheTimeClockKioskStates({
  restaurantId,
  anchorDate,
  statesByEmployee,
}) {
  return updateRestaurantEntry(restaurantId, (entry) => ({
    ...entry,
    anchorDate: anchorDate || entry.anchorDate || "",
    statesByEmployee:
      statesByEmployee && typeof statesByEmployee === "object"
        ? cloneJson(statesByEmployee)
        : {},
    lastSuccessfulSyncAt: new Date().toISOString(),
  }));
}

export function saveTimeClockKioskStateForEmployee({
  restaurantId,
  anchorDate,
  employeeId,
  kioskState,
}) {
  const targetEmployeeId = String(employeeId || "").trim();
  if (!targetEmployeeId || !kioskState) return null;

  return updateRestaurantEntry(restaurantId, (entry) => ({
    ...entry,
    anchorDate: anchorDate || entry.anchorDate || "",
    statesByEmployee: {
      ...(entry.statesByEmployee || {}),
      [targetEmployeeId]: cloneJson(kioskState),
    },
    lastSuccessfulSyncAt: new Date().toISOString(),
  }));
}

export function toKioskStateSummary(summary) {
  if (!summary) return null;

  return {
    employee: cloneJson(summary.employee) || null,
    anchorDate: summary.anchorDate || "",
    state: cloneJson(summary.state) || null,
    day: cloneJson(summary.day) || null,
    lastUpdatedAt: summary.lastUpdatedAt || new Date().toISOString(),
  };
}

export function getPendingPunchesForRestaurant(restaurantId) {
  const entry = readTimeClockOfflineEntry(restaurantId);
  return Array.isArray(entry?.pendingPunches) ? entry.pendingPunches : [];
}

export function getFailedPunchesForRestaurant(restaurantId) {
  const entry = readTimeClockOfflineEntry(restaurantId);
  return Array.isArray(entry?.failedPunches) ? entry.failedPunches : [];
}

export function getPendingPunchCountForRestaurant(restaurantId) {
  return getPendingPunchesForRestaurant(restaurantId).length;
}

export function queueOfflinePunch({
  restaurantId,
  employee,
  action,
  businessDate,
  signatureStrokes,
  occurredAt = new Date(),
}) {
  const targetRestaurantId = normalizeRestaurantId(restaurantId);
  const employeeId = String(employee?._id || employee?.id || "").trim();
  const actionTime =
    occurredAt instanceof Date ? occurredAt : new Date(occurredAt);

  if (!targetRestaurantId || !employeeId || Number.isNaN(actionTime.getTime())) {
    return null;
  }

  const punch = {
    clientMutationId: buildClientMutationId(),
    restaurantId: targetRestaurantId,
    employeeId,
    action,
    businessDate: businessDate || toLocalDateKey(actionTime),
    occurredAt: actionTime.toISOString(),
    queuedAt: new Date().toISOString(),
    signature: {
      strokes: cloneSignatureStrokes(signatureStrokes),
    },
    source: "kiosk",
  };

  updateRestaurantEntry(targetRestaurantId, (entry) => ({
    ...entry,
    pendingPunches: sortPendingPunches([
      ...(Array.isArray(entry.pendingPunches) ? entry.pendingPunches : []),
      punch,
    ]),
  }));

  return punch;
}

export function removePendingPunch(restaurantId, clientMutationId) {
  return updateRestaurantEntry(restaurantId, (entry) => ({
    ...entry,
    pendingPunches: (entry.pendingPunches || []).filter(
      (item) => String(item?.clientMutationId || "") !== String(clientMutationId || ""),
    ),
  }));
}

export function appendFailedPunch(restaurantId, failedPunch) {
  return updateRestaurantEntry(restaurantId, (entry) => ({
    ...entry,
    failedPunches: [
      {
        ...cloneJson(failedPunch),
        recordedAt: new Date().toISOString(),
      },
      ...(Array.isArray(entry.failedPunches) ? entry.failedPunches : []),
    ].slice(0, MAX_FAILED_PUNCHES),
  }));
}

export function clearFailedPunches(restaurantId) {
  return updateRestaurantEntry(restaurantId, (entry) => ({
    ...entry,
    failedPunches: [],
  }));
}

export function getMergedKioskState({
  restaurantId,
  employee,
  anchorDate,
  serverState = null,
  now = new Date(),
}) {
  const entry = readTimeClockOfflineEntry(restaurantId);
  const baseState =
    serverState ||
    entry?.statesByEmployee?.[String(employee?._id || employee?.id || "")] ||
    null;
  const pendingPunches = sortPendingPunches(
    (entry?.pendingPunches || []).filter(
      (item) =>
        String(item?.employeeId || "") ===
        String(employee?._id || employee?.id || ""),
    ),
  );

  let next = ensureKioskState(baseState, employee, anchorDate);

  for (const punch of pendingPunches) {
    next = applyQueuedPunchToKioskState(next, punch, employee);
  }

  return advanceActiveStateTo(next, now);
}

export function getMergedKioskStatesByEmployee({
  restaurantId,
  employees = [],
  anchorDate,
  serverStatesByEmployee = {},
  now = new Date(),
}) {
  return (employees || []).reduce((accumulator, employee) => {
    const employeeId = String(employee?._id || employee?.id || "");
    if (!employeeId) return accumulator;

    accumulator[employeeId] = getMergedKioskState({
      restaurantId,
      employee,
      anchorDate,
      serverState: serverStatesByEmployee?.[employeeId] || null,
      now,
    });
    return accumulator;
  }, {});
}

export async function replayPendingTimeClockPunches({
  restaurantId,
  token,
  apiUrl,
  onItemSynced,
  onItemFailed,
}) {
  const targetRestaurantId = normalizeRestaurantId(restaurantId);
  if (!targetRestaurantId || !token || !apiUrl) {
    return { processed: 0, synced: 0, failed: 0, stopped: false };
  }

  const pendingPunches = sortPendingPunches(
    getPendingPunchesForRestaurant(targetRestaurantId),
  );
  const result = {
    processed: 0,
    synced: 0,
    failed: 0,
    stopped: false,
  };

  for (const punch of pendingPunches) {
    try {
      const { data } = await axios.post(
        `${apiUrl}/restaurants/${targetRestaurantId}/time-clock/punch`,
        {
          employeeId: punch.employeeId,
          action: punch.action,
          businessDate: punch.businessDate,
          occurredAt: punch.occurredAt,
          clientMutationId: punch.clientMutationId,
          signature: punch.signature,
          source: punch.source || "kiosk",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      removePendingPunch(targetRestaurantId, punch.clientMutationId);
      if (data?.summary) {
        saveTimeClockKioskStateForEmployee({
          restaurantId: targetRestaurantId,
          anchorDate: data.summary.anchorDate || punch.businessDate,
          employeeId: punch.employeeId,
          kioskState: toKioskStateSummary(data.summary),
        });
      }

      result.processed += 1;
      result.synced += 1;
      onItemSynced?.({ punch, data });
    } catch (error) {
      const status = Number(error?.response?.status || 0);

      if (status >= 400 && status < 500) {
        removePendingPunch(targetRestaurantId, punch.clientMutationId);
        appendFailedPunch(targetRestaurantId, {
          punch,
          message:
            error?.response?.data?.message ||
            "Le pointage en attente a ete refuse lors de la synchronisation.",
          status,
        });
        result.processed += 1;
        result.failed += 1;
        onItemFailed?.({ punch, error, conflict: true });
        continue;
      }

      result.stopped = true;
      onItemFailed?.({ punch, error, conflict: false });
      break;
    }
  }

  return result;
}
