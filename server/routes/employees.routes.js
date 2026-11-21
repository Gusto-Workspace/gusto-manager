const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");
const axios = require("axios");
const { broadcastToRestaurant } = require("../services/shared/sse-bus.service");

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");
const {
  isAccountSessionValid,
  normalizeSessionVersion,
  rotatePasswordSession,
  signAccountToken,
  stripJwtMetadata,
  validatePasswordChangeInput,
} = require("../services/shared/account-session.service");

// MODELS
const EmployeeModel = require("../models/employee.model");
const PersonnelReportInput = require("../models/personnel-report-input.model");
const { TimeClockPin } = require("../models/time-clock-device.model");
const { clockPinWriteProblem, provisionInitialClockPin, withClockPinTransaction } = require("../services/employees/time-clock-pin.service");
const RestaurantModel = require("../models/restaurant.model");
const OwnerModel = require("../models/owner.model");
const TrainingSession = require("../models/logs/training-session.model");

// SERVICE NOTIFS
const {
  createAndBroadcastNotification,
} = require("../services/shared/notifications.service");
const {
  refreshGiftCardLifecycle,
} = require("../services/gift-cards/gift-card-lifecycle.service");
const {
  buildPlanningExportPdf,
} = require("../services/pdf/render-planning-export.service");
const {
  buildWorkbookBuffer: buildPlanningWorkbookBuffer,
} = require("../services/excel/render-planning-export-workbook.service");
const {
  decorateEmployeeForRestaurant,
  decorateRestaurantEmployees,
  publicEmployeeDirectoryEntry,
} = require("../services/employees/employee-serialization.service");
const {
  resolvePlanningAbsence,
} = require("../services/employees/planning-absence.service");
const { applyPlanningAction } = require("../services/employees/planning-actions.service");
const PlanningShiftTemplate = require("../models/planning-shift-template.model");
const { prepareShiftTemplate, templateNameKey } = require("../services/employees/planning-shift-template.service");
const { readLeaveRequest, canTransitionLeave } = require("../services/employees/leave-request.service");
const {
  periodDates, planningFence, assertPlanningUnlocked, withPlanningWrite, visiblePlanningShifts,
  getPlanningState, setPlanningLock, publishPlanning, deliverPlanningEmails, planningError,
} = require("../services/employees/planning-period.service");
const {
  attemptEmployeeAssetDeletions,
  enqueueEmployeeAssetDeletions,
} = require("../services/employees/employee-asset-deletion.service");
const {
  noShiftOverlap,
  plannedMinutes: getPlannedShiftMinutes,
  prepareShiftBatch,
  readWorkDetails,
} = require("../services/employees/planning-shift.service");
const {
  EMPLOYEE_DOCUMENT_MAX_FILES,
  EMPLOYEE_DOCUMENT_MAX_FILE_SIZE,
  EmployeeDocumentValidationError,
  buildEmployeeDocumentDownloadUrl,
  createEmployeeDocumentPublicId,
  getDocumentContentDisposition,
  getDocumentContentType,
  getDocumentDeliveryType,
  getDocumentResourceType,
  serializeEmployeeDocuments,
  setPrivateDocumentResponseHeaders,
  validateEmployeeDocumentFile,
  validateEmployeeDocumentMetadata,
  validateEmployeeDocumentUpload,
} = require("../services/employees/employee-documents.service");

// ---------- HELPERS MULTI-RESTAURANTS / PROFILES ----------

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeAccountType(value) {
  return value === "accountant" ? "accountant" : "employee";
}

function isAccountant(employee) {
  return employee?.accountType === "accountant";
}

function workforceAccountFilter() {
  return {
    $or: [{ accountType: "employee" }, { accountType: { $exists: false } }],
  };
}

function serializeEmployeeForAccountant(employee, restaurantId) {
  const snapshot =
    findRestaurantProfile(employee, restaurantId)?.snapshot || {};

  return {
    _id: employee?._id,
    firstname: snapshot.firstname || employee?.firstname || "",
    lastname: snapshot.lastname || employee?.lastname || "",
    post: snapshot.post || employee?.post || "",
    profilePicture: employee?.profilePicture?.url
      ? { url: employee.profilePicture.url }
      : null,
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || "").trim());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeContractType(value) {
  return String(value || "").trim();
}

function normalizeContractualUnit(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (
    ["week", "weekly", "semaine", "hebdo", "hebdomadaire"].includes(normalized)
  ) {
    return "week";
  }

  if (
    ["month", "monthly", "mois", "mensuel", "mensuelle"].includes(normalized)
  ) {
    return "month";
  }

  return "";
}

function normalizeContractualValue(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const numeric = Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Math.round(numeric * 100) / 100;
}

function employeeWorksInRestaurant(employee, restaurantId) {
  const target = String(restaurantId);
  return Array.isArray(employee.restaurants)
    ? employee.restaurants.some((id) => String(id) === target)
    : false;
}

function findRestaurantProfile(employee, restaurantId) {
  if (!Array.isArray(employee?.restaurantProfiles)) return null;
  const target = String(restaurantId);
  return employee.restaurantProfiles.find(
    (p) => String(p.restaurant) === target,
  );
}

function syncEmployeeIdentityAcrossProfiles(employee, updates = {}) {
  const profiles = Array.isArray(employee.restaurantProfiles)
    ? employee.restaurantProfiles
    : [];

  if (updates.firstname !== undefined) {
    employee.firstname = updates.firstname;
  }

  if (updates.lastname !== undefined) {
    employee.lastname = updates.lastname;
  }

  profiles.forEach((profile) => {
    profile.snapshot ??= {};

    if (updates.firstname !== undefined) {
      profile.snapshot.firstname = updates.firstname;
    }

    if (updates.lastname !== undefined) {
      profile.snapshot.lastname = updates.lastname;
    }
  });
}

function setEmployeeProfileOptions(profile, options, { partial = false } = {}) {
  profile.options ??= {};
  for (const key of Object.keys(profile.schema.path("options").schema.paths)) {
    if (partial && !Object.hasOwn(options, key)) continue;
    profile.options[key] = options?.[key] ?? false;
  }
}

function broadcastEmployeeUpdate(employee) {
  const restaurants = Array.isArray(employee?.restaurants)
    ? employee.restaurants
    : [];

  if (!restaurants.length) return;

  restaurants.forEach((restaurantId) => {
    broadcastToRestaurant(String(restaurantId), {
      type: "employee_updated",
      employee: decorateEmployeeForRestaurant(employee, restaurantId, {
        includeDocuments: false,
      }),
    });
  });
}

async function getEmployeesAccessContext(request, restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId).select(
    "name owner_id employees options.employees",
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
    if (String(request.user.restaurantId || "") !== String(restaurantId)) {
      return { error: { status: 403, message: "Forbidden" } };
    }
    const currentEmployee = await EmployeeModel.findById(request.user.id);
    const isListedByRestaurant = (restaurant.employees || []).some(
      (employee) =>
        String(employee?._id || employee || "") === String(request.user.id),
    );
    if (
      !currentEmployee ||
      isAccountant(currentEmployee) ||
      !isListedByRestaurant ||
      !employeeWorksInRestaurant(currentEmployee, restaurantId)
    ) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    const profile = findRestaurantProfile(currentEmployee, restaurantId);
    if (!profile) {
      return { error: { status: 403, message: "Forbidden" } };
    }
    return {
      restaurant,
      isManager: restaurant.options?.employees === true && profile?.options?.employees === true,
      currentEmployee,
    };
  }

  if (request.user?.role === "accountant") {
    if (String(request.user.restaurantId || "") !== String(restaurantId)) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    const currentEmployee = await EmployeeModel.findById(request.user.id);
    const isListedByRestaurant = (restaurant.employees || []).some(
      (employee) =>
        String(employee?._id || employee || "") === String(request.user.id),
    );
    if (
      !currentEmployee ||
      !isAccountant(currentEmployee) ||
      !isListedByRestaurant ||
      !employeeWorksInRestaurant(currentEmployee, restaurantId)
    ) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    return {
      restaurant,
      isManager: false,
      isAccountant: true,
      currentEmployee,
    };
  }

  return { error: { status: 403, message: "Forbidden" } };
}

function canAccessEmployeeTarget(accessContext, employeeId) {
  if (!accessContext?.currentEmployee) return true;
  if (accessContext?.isManager) return true;

  return String(accessContext.currentEmployee._id) === String(employeeId);
}

async function getEmployeeRouteAccess(
  request,
  restaurantId,
  employeeId,
  {
    managerOnly = false,
    requireModule = false,
    allowSelf = true,
    allowAccountantSelf = false,
    allowAccountantTarget = false,
  } = {},
) {
  const accessContext = await getEmployeesAccessContext(request, restaurantId);
  if (accessContext.error) return accessContext;

  if (accessContext.isAccountant && !allowAccountantSelf) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  if (managerOnly && !accessContext.isManager) {
    return { error: { status: 403, message: "Forbidden" } };
  }
  if (requireModule && accessContext.restaurant.options?.employees !== true) {
    return { error: { status: 403, message: "Le module Gestion du personnel est indisponible." } };
  }

  if (
    !managerOnly &&
    request.user?.role === "employee" &&
    !accessContext.isManager
  ) {
    if (!allowSelf || !canAccessEmployeeTarget(accessContext, employeeId)) {
      return { error: { status: 403, message: "Forbidden" } };
    }
  }

  if (
    accessContext.isAccountant &&
    String(accessContext.currentEmployee?._id || "") !==
      String(employeeId || "")
  ) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  if (employeeId && !allowAccountantTarget) {
    const target = await EmployeeModel.findById(employeeId)
      .select("accountType")
      .lean();
    if (isAccountant(target)) {
      return { error: { status: 403, message: "Forbidden" } };
    }
  }

  return accessContext;
}

async function getEmployeeDocumentRouteAccess(
  request,
  restaurantId,
  employeeId,
  options = {},
) {
  if (request.user?.role === "employee" &&
      String(request.user.restaurantId || "") !== String(restaurantId)) {
    return { error: { status: 403, message: "Forbidden" } };
  }
  if (request.query?.scope === "personal" && (
    request.user?.role !== "employee" || String(request.user.id) !== String(employeeId)
  )) {
    return { error: { status: 403, message: "Forbidden" } };
  }
  if (request.user?.role === "accountant") {
    if (options.managerOnly) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    const accessContext = await getEmployeesAccessContext(
      request,
      restaurantId,
    );
    if (accessContext.error) return accessContext;

    const employeeIsListedByRestaurant = (
      accessContext.restaurant?.employees || []
    ).some(
      (employee) =>
        String(employee?._id || employee || "") === String(employeeId),
    );
    const targetEmployee = await EmployeeModel.findById(employeeId);

    if (
      !employeeIsListedByRestaurant ||
      !targetEmployee ||
      isAccountant(targetEmployee) ||
      !employeeWorksInRestaurant(targetEmployee, restaurantId) ||
      !findRestaurantProfile(targetEmployee, restaurantId)
    ) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    return accessContext;
  }

  const accessContext = await getEmployeeRouteAccess(
    request,
    restaurantId,
    employeeId,
    { ...options, allowAccountantTarget: true },
  );
  if (accessContext.error) return accessContext;

  const employeeIsListedByRestaurant = (
    accessContext.restaurant?.employees || []
  ).some(
    (employee) =>
      String(employee?._id || employee || "") === String(employeeId),
  );
  if (!employeeIsListedByRestaurant) {
    return { error: { status: 404, message: "Employee not found" } };
  }

  const employeeExists = await EmployeeModel.exists({
    _id: employeeId,
    restaurants: restaurantId,
    "restaurantProfiles.restaurant": restaurantId,
    ...workforceAccountFilter(),
  });
  if (!employeeExists) {
    return { error: { status: 404, message: "Employee not found" } };
  }

  return accessContext;
}

function findEmployeeDocument(profile, publicId) {
  return (
    (profile?.documents || []).find(
      (document) => document.public_id === publicId,
    ) || null
  );
}

function accountantCanReadDocument(user, document) {
  return (
    user?.role === "accountant" && document?.uploadedBy?.role === "accountant"
  );
}

function canReadEmployeeDocument(req, access, document) {
  if (access.isAccountant) return accountantCanReadDocument(req.user, document);
  if (access.isManager && req.query?.scope !== "personal") return true;
  return document.visibility === "employee";
}

function toValidDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function findShiftConflicts(
  profile,
  start,
  end,
  { excludeShiftId = null, excludeLeaveRequestId = null } = {},
) {
  return (profile?.shifts || []).filter((shift) => {
    if (excludeShiftId && String(shift?._id) === String(excludeShiftId)) {
      return false;
    }

    if (
      excludeLeaveRequestId &&
      shift?.leaveRequestId &&
      String(shift.leaveRequestId) === String(excludeLeaveRequestId)
    ) {
      return false;
    }

    const currentStart = toValidDate(shift?.start);
    const currentEnd = toValidDate(shift?.end);
    if (!currentStart || !currentEnd || currentEnd <= currentStart)
      return false;

    return rangesOverlap(start, end, currentStart, currentEnd);
  });
}

function findShiftConflict(profile, start, end, options = {}) {
  return findShiftConflicts(profile, start, end, options)[0] || null;
}

function findActiveLeaveRequestConflict(
  profile,
  start,
  end,
  { excludeReqId = null } = {},
) {
  return (profile?.leaveRequests || []).find((leaveRequest) => {
    if (excludeReqId && String(leaveRequest?._id) === String(excludeReqId)) {
      return false;
    }

    if (!["pending", "approved"].includes(leaveRequest?.status)) return false;

    const currentStart = toValidDate(leaveRequest?.start);
    const currentEnd = toValidDate(leaveRequest?.end);
    if (!currentStart || !currentEnd || currentEnd <= currentStart)
      return false;

    return rangesOverlap(start, end, currentStart, currentEnd);
  });
}

async function buildDecoratedRestaurant(restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId)
    .populate("owner_id", "firstname")
    .populate("menus")
    .populate("employees");

  if (!restaurant) return null;

  return decorateRestaurantEmployees(
    restaurant,
    restaurantId,
    restaurant.employees || [],
  );
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

const PLANNING_TIME_ZONE = "Europe/Paris";
const planningDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: PLANNING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const planningTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PLANNING_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const planningDayKey = (value) => planningDateFormatter.format(value);
const millisecondsPerDay = 86_400_000;
const civilDay = (key) => Date.parse(`${key}T00:00:00Z`);
const movePlanningDayKey = (key, days) =>
  new Date(civilDay(key) + days * millisecondsPerDay).toISOString().slice(0, 10);

function dateKeyToPlanningStart(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return null;
  const utc = civilDay(key);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== key) return null;
  for (const offset of [120, 60]) {
    const candidate = new Date(utc - offset * 60_000);
    if (planningDayKey(candidate) === key && planningTimeFormatter.format(candidate) === "00:00") return candidate;
  }
  return null;
}

function getDateRangeBounds(startDateKey, endDateKey) {
  const start = dateKeyToPlanningStart(startDateKey);
  const end = dateKeyToPlanningStart(endDateKey);

  if (!start || !end || start > end) return null;

  const endExclusive = dateKeyToPlanningStart(movePlanningDayKey(endDateKey, 1));
  if (!endExclusive) return null;

  return { start, end, endExclusive, startDateKey, endDateKey };
}

function normalizePlanningTitle(value) {
  return String(value || "").trim();
}

function normalizePlanningTitleKey(value) {
  return normalizePlanningTitle(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isLeaveShift(value) {
  return (
    value?.isLeave === true ||
    value?.leaveRequestId != null ||
    ["conges", "conge"].includes(normalizePlanningTitleKey(value?.title))
  );
}

function getPlanningShiftTitle(value) {
  if (isLeaveShift(value)) return "Congés";
  return normalizePlanningTitle(value?.title);
}

function serializeShiftConflict(shift) {
  const leaveShift = isLeaveShift(shift);

  return {
    _id: shift?._id || null,
    title: getPlanningShiftTitle(shift),
    start: shift?.start || null,
    end: shift?.end || null,
    isLeave: leaveShift,
    leaveRequestId: shift?.leaveRequestId || null,
    canDelete: !leaveShift,
  };
}

function parseShiftDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toObjectIdOrNull(value) {
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : null;
}

function getRestaurantProfileProjection(restaurantId) {
  return {
    __v: 1,
    restaurantProfiles: {
      $elemMatch: { restaurant: restaurantId },
    },
  };
}

async function ensureRestaurantProfileExists(employeeId, restaurantId, snapshot = {}) {
  await EmployeeModel.updateOne(
    {
      _id: employeeId,
      restaurants: restaurantId,
      "restaurantProfiles.restaurant": { $ne: restaurantId },
    },
    {
      $push: {
        restaurantProfiles: {
          restaurant: restaurantId,
          options: {},
          documents: [],
          shifts: [],
          leaveRequests: [],
          snapshot,
        },
      },
      $inc: { __v: 1 },
    },
  );
}

async function ensureEmployeeProfileForEdit(employee, restaurantId) {
  if (findRestaurantProfile(employee, restaurantId)) return employee;
  await ensureRestaurantProfileExists(employee._id, new mongoose.Types.ObjectId(restaurantId), {
    firstname: employee.firstname || "",
    lastname: employee.lastname || "",
  });
  return EmployeeModel.findById(employee._id);
}

function isFullDayLeave(start, end, leaveShift) {
  return leaveShift && formatTimeLabel(start) === "00:00" && formatTimeLabel(end) === "23:59";
}

function getOrCreatePlanningDay(planningDays, dayKey) {
  const existing = planningDays.get(dayKey);
  if (existing) return existing;

  const next = {
    date: dayKey,
    shifts: [],
    shiftCount: 0,
    totalMinutes: 0,
  };

  planningDays.set(dayKey, next);
  return next;
}

function formatTimeLabel(value) {
  if (!value) return "-";

  try {
    return planningTimeFormatter.format(new Date(value));
  } catch {
    return "-";
  }
}

function getShiftEndLabel(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";

  const endLabel = formatTimeLabel(end);
  const startDay = planningDayKey(start);
  const endDay = planningDayKey(end);

  if (startDay === endDay) return endLabel;

  const dayDelta = (civilDay(endDay) - civilDay(startDay)) / millisecondsPerDay;

  return `${endLabel} (+${dayDelta}j)`;
}

function buildPlanningExportEmployee(employee, restaurantId, bounds) {
  const profile = findRestaurantProfile(employee, restaurantId);
  const snapshot = profile?.snapshot || {};
  const planningDays = new Map();
  let shiftCount = 0;
  let plannedMinutes = 0;

  const shifts = [...(profile?.shifts || [])].sort(
    (left, right) => new Date(left.start) - new Date(right.start),
  );

  for (const shift of shifts) {
    const shiftStart = new Date(shift.start);
    const shiftEnd = new Date(shift.end);
    const leaveShift = isLeaveShift(shift);

    if (
      Number.isNaN(shiftStart.getTime()) ||
      !(shiftEnd > shiftStart)
    ) {
      continue;
    }

    if (shiftStart >= bounds.endExclusive || shiftEnd <= bounds.start) {
      continue;
    }

    const durationMinutes = getPlannedShiftMinutes(
      shiftStart, shiftEnd, leaveShift ? 0 : shift.breakMinutes,
    );
    const fullDayLeave = isFullDayLeave(shiftStart, shiftEnd, leaveShift);

    if (fullDayLeave) {
      const startKey = planningDayKey(shiftStart);
      const endKey = planningDayKey(shiftEnd);
      const firstVisibleDay = startKey < bounds.startDateKey ? bounds.startDateKey : startKey;
      const lastVisibleDay = endKey > bounds.endDateKey ? bounds.endDateKey : endKey;

      for (
        let cursor = firstVisibleDay;
        cursor <= lastVisibleDay;
        cursor = movePlanningDayKey(cursor, 1)
      ) {
        const current = getOrCreatePlanningDay(
          planningDays,
          cursor,
        );
        current.shifts.push({
          title: getPlanningShiftTitle(shift),
          textLabel: getPlanningShiftTitle(shift),
          isLeave: true,
        });
      }

      continue;
    }

    const dayKey = planningDayKey(shiftStart);
    const current = getOrCreatePlanningDay(planningDays, dayKey);
    const title = getPlanningShiftTitle(shift);

    current.shifts.push({
      title: leaveShift ? title : [shift.position, title].filter(Boolean).join(" · "),
      startLabel: formatTimeLabel(shiftStart),
      endLabel: getShiftEndLabel(shiftStart, shiftEnd),
      durationMinutes,
      isLeave: leaveShift,
    });
    if (!leaveShift) {
      current.shiftCount += 1;
      current.totalMinutes += durationMinutes;
      shiftCount += 1;
      plannedMinutes += durationMinutes;
    }
    planningDays.set(dayKey, current);
  }

  return {
    employee: {
      id: employee?._id ? String(employee._id) : "",
      firstname: snapshot.firstname || employee?.firstname || "",
      lastname: snapshot.lastname || employee?.lastname || "",
      post: snapshot.post || employee?.post || "",
    },
    totals: {
      shiftCount,
      plannedMinutes,
    },
    days: Array.from(planningDays.values()).sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
  };
}

function formatPlanningEmailDuration(minutes) {
  const total = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(total / 60);
  const remaining = total % 60;

  if (!hours && !remaining) return "0h";
  if (!remaining) return `${hours}h`;
  return `${hours}h${String(remaining).padStart(2, "0")}`;
}

function formatPlanningEmailDate(dateKey) {
  const date = dateKeyToPlanningStart(dateKey);
  if (!date) return dateKey;

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PLANNING_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function buildPlanningEmailDays(employeePlanning, bounds) {
  const daysByDate = new Map(
    (employeePlanning.days || []).map((day) => [day.date, day]),
  );
  const days = [];

  for (
    let dateKey = bounds.startDateKey;
    dateKey <= bounds.endDateKey;
    dateKey = movePlanningDayKey(dateKey, 1)
  ) {
    days.push(
      daysByDate.get(dateKey) || {
        date: dateKey,
        shifts: [],
        shiftCount: 0,
        totalMinutes: 0,
      },
    );
  }

  return days;
}

function buildPlanningEmailHtml({
  restaurantName,
  employeeName,
  firstName,
  formattedFrom,
  formattedTo,
  employeePlanning,
  bounds,
}) {
  const days = buildPlanningEmailDays(employeePlanning, bounds);
  const rows = days
    .map((day) => {
      const shifts = day.shifts || [];
      const shiftHtml = shifts.length
        ? shifts
            .map((shift, index) => {
              const spacing = index > 0 ? "margin-top:10px;" : "";

              if (shift.isLeave) {
                return `<div style="display:inline-block;margin:0;${spacing}padding:4px 8px;border-radius:999px;background:#ede9fe;color:#5b3fd2;font-size:14px;font-weight:700;line-height:1.2;vertical-align:top;">${escapeHtml(
                  shift.textLabel || shift.title || "Congés",
                )}</div>`;
              }

              const title = shift.title ? ` - ${shift.title}` : "";
              const duration = shift.durationMinutes
                ? ` <span style="color:#6b7280;">(${formatPlanningEmailDuration(
                    shift.durationMinutes,
                  )})</span>`
                : "";

              return `<div style="margin:0;${spacing}padding:0;line-height:1.3;font-size:14px;white-space:nowrap;"><strong>${escapeHtml(
                shift.startLabel || "",
              )}&nbsp;-&nbsp;${escapeHtml(shift.endLabel || "")}</strong>${escapeHtml(
                title,
              )}${duration}</div>`;
            })
            .join("")
        : '<span style="color:#8a90a3;font-size:14px;line-height:1.25;">Repos</span>';

      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #edf0f7;vertical-align:top;font-size:14px;line-height:1.25;font-weight:700;color:#131E36;width:42%;">
            ${escapeHtml(formatPlanningEmailDate(day.date))}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #edf0f7;vertical-align:top;font-size:14px;line-height:1.25;color:#131E36;width:58%;">
            ${shiftHtml}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,sans-serif;color:#131E36;">
      <div style="max-width:640px;margin:0 auto;padding:16px 8px;">
        <div style="background:#ffffff;border:1px solid #e6e9f2;border-radius:18px;overflow:hidden;">
          <div style="padding:20px 18px;background:#131E36;color:#ffffff;">
            <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">${escapeHtml(
              restaurantName,
            )}</div>
            <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;">Votre planning</h1>
            <p style="margin:8px 0 0;color:#dbe4ff;">Du ${escapeHtml(
              formattedFrom,
            )} au ${escapeHtml(formattedTo)}</p>
          </div>

          <div style="padding:18px 16px;">
            <p style="margin:0 0 16px;font-size:16px;">Bonjour ${escapeHtml(
              firstName || employeeName,
            )},</p>
            <p style="margin:0 0 16px;color:#4b5565;">Voici votre emploi du temps pour la période sélectionnée.</p>

            <div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px;">
              <div style="padding:9px 10px;border-radius:12px;background:#f4f7ff;border:1px solid #dbe6ff;">
                <div style="font-size:12px;color:#64708a;">Créneaux</div>
                <div style="font-size:18px;font-weight:800;">${Number(
                  employeePlanning.totals?.shiftCount || 0,
                )}</div>
              </div>
              <div style="padding:9px 10px;border-radius:12px;background:#f4f7ff;border:1px solid #dbe6ff;">
                <div style="font-size:12px;color:#64708a;">Heures prévues</div>
                <div style="font-size:18px;font-weight:800;">${escapeHtml(
                  formatPlanningEmailDuration(
                    employeePlanning.totals?.plannedMinutes,
                  ),
                )}</div>
              </div>
            </div>

            <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #edf0f7;border-radius:14px;overflow:hidden;">
              <tbody>${rows}</tbody>
            </table>

            <p style="margin:22px 0 0;color:#6b7280;font-size:13px;">Bonne journée,<br/>L'équipe Gusto Manager</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---------- CLOUDINARY / MULTER ----------

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });
const employeeDocumentUpload = multer({
  storage,
  limits: {
    fileSize: EMPLOYEE_DOCUMENT_MAX_FILE_SIZE,
    files: EMPLOYEE_DOCUMENT_MAX_FILES,
    fields: EMPLOYEE_DOCUMENT_MAX_FILES + 1,
    parts: EMPLOYEE_DOCUMENT_MAX_FILES * 2 + 1,
    fieldNameSize: 100,
    fieldSize: 4096,
  },
}).array("documents", EMPLOYEE_DOCUMENT_MAX_FILES);
const MAX_PLANNING_FILES = 6;
const planningFilesUpload = multer({
  storage,
  limits: { fileSize: EMPLOYEE_DOCUMENT_MAX_FILE_SIZE, files: MAX_PLANNING_FILES, fields: 0, parts: MAX_PLANNING_FILES + 1 },
}).array("files", MAX_PLANNING_FILES);

router.use("/restaurants/:restaurantId/employees", authenticateToken);

async function authorizeEmployeeDocumentUpload(req, res, next) {
  try {
    const { restaurantId, employeeId } = req.params;
    const accessContext = await getEmployeeDocumentRouteAccess(
      req,
      restaurantId,
      employeeId,
      { managerOnly: req.user?.role !== "accountant" },
    );
    if (accessContext.error) {
      return res
        .status(accessContext.error.status)
        .json({ message: accessContext.error.message });
    }

    return next();
  } catch (error) {
    console.error(
      "Employee document upload authorization error:",
      error?.message || error,
    );
    return res.status(500).json({ message: "Internal server error" });
  }
}

function handleEmployeeDocumentUpload(req, res, next) {
  employeeDocumentUpload(req, res, (error) => {
    if (!error) return next();

    if (
      error instanceof multer.MulterError &&
      [
        "LIMIT_FILE_SIZE",
        "LIMIT_FILE_COUNT",
        "LIMIT_PART_COUNT",
        "LIMIT_FIELD_VALUE",
      ].includes(error.code)
    ) {
      return res.status(413).json({ message: "Document upload is too large" });
    }

    return res.status(400).json({ message: "Invalid document upload" });
  });
}

async function destroyEmployeeDocumentAsset(document) {
  return cloudinary.uploader.destroy(document.public_id, {
    resource_type: getDocumentResourceType(document),
    type: getDocumentDeliveryType(document),
    invalidate: true,
  });
}

async function cleanEmployeeUploadAssets(files) {
  try {
    await attemptEmployeeAssetDeletions(await enqueueEmployeeAssetDeletions(files));
  } catch (error) {
    // This path rolls back files never attached to a shift, including during a database outage.
    console.warn("[employee-assets] Could not enqueue upload rollback:", error?.code || "unavailable");
    await Promise.allSettled(files.map(destroyEmployeeDocumentAsset));
  }
}

async function reconcileEmployeeDocumentUpload(employeeId, restaurantId, files) {
  try {
    const employee = await EmployeeModel.findById(employeeId).select("restaurantProfiles.restaurant restaurantProfiles.documents.public_id").lean();
    const stored = findRestaurantProfile(employee, restaurantId)?.documents || [];
    const attachedIds = new Set(stored.map(({ public_id }) => public_id));
    await cleanEmployeeUploadAssets(files.filter(({ public_id }) => !attachedIds.has(public_id)));
  } catch (error) {
    // If acknowledgement was lost, the uploaded assets might already be attached.
    console.warn("[employee-assets] Could not confirm upload rollback:", error?.code || "unavailable");
  }
}

async function savePlanningEmployee(employee, session) {
  employee.$where = { __v: employee.__v ?? { $exists: false } };
  employee.increment();
  await employee.save({ session });
}

const uploadFromBuffer = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, format: "webp" },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      },
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// ---------- BREVO ----------

function instantiateClient() {
  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications["api-key"];
    apiKey.apiKey = process.env.BREVO_API_KEY;
    return defaultClient;
  } catch (err) {
    console.error("Erreur d'instanciation du client Brevo:", err);
    throw err;
  }
}

function sendTransactionalEmail(params) {
  try {
    instantiateClient();

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.sender = {
      email: "no-reply@gusto-manager.com",
      name: "Gusto Manager",
    };
    sendSmtpEmail.to = params.to;
    sendSmtpEmail.subject = params.subject;
    sendSmtpEmail.htmlContent = params.htmlContent;
    if (params.attachment) {
      sendSmtpEmail.attachment = Array.isArray(params.attachment)
        ? params.attachment
        : [params.attachment];
    }

    return apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (err) {
    console.error("Erreur lors de l'envoi de l'email :", err);
    throw err;
  }
}

function formatDateForEmail(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getLeaveTypeLabel(type) {
  if (type === "morning") return "matin";
  if (type === "afternoon") return "après-midi";
  return "journée entière";
}

async function sendLeaveRequestOwnerEmail({
  restaurantId,
  employee,
  leaveRequest,
}) {
  const restaurant = await RestaurantModel.findById(restaurantId)
    .select("name owner_id")
    .lean();
  if (!restaurant?.owner_id) return;

  const owner = await OwnerModel.findById(restaurant.owner_id)
    .select("firstname lastname email")
    .lean();
  const ownerEmail = normalizeEmail(owner?.email);
  if (!ownerEmail) return;

  const employeeName =
    `${employee?.firstname || ""} ${employee?.lastname || ""}`.trim() ||
    "Un employé";
  const start = formatDateForEmail(leaveRequest?.start);
  const end = formatDateForEmail(leaveRequest?.end);
  const period =
    start && end && start !== end
      ? `du ${start} au ${end}`
      : `${start || "date non renseignée"} (${getLeaveTypeLabel(
          leaveRequest?.type,
        )})`;

  return sendTransactionalEmail({
    to: [
      {
        email: ownerEmail,
        name: `${owner?.firstname || ""} ${owner?.lastname || ""}`.trim(),
      },
    ],
    subject: "Nouvelle demande de congé",
    htmlContent: `
      <p>Bonjour ${escapeHtml(owner?.firstname || "")},</p>
      <p>Une nouvelle demande de congé vient d’être déposée pour <strong>${escapeHtml(
        restaurant.name || "votre restaurant",
      )}</strong>.</p>
      <p>
        <strong>Employé :</strong> ${escapeHtml(employeeName)}<br/>
        <strong>Période :</strong> ${escapeHtml(period)}
      </p>
      <p>Vous pouvez la consulter et la traiter depuis Gusto Manager, dans le module Personnel &gt; Planning &gt; Congés.</p>
      <p>— L’équipe Gusto Manager</p>
    `,
  });
}

// Générateur de mot de passe 8 caractères
function generatePassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const specials = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const all = upper + upper.toLowerCase() + digits + specials;

  let pw = [
    upper[Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    specials[Math.floor(Math.random() * specials.length)],
  ];
  while (pw.length < 8) {
    pw.push(all[Math.floor(Math.random() * all.length)]);
  }
  return pw.sort(() => 0.5 - Math.random()).join("");
}

// ---------- ADD / IMPORT EMPLOYEE (SNAPSHOT + MULTI-RESTOS) ----------

router.post(
  "/restaurants/:restaurantId/employees",
  upload.single("profilePicture"),
  async (req, res) => {
    const restaurantId = req.params.restaurantId;

    const {
      lastName,
      firstName,
      email,
      secuNumber,
      address,
      emergencyContact,
      phone,
      post,
      dateOnPost,
      contractType,
      contractualValue,
      contractualUnit,
      accountType,
      existingEmployeeId,
    } = req.body;

    const normalizedEmail = normalizeEmail(email);
    const normalizedAccountType = normalizeAccountType(accountType);
    const normalizedEmployment = {
      contractType: normalizeContractType(contractType),
      contractualValue: normalizeContractualValue(contractualValue),
      contractualUnit: normalizeContractualUnit(contractualUnit),
    };

    try {
      if (
        !String(firstName || "").trim() ||
        !String(lastName || "").trim() ||
        !String(phone || "").trim() ||
        !normalizedEmail
      ) {
        return res.status(400).json({
          message: "Le prénom, le nom, l'e-mail et le téléphone sont requis.",
        });
      }

      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ message: "Saisissez une adresse e-mail valide." });
      }
      if (normalizedAccountType !== "accountant" && dateOnPost && Number.isNaN(+new Date(dateOnPost))) {
        return res.status(400).json({ message: "La date de prise de poste est invalide." });
      }

      const accessContext = await getEmployeeRouteAccess(
        req,
        restaurantId,
        null,
        {
          managerOnly: true,
          requireModule: true,
        },
      );
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      // 1) Vérifier si un employé existe déjà avec cet email
      let existingEmployee = null;
      if (existingEmployeeId) {
        if (req.user.role !== "owner") return res.status(403).json({ message: "Forbidden" });
        if (!mongoose.isValidObjectId(existingEmployeeId)) return res.status(400).json({ message: "Identifiant invalide" });
        existingEmployee = await EmployeeModel.findById(existingEmployeeId);
        if (!existingEmployee || normalizeEmail(existingEmployee.email) !== normalizedEmail) {
          return res.status(404).json({ message: "Compte à rattacher introuvable." });
        }
      } else {
        const [employeeDuplicate, ownerDuplicate] = await Promise.all([
          EmployeeModel.findOne({ email: normalizedEmail }),
          OwnerModel.findOne({ email: normalizedEmail }),
        ]);

        if (ownerDuplicate) {
          return res.status(409).json({
            code: "OWNER_EMAIL_CONFLICT",
            message:
              "Cette adresse mail est celle du compte restaurateur. Utilisez une autre adresse pour créer un compte employé.",
          });
        }

        existingEmployee = employeeDuplicate;
      }

      if (existingEmployee && !employeeWorksInRestaurant(existingEmployee, restaurantId) &&
          !(await RestaurantModel.exists({
            _id: { $in: existingEmployee.restaurants },
            owner_id: accessContext.restaurant.owner_id,
            employees: existingEmployee._id,
          }))) {
        return res.status(existingEmployeeId ? 404 : 409).json({
          message: existingEmployeeId ? "Compte à rattacher introuvable." : "Cette adresse e-mail ne peut pas être utilisée pour ce compte.",
        });
      }

      if (
        existingEmployee &&
        employeeWorksInRestaurant(existingEmployee, restaurantId)
      ) {
        return res.status(409).json({
          code: "EMPLOYEE_EMAIL_EXISTS",
          message:
            "Un employé utilise déjà cette adresse mail dans ce restaurant.",
        });
      }

      let profilePicture = null;
      if (!existingEmployee && req.file) {
        const result = await uploadFromBuffer(req.file.buffer, `Gusto_Workspace/restaurants/${restaurantId}/employees`);
        profilePicture = { url: result.secure_url, public_id: result.public_id };
      }

      if (
        existingEmployee &&
        normalizeAccountType(existingEmployee.accountType) !==
          normalizedAccountType
      ) {
        return res.status(409).json({
          code: "ACCOUNT_TYPE_CONFLICT",
          message:
            "Cette adresse mail appartient déjà à un autre type de compte.",
        });
      }

      // ---------- CAS 1 : NOUVEL EMPLOYÉ ----------
      if (!existingEmployee) {
        const temporaryPassword = generatePassword();
        const employeeData = {
          accountType: normalizedAccountType,
          lastname: lastName,
          firstname: firstName,
          email: normalizedEmail,
          phone: phone,
          secuNumber:
            normalizedAccountType === "accountant" ? undefined : secuNumber,
          address: normalizedAccountType === "accountant" ? undefined : address,
          emergencyContact:
            normalizedAccountType === "accountant"
              ? undefined
              : emergencyContact,
          password: temporaryPassword,
          post: normalizedAccountType === "accountant" ? "" : post,
          dateOnPost:
            normalizedAccountType === "accountant" || !dateOnPost
              ? undefined
              : new Date(dateOnPost),
          profilePicture,
          restaurants: [restaurantId],
          restaurantProfiles: [
            {
              restaurant: restaurantId,
              options: {},
              documents: [],
              shifts: [],
              leaveRequests: [],
              snapshot: {
                firstname: firstName,
                lastname: lastName,
                email: normalizedEmail,
                phone,
                secuNumber:
                  normalizedAccountType === "accountant"
                    ? undefined
                    : secuNumber,
                address:
                  normalizedAccountType === "accountant" ? undefined : address,
                emergencyContact:
                  normalizedAccountType === "accountant"
                    ? undefined
                    : emergencyContact,
                post: normalizedAccountType === "accountant" ? "" : post,
                dateOnPost:
                  normalizedAccountType === "accountant" || !dateOnPost
                    ? undefined
                    : new Date(dateOnPost),
              },
              employment:
                normalizedAccountType === "accountant"
                  ? {}
                  : normalizedEmployment,
            },
          ],
        };

        const newEmployee = await withClockPinTransaction(async (session) => {
          if (await EmployeeModel.exists({ email: normalizedEmail }).session(session)) return null;
          const employee = await new EmployeeModel(employeeData).save({ session });
          const roster = await RestaurantModel.updateOne(
            { _id: restaurantId }, { $addToSet: { employees: employee._id } }, { session },
          );
          if (!roster.matchedCount) throw new Error("Employee restaurant unavailable");
          if (normalizedAccountType === "employee") {
            await provisionInitialClockPin({
              restaurant: restaurantId, employee: employee._id,
              profile: String(employee.restaurantProfiles[0]._id), changedBy: String(req.user.id), session,
            });
          }
          return employee;
        });
        if (!newEmployee) return res.status(409).json({
          code: "EMPLOYEE_EMAIL_EXISTS",
          message: "Un compte utilise déjà cette adresse e-mail. Vérifiez le rattachement et réessayez.",
        });

        if (newEmployee.email) {
          const emailParams = {
            to: [
              {
                email: newEmployee.email,
                name: newEmployee.firstname,
              },
            ],
            subject:
              normalizedAccountType === "accountant"
                ? "Votre accès comptable Gusto Manager"
                : "Votre accès employé Gusto Manager",
            htmlContent: `
              <p>Bonjour ${escapeHtml(newEmployee.firstname)},</p>
              <p>Votre compte ${normalizedAccountType === "accountant" ? "comptable" : "employé"} a été créé avec succès.</p>
              <p>Connectez-vous ici : 
                <a href="https://gusto-manager.com/dashboard/login">
                  https://gusto-manager.com/dashboard/login
                </a>
              </p>
              <p><strong>Identifiant :</strong> ${escapeHtml(newEmployee.email)}<br/>
                 <strong>Mot de passe temporaire :</strong> ${escapeHtml(temporaryPassword)}
              </p>
              <p>${
                normalizedAccountType === "accountant"
                  ? "En cas de besoin, utilisez « Mot de passe oublié » depuis la page de connexion."
                  : "Merci de modifier votre mot de passe lors de votre première connexion. Si votre restaurant utilise la Pointeuse, retrouvez votre code PIN dans les paramètres de votre compte."
              }</p>
              <p>— L’équipe Gusto Manager</p>
            `,
          };
          sendTransactionalEmail(emailParams)
            .then(() => console.log("Mail création employé envoyé"))
            .catch((err) =>
              console.error("Erreur mail création employé :", err),
            );
        }

        const updatedRestaurant = await buildDecoratedRestaurant(restaurantId);

        return res.status(201).json({ restaurant: updatedRestaurant, employeeId: newEmployee._id });
      }

      // ---------- CAS 2 : RATTACHEMENT D’UN COMPTE ----------
      const existingProfile = findRestaurantProfile(existingEmployee, restaurantId);
      const profile = existingProfile || {
        _id: new mongoose.Types.ObjectId(), restaurant: restaurantId, snapshot: {}, employment: {},
      };
      profile.snapshot ??= {};
      profile.snapshot.firstname = existingEmployee.firstname;
      profile.snapshot.lastname = existingEmployee.lastname;
      profile.snapshot.email = existingEmployee.email;
      profile.snapshot.phone = phone;

      if (normalizedAccountType === "accountant") {
        if (existingProfile) setEmployeeProfileOptions(profile, {});
      } else {
        Object.assign(profile.snapshot, {
          secuNumber: secuNumber || "",
          address: address || "",
          emergencyContact: emergencyContact || "",
          post: post || "",
          dateOnPost: dateOnPost ? new Date(dateOnPost) : null,
        });
        profile.employment ??= {};
        Object.assign(profile.employment, normalizedEmployment);
      }

      const linked = await withClockPinTransaction(async (session) => {
        if (existingEmployee.isModified()) await savePlanningEmployee(existingEmployee, session);
        const result = await EmployeeModel.updateOne({
          _id: existingEmployee._id,
          __v: existingEmployee.__v ?? { $exists: false },
          restaurants: { $ne: restaurantId },
        }, {
          $addToSet: { restaurants: restaurantId },
          ...(!existingProfile && { $push: { restaurantProfiles: profile } }),
          $inc: { __v: 1 },
        }, { session, runValidators: true });
        if (!result.modifiedCount) return false;
        await RestaurantModel.updateOne(
          { _id: restaurantId }, { $addToSet: { employees: existingEmployee._id } }, { session },
        );
        if (normalizedAccountType === "employee") {
          await provisionInitialClockPin({
            restaurant: restaurantId, employee: existingEmployee._id,
            profile: String(profile._id || ""), changedBy: String(req.user.id), session,
          });
        }
        return true;
      });
      if (!linked) return res.status(409).json({ message: "Le rattachement du salarié a changé." });

      const updatedRestaurant = await buildDecoratedRestaurant(restaurantId);

      return res.status(200).json({ restaurant: updatedRestaurant, employeeId: existingEmployee._id });
    } catch (error) {
      const problem = clockPinWriteProblem(error);
      if (problem) return res.status(409).json(problem);
      console.error("Error creating/importing employee", { code: error.code || error.name });
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------- UPDATE EMPLOYEE POUR UN RESTO DONNÉ (options par resto) ----------

router.patch(
  "/restaurants/:restaurantId/employees/:employeeId",
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const {
        firstname,
        lastname,
        email,
        phone,
        secuNumber,
        address,
        emergencyContact,
        post,
        dateOnPost,
        options,
        contractType,
        contractualValue,
        contractualUnit,
        payrollCode,
      } = req.body;

      const accessContext = await getEmployeeRouteAccess(
        req,
        restaurantId,
        employeeId,
        { managerOnly: true, requireModule: true, allowAccountantTarget: true },
      );
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      let employee = await EmployeeModel.findById(employeeId);
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId) ||
          !accessContext.restaurant.employees.some((id) => String(id) === employeeId)) {
        return res.status(404).json({ message: "Employee not found" });
      }
      const normalizedEmail = normalizeEmail(email);
      const employeeIsAccountant = isAccountant(employee);
      if (!employeeIsAccountant && payrollCode !== undefined && (typeof payrollCode !== "string" || payrollCode.length > 64)) {
        return res.status(400).json({ message: "Saisissez un matricule de paie de 64 caractères maximum." });
      }
      if (email !== undefined && ((normalizedEmail && !isValidEmail(normalizedEmail)) ||
          (employeeIsAccountant && !normalizedEmail))) {
        return res.status(400).json({ message: "Saisissez une adresse e-mail valide." });
      }
      if ([firstname, lastname, phone].some((value) => value !== undefined && !String(value || "").trim())) {
        return res.status(400).json({ message: "Le prénom, le nom et le téléphone sont requis." });
      }
      if (!employeeIsAccountant && dateOnPost && Number.isNaN(+new Date(dateOnPost))) {
        return res.status(400).json({ message: "La date de prise de poste est invalide." });
      }
      let optionChanges;
      if (!employeeIsAccountant && options !== undefined) {
        try {
          optionChanges = typeof options === "string" ? JSON.parse(options) : options;
          if (!optionChanges || typeof optionChanges !== "object" || Array.isArray(optionChanges) ||
              Object.values(optionChanges).some((value) => typeof value !== "boolean")) throw new Error();
        } catch {
          return res.status(400).json({ message: "Les droits d’accès sont invalides." });
        }
      }
      employee = await ensureEmployeeProfileForEdit(employee, restaurantId);
      const profile = findRestaurantProfile(employee, restaurantId);
      if (!profile || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(409).json({ message: "Le rattachement du salarié a changé." });
      }

      // Photo globale
      if (req.file) {
        if (employee.profilePicture?.public_id) {
          await cloudinary.uploader.destroy(employee.profilePicture.public_id);
        }
        const result = await uploadFromBuffer(
          req.file.buffer,
          `Gusto_Workspace/restaurants/${restaurantId}/employees`,
        );
        employee.profilePicture = {
          url: result.secure_url,
          public_id: result.public_id,
        };
      }

      if (!profile.snapshot) {
        profile.snapshot = {};
      }
      profile.employment ??= {};

      if (firstname !== undefined || lastname !== undefined) {
        syncEmployeeIdentityAcrossProfiles(employee, {
          firstname,
          lastname,
        });
      }

      const scopedChanges = employeeIsAccountant ? { phone } : {
        phone, secuNumber, address, emergencyContact, post,
        dateOnPost: dateOnPost === undefined ? undefined : dateOnPost ? new Date(dateOnPost) : null,
      };
      for (const [key, value] of Object.entries(scopedChanges)) {
        if (value === undefined) continue;
        profile.snapshot[key] = value;
        if (employee.restaurants.length === 1) employee[key] = value;
      }

      if (email !== undefined) {
        if (normalizedEmail && normalizedEmail !== employee.email) {
          const [employeeDuplicate, ownerDuplicate] = await Promise.all([
            EmployeeModel.findOne({
              email: normalizedEmail,
              _id: { $ne: employee._id },
            }),
            OwnerModel.findOne({ email: normalizedEmail }),
          ]);

          if (employeeDuplicate || ownerDuplicate) {
            return res
              .status(409)
              .json({ message: "L'adresse mail est déjà utilisée" });
          }
        }

        employee.email = normalizedEmail;
        for (const restaurantProfile of employee.restaurantProfiles || []) {
          restaurantProfile.snapshot ??= {};
          restaurantProfile.snapshot.email = normalizedEmail;
        }
      }

      if (optionChanges) {
        setEmployeeProfileOptions(profile, optionChanges, { partial: true });
      } else if (employeeIsAccountant) {
        setEmployeeProfileOptions(profile, {});
      }

      if (!employeeIsAccountant && contractType !== undefined) {
        profile.employment.contractType = normalizeContractType(contractType);
      }

      if (!employeeIsAccountant && contractualValue !== undefined) {
        profile.employment.contractualValue =
          normalizeContractualValue(contractualValue);
      }

      if (!employeeIsAccountant && contractualUnit !== undefined) {
        profile.employment.contractualUnit =
          normalizeContractualUnit(contractualUnit);
      }
      if (!employeeIsAccountant && payrollCode !== undefined) {
        profile.employment.payrollCode = payrollCode.trim();
      }

      await savePlanningEmployee(employee);
      broadcastEmployeeUpdate(employee);

      const updatedRestaurant = await buildDecoratedRestaurant(restaurantId);

      res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      if (["VersionError", "DocumentNotFoundError"].includes(error.name)) {
        return res.status(409).json({ message: "Cette fiche a été mise à jour entre-temps. Réessayez." });
      }
      console.error("Error updating employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------- DOCUMENTS (par restaurant) ----------

// UPLOAD DOCUMENTS
router.post(
  "/restaurants/:restaurantId/employees/:employeeId/documents",
  authorizeEmployeeDocumentUpload,
  handleEmployeeDocumentUpload,
  async (req, res) => {
    const uploadedAssets = [];
    let writeStarted = false;
    let metadataPersisted = false;

    const { restaurantId, employeeId } = req.params;
    try {
      setPrivateDocumentResponseHeaders(res);

      const documents = validateEmployeeDocumentUpload(
        req.files,
        req.body.titles,
        req.body.metadata,
      );
      if (req.user.role === "accountant" && documents.some(({ visibility }) => visibility !== "internal")) {
        return res.status(403).json({ message: "Seul un responsable RH peut mettre un document à disposition du salarié." });
      }

      const employee = await EmployeeModel.findById(employeeId);
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = findRestaurantProfile(employee, restaurantId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const uploaderName = [req.user.firstname, req.user.lastname]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" ")
        .slice(0, 120);

      for (const document of documents) {
        const folder = `Gusto_Workspace/restaurants/${restaurantId}/employees/${employeeId}/documents`;
        const publicId = createEmployeeDocumentPublicId(document.extension);

        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: "raw",
              type: "authenticated",
              folder,
              public_id: publicId,
              overwrite: false,
              use_filename: false,
              unique_filename: false,
            },
            (err, r) => {
              if (err) return reject(err);
              resolve(r);
            },
          );
          streamifier.createReadStream(document.file.buffer).pipe(uploadStream);
        });

        const storedDocument = {
          public_id: result.public_id,
          asset_id: result.asset_id || "",
          resource_type: result.resource_type || "raw",
          delivery_type: "authenticated",
          format: document.format,
          filename: document.filename,
          title: document.title,
          category: document.category,
          visibility: document.visibility,
          mimeType: document.mimeType,
          size: document.size,
          uploadedAt: new Date(),
          uploadedBy: {
            id: String(req.user.id || ""),
            role: req.user.role,
            name: uploaderName,
          },
        };

        uploadedAssets.push(storedDocument);
      }

      const targetProfile = { restaurant: restaurantId, ...(profile._id && { _id: profile._id }) };
      writeStarted = true;
      const updated = await EmployeeModel.findOneAndUpdate({
        _id: employeeId,
        restaurants: restaurantId,
        restaurantProfiles: { $elemMatch: targetProfile },
      }, {
        $push: { "restaurantProfiles.$[profile].documents": { $each: uploadedAssets } },
        $inc: { __v: 1 },
      }, {
        new: true, runValidators: true,
        arrayFilters: [{ "profile.restaurant": restaurantId, ...(profile._id && { "profile._id": profile._id }) }],
      }).lean();
      if (!updated) {
        await cleanEmployeeUploadAssets(uploadedAssets);
        return res.status(404).json({ message: "Le rattachement du salarié a changé." });
      }
      metadataPersisted = true;

      const stored = findRestaurantProfile(updated, restaurantId)?.documents || [];
      const visibleDocuments =
        req.user?.role === "accountant"
          ? stored.filter((document) =>
              accountantCanReadDocument(req.user, document),
            )
          : stored;
      const responsePayload = {
        documents: serializeEmployeeDocuments(visibleDocuments),
      };

      if (req.user?.role !== "accountant") {
        responsePayload.restaurant =
          await buildDecoratedRestaurant(restaurantId).catch(() => undefined);
      }

      return res.json(responsePayload);
    } catch (err) {
      if (!metadataPersisted && uploadedAssets.length) {
        if (writeStarted) await reconcileEmployeeDocumentUpload(employeeId, restaurantId, uploadedAssets);
        else await cleanEmployeeUploadAssets(uploadedAssets);
      }

      if (err instanceof EmployeeDocumentValidationError) {
        return res.status(err.status).json({ message: err.message });
      }

      console.error("Error uploading employee documents:", err?.http_code || err?.code || "unavailable");
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// LIST DOCUMENTS
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/documents",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      setPrivateDocumentResponseHeaders(res);

      const accessContext = await getEmployeeDocumentRouteAccess(
        req,
        restaurantId,
        employeeId,
      );
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const employee = await EmployeeModel.findById(employeeId).lean();
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = (employee.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId),
      );

      const documents = profile?.documents || [];
      const visibleDocuments = documents.filter((document) => canReadEmployeeDocument(req, accessContext, document));

      return res.json({
        documents: serializeEmployeeDocuments(visibleDocuments),
      });
    } catch (err) {
      console.error("Error fetching employee documents:", err?.code || "unavailable");
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// DOWNLOAD DOCUMENT
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/documents/:public_id(*)/download",
  async (req, res) => {
    try {
      const { restaurantId, employeeId, public_id } = req.params;
      setPrivateDocumentResponseHeaders(res);

      const accessContext = await getEmployeeDocumentRouteAccess(
        req,
        restaurantId,
        employeeId,
      );
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const emp = await EmployeeModel.findById(employeeId);
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = findRestaurantProfile(emp, restaurantId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const doc = findEmployeeDocument(profile, public_id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      if (!canReadEmployeeDocument(req, accessContext, doc)) {
        if (!accessContext.isAccountant) return res.status(404).json({ message: "Document not found" });
        return res.status(403).json({ message: "Forbidden" });
      }

      const storageUrl = buildEmployeeDocumentDownloadUrl(doc, cloudinary);
      const response = await axios.get(storageUrl, {
        responseType: "stream",
        timeout: 15_000,
      });

      res.setHeader("Content-Type", getDocumentContentType(doc));
      res.setHeader(
        "Content-Disposition",
        getDocumentContentDisposition(doc.filename),
      );

      response.data.on("error", () => {
        if (!res.headersSent) {
          res.status(502).json({ message: "Document storage unavailable" });
        } else {
          res.destroy();
        }
      });
      return response.data.pipe(res);
    } catch (err) {
      console.error(
        "Error downloading employee document:",
        err?.http_code || err?.code || "unavailable",
      );
      return res.status(502).json({ message: "Document storage unavailable" });
    }
  },
);

// UPDATE DOCUMENT METADATA
router.patch(
  "/restaurants/:restaurantId/employees/:employeeId/documents/:public_id(*)",
  async (req, res) => {
    const { restaurantId, employeeId, public_id } = req.params;
    setPrivateDocumentResponseHeaders(res);
    try {
      const access = await getEmployeeDocumentRouteAccess(req, restaurantId, employeeId, { managerOnly: true });
      if (access.error) return res.status(access.error.status).json({ message: access.error.message });
      const metadata = validateEmployeeDocumentMetadata(req.body);
      const revision = req.body.revision;
      if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) {
        return res.status(400).json({ message: "La version du document est invalide." });
      }
      const target = {
        _id: employeeId,
        restaurants: restaurantId,
      };
      const documentVersion = revision > 0
        ? { revision }
        : { $or: [{ revision: 0 }, { revision: { $exists: false } }] };
      const updated = await EmployeeModel.findOneAndUpdate({
        ...target,
        restaurantProfiles: { $elemMatch: {
          restaurant: restaurantId,
          documents: { $elemMatch: { public_id, ...documentVersion } },
        } },
      }, {
        $set: {
          "restaurantProfiles.$[profile].documents.$[doc].title": metadata.title,
          "restaurantProfiles.$[profile].documents.$[doc].category": metadata.category,
          "restaurantProfiles.$[profile].documents.$[doc].visibility": metadata.visibility,
          "restaurantProfiles.$[profile].documents.$[doc].updatedAt": new Date(),
          "restaurantProfiles.$[profile].documents.$[doc].updatedBy": String(req.user.id),
        },
        $inc: { __v: 1, "restaurantProfiles.$[profile].documents.$[doc].revision": 1 },
      }, {
        new: true, runValidators: true,
        arrayFilters: [{ "profile.restaurant": restaurantId }, { "doc.public_id": public_id }],
      }).lean();
      if (!updated) {
        const exists = await EmployeeModel.exists({
          ...target,
          restaurantProfiles: { $elemMatch: { restaurant: restaurantId, "documents.public_id": public_id } },
        });
        if (!exists) return res.status(404).json({ message: "Document introuvable." });
        return res.status(409).json({ message: "Ce document a changé. Fermez cette fenêtre puis rouvrez le document." });
      }
      return res.json({ documents: serializeEmployeeDocuments(findRestaurantProfile(updated, restaurantId)?.documents) });
    } catch (error) {
      if (error instanceof EmployeeDocumentValidationError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("Error updating employee document:", error?.code || "unavailable");
      return res.status(500).json({ message: "Impossible de modifier le document." });
    }
  },
);

// DELETE DOCUMENT
router.delete(
  "/restaurants/:restaurantId/employees/:employeeId/documents/:public_id(*)",
  async (req, res) => {
    const { restaurantId, employeeId, public_id } = req.params;

    try {
      setPrivateDocumentResponseHeaders(res);
      const accessContext = await getEmployeeDocumentRouteAccess(
        req,
        restaurantId,
        employeeId,
        { managerOnly: true },
      );
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const employee = await EmployeeModel.findById(employeeId);
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = findRestaurantProfile(employee, restaurantId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const document = findEmployeeDocument(profile, public_id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const result = await mongoose.connection.transaction(async (session) => {
        const updated = await EmployeeModel.findOneAndUpdate({
          _id: employeeId,
          restaurants: restaurantId,
          restaurantProfiles: { $elemMatch: { restaurant: restaurantId, "documents.public_id": public_id } },
        }, {
          $pull: { "restaurantProfiles.$[profile].documents": { public_id } },
          $inc: { __v: 1 },
        }, { new: true, session, arrayFilters: [{ "profile.restaurant": restaurantId }] }).lean();
        if (!updated) return null;
        const jobIds = await enqueueEmployeeAssetDeletions([document], session);
        return { jobIds, documents: findRestaurantProfile(updated, restaurantId)?.documents };
      });
      if (!result) return res.status(404).json({ message: "Document introuvable." });
      const assetCleanupPending = await attemptEmployeeAssetDeletions(result.jobIds);

      const updatedRestaurant = await buildDecoratedRestaurant(restaurantId).catch(() => undefined);

      return res.json({
        restaurant: updatedRestaurant,
        documents: serializeEmployeeDocuments(result.documents),
        assetCleanupPending,
      });
    } catch (err) {
      console.error("Error deleting employee document:", err?.code || "unavailable");
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------- DELETE EMPLOYEE D'UN RESTO (multi-resto) ----------

router.delete(
  "/restaurants/:restaurantId/employees/:employeeId",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      const accessContext = await getEmployeeRouteAccess(
        req,
        restaurantId,
        employeeId,
        { managerOnly: true, requireModule: true, allowAccountantTarget: true },
      );
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const restaurantObjectId = toObjectIdOrNull(restaurantId);
      const employeeObjectId = toObjectIdOrNull(employeeId);
      if (!restaurantObjectId || !employeeObjectId) {
        return res.status(400).json({ message: "Identifiant invalide" });
      }
      const target = { _id: employeeObjectId, restaurants: restaurantObjectId };
      const jobIds = await mongoose.connection.transaction(async (session) => {
        const employee = await EmployeeModel.collection.findOne(target, {
          projection: { restaurants: 1, restaurantProfiles: 1, profilePicture: 1 },
          session,
        });
        if (!employee) return null;

        const keepAccount = employee.restaurants.some((id) => String(id) !== String(restaurantObjectId));
        const profiles = (employee.restaurantProfiles || []).filter(
          (profile) => !keepAccount || String(profile.restaurant) === String(restaurantObjectId),
        );
        const assets = profiles.flatMap((profile) => [
          ...(profile.documents || []), ...(profile.planningFiles || []),
        ]);
        if (!keepAccount && employee.profilePicture?.public_id) {
          assets.push({ ...employee.profilePicture, resource_type: "image", delivery_type: "upload" });
        }

        if (keepAccount) {
          await EmployeeModel.updateOne(target, {
            $pull: { restaurants: restaurantId, restaurantProfiles: { restaurant: restaurantId } },
            $inc: { __v: 1 },
          }, { session });
        } else {
          await EmployeeModel.deleteOne(target, { session });
        }
        await RestaurantModel.updateOne(
          { _id: restaurantId }, { $pull: { employees: employeeId } }, { session },
        );
        await TimeClockPin.deleteOne({ restaurant: restaurantId, employee: employeeId }, { session });
        await PersonnelReportInput.deleteMany(keepAccount
          ? { employee: employeeId, restaurant: restaurantId } : { employee: employeeId }, { session });
        return enqueueEmployeeAssetDeletions(assets, session);
      });
      if (!jobIds) return res.status(404).json({ message: "Employee not found" });
      const assetCleanupPending = await attemptEmployeeAssetDeletions(jobIds);

      const updatedRestaurant = await buildDecoratedRestaurant(restaurantId);

      if (!updatedRestaurant) {
        return res
          .status(404)
          .json({ message: "Restaurant not found after update" });
      }

      res.status(200).json({ restaurant: updatedRestaurant, ...(assetCleanupPending && { assetCleanupPending }) });
    } catch (error) {
      console.error("Error deleting employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------- SHIFTS (par restaurant) ----------

function planningFailure(res, error) {
  const { message, conflictType, employeeId, date } = error;
  return res.status(error.planningStatus).json({ message, conflictType, employeeId, date });
}

function broadcastPlanningChange(restaurant, employeeIds) {
  broadcastToRestaurant(restaurant, { type: "planning_changed", employeeIds: employeeIds.map(String) });
}

function planningManager(handler) {
  return async (req, res) => {
    try {
      const restaurant = toObjectIdOrNull(req.params.restaurantId);
      if (!restaurant) return res.status(400).json({ message: "Restaurant invalide." });
      const access = await getEmployeesAccessContext(req, restaurant);
      if (access.error) return res.status(access.error.status).json({ message: access.error.message });
      if (!access.isManager) return res.status(403).json({ message: "Accès au planning refusé." });
      const roster = new Set((access.restaurant.employees || []).map((employee) => String(employee._id || employee)));
      return await handler(req, res, restaurant, roster, access);
    } catch (error) {
      if (error.planningStatus) return planningFailure(res, error);
      console.error("[planning-actions]", error);
      return res.status(500).json({ message: "L’action de planning a échoué." });
    }
  };
}

const planningActionsPath = "/restaurants/:restaurantId/employees/planning";

const shiftTemplatePath = `${planningActionsPath}/templates`;
const shiftTemplateFields = "name title position startTime endTime endDayOffset breakMinutes notes";

router.get(shiftTemplatePath, planningManager(async (_req, res, restaurant) => {
  res.set("Cache-Control", "private, no-store");
  const templates = await PlanningShiftTemplate.find({ restaurant }).select(shiftTemplateFields).sort({ name: 1 }).lean();
  return res.json({ templates });
}));

router.post(shiftTemplatePath, planningManager(async (req, res, restaurant) => {
  res.set("Cache-Control", "private, no-store");
  const template = prepareShiftTemplate(req.body, normalizePlanningTitleKey);
  if (!template) return res.status(400).json({ message: "Le nom, les horaires ou les détails du modèle sont invalides." });
  try {
    await PlanningShiftTemplate.init();
    const { _id } = await PlanningShiftTemplate.create({ restaurant, nameKey: templateNameKey(template.name), ...template });
    return res.status(201).json({ template: { _id, ...template } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Un modèle porte déjà ce nom dans cet établissement." });
    throw error;
  }
}));

router.delete(`${shiftTemplatePath}/:templateId`, planningManager(async (req, res, restaurant) => {
  res.set("Cache-Control", "private, no-store");
  const _id = toObjectIdOrNull(req.params.templateId);
  if (!_id) return res.status(400).json({ message: "Identifiant de modèle invalide." });
  const { deletedCount } = await PlanningShiftTemplate.deleteOne({ _id, restaurant });
  if (!deletedCount) return res.status(404).json({ message: "Modèle introuvable dans cet établissement." });
  return res.status(204).end();
}));

router.post(`${planningActionsPath}/actions`, planningManager(async (req, res, restaurant, roster) => {
  const { updates, jobIds, replayed } = await applyPlanningAction(restaurant, roster, req.body, isLeaveShift);
  const assetCleanupPending = await attemptEmployeeAssetDeletions(jobIds);
  if (!replayed) broadcastPlanningChange(restaurant, updates.map(({ employeeId }) => employeeId));
  return res.json({ updates, replayed, assetCleanupPending });
}));

const planningFilesPath = "/restaurants/:restaurantId/employees/:employeeId/shifts/:shiftId/files";

async function authorizePlanningFiles(req, res, next) {
  try {
    const { restaurantId, employeeId, shiftId } = req.params;
    const restaurant = toObjectIdOrNull(restaurantId);
    const employee = toObjectIdOrNull(employeeId);
    const shift = toObjectIdOrNull(shiftId);
    setPrivateDocumentResponseHeaders(res);
    if (!restaurant || !employee || !shift) return res.status(400).json({ message: "Identifiant invalide" });
    const access = await getEmployeeDocumentRouteAccess(req, restaurantId, employeeId, { managerOnly: true });
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });
    const target = { _id: employee, restaurants: restaurant };
    const profile = findRestaurantProfile(await EmployeeModel.collection.findOne(target, {
      projection: getRestaurantProfileProjection(restaurant),
    }), restaurant);
    const entry = profile?.shifts?.find(({ _id }) => _id.equals(shift));
    if (!entry || isLeaveShift(entry)) return res.status(404).json({ message: "Shift de travail introuvable." });
    req.planningFiles = {
      target, restaurant, shift, entry,
      shiftMatch: { _id: shift, isLeave: { $ne: true }, leaveRequestId: null, title: entry.title ?? null, start: entry.start, end: entry.end },
      files: (profile.planningFiles || []).filter(({ shiftId: id }) => id.equals(shift)),
    };
    return next();
  } catch (error) {
    console.error("Erreur accès aux pièces jointes du planning:", error?.message);
    return res.status(500).json({ message: "Impossible d’accéder aux pièces jointes." });
  }
}

function sendPlanningFiles(res, files, status = 200) {
  return res.status(status).json({ files: files.map(({ _id, filename, size }) => ({ _id, filename, size })) });
}

router.get(planningFilesPath, authorizePlanningFiles, (req, res) => sendPlanningFiles(res, req.planningFiles.files));

router.post(planningFilesPath, authorizePlanningFiles, (req, res, next) => {
  if (req.planningFiles.files.length >= MAX_PLANNING_FILES) {
    return res.status(409).json({ message: "La limite de six pièces jointes est atteinte." });
  }
  return planningFilesUpload(req, res, (error) => {
    if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({ message: "Téléversez au maximum six fichiers de 10 Mo chacun." });
    return next();
  });
}, async (req, res) => {
  const { target, restaurant, shift, entry, shiftMatch, files } = req.planningFiles;
  const freeSlots = Array.from({ length: MAX_PLANNING_FILES }, (_, slot) => slot)
    .filter((slot) => !files.some((file) => file.slot === slot));
  if (!req.files?.length || req.files.length > freeSlots.length) {
    return res.status(400).json({ message: "Le nombre de pièces jointes dépasse la limite du shift." });
  }
  const uploaded = [];
  let writeAttempted = false;
  try {
    await assertPlanningUnlocked(restaurant, [entry], null);
    const documents = req.files.map(validateEmployeeDocumentFile);
    const folder = `Gusto_Workspace/restaurants/${restaurant}/employees/${target._id}/planning/${shift}`;
    for (const [index, document] of documents.entries()) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          resource_type: "raw", type: "authenticated", folder,
          public_id: createEmployeeDocumentPublicId(document.extension),
          overwrite: false, use_filename: false, unique_filename: false,
        }, (error, asset) => error ? reject(error) : resolve(asset));
        stream.end(document.file.buffer);
      });
      uploaded.push({
        _id: new mongoose.Types.ObjectId(), shiftId: shift, slot: freeSlots[index],
        public_id: result.public_id, resource_type: "raw", delivery_type: "authenticated",
        filename: document.filename, format: document.format, mimeType: document.mimeType, size: document.size,
      });
    }
    writeAttempted = true;
    const result = await withPlanningWrite(restaurant, [entry], (session) => EmployeeModel.updateOne({
      ...target,
      restaurantProfiles: { $elemMatch: {
        restaurant, shifts: { $elemMatch: shiftMatch },
        planningFiles: { $not: { $elemMatch: { shiftId: shift, slot: { $in: freeSlots.slice(0, uploaded.length) } } } },
      } },
    }, {
      $push: { "restaurantProfiles.$[profile].planningFiles": { $each: uploaded } },
      $inc: { __v: 1 },
    }, { runValidators: true, arrayFilters: [{ "profile.restaurant": restaurant }], session }));
    if (!result.modifiedCount) {
      await cleanEmployeeUploadAssets(uploaded);
      return res.status(409).json({ message: "Le shift ou ses pièces jointes ont changé. Actualisez la liste." });
    }
    return sendPlanningFiles(res, [...files, ...uploaded], 201);
  } catch (error) {
    if (error.planningStatus) {
      await cleanEmployeeUploadAssets(uploaded);
      return planningFailure(res, error);
    }
    if (error instanceof EmployeeDocumentValidationError) {
      return res.status(400).json({ message: "Format, contenu ou nom de fichier invalide." });
    }
    // A lost database response can follow a successful update. Check before removing its assets.
    if (writeAttempted) {
      try {
        const current = findRestaurantProfile(await EmployeeModel.collection.findOne(target, {
          projection: getRestaurantProfileProjection(restaurant),
        }), restaurant);
        const currentFiles = (current?.planningFiles || []).filter(({ shiftId: id }) => id.equals(shift));
        if (uploaded.every((asset) => currentFiles.some(({ _id }) => _id.equals(asset._id)))) {
          return sendPlanningFiles(res, currentFiles, 201);
        }
        await cleanEmployeeUploadAssets(uploaded.filter((asset) => !currentFiles.some(({ _id }) => _id.equals(asset._id))));
      } catch (readError) {
        console.error("Impossible de vérifier le téléversement:", readError?.message);
      }
    } else {
      await cleanEmployeeUploadAssets(uploaded);
    }
    console.error("Erreur téléversement planning:", error?.message);
    return res.status(502).json({ message: "Le téléversement a échoué. Actualisez la liste avant de réessayer." });
  }
});

router.get(`${planningFilesPath}/:fileId/download`, authorizePlanningFiles, async (req, res) => {
  const file = req.planningFiles.files.find(({ _id }) => String(_id) === req.params.fileId);
  if (!file) return res.status(404).json({ message: "Pièce jointe introuvable." });
  try {
    const response = await axios.get(buildEmployeeDocumentDownloadUrl(file, cloudinary), {
      responseType: "stream", timeout: 15_000,
    });
    res.setHeader("Content-Type", getDocumentContentType(file));
    res.setHeader("Content-Disposition", getDocumentContentDisposition(file.filename));
    response.data.on("error", () => res.destroy());
    return response.data.pipe(res);
  } catch (error) {
    console.error("Erreur téléchargement planning:", error?.code);
    return res.status(502).json({ message: "Le stockage des pièces jointes est indisponible." });
  }
});

router.delete(`${planningFilesPath}/:fileId`, authorizePlanningFiles, async (req, res) => {
  const { target, restaurant, shift, entry, shiftMatch, files } = req.planningFiles;
  const file = files.find(({ _id }) => String(_id) === req.params.fileId);
  if (!file) return res.status(404).json({ message: "Pièce jointe introuvable." });
  try {
    const jobIds = await withPlanningWrite(restaurant, [entry], async (session) => {
      const deleted = await EmployeeModel.updateOne({
        ...target,
        restaurantProfiles: { $elemMatch: {
          restaurant,
          shifts: { $elemMatch: shiftMatch },
          planningFiles: { $elemMatch: { _id: file._id, shiftId: shift, public_id: file.public_id } },
        } },
      }, {
        $pull: { "restaurantProfiles.$[profile].planningFiles": { _id: file._id } },
        $inc: { __v: 1 },
      }, { arrayFilters: [{ "profile.restaurant": restaurant }], session });
      if (!deleted.modifiedCount) return null;
      return enqueueEmployeeAssetDeletions([file], session);
    });
    if (!jobIds) return res.status(404).json({ message: "Pièce jointe introuvable." });
    if (await attemptEmployeeAssetDeletions(jobIds)) {
      return res.status(202).json({ assetCleanupPending: true });
    }
    return res.status(204).end();
  } catch (error) {
    if (error.planningStatus) return planningFailure(res, error);
    console.error("Erreur suppression de pièce jointe planning:", error?.message);
    return res.status(502).json({ message: "Impossible de retirer cette pièce jointe. Réessayez." });
  }
});

router.post(
  "/restaurants/:restaurantId/employees/:employeeId/shifts/batch",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const restaurant = toObjectIdOrNull(restaurantId);
      const employee = toObjectIdOrNull(employeeId);
      if (!restaurant || !employee) return res.status(400).json({ message: "Identifiant invalide" });
      const access = await getEmployeeRouteAccess(req, restaurantId, employeeId, { managerOnly: true });
      if (access.error) {
        return res.status(access.error.status).json({ message: access.error.message });
      }

      const batch = prepareShiftBatch(req.body, normalizePlanningTitleKey);
      if (batch.status) {
        const { status, conflict, attempted, ...body } = batch;
        return res.status(status).json({
          ...body,
          ...(conflict && { conflict: serializeShiftConflict(conflict), attempted: serializeShiftConflict(attempted) }),
        });
      }
      const target = { _id: employee, restaurants: restaurant };
      const projection = getRestaurantProfileProjection(restaurant);
      const readProfile = async () => findRestaurantProfile(
        await EmployeeModel.findOne(target, projection).lean(), restaurant,
      );
      const existingBatch = (profile) => (profile?.planningBatches || []).find((item) => item.key === batch.key);
      const replay = (profile, receipt) => receipt.signature === batch.signature
        ? res.json({ shifts: profile.shifts, replayed: true })
        : res.status(409).json({ message: "Cette demande a déjà été utilisée avec un autre contenu.", code: "planning_batch_reused" });
      const sendConflict = (profile) => {
        for (const entry of batch.shifts) {
          const conflict = findShiftConflict(profile, entry.start, entry.end);
          if (!conflict) continue;
          const detail = serializeShiftConflict(conflict);
          return res.status(409).json({
            message: detail.isLeave ? "Un shift de la sélection chevauche une absence." : "Un shift de la sélection chevauche un créneau existant.",
            conflictType: detail.isLeave ? "leave_overlap" : "shift_overlap",
            attempted: serializeShiftConflict(entry),
            conflict: detail,
          });
        }
        return null;
      };

      let profile = await readProfile();
      if (!profile) {
        await ensureRestaurantProfileExists(employee, restaurant);
        profile = await readProfile();
      }
      if (!profile) return res.status(404).json({ message: "Employé non trouvé" });
      const recorded = existingBatch(profile);
      if (recorded) return replay(profile, recorded);
      if (sendConflict(profile)) return;

      const entries = batch.shifts.map((shift) => ({
        ...shift,
        _id: new mongoose.Types.ObjectId(),
        source: "manual",
        requiresPlanningPublication: true,
        seriesId: batch.repeating ? batch.key : null,
      }));
      const updated = await withPlanningWrite(restaurant, entries, (session) => EmployeeModel.findOneAndUpdate(
        {
          ...target,
          restaurantProfiles: { $elemMatch: {
            restaurant,
            "planningBatches.key": { $ne: batch.key },
            shifts: noShiftOverlap(entries),
          } },
        },
        {
          $push: {
            "restaurantProfiles.$[profile].shifts": { $each: entries },
            "restaurantProfiles.$[profile].planningBatches": { key: batch.key, signature: batch.signature },
          },
          $inc: { __v: 1 },
        },
        { new: true, runValidators: true, projection, arrayFilters: [{ "profile.restaurant": restaurant }], session },
      ).lean());
      if (updated) {
        const updatedProfile = findRestaurantProfile(updated, restaurant);
        broadcastPlanningChange(restaurant, [employee]);
        return res.status(201).json({ shifts: updatedProfile.shifts, createdCount: entries.length });
      }

      profile = await readProfile();
      const concurrent = existingBatch(profile);
      if (concurrent) return replay(profile, concurrent);
      if (sendConflict(profile)) return;
      return res.status(409).json({ message: "Le planning a changé. Réessayez après vérification." });
    } catch (error) {
      if (error.planningStatus) return planningFailure(res, error);
      console.error("Erreur création groupée de shifts:", error);
      return res.status(500).json({ message: "Impossible d’enregistrer les shifts." });
    }
  },
);

// GET SHIFTS
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/shifts",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      const accessContext = await getEmployeeRouteAccess(
        req,
        restaurantId,
        employeeId,
      );
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const employee = await EmployeeModel.findById(employeeId).lean();
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employé non trouvé" });
      }

      const profile = (employee.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId),
      );

      const personal = req.query?.scope === "personal";
      if ((personal && (req.user.role !== "employee" || String(req.user.id) !== String(employeeId))) ||
          ((personal || !accessContext.isManager) && req.user.restaurantId && String(req.user.restaurantId) !== String(restaurantId))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const shifts = profile?.shifts || [];
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({
        shifts: accessContext.isManager && !personal
          ? shifts : await visiblePlanningShifts(restaurantId, employeeId, shifts),
      });
    } catch (err) {
      console.error("Erreur fetch shifts:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// POST SHIFT
router.post(
  "/restaurants/:restaurantId/employees/:employeeId/shifts",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const {
        title,
        start,
        end,
        isLeave = false,
        leaveRequestId = null,
      } = req.body;

      const accessContext = await getEmployeeRouteAccess(
        req,
        restaurantId,
        employeeId,
        { managerOnly: true },
      );
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const parsedStart = parseShiftDate(start);
      const parsedEnd = parseShiftDate(end);

      if (!parsedStart || !parsedEnd || parsedEnd <= parsedStart) {
        return res.status(400).json({ message: "Dates de shift invalides" });
      }

      const restaurantObjectId = toObjectIdOrNull(restaurantId);
      const employeeObjectId = toObjectIdOrNull(employeeId);
      const leaveRequestObjectId =
        leaveRequestId != null ? toObjectIdOrNull(leaveRequestId) : null;

      if (
        !restaurantObjectId ||
        !employeeObjectId ||
        (leaveRequestId != null && !leaveRequestObjectId)
      ) {
        return res.status(400).json({ message: "Identifiant invalide" });
      }

      const leaveShift =
        isLeave === true ||
        leaveRequestObjectId != null ||
        isLeaveShift({ title });
      const absence = resolvePlanningAbsence(req.body, {
        manualAbsence: leaveShift && !leaveRequestObjectId,
      });
      if (!absence) {
        return res
          .status(400)
          .json({ message: "Type ou durée d’absence invalide." });
      }

      await ensureRestaurantProfileExists(employeeObjectId, restaurantObjectId);

      const currentEmployee = await EmployeeModel.findOne(
        {
          _id: employeeObjectId,
          restaurants: restaurantObjectId,
        },
        getRestaurantProfileProjection(restaurantObjectId),
      );

      if (!currentEmployee) {
        return res.status(404).json({ message: "Employé non trouvé" });
      }

      const currentProfile = findRestaurantProfile(
        currentEmployee,
        restaurantId,
      );
      const work = readWorkDetails(
        req.body, null, parsedStart, parsedEnd,
        normalizePlanningTitle(currentProfile?.snapshot?.post).slice(0, 80), leaveShift,
      );
      if (!work) return res.status(400).json({ message: "Pause, poste ou notes invalides." });
      const conflict = findShiftConflict(
        currentProfile,
        parsedStart,
        parsedEnd,
      );
      if (conflict) {
        const serializedConflict = serializeShiftConflict(conflict);
        return res.status(409).json({
          message: serializedConflict.isLeave
            ? "Impossible d'ajouter ce shift car un congé existe déjà sur cette période."
            : "Impossible d'ajouter ce shift car un autre créneau existe déjà sur cette période.",
          conflictType: serializedConflict.isLeave
            ? "leave_overlap"
            : "shift_overlap",
          conflict: serializedConflict,
        });
      }

      const shiftId = new mongoose.Types.ObjectId();

      const updatedEmployee = await withPlanningWrite(restaurantObjectId, [{ start: parsedStart, end: parsedEnd }], (session) => EmployeeModel.findOneAndUpdate(
        {
          _id: employeeObjectId,
          restaurants: restaurantObjectId,
          restaurantProfiles: { $elemMatch: {
            restaurant: restaurantObjectId,
            shifts: noShiftOverlap([{ start: parsedStart, end: parsedEnd }]),
          } },
        },
        {
          $push: {
            "restaurantProfiles.$[profile].shifts": {
              _id: shiftId,
              title: leaveShift ? "" : normalizePlanningTitle(title),
              start: parsedStart,
              end: parsedEnd,
              isLeave: leaveShift,
              requiresPlanningPublication: true,
              leaveRequestId: leaveRequestObjectId,
              ...absence,
              ...work,
              source: "manual",
            },
          },
          $inc: { __v: 1 },
        },
        {
          new: true,
          arrayFilters: [{ "profile.restaurant": restaurantObjectId }],
          projection: getRestaurantProfileProjection(restaurantObjectId),
          runValidators: true,
          session,
        },
      ));

      if (!updatedEmployee) {
        return res.status(409).json({ message: "Le planning a changé. Réessayez après vérification." });
      }

      const profile = findRestaurantProfile(updatedEmployee, restaurantId);
      const created =
        profile?.shifts?.id?.(shiftId) ||
        profile?.shifts?.find((shift) => String(shift._id) === String(shiftId));
      broadcastPlanningChange(restaurantObjectId, [employeeObjectId]);

      return res.status(201).json({
        shift: created || null,
        shifts: profile?.shifts || [],
      });
    } catch (err) {
      if (err.planningStatus) return planningFailure(res, err);
      console.error("Erreur création shift:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// PUT SHIFT
router.put(
  "/restaurants/:restaurantId/employees/:employeeId/shifts/:shiftId",
  async (req, res) => {
    try {
      const { restaurantId, employeeId, shiftId } = req.params;
      const { title, start, end, isLeave, leaveRequestId } = req.body;

      const accessContext = await getEmployeeRouteAccess(
        req,
        restaurantId,
        employeeId,
        { managerOnly: true },
      );
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const restaurantObjectId = toObjectIdOrNull(restaurantId);
      const employeeObjectId = toObjectIdOrNull(employeeId);
      const shiftObjectId = toObjectIdOrNull(shiftId);
      const leaveRequestObjectId =
        leaveRequestId !== undefined && leaveRequestId !== null
          ? toObjectIdOrNull(leaveRequestId)
          : null;

      if (
        !restaurantObjectId ||
        !employeeObjectId ||
        !shiftObjectId ||
        (leaveRequestId !== undefined &&
          leaveRequestId !== null &&
          !leaveRequestObjectId)
      ) {
        return res.status(400).json({ message: "Identifiant invalide" });
      }

      const currentEmployee = await EmployeeModel.findOne(
        {
          _id: employeeObjectId,
          restaurants: restaurantObjectId,
          restaurantProfiles: {
            $elemMatch: {
              restaurant: restaurantObjectId,
              "shifts._id": shiftObjectId,
            },
          },
        },
        getRestaurantProfileProjection(restaurantObjectId),
      );

      if (!currentEmployee) {
        return res.status(404).json({ message: "Shift non trouvé" });
      }

      const currentProfile = findRestaurantProfile(
        currentEmployee,
        restaurantId,
      );
      const currentShift = currentProfile?.shifts?.id?.(shiftObjectId);

      if (!currentShift) {
        return res.status(404).json({ message: "Shift non trouvé" });
      }

      const nextStart =
        start !== undefined
          ? parseShiftDate(start)
          : new Date(currentShift.start);
      if (!nextStart) {
        return res.status(400).json({ message: "Date de début invalide" });
      }

      const nextEnd =
        end !== undefined ? parseShiftDate(end) : new Date(currentShift.end);
      if (!nextEnd) {
        return res.status(400).json({ message: "Date de fin invalide" });
      }

      if (nextEnd <= nextStart) {
        return res.status(400).json({ message: "Dates de shift invalides" });
      }

      const nextLeaveRequestId =
        leaveRequestId !== undefined
          ? leaveRequestObjectId
          : currentShift.leaveRequestId || null;
      const nextIsLeave =
        isLeave !== undefined ? isLeave === true : currentShift.isLeave;
      const nextTitle =
        title !== undefined
          ? normalizePlanningTitle(title)
          : normalizePlanningTitle(currentShift.title);
      const leaveShift = isLeaveShift({
        title: nextTitle,
        isLeave: nextIsLeave,
        leaveRequestId: nextLeaveRequestId,
      });
      const datesChanged = +nextStart !== +new Date(currentShift.start) ||
        +nextEnd !== +new Date(currentShift.end);
      const absence = resolvePlanningAbsence(req.body, {
        manualAbsence: leaveShift && !nextLeaveRequestId,
        currentShift,
        datesChanged,
      });
      if (!absence) {
        return res
          .status(400)
          .json({ message: "Type ou durée d’absence invalide." });
      }
      const work = readWorkDetails(
        req.body, currentShift, nextStart, nextEnd,
        normalizePlanningTitle(currentProfile?.snapshot?.post).slice(0, 80), leaveShift,
      );
      if (!work) return res.status(400).json({ message: "Pause, poste ou notes invalides." });

      const checkOverlap = datesChanged || leaveShift !== isLeaveShift(currentShift);
      const overlap = checkOverlap && findShiftConflict(currentProfile, nextStart, nextEnd, {
        excludeShiftId: shiftObjectId,
      });
      if (overlap) {
        const serializedConflict = serializeShiftConflict(overlap);
        return res.status(409).json({
          message: serializedConflict.isLeave
            ? "Impossible de modifier ce shift car un congé existe déjà sur cette période."
            : "Impossible de modifier ce shift car un autre créneau existe déjà sur cette période.",
          conflictType: serializedConflict.isLeave
            ? "leave_overlap"
            : "shift_overlap",
          conflict: serializedConflict,
        });
      }

      const updatedEmployee = await withPlanningWrite(restaurantObjectId,
        [currentShift, { start: nextStart, end: nextEnd }], (session) => EmployeeModel.findOneAndUpdate(
        {
          _id: employeeObjectId,
          restaurants: restaurantObjectId,
          __v: currentEmployee.__v ?? { $exists: false },
          restaurantProfiles: {
            $elemMatch: {
              restaurant: restaurantObjectId,
              "shifts._id": shiftObjectId,
              ...(checkOverlap && { shifts: noShiftOverlap([{ start: nextStart, end: nextEnd }], shiftObjectId) }),
              ...(leaveShift && { "planningFiles.shiftId": { $ne: shiftObjectId } }),
            },
          },
        },
        {
          $set: {
            "restaurantProfiles.$[profile].shifts.$[shift].title": leaveShift
              ? ""
              : nextTitle,
            "restaurantProfiles.$[profile].shifts.$[shift].start": nextStart,
            "restaurantProfiles.$[profile].shifts.$[shift].end": nextEnd,
            "restaurantProfiles.$[profile].shifts.$[shift].isLeave": leaveShift,
            "restaurantProfiles.$[profile].shifts.$[shift].leaveRequestId":
              nextLeaveRequestId,
            "restaurantProfiles.$[profile].shifts.$[shift].absenceType":
              absence.absenceType,
            "restaurantProfiles.$[profile].shifts.$[shift].absenceDuration":
              absence.absenceDuration,
            "restaurantProfiles.$[profile].shifts.$[shift].breakMinutes":
              work.breakMinutes,
            "restaurantProfiles.$[profile].shifts.$[shift].position":
              work.position,
            "restaurantProfiles.$[profile].shifts.$[shift].notes":
              work.notes,
            ...(planningDayKey(new Date(currentShift.start)) !== planningDayKey(nextStart) && {
              "restaurantProfiles.$[profile].shifts.$[shift].requiresPlanningPublication": true,
            }),
            ...(leaveShift && { "restaurantProfiles.$[profile].shifts.$[shift].seriesId": null }),
          },
          $inc: { __v: 1 },
        },
        {
          arrayFilters: [
            { "profile.restaurant": restaurantObjectId },
            { "shift._id": shiftObjectId },
          ],
          new: true,
          projection: getRestaurantProfileProjection(restaurantObjectId),
          runValidators: true,
          session,
        },
      ));

      if (!updatedEmployee) {
        return res.status(409).json({
          message: leaveShift && !isLeaveShift(currentShift)
            ? "Retirez les pièces jointes avant de convertir ce shift en absence, puis vérifiez que le planning est à jour."
            : "Le planning a changé. Réessayez après vérification.",
        });
      }

      const profile = findRestaurantProfile(updatedEmployee, restaurantId);
      const shift = profile?.shifts?.id?.(shiftObjectId);
      broadcastPlanningChange(restaurantObjectId, [employeeObjectId]);

      return res.json({ shift: shift || null, shifts: profile?.shifts || [] });
    } catch (err) {
      if (err.planningStatus) return planningFailure(res, err);
      console.error("Erreur modification shift:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// DELETE SHIFT
router.delete(
  "/restaurants/:restaurantId/employees/:employeeId/shifts/:shiftId",
  async (req, res) => {
    try {
      const { restaurantId, employeeId, shiftId } = req.params;

      const accessContext = await getEmployeeRouteAccess(
        req,
        restaurantId,
        employeeId,
        { managerOnly: true },
      );
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const restaurantObjectId = toObjectIdOrNull(restaurantId);
      const employeeObjectId = toObjectIdOrNull(employeeId);
      const shiftObjectId = toObjectIdOrNull(shiftId);

      if (!restaurantObjectId || !employeeObjectId || !shiftObjectId) {
        return res.status(400).json({ message: "Identifiant invalide" });
      }

      const removed = await mongoose.connection.transaction(async (session) => {
        await planningFence(restaurantObjectId, session);
        const previousEmployee = await EmployeeModel.collection.findOneAndUpdate(
          {
            _id: employeeObjectId,
            restaurants: restaurantObjectId,
            restaurantProfiles: {
              $elemMatch: {
                restaurant: restaurantObjectId,
                "shifts._id": shiftObjectId,
              },
            },
          },
          {
            $pull: {
              "restaurantProfiles.$[profile].shifts": { _id: shiftObjectId },
              "restaurantProfiles.$[profile].planningFiles": { shiftId: shiftObjectId },
            },
            $inc: { __v: 1 },
          },
          {
            arrayFilters: [{ "profile.restaurant": restaurantObjectId }],
            projection: getRestaurantProfileProjection(restaurantObjectId),
            returnDocument: "before",
            session,
          },
        );
        if (!previousEmployee) return null;
        const profile = findRestaurantProfile(previousEmployee, restaurantId);
        await assertPlanningUnlocked(restaurantObjectId, profile.shifts.filter(({ _id }) => _id.equals(shiftObjectId)), session);
        const assets = (profile.planningFiles || []).filter(({ shiftId: id }) => id?.equals(shiftObjectId));
        return {
          shifts: profile.shifts.filter(({ _id }) => !_id.equals(shiftObjectId)),
          jobIds: await enqueueEmployeeAssetDeletions(assets, session),
        };
      });

      if (!removed) {
        return res.status(404).json({ message: "Shift non trouvé" });
      }

      const assetCleanupPending = await attemptEmployeeAssetDeletions(removed.jobIds);
      broadcastPlanningChange(restaurantObjectId, [employeeObjectId]);
      return res.json({ shifts: removed.shifts, ...(assetCleanupPending && { assetCleanupPending }) });
    } catch (err) {
      if (err.planningStatus) return planningFailure(res, err);
      console.error("Erreur suppression shift:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.post(
  "/restaurants/:restaurantId/employees/planning/export/pdf",
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.from || ""))
        ? String(req.body.from)
        : null;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.to || ""))
        ? String(req.body.to)
        : null;
      const bounds = from && to ? getDateRangeBounds(from, to) : null;

      if (!bounds) {
        return res.status(400).json({
          message: "Les dates de debut et de fin sont invalides.",
        });
      }

      const accessContext = await getEmployeesAccessContext(req, restaurantId);
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
        ...workforceAccountFilter(),
      }).lean();

      if (!employees.length) {
        return res.status(404).json({ message: "Employees not found" });
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

      const payload = orderedEmployees.map((employee) =>
        buildPlanningExportEmployee(employee, restaurantId, bounds),
      );

      const pdfBuffer = await buildPlanningExportPdf({
        restaurantName: accessContext.restaurant?.name || "Restaurant",
        startDate: from,
        endDate: to,
        employees: payload,
      });

      const safeRestaurantName = toFilenamePart(accessContext.restaurant?.name);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="planning-${safeRestaurantName}-${from}-au-${to}.pdf"`,
      );

      return res.send(pdfBuffer);
    } catch (error) {
      console.error("Error exporting planning pdf:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.post(
  "/restaurants/:restaurantId/employees/planning/export/excel",
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.from || ""))
        ? String(req.body.from)
        : null;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.to || ""))
        ? String(req.body.to)
        : null;
      const bounds = from && to ? getDateRangeBounds(from, to) : null;

      if (!bounds) {
        return res.status(400).json({
          message: "Les dates de debut et de fin sont invalides.",
        });
      }

      const accessContext = await getEmployeesAccessContext(req, restaurantId);
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
        ...workforceAccountFilter(),
      }).lean();

      if (!employees.length) {
        return res.status(404).json({ message: "Employees not found" });
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

      const payload = orderedEmployees.map((employee) =>
        buildPlanningExportEmployee(employee, restaurantId, bounds),
      );

      const workbookBuffer = buildPlanningWorkbookBuffer({
        restaurantName: accessContext.restaurant?.name || "Restaurant",
        startDate: from,
        endDate: to,
        employees: payload,
      });

      const safeRestaurantName = toFilenamePart(accessContext.restaurant?.name);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="planning-${safeRestaurantName}-${from}-au-${to}.xlsx"`,
      );

      return res.send(workbookBuffer);
    } catch (error) {
      console.error("Error exporting planning workbook:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

async function planningRecipients(restaurant, roster) {
  const employees = await EmployeeModel.find({
    _id: { $in: [...roster] }, restaurants: restaurant, ...workforceAccountFilter(),
  }).select("firstname lastname email post restaurantProfiles").lean();
  return employees.map((employee) => {
    const snapshot = findRestaurantProfile(employee, restaurant)?.snapshot || {};
    const firstName = snapshot.firstname || employee.firstname || "";
    const name = `${firstName} ${snapshot.lastname || employee.lastname || ""}`.trim() || "Salarié";
    const email = normalizeEmail(snapshot.email || employee.email);
    return { employeeId: String(employee._id), name, firstName, email, emailAvailable: isValidEmail(email), employee };
  }).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function publicationAuthor(req) {
  return {
    name: [req.user.firstname, req.user.lastname].filter(Boolean).join(" ") || "Responsable",
    id: String(req.user.id), role: req.user.role,
  };
}

router.get(`${planningActionsPath}/publication`, planningManager(async (req, res, restaurant, roster) => {
  const { from, to } = req.query;
  periodDates(from, to);
  const recipients = await planningRecipients(restaurant, roster);
  const state = await getPlanningState(restaurant, from, to, recipients.map(({ employeeId }) => employeeId));
  return res.json({
    ...state, recipients: recipients.map(({ employeeId, name, emailAvailable }) => ({ employeeId, name, emailAvailable })),
  });
}));

router.post(`${planningActionsPath}/publication`, planningManager(async (req, res, restaurant, roster, access) => {
  const { employeeIds, from, to } = req.body || {};
  if (!Array.isArray(employeeIds) || !employeeIds.length || employeeIds.some((id) => typeof id !== "string" || !roster.has(id))) {
    throw planningError(400, "Sélectionnez les salariés du restaurant actif.");
  }
  const ids = new Set(employeeIds);
  const recipients = (await planningRecipients(restaurant, roster)).filter(({ employeeId }) => ids.has(employeeId));
  if (recipients.length !== ids.size) throw planningError(409, "La liste des salariés a changé.");
  const { publication, notifications } = await publishPlanning(restaurant, req.body, publicationAuthor(req), recipients);
  broadcastToRestaurant(restaurant, { type: "planning_state_changed" });
  broadcastPlanningChange(restaurant, [...ids]);
  for (const notification of notifications) {
    const record = notification.toObject();
    broadcastToRestaurant(restaurant, {
      type: "notification_created", recipientEmployeeId: record.recipientEmployeeId, notification: record,
    });
  }

  const bounds = getDateRangeBounds(from, to);
  const restaurantName = access.restaurant.name || "Restaurant";
  const format = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PLANNING_TIME_ZONE, day: "2-digit", month: "long", year: "numeric",
  });
  const formattedFrom = format.format(bounds.start);
  const formattedTo = format.format(bounds.end);
  try {
    const result = await deliverPlanningEmails(publication, async (employeeId) => {
      if (!await RestaurantModel.exists({ _id: restaurant, employees: employeeId })) return false;
      const [recipient] = await planningRecipients(restaurant, [employeeId]);
      if (!recipient?.emailAvailable) return false;
      const profile = findRestaurantProfile(recipient.employee, restaurant);
      if (profile) profile.shifts = await visiblePlanningShifts(restaurant, employeeId, profile.shifts);
      await sendTransactionalEmail({
        to: [{ email: recipient.email, name: recipient.name }],
        subject: `Votre planning du ${formattedFrom} au ${formattedTo} - ${restaurantName}`,
        htmlContent: buildPlanningEmailHtml({
          restaurantName, employeeName: recipient.name, firstName: recipient.firstName,
          formattedFrom, formattedTo, employeePlanning: buildPlanningExportEmployee(recipient.employee, restaurant, bounds), bounds,
        }),
      });
      return true;
    });
    return res.json({ publication: result });
  } catch (error) {
    console.error("[planning-publication] Résultats e-mail indisponibles", error?.message);
    return res.json({
      publication: {
        from, to, notify: publication.notify, email: publication.email,
        recipients: publication.recipients.map(({ employeeId, name }) => ({ employeeId, name, emailStatus: "unknown" })),
      },
    });
  }
}));

router.put(`${planningActionsPath}/lock`, planningManager(async (req, res, restaurant) => {
  await setPlanningLock(restaurant, req.body || {}, publicationAuthor(req).id);
  broadcastToRestaurant(restaurant, { type: "planning_state_changed" });
  return res.json({ locked: req.body.locked });
}));

// ---------- DEMANDES DE CONGÉS (par restaurant) ----------

const leaveRequestPath = "/restaurants/:restaurantId/employees/:employeeId/leave-requests";

async function leaveRequestAccess(req, { managerOnly = false } = {}) {
  const { restaurantId, employeeId, reqId } = req.params;
  if (![restaurantId, employeeId, ...(reqId ? [reqId] : [])].every(mongoose.isValidObjectId)) {
    return { error: { status: 400, message: "Identifiant invalide." } };
  }
  const access = await getEmployeeRouteAccess(req, restaurantId, employeeId, { managerOnly, requireModule: true });
  if (!access.error && !(access.restaurant.employees || []).some((item) => String(item._id || item) === String(employeeId))) {
    return { error: { status: 404, message: "Salarié introuvable dans ce restaurant." } };
  }
  return access;
}

function leaveConflictKey(shift) {
  return [String(shift._id), +new Date(shift.start), +new Date(shift.end)].join(":");
}

// CREATE LEAVE-REQUEST
router.post(
  leaveRequestPath,
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const accessContext = await leaveRequestAccess(req);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const candidate = readLeaveRequest(req.body || {});
      if (!candidate) return res.status(400).json({ message: "Vérifiez les dates, les horaires et le motif de la demande." });

      let emp = await EmployeeModel.findById(employeeId);
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      emp = await ensureEmployeeProfileForEdit(emp, restaurantId);
      const profile = findRestaurantProfile(emp, restaurantId);
      if (!profile || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(409).json({ message: "Le rattachement du salarié a changé." });
      }
      const activeConflict = findActiveLeaveRequestConflict(
        profile,
        candidate.start,
        candidate.end,
      );
      if (activeConflict) {
        return res.status(409).json({
          message: "Une demande de congé existe déjà sur cette période.",
        });
      }

      profile.leaveRequests.push({
        ...candidate,
        createdAt: new Date(),
        status: "pending",
      });
      await savePlanningEmployee(emp);

      const last = profile.leaveRequests[profile.leaveRequests.length - 1];

      // Notifie le restaurant concerné
      broadcastToRestaurant(String(restaurantId), {
        type: "leave_request_created",
        employeeId: String(emp._id),
        restaurantId: String(restaurantId),
        leaveRequest: last,
      });

      await createAndBroadcastNotification({
        restaurantId: String(restaurantId),
        module: "employees",
        type: "leave_request_created",
        dedupeKey: `leave:created:${last._id}`,
        data: {
          restaurantId,
          employeeName: `${emp?.firstname || ""} ${emp?.lastname || ""}`.trim(),
          employeeId: String(emp._id),
          leaveRequestId: String(last._id),
          start: last?.start,
          end: last?.end,
          type: last?.type,
          status: last?.status,
        },
      }).catch(() => console.error("Notification de demande de congé indisponible"));

      sendLeaveRequestOwnerEmail({
        restaurantId,
        employee: emp,
        leaveRequest: last,
      }).catch((error) =>
        console.error("Erreur mail demande de congé propriétaire :", error),
      );

      return res.status(201).json(profile.leaveRequests);
    } catch (err) {
      if (err instanceof mongoose.Error.VersionError || err instanceof mongoose.Error.DocumentNotFoundError) {
        return res.status(409).json({ message: "Les demandes ont changé. Actualisez avant de réessayer." });
      }
      console.error("Erreur création leaveRequest:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// LIST LEAVE-REQUESTS
router.get(
  leaveRequestPath,
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      const accessContext = await leaveRequestAccess(req);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const emp = await EmployeeModel.findById(employeeId).lean();
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = (emp.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId),
      );

      return res.json(profile?.leaveRequests || []);
    } catch (err) {
      console.error("Erreur list leaveRequests:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.get(`${leaveRequestPath}/:reqId/conflicts`, async (req, res) => {
  try {
    const access = await leaveRequestAccess(req, { managerOnly: true });
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });
    const { restaurantId, employeeId, reqId } = req.params;
    const employee = await EmployeeModel.findById(employeeId).lean();
    const profile = employee && employeeWorksInRestaurant(employee, restaurantId) && findRestaurantProfile(employee, restaurantId);
    const request = profile?.leaveRequests?.find((item) => String(item._id) === reqId);
    if (!request) return res.status(404).json({ message: "Demande introuvable." });
    if (request.status !== "pending") return res.json({ conflictShifts: [], locked: null });
    const shifts = findShiftConflicts(profile, request.start, request.end, { excludeLeaveRequestId: request._id });
    let locked = null;
    try {
      await assertPlanningUnlocked(restaurantId, [request, ...shifts], null);
    } catch (error) {
      if (error.planningStatus !== 423) throw error;
      locked = { date: error.date, message: error.message };
    }
    return res.json({ conflictShifts: shifts.map(serializeShiftConflict), locked });
  } catch {
    return res.status(500).json({ message: "Impossible de vérifier les conflits du planning." });
  }
});

// UPDATE LEAVE-REQUEST STATUS
router.put(
  `${leaveRequestPath}/:reqId`,
  async (req, res) => {
    try {
      const { restaurantId, employeeId, reqId } = req.params;
      const { status, resolveConflict, confirmedConflicts, decisionNote } = req.body || {};
      if (status !== undefined && !["pending", "approved", "rejected", "canceled"].includes(status)) {
        return res.status(400).json({ message: "status invalide" });
      }
      if (decisionNote != null && (typeof decisionNote !== "string" || decisionNote.length > 1000)) {
        return res.status(400).json({ message: "Le commentaire de décision doit contenir au plus 1000 caractères." });
      }

      const accessContext = await leaveRequestAccess(req);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const emp = await EmployeeModel.findById(employeeId).select("+restaurantProfiles.planningFiles");
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = findRestaurantProfile(emp, restaurantId);
      const lr = profile?.leaveRequests?.id(reqId);
      if (!lr) return res.status(404).json({ message: "Request not found" });

      const isSelf =
        String(accessContext.currentEmployee?._id || "") === String(employeeId);

      if (!accessContext.isManager && (!isSelf || (status !== undefined && status !== "canceled"))) {
        return res.status(403).json({ message: "Action non autorisée." });
      }

      if (status === lr.status) return res.json({ leaveRequest: lr });
      const before = lr.status;
      const editing = status === undefined;
      if (editing ? before !== "pending" : !canTransitionLeave(before, status, accessContext.isManager)) {
        return res.status(409).json({ message: "Cette demande ne peut plus être modifiée de cette façon." });
      }

      if (editing) {
        const candidate = readLeaveRequest(req.body || {});
        if (!candidate) return res.status(400).json({ message: "Vérifiez les dates, les horaires et le motif de la demande." });
        if (findActiveLeaveRequestConflict(profile, candidate.start, candidate.end, { excludeReqId: lr._id })) {
          return res.status(409).json({ message: "Une demande de congé existe déjà sur cette période." });
        }
        lr.set(candidate);
      }

      let filesToRemove = [];
      const touchedShifts = profile.shifts.filter((shift) => String(shift.leaveRequestId) === String(lr._id));
      if (status === "approved") {
        touchedShifts.push({ start: lr.start, end: lr.end });
        const overlappingShifts = findShiftConflicts(
          profile,
          new Date(lr.start),
          new Date(lr.end),
          {
            excludeLeaveRequestId: lr._id,
          },
        );

        if (overlappingShifts.length) {
          const serializedConflicts = overlappingShifts.map(
            serializeShiftConflict,
          );
          const canResolveByDeletion = serializedConflicts.every(
            (shift) => shift.canDelete === true,
          );

          const unchanged = confirmedConflicts === undefined || (Array.isArray(confirmedConflicts) &&
            JSON.stringify([...confirmedConflicts].sort()) === JSON.stringify(overlappingShifts.map(leaveConflictKey).sort()));
          if (resolveConflict === "delete_conflicting_shifts" && unchanged) {
            if (!canResolveByDeletion) {
              return res.status(409).json({
                message:
                  "Impossible d'approuver ce congé car il chevauche une absence ou un créneau non supprimable.",
                conflictType: "shift_overlap",
                canResolveByDeletion: false,
                conflictShifts: serializedConflicts,
              });
            }

            const conflictingShiftIds = new Set(
              overlappingShifts.map((shift) => String(shift?._id)),
            );
            touchedShifts.push(...overlappingShifts);
            profile.shifts = (profile.shifts || []).filter(
              (shift) => !conflictingShiftIds.has(String(shift?._id)),
            );
            filesToRemove = (profile.planningFiles || []).filter(
              (file) => conflictingShiftIds.has(String(file.shiftId)),
            );
            if (filesToRemove.length) {
              profile.planningFiles = profile.planningFiles.filter(
                (file) => !conflictingShiftIds.has(String(file.shiftId)),
              );
            }
          } else {
            return res.status(409).json({
              message:
                "Impossible d'approuver ce congé car il chevauche un shift existant.",
              conflictType: "shift_overlap",
              canResolveByDeletion,
              conflictShifts: serializedConflicts,
            });
          }
        }
      }

      if (!editing) lr.status = status;
      const author = publicationAuthor(req);
      lr.history ??= [];
      lr.history.push({
        action: editing ? "edited" : "decision", from: before, to: lr.status, at: new Date(),
        actor: { id: author.id, name: author.name, role: author.role },
        ...(decisionNote?.trim() && { note: decisionNote.trim() }),
      });

      if (status === "approved") {
        const already = profile.shifts.some(
          (s) => String(s.leaveRequestId) === String(lr._id),
        );
        if (!already) {
          profile.shifts.push({
            title: "",
            start: lr.start,
            end: lr.end,
            isLeave: true,
            absenceType: lr.absenceType,
            absenceDuration: lr.type,
            requiresPlanningPublication: true,
            leaveRequestId: lr._id,
            source: "leave_request",
          });
        }
      }

      if (status === "rejected" || status === "canceled") {
        profile.shifts = profile.shifts.filter(
          (s) => String(s.leaveRequestId) !== String(lr._id),
        );
      }

      let assetCleanupPending = false;
      if (touchedShifts.length) {
        const jobIds = await withPlanningWrite(restaurantId, touchedShifts, async (session) => {
          await savePlanningEmployee(emp, session);
          return filesToRemove.length ? enqueueEmployeeAssetDeletions(filesToRemove, session) : [];
        });
        assetCleanupPending = await attemptEmployeeAssetDeletions(jobIds);
        broadcastPlanningChange(restaurantId, [employeeId]);
      } else {
        await savePlanningEmployee(emp);
      }
      broadcastToRestaurant(String(restaurantId), {
        type: "leave_request_updated",
        employeeId: String(emp._id),
        leaveRequest: lr?.toObject ? lr.toObject() : { ...lr },
        shifts: profile.shifts || [],
      });
      if (["approved", "rejected"].includes(status)) {
        await createAndBroadcastNotification({
          restaurantId, module: "my_planning", type: "leave_request_decided",
          recipientEmployeeId: employeeId, dedupeKey: `leave:${status}:${reqId}`,
          data: { status, leaveRequestId: reqId },
        }).catch(() => console.error("Notification de décision de congé indisponible"));
      }
      return res.json({
        leaveRequest: lr,
        shifts: accessContext.isManager ? profile.shifts : await visiblePlanningShifts(restaurantId, employeeId, profile.shifts),
        ...(assetCleanupPending && { assetCleanupPending }),
      });
    } catch (error) {
      if (error.planningStatus) return planningFailure(res, error);
      if (error instanceof mongoose.Error.VersionError || error instanceof mongoose.Error.DocumentNotFoundError) {
        return res.status(409).json({ message: "Le planning a changé. Vérifiez les conflits avant de réessayer." });
      }
      console.error("Erreur update leave request:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// DELETE LEAVE-REQUEST
router.delete(
  `${leaveRequestPath}/:reqId`,
  async (req, res) => {
    try {
      const { restaurantId, employeeId, reqId } = req.params;

      const accessContext = await leaveRequestAccess(req);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      const emp = await EmployeeModel.findById(employeeId);
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = findRestaurantProfile(emp, restaurantId);
      const lr = profile?.leaveRequests?.id(reqId);
      if (!lr) return res.status(404).json({ message: "Request not found" });

      const isSelf =
        String(accessContext.currentEmployee?._id || "") === String(employeeId);

      if (!accessContext.isManager && (!isSelf || lr.status !== "pending")) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const removedShifts = profile.shifts.filter((s) => String(s.leaveRequestId) === String(reqId));
      profile.shifts = profile.shifts.filter(
        (s) => String(s.leaveRequestId) !== String(reqId),
      );

      lr.deleteOne();
      if (removedShifts.length) {
        await withPlanningWrite(restaurantId, removedShifts, (session) => savePlanningEmployee(emp, session));
        broadcastPlanningChange(restaurantId, [employeeId]);
      } else await savePlanningEmployee(emp);
      broadcastToRestaurant(String(restaurantId), {
        type: "leave_request_deleted",
        employeeId: String(emp._id),
        leaveRequestId: String(reqId),
        shifts: profile.shifts || [],
      });

      return res.json({
        leaveRequests: profile.leaveRequests,
        shifts: accessContext.isManager ? profile.shifts : await visiblePlanningShifts(restaurantId, employeeId, profile.shifts),
      });
    } catch (error) {
      if (error.planningStatus) return planningFailure(res, error);
      if (error instanceof mongoose.Error.VersionError || error instanceof mongoose.Error.DocumentNotFoundError) {
        return res.status(409).json({ message: "Le planning a changé. Réessayez après vérification." });
      }
      console.error("Erreur delete leave request:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------- EMPLOYEE ME / UPDATE DATA / PASSWORD ----------

router.get("/accountants/me", authenticateToken, async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    if (req.user?.role !== "accountant") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const accountant = await EmployeeModel.findById(req.user.id).lean();
    if (!accountant || !isAccountant(accountant)) {
      return res.status(404).json({ message: "Accountant not found" });
    }

    const linkedRestaurantIds = (accountant.restaurants || []).map((id) =>
      String(id),
    );
    const restaurants = await RestaurantModel.find({
      _id: { $in: linkedRestaurantIds },
      employees: accountant._id,
    })
      .select("_id name")
      .lean();

    const selectedRestaurantId = String(req.user.restaurantId || "");
    const restaurant = await RestaurantModel.findOne({
      _id: selectedRestaurantId,
      employees: accountant._id,
    })
      .select("_id name employees")
      .lean();

    if (!restaurant) {
      return res.status(403).json({ message: "Restaurant selection required" });
    }

    const employees = await EmployeeModel.find({
      _id: { $in: restaurant.employees || [] },
      restaurants: restaurant._id,
      "restaurantProfiles.restaurant": restaurant._id,
      ...workforceAccountFilter(),
    })
      .select(
        "_id firstname lastname post profilePicture restaurantProfiles.restaurant restaurantProfiles.snapshot.firstname restaurantProfiles.snapshot.lastname restaurantProfiles.snapshot.post",
      )
      .lean();

    const limitedEmployees = employees.map((employee) =>
      serializeEmployeeForAccountant(employee, restaurant._id),
    );

    return res.json({
      accountant: {
        _id: accountant._id,
        accountType: "accountant",
        firstname: accountant.firstname,
        lastname: accountant.lastname,
        email: accountant.email,
        phone: accountant.phone,
      },
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        employees: limitedEmployees,
      },
      restaurants,
    });
  } catch (error) {
    console.error("Error fetching accountant session:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/employees/me", authenticateToken, async (req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    if (req.user.role !== "employee") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const emp = await EmployeeModel.findById(req.user.id);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    // 1) Tous les restos où il travaille
    const restaurantIds = Array.isArray(emp.restaurants) ? emp.restaurants : [];
    const restaurants = await RestaurantModel.find({
      _id: { $in: restaurantIds },
      employees: emp._id,
    })
      .select("name _id")
      .lean();

    // 2) Resto courant (via token) + profil courant
    const restaurantIdFromToken = req.user.restaurantId;
    let restaurant = null;
    let currentProfile = null;

    const tokenRestaurantIsCurrent = restaurants.some(
      (candidate) =>
        String(candidate?._id || candidate) === String(restaurantIdFromToken),
    );

    if (restaurantIdFromToken && tokenRestaurantIsCurrent) {
      await refreshGiftCardLifecycle(restaurantIdFromToken);
      restaurant = await RestaurantModel.findById(restaurantIdFromToken)
        .populate("owner_id", "firstname")
        .populate("menus");

      currentProfile = findRestaurantProfile(emp, restaurantIdFromToken);
    }

    // 3) Fallback : si token n’a pas de restaurantId, on prend le premier
    if (!restaurant && restaurants.length > 0) {
      const firstId = restaurants[0]._id;
      await refreshGiftCardLifecycle(firstId);
      restaurant = await RestaurantModel.findById(firstId)
        .populate("owner_id", "firstname")
        .populate("menus");

      currentProfile = findRestaurantProfile(emp, firstId);
    }

    let decoratedRestaurant = null;
    let decoratedEmployee = { ...emp.toObject(), restaurantProfiles: [], shifts: [] };

    if (restaurant?._id) {
      const coworkerIds = Array.isArray(restaurant.employees)
        ? restaurant.employees
        : [];
      const coworkers = await EmployeeModel.find({
        _id: { $in: coworkerIds },
        restaurants: restaurant._id,
        ...workforceAccountFilter(),
      })
        .select(
          "firstname lastname post profilePicture restaurantProfiles restaurants",
        )
        .lean();

      const canManageEmployees = restaurant.options?.employees === true && currentProfile?.options?.employees === true;

      decoratedRestaurant = decorateRestaurantEmployees(
        restaurant,
        restaurant._id,
        coworkers,
        { safe: !canManageEmployees, includeDocuments: false },
      );
      decoratedEmployee =
        decorateEmployeeForRestaurant(emp, restaurant._id, {
          includeDocuments: false,
        }) || decoratedEmployee;
      currentProfile = findRestaurantProfile(decoratedEmployee, restaurant._id);
      const visible = await visiblePlanningShifts(restaurant._id, emp._id, decoratedEmployee.shifts);
      decoratedEmployee.shifts = visible;
      if (currentProfile) currentProfile.shifts = visible;
      if (!canManageEmployees) {
        decoratedRestaurant.employees = decoratedRestaurant.employees.map((employee) =>
          String(employee._id) === String(emp._id) ? decoratedEmployee : publicEmployeeDirectoryEntry(employee));
      }
    }

    return res.json({
      employee: decoratedEmployee,
      restaurant: decoratedRestaurant,
      currentProfile,
      restaurants,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put(
  "/employees/update-data",
  authenticateToken,
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      if (req.user.role !== "employee") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { firstname, lastname, email, phone, removeProfilePicture } =
        req.body;

      const emp = await EmployeeModel.findById(req.user.id);
      if (!emp) return res.status(404).json({ message: "Employee not found" });

      const normalizedEmail = normalizeEmail(email);

      // 🔹 Vérif duplication email (si l'email change)
      if (normalizedEmail && normalizedEmail !== emp.email) {
        const [employeeDup, ownerDup] = await Promise.all([
          EmployeeModel.findOne({
            email: normalizedEmail,
            _id: { $ne: emp._id },
          }),
          OwnerModel.findOne({ email: normalizedEmail }),
        ]);
        if (employeeDup || ownerDup) {
          return res
            .status(409)
            .json({ message: "L'adresse mail est déjà utilisée" });
        }
      }

      // ---------- Mise à jour des infos de base + snapshots ----------

      const profiles = Array.isArray(emp.restaurantProfiles)
        ? emp.restaurantProfiles
        : [];

      // firstname
      if (firstname !== undefined) {
        syncEmployeeIdentityAcrossProfiles(emp, { firstname });
      }

      // lastname
      if (lastname !== undefined) {
        syncEmployeeIdentityAcrossProfiles(emp, { lastname });
      }

      // email
      if (normalizedEmail !== undefined) {
        emp.email = normalizedEmail;
        profiles.forEach((p) => {
          p.snapshot ??= {};
          p.snapshot.email = normalizedEmail;
        });
      }

      // phone
      if (phone !== undefined) {
        emp.phone = phone;
        profiles.forEach((p) => {
          p.snapshot ??= {};
          p.snapshot.phone = phone;
        });
      }

      // ---------- Photo de profil ----------

      if (req.file) {
        // suppression éventuelle de l'ancienne
        if (emp.profilePicture?.public_id) {
          try {
            await cloudinary.uploader.destroy(emp.profilePicture.public_id);
          } catch (err) {
            console.warn(
              "Erreur lors de la suppression de l'ancienne photo employé :",
              err?.message || err,
            );
          }
        }

        const result = await uploadFromBuffer(
          req.file.buffer,
          `Gusto_Workspace/employees/${emp._id}`,
        );

        emp.profilePicture = {
          url: result.secure_url,
          public_id: result.public_id,
        };
      } else if (removeProfilePicture === "true") {
        if (emp.profilePicture?.public_id) {
          try {
            await cloudinary.uploader.destroy(emp.profilePicture.public_id);
          } catch (err) {
            console.warn(
              "Erreur lors de la suppression de la photo employé :",
              err?.message || err,
            );
          }
        }
        emp.profilePicture = null;
      }

      await savePlanningEmployee(emp);
      broadcastEmployeeUpdate(emp);

      if (!(await isAccountSessionValid(req.user))) {
        return res.status(403).json({ message: "Session revoked" });
      }

      const payload = {
        ...stripJwtMetadata(req.user),
        id: emp._id,
        role: "employee",
        firstname: emp.firstname,
        lastname: emp.lastname,
        email: emp.email,
        phone: emp.phone,
        restaurantId: req.user.restaurantId,
        options: req.user.options || {},
        profilePictureUrl: emp.profilePicture?.url || null,
        sessionVersion: normalizeSessionVersion(req.user.sessionVersion),
      };

      const token = signAccountToken(payload, {
        expiresIn: "7d",
      });

      return res.json({ message: "Employee updated", token });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

router.put(
  "/employees/update-password",
  authenticateToken,
  async (req, res) => {
    try {
      if (req.user.role !== "employee") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { currentPassword, newPassword } = req.body;

      const validationError = validatePasswordChangeInput(
        currentPassword,
        newPassword,
      );
      if (validationError) {
        return res.status(400).json(validationError);
      }

      const emp = await EmployeeModel.findById(req.user.id).select({
        _id: 1,
        password: 1,
      });
      if (!emp) return res.status(404).json({ message: "Employee not found" });

      const ok = await emp.comparePassword(currentPassword, emp.password);
      if (!ok)
        return res.status(401).json({ message: "Incorrect current password" });

      const previousVersion = normalizeSessionVersion(req.user.sessionVersion);
      const updatedEmployee = await rotatePasswordSession({
        AccountModel: EmployeeModel,
        accountId: emp._id,
        currentPasswordHash: emp.password,
        expectedSessionVersion: previousVersion,
        newPassword,
      });

      if (!updatedEmployee) {
        return res.status(403).json({ message: "Session revoked" });
      }

      const token = signAccountToken(
        {
          ...stripJwtMetadata(req.user),
          sessionVersion: previousVersion + 1,
        },
        { expiresIn: "7d" },
      );

      return res.json({ message: "Password updated successfully", token });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

// ---------- TRAINING SESSIONS (global, pas par resto) ----------

router.get(
  "/employees/:employeeId/training-sessions",
  authenticateToken,
  async (req, res) => {
    try {
      const { employeeId } = req.params;

      if (
        req.user?.role === "employee" &&
        String(req.user.id) !== String(employeeId)
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (req.user?.role === "owner") {
        const ownsEmployee = await RestaurantModel.exists({
          owner_id: req.user.id,
          employees: employeeId,
        });

        if (!ownsEmployee) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const page = Math.max(parseInt(req.query.page || "1", 10), 1);
      const limit = Math.min(
        Math.max(parseInt(req.query.limit || "50", 10), 1),
        100,
      );
      const skip = (page - 1) * limit;

      const emp = await EmployeeModel.findById(employeeId)
        .select("trainingSessions")
        .lean();

      if (!emp) return res.status(404).json({ message: "Employee not found" });

      const ids = Array.isArray(emp.trainingSessions)
        ? emp.trainingSessions
        : [];
      const total = ids.length;

      if (total === 0) {
        return res.json({ trainingSessions: [], total, page, limit });
      }

      const items = await TrainingSession.find({ _id: { $in: ids } })
        .sort({ date: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const trainingSessions = items.map((s) => {
        const me = (s.attendees || []).find(
          (a) => String(a.employeeId) === String(employeeId),
        );
        return {
          ...s,
          myStatus: me?.status || "attended",
          myNotes: me?.notes || "",
          mySignedAt: me?.signedAt || null,
          myCertificateUrl: me?.certificateUrl || null,
        };
      });

      return res.json({ trainingSessions, total, page, limit });
    } catch (e) {
      console.error("Error fetching training sessions:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

router._employeeDocumentSecurity = {
  accountantCanReadDocument,
  authorizeEmployeeDocumentUpload,
  findEmployeeDocument,
  getEmployeeDocumentRouteAccess,
  handleEmployeeDocumentUpload,
};
router._accountantSecurity = {
  serializeEmployeeForAccountant,
  workforceAccountFilter,
};

module.exports = router;
