function safeArr(value) {
  return Array.isArray(value) ? value : [];
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDateKey(value) {
  if (!value) return "";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function toLocalDateKey(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function toUtcDateKey(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatTime(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatRangeSheetName(startDate, endDate) {
  const left = String(startDate || "").slice(5).split("-").reverse().join("-");
  const right = String(endDate || "").slice(5).split("-").reverse().join("-");
  const raw = [left, right].filter(Boolean).join(" au ");

  return sanitizeWorksheetName(raw || "Periode");
}

function sanitizeWorksheetName(value) {
  const cleaned = String(value || "Feuille")
    .replace(/[\\/*?:[\]]/g, "-")
    .trim();

  return (cleaned || "Feuille").slice(0, 31);
}

function minutesToHours(value) {
  const hours = Number(value || 0) / 60;
  return Math.round(hours * 100) / 100;
}

function toNumberCell(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { value: 0, type: "Number" };

  const scale = 10 ** digits;
  return {
    value: Math.round(numeric * scale) / scale,
    type: "Number",
  };
}

function toIntegerCell(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { value: 0, type: "Number" };

  return {
    value: Math.round(numeric),
    type: "Number",
  };
}

function getContractualLabel(employment = {}) {
  const value = Number(employment?.contractualValue || 0);
  const unit = String(employment?.contractualUnit || "").trim().toLowerCase();

  if (!value && !unit) return "";
  if (!unit) return value ? `${value} h` : "";
  if (!value) {
    if (unit === "week") return "h / semaine";
    if (unit === "month") return "h / mois";
    return unit;
  }

  if (unit === "week") return `${value} h / semaine`;
  if (unit === "month") return `${value} h / mois`;

  return `${value} ${unit}`.trim();
}

function getContractualUnitLabel(employment = {}) {
  if (!employment?.contractualUnit) return "";
  return "heures";
}

function getPrimaryEstablishmentLabel(employment = {}, restaurantName = "") {
  return employment?.primaryEstablishment || restaurantName || "";
}

function getLeaveTypeLabel(leaveRequest = {}) {
  switch (String(leaveRequest?.type || "").trim()) {
    case "morning":
      return "Conge paye matin";
    case "afternoon":
      return "Conge paye apres-midi";
    default:
      return "Conge paye";
  }
}

function getMealPeriodLabel(periods = []) {
  return safeArr(periods)
    .map((value) => {
      switch (String(value || "").trim()) {
        case "lunch":
          return "Midi";
        case "dinner":
          return "Soir";
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(", ");
}

function getDateBounds(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  return { start, end };
}

function overlapsRange(startValue, endValue, bounds) {
  if (!bounds) return false;

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  return start <= bounds.end && end >= bounds.start;
}

function diffMinutes(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return 0;
  }

  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function countCalendarDays(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let count = 0;

  while (cursor <= last) {
    count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function countDateKeysBetween(startKey, endKey) {
  if (!startKey || !endKey) return 0;

  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }

  let count = 0;
  const cursor = new Date(start.getTime());

  while (cursor <= end) {
    count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function buildDateKeysBetween(startKey, endKey) {
  if (!startKey || !endKey) return [];

  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  const keys = [];
  const cursor = new Date(start.getTime());

  while (cursor <= end) {
    keys.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(cursor.getDate()).padStart(2, "0")}`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function getLeaveDateKeys(leaveRequest = {}) {
  const localStartKey = toLocalDateKey(leaveRequest.start);
  const localEndKey = toLocalDateKey(leaveRequest.end);
  const utcStartKey = toUtcDateKey(leaveRequest.start);
  const utcEndKey = toUtcDateKey(leaveRequest.end);

  const localCount = countDateKeysBetween(localStartKey, localEndKey);
  const utcCount = countDateKeysBetween(utcStartKey, utcEndKey);

  const useUtc =
    utcCount > 0 &&
    (localCount === 0 || utcCount < localCount);

  const startKey = useUtc ? utcStartKey : localStartKey;
  const endKey = useUtc ? utcEndKey : localEndKey;

  return {
    mode: useUtc ? "utc" : "local",
    startKey,
    endKey,
    keys: buildDateKeysBetween(startKey, endKey),
  };
}

function getDayBoundsForDateKey(dateKey = "", mode = "local") {
  if (!dateKey) return null;

  if (mode === "utc") {
    const [year, month, day] = String(dateKey)
      .split("-")
      .map((part) => Number(part));
    if (!year || !month || !day) return null;

    return {
      start: new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)),
    };
  }

  return {
    start: new Date(`${dateKey}T00:00:00`),
    end: new Date(`${dateKey}T23:59:59.999`),
  };
}

function getLeaveDisplayTimesForDateKey(dateKey = "", leaveRequest = {}) {
  if (!dateKey) return { start: "", end: "" };

  if (leaveRequest?.type === "morning") {
    return { start: "00:00", end: "12:00" };
  }

  if (leaveRequest?.type === "afternoon") {
    return { start: "12:00", end: "23:59" };
  }

  return { start: "00:00", end: "23:59" };
}

function computeLeaveDays(leaveRequest = {}) {
  const days = getLeaveDateKeys(leaveRequest).keys.length;
  if (!days) return 0;

  if (leaveRequest.type === "morning" || leaveRequest.type === "afternoon") {
    return Math.round(days * 0.5 * 100) / 100;
  }

  return days;
}

function getYearBounds(year) {
  return {
    start: new Date(`${year}-01-01T00:00:00`),
    end: new Date(`${year}-12-31T23:59:59.999`),
  };
}

function getWeeklyContractualHours(employment = {}) {
  const value = Number(employment?.contractualValue || 0);
  const unit = String(employment?.contractualUnit || "").trim().toLowerCase();

  if (!value) return 0;

  if (unit === "week") return value;
  if (unit === "month") return (value * 12) / 52;

  return 0;
}

function getMonthlyContractualHours(employment = {}) {
  const value = Number(employment?.contractualValue || 0);
  const unit = String(employment?.contractualUnit || "").trim().toLowerCase();

  if (!value) return 0;

  if (unit === "week") return (value * 52) / 12;
  if (unit === "month") return value;

  return 0;
}

function getIsoWeekNumber(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return 0;

  const utcDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));

  return Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
}

function getIsoWeekId(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const utcDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  return `${utcDate.getUTCFullYear()}-W${String(getIsoWeekNumber(date)).padStart(
    2,
    "0",
  )}`;
}

function addDays(date, amount) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function getEasterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function isFrenchPublicHoliday(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const easter = getEasterDate(year);

  const movable = [
    addDays(easter, 1),
    addDays(easter, 39),
    addDays(easter, 50),
  ];

  if (
    [
      [0, 1],
      [4, 1],
      [4, 8],
      [6, 14],
      [7, 15],
      [10, 1],
      [10, 11],
      [11, 25],
    ].some(([targetMonth, targetDay]) => month === targetMonth && day === targetDay)
  ) {
    return true;
  }

  return movable.some(
    (holiday) =>
      holiday.getFullYear() === year &&
      holiday.getMonth() === month &&
      holiday.getDate() === day,
  );
}

function eachDayBetween(startValue, endValue, iteratee) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return;
  }

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= last) {
    iteratee(new Date(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
}

function getMonthlyProratedContractualMinutesForDay(dayValue, employment = {}) {
  const monthlyHours = getMonthlyContractualHours(employment);
  const date = dayValue instanceof Date ? dayValue : new Date(dayValue);

  if (!monthlyHours || Number.isNaN(date.getTime())) return 0;

  const daysInMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  if (!daysInMonth) return 0;

  return (monthlyHours * 60) / daysInMonth;
}

function getLeaveReferenceMinutesForDay(employment = {}) {
  const weeklyHours = getWeeklyContractualHours(employment);
  if (weeklyHours) {
    return (weeklyHours * 60) / 6;
  }

  const monthlyHours = getMonthlyContractualHours(employment);
  if (monthlyHours) {
    return (monthlyHours * 60) / 26;
  }

  return 0;
}

function computeContractualExpectedMinutes(bounds, employment = {}) {
  if (!bounds) return 0;

  let total = 0;
  eachDayBetween(bounds.start, bounds.end, (day) => {
    total += getMonthlyProratedContractualMinutesForDay(day, employment);
  });
  return total;
}

function clampLeaveRequestToBounds(leaveRequest = {}, bounds) {
  if (!bounds || !overlapsRange(leaveRequest?.start, leaveRequest?.end, bounds)) {
    return null;
  }

  const start = new Date(
    Math.max(new Date(leaveRequest.start).getTime(), bounds.start.getTime()),
  );
  const end = new Date(
    Math.min(new Date(leaveRequest.end).getTime(), bounds.end.getTime()),
  );

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  return {
    ...leaveRequest,
    start,
    end,
  };
}

function computeLeaveMinutes(leaveRequest = {}, employment = {}, bounds) {
  const boundedLeave = clampLeaveRequestToBounds(leaveRequest, bounds);
  if (!boundedLeave) return 0;

  if (
    boundedLeave.type !== "full" &&
    diffMinutes(boundedLeave.start, boundedLeave.end) > 0 &&
    diffMinutes(boundedLeave.start, boundedLeave.end) <= 12 * 60
  ) {
    return diffMinutes(boundedLeave.start, boundedLeave.end);
  }

  let total = 0;
  getLeaveDateKeys(boundedLeave).keys.forEach(() => {
    const dailyMinutes = getLeaveReferenceMinutesForDay(employment);
    total +=
      boundedLeave.type === "morning" || boundedLeave.type === "afternoon"
        ? dailyMinutes / 2
        : dailyMinutes;
  });

  return total;
}

function computeLeaveStats(report = {}, bounds) {
  const employment = report?.profile?.employment || {};
  const approvedLeaves = safeArr(report?.profile?.leaveRequests).filter(
    (leaveRequest) =>
      leaveRequest?.status === "approved" &&
      overlapsRange(leaveRequest.start, leaveRequest.end, bounds),
  );

  return approvedLeaves.reduce(
    (totals, leaveRequest) => {
      const boundedLeave = clampLeaveRequestToBounds(leaveRequest, bounds);
      if (!boundedLeave) return totals;

      totals.totalLeaveDays += computeLeaveDays(boundedLeave);
      totals.totalLeaveMinutes += computeLeaveMinutes(
        boundedLeave,
        employment,
        bounds,
      );
      return totals;
    },
    {
      totalLeaveDays: 0,
      totalLeaveMinutes: 0,
    },
  );
}

function computeOvertimeMinutes(report = {}, bounds) {
  const weeklyHours = getWeeklyContractualHours(report?.profile?.employment || {});
  if (!weeklyHours || !bounds) return 0;

  const weekMap = new Map();

  eachDayBetween(bounds.start, bounds.end, (day) => {
    const dateKey = toLocalDateKey(day);
    const weekId = getIsoWeekId(day);
    const daySummary = safeArr(report?.range?.days).find(
      (item) => String(item?.date || "") === dateKey,
    );

    if (!weekMap.has(weekId)) {
      weekMap.set(weekId, {
        daysInRange: 0,
        workedMinutes: 0,
      });
    }

    const weekEntry = weekMap.get(weekId);
    weekEntry.daysInRange += 1;
    weekEntry.workedMinutes += Number(daySummary?.totalWorkedMinutes || 0);
  });

  return Array.from(weekMap.values()).reduce((total, weekEntry) => {
    const expectedMinutes =
      weeklyHours * 60 * (Number(weekEntry?.daysInRange || 0) / 7);

    return total + Math.max(0, Number(weekEntry?.workedMinutes || 0) - expectedMinutes);
  }, 0);
}

function clipInterval(startValue, endValue, boundsStart, boundsEnd) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const clipStart =
    boundsStart instanceof Date ? boundsStart : new Date(boundsStart);
  const clipEnd = boundsEnd instanceof Date ? boundsEnd : new Date(boundsEnd);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    Number.isNaN(clipStart.getTime()) ||
    Number.isNaN(clipEnd.getTime())
  ) {
    return null;
  }

  const nextStart = new Date(Math.max(start.getTime(), clipStart.getTime()));
  const nextEnd = new Date(Math.min(end.getTime(), clipEnd.getTime()));

  if (nextEnd <= nextStart) return null;

  return {
    start: nextStart,
    end: nextEnd,
    minutes: diffMinutes(nextStart, nextEnd),
  };
}

function sumIntervalMinutes(intervals = []) {
  return safeArr(intervals).reduce(
    (total, interval) => total + diffMinutes(interval?.start, interval?.end),
    0,
  );
}

function getSessionWorkIntervalsForDay(session = {}) {
  const dayStart = session?.dayTotals?.startAt || session?.clockInAt;
  const dayEnd = session?.dayTotals?.endAt || session?.clockOutAt;
  const sessionStart = new Date(dayStart);
  const sessionEnd = new Date(dayEnd);

  if (
    Number.isNaN(sessionStart.getTime()) ||
    Number.isNaN(sessionEnd.getTime()) ||
    sessionEnd <= sessionStart
  ) {
    return [];
  }

  const relevantBreaks = safeArr(session?.breaks)
    .map((item) => clipInterval(item?.startAt, item?.endAt, sessionStart, sessionEnd))
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);

  const intervals = [];
  let cursor = new Date(sessionStart.getTime());

  relevantBreaks.forEach((currentBreak) => {
    if (currentBreak.start > cursor) {
      intervals.push({
        start: new Date(cursor.getTime()),
        end: new Date(currentBreak.start.getTime()),
      });
    }

    if (currentBreak.end > cursor) {
      cursor = new Date(currentBreak.end.getTime());
    }
  });

  if (cursor < sessionEnd) {
    intervals.push({
      start: new Date(cursor.getTime()),
      end: new Date(sessionEnd.getTime()),
    });
  }

  return intervals;
}

function computeSpecialMinutesForSessionDay(session = {}, dateKey = "") {
  const intervals = getSessionWorkIntervalsForDay(session);
  const dayStart = new Date(`${dateKey}T00:00:00`);
  const dayMorningEnd = new Date(`${dateKey}T07:00:00`);
  const dayNightStart = new Date(`${dateKey}T22:00:00`);
  const nextDayStart = new Date(`${dateKey}T00:00:00`);
  nextDayStart.setDate(nextDayStart.getDate() + 1);

  const nightMinutes = intervals.reduce((total, interval) => {
    const earlyNight = clipInterval(interval.start, interval.end, dayStart, dayMorningEnd);
    const lateNight = clipInterval(
      interval.start,
      interval.end,
      dayNightStart,
      nextDayStart,
    );

    return total + (earlyNight?.minutes || 0) + (lateNight?.minutes || 0);
  }, 0);

  const sundayMinutes = dayStart.getDay() === 0 ? sumIntervalMinutes(intervals) : 0;
  const holidayMinutes = isFrenchPublicHoliday(dayStart)
    ? sumIntervalMinutes(intervals)
    : 0;

  return {
    holidayMinutes,
    nightMinutes,
    sundayMinutes,
  };
}

function isLeaveShift(shift = {}) {
  return Boolean(shift?.isLeave || shift?.leaveRequestId);
}

function overlapsInterval(startA, endA, startB, endB) {
  const leftStart = new Date(startA);
  const leftEnd = new Date(endA);
  const rightStart = new Date(startB);
  const rightEnd = new Date(endB);

  if (
    Number.isNaN(leftStart.getTime()) ||
    Number.isNaN(leftEnd.getTime()) ||
    Number.isNaN(rightStart.getTime()) ||
    Number.isNaN(rightEnd.getTime())
  ) {
    return false;
  }

  return leftStart < rightEnd && leftEnd > rightStart;
}

function buildDaySessionsMap(range = {}) {
  return new Map(
    safeArr(range?.days).map((day) => [String(day?.date || ""), safeArr(day?.sessions)]),
  );
}

function getDailyShiftDayValue(durationMinutes) {
  if (Number(durationMinutes || 0) >= 6 * 60) return 1;
  if (Number(durationMinutes || 0) > 0) return 0.5;
  return 0;
}

function buildShiftAttendanceInsights(report = {}, bounds) {
  const profile = report?.profile || {};
  const approvedLeaves = safeArr(profile?.leaveRequests).filter(
    (leaveRequest) =>
      leaveRequest?.status === "approved" &&
      overlapsRange(leaveRequest.start, leaveRequest.end, bounds),
  );
  const sessionsByDate = buildDaySessionsMap(report?.range || {});
  const tardiness = [];
  const unjustifiedAbsences = [];

  safeArr(profile?.shifts)
    .filter((shift) => !isLeaveShift(shift))
    .forEach((shift) => {
      const shiftStart = new Date(shift.start);
      const shiftEnd = new Date(shift.end);

      if (
        Number.isNaN(shiftStart.getTime()) ||
        Number.isNaN(shiftEnd.getTime()) ||
        !overlapsRange(shiftStart, shiftEnd, bounds)
      ) {
        return;
      }

      const coveredByLeave = approvedLeaves.some((leaveRequest) =>
        overlapsInterval(shiftStart, shiftEnd, leaveRequest.start, leaveRequest.end),
      );
      if (coveredByLeave) return;

      const dateKey = toLocalDateKey(shiftStart);
      const daySessions = sessionsByDate.get(dateKey) || [];
      const overlappingSessions = daySessions.filter((session) =>
        overlapsInterval(
          session?.dayTotals?.startAt || session?.clockInAt,
          session?.dayTotals?.endAt || session?.clockOutAt,
          shiftStart,
          shiftEnd,
        ),
      );

      if (!overlappingSessions.length) {
        unjustifiedAbsences.push({
          title: shift?.title || report?.employee?.post || "Service prévu",
          start: shiftStart,
          end: shiftEnd,
          durationMinutes: diffMinutes(shiftStart, shiftEnd),
          days: getDailyShiftDayValue(diffMinutes(shiftStart, shiftEnd)),
        });
        return;
      }

      const actualStart = overlappingSessions
        .map((session) => new Date(session?.dayTotals?.startAt || session?.clockInAt))
        .filter((value) => !Number.isNaN(value.getTime()))
        .sort((left, right) => left - right)[0];

      if (actualStart && actualStart > shiftStart) {
        tardiness.push({
          title: shift?.title || report?.employee?.post || "Service prévu",
          start: shiftStart,
          end: actualStart,
          durationMinutes: diffMinutes(shiftStart, actualStart),
        });
      }
    });

  return {
    tardiness,
    unjustifiedAbsences,
  };
}

function buildLeaveDetailRows(report = {}, leaveRequest = {}, employment = {}, bounds, restaurantName) {
  const rows = [];
  const boundedLeave = clampLeaveRequestToBounds(leaveRequest, bounds);
  if (!boundedLeave) return rows;

  const leaveDateKeys = getLeaveDateKeys(boundedLeave);

  leaveDateKeys.keys.forEach((dateKey) => {
    const dayBounds = getDayBoundsForDateKey(dateKey, leaveDateKeys.mode);
    if (!dayBounds) return;

    const currentBounds = {
      start: dayBounds.start,
      end: dayBounds.end,
    };
    const leaveHoursMinutes = computeLeaveMinutes(
      {
        ...leaveRequest,
        start: dayBounds.start,
        end: dayBounds.end,
      },
      employment,
      currentBounds,
    );
    const displayTimes = getLeaveDisplayTimesForDateKey(dateKey, leaveRequest);

    rows.push([
      report?.employee?.firstname || "",
      report?.employee?.lastname || "",
      employment.payrollCode || "",
      employment.contractType || "",
      Number(employment?.contractualValue || 0) || "",
      getContractualUnitLabel(employment),
      getPrimaryEstablishmentLabel(employment, restaurantName),
      toIntegerCell(getIsoWeekNumber(new Date(`${dateKey}T12:00:00`))),
      formatDateKey(dateKey),
      "Absence",
      getLeaveTypeLabel(leaveRequest),
      getPrimaryEstablishmentLabel(employment, restaurantName),
      displayTimes.start,
      displayTimes.end,
      toNumberCell(0),
      toNumberCell(0),
      "Conges approuves",
      toNumberCell(0),
      toNumberCell(0),
      toNumberCell(minutesToHours(leaveHoursMinutes)),
      toNumberCell(0),
      toNumberCell(0),
      toNumberCell(0),
      toNumberCell(0),
      toNumberCell(0),
      toIntegerCell(0),
    ]);
  });

  return rows;
}

function buildSummaryRows(reports = [], bounds) {
  return reports.map((report) => {
    const employment = report?.profile?.employment || {};
    const range = report?.range || {};
    const activeDays = safeArr(range.days).filter(
      (day) => Number(day?.totalWorkedMinutes || 0) > 0,
    ).length;
    const contractualMinutes = computeContractualExpectedMinutes(
      bounds,
      employment,
    );
    const overtimeMinutes = computeOvertimeMinutes(report, bounds);
    const leaveStats = computeLeaveStats(report, bounds);
    const attendanceInsights = buildShiftAttendanceInsights(report, bounds);
    const absenceMinutes =
      Number(leaveStats.totalLeaveMinutes || 0) +
      attendanceInsights.unjustifiedAbsences.reduce(
        (total, item) => total + Number(item?.durationMinutes || 0),
        0,
      );

    return [
      report?.employee?.firstname || "",
      report?.employee?.lastname || "",
      report?.employee?.post || "",
      employment.contractType || "",
      getContractualLabel(employment),
      toNumberCell(minutesToHours(contractualMinutes)),
      toNumberCell(minutesToHours(range.totalWorkedMinutes || 0)),
      toNumberCell(minutesToHours(overtimeMinutes)),
      toNumberCell(minutesToHours(absenceMinutes)),
      toNumberCell(leaveStats.totalLeaveDays || 0),
      toNumberCell(minutesToHours(range.totalBreakMinutes || 0)),
      toNumberCell(minutesToHours(range.totalGrossMinutes || 0)),
      toIntegerCell(range.totalSessions || 0),
      toIntegerCell(range.totalMealCount || 0),
      toIntegerCell(activeDays),
      safeArr(range.anomalies).join(", "),
    ];
  });
}

function buildDetailRows(reports = [], bounds, restaurantName = "") {
  const rows = [];

  reports.forEach((report) => {
    const employment = report?.profile?.employment || {};
    const leaveRequests = safeArr(report?.profile?.leaveRequests);
    const attendanceInsights = buildShiftAttendanceInsights(report, bounds);

    safeArr(report?.range?.days).forEach((day) => {
      safeArr(day?.sessions).forEach((session) => {
        const startAt = session?.dayTotals?.startAt || session?.clockInAt;
        const endAt = session?.dayTotals?.endAt || session?.clockOutAt;
        const workedDate = new Date(`${day?.date}T12:00:00`);
        const dayWorkedValue = safeArr(day?.sessions).length
          ? 1 / safeArr(day?.sessions).length
          : 0;
        const specialMinutes = computeSpecialMinutesForSessionDay(
          session,
          day?.date,
        );
        const overlappingTardiness = attendanceInsights.tardiness
          .filter((item) =>
            overlapsInterval(
              item?.start,
              item?.end,
              startAt,
              endAt,
            ),
          )
          .reduce((total, item) => total + Number(item?.durationMinutes || 0), 0);

        rows.push([
          report?.employee?.firstname || "",
          report?.employee?.lastname || "",
          employment.payrollCode || "",
          employment.contractType || "",
          Number(employment?.contractualValue || 0) || "",
          getContractualUnitLabel(employment),
          getPrimaryEstablishmentLabel(employment, restaurantName),
          toIntegerCell(getIsoWeekNumber(workedDate)),
          formatDateKey(day?.date),
          "Travail",
          report?.employee?.post || "",
          getPrimaryEstablishmentLabel(employment, restaurantName),
          formatTime(startAt),
          formatTime(endAt),
          toNumberCell(minutesToHours(session?.dayTotals?.breakMinutes || 0)),
          toNumberCell(minutesToHours(overlappingTardiness)),
          session?.isManuallyEdited ? "Corrige" : "",
          toNumberCell(minutesToHours(session?.dayTotals?.workedMinutes || 0)),
          toNumberCell(dayWorkedValue),
          toNumberCell(0),
          toNumberCell(minutesToHours(specialMinutes.holidayMinutes || 0)),
          toNumberCell(minutesToHours(specialMinutes.nightMinutes || 0)),
          toNumberCell(minutesToHours(specialMinutes.sundayMinutes || 0)),
          toNumberCell(
            session?.dayTotals?.mealCount > 0
              ? Number(session?.mealAllowance?.amount || 0)
              : 0,
          ),
          toIntegerCell(session?.dayTotals?.mealCount || 0),
          toIntegerCell(session?.dayTotals?.mealCount || 0),
        ]);
      });
    });

    leaveRequests
      .filter(
        (leaveRequest) =>
          leaveRequest?.status === "approved" &&
          overlapsRange(leaveRequest.start, leaveRequest.end, bounds),
      )
      .forEach((leaveRequest) => {
        rows.push(
          ...buildLeaveDetailRows(
            report,
            leaveRequest,
            employment,
            bounds,
            restaurantName,
          ),
        );
      });

    attendanceInsights.unjustifiedAbsences.forEach((absence) => {
      const absenceDate = toLocalDateKey(absence?.start);
      const absenceDay = new Date(`${absenceDate}T12:00:00`);

      rows.push([
        report?.employee?.firstname || "",
        report?.employee?.lastname || "",
        employment.payrollCode || "",
        employment.contractType || "",
        Number(employment?.contractualValue || 0) || "",
        getContractualUnitLabel(employment),
        getPrimaryEstablishmentLabel(employment, restaurantName),
        toIntegerCell(getIsoWeekNumber(absenceDay)),
        formatDateKey(absenceDate),
        "Absence",
        "Absence injustifiee",
        getPrimaryEstablishmentLabel(employment, restaurantName),
        formatTime(absence?.start),
        formatTime(absence?.end),
        toNumberCell(0),
        toNumberCell(0),
        absence?.title || "",
        toNumberCell(0),
        toNumberCell(0),
        toNumberCell(minutesToHours(absence?.durationMinutes || 0)),
        toNumberCell(0),
        toNumberCell(0),
        toNumberCell(0),
        toNumberCell(0),
        toNumberCell(0),
        toIntegerCell(0),
      ]);
    });
  });

  return rows.sort((left, right) => {
    const nameCompare = `${left[1]} ${left[0]}`.localeCompare(`${right[1]} ${right[0]}`);
    if (nameCompare !== 0) return nameCompare;
    return String(left[8] || "").localeCompare(String(right[8] || ""));
  });
}

function buildLeaveRows(reports = [], bounds) {
  const rows = [];

  reports.forEach((report) => {
    const employment = report?.profile?.employment || {};
    const attendanceInsights = buildShiftAttendanceInsights(report, bounds);

    safeArr(report?.profile?.leaveRequests)
      .filter(
        (leaveRequest) =>
          leaveRequest?.status === "approved" &&
          overlapsRange(leaveRequest.start, leaveRequest.end, bounds),
      )
      .forEach((leaveRequest) => {
        const boundedLeave = clampLeaveRequestToBounds(leaveRequest, bounds);
        if (!boundedLeave) return;
        const leaveDateKeys = getLeaveDateKeys(boundedLeave);

        rows.push([
          report?.employee?.lastname || "",
          report?.employee?.firstname || "",
          employment.payrollCode || "",
          getLeaveTypeLabel(boundedLeave),
          formatDateKey(leaveDateKeys.startKey),
          formatDateKey(leaveDateKeys.endKey),
          toNumberCell(
            minutesToHours(
              computeLeaveMinutes(boundedLeave, report?.profile?.employment || {}, bounds),
            ),
          ),
          toNumberCell(computeLeaveDays(boundedLeave)),
        ]);
      });

    attendanceInsights.tardiness.forEach((item) => {
      rows.push([
        report?.employee?.lastname || "",
        report?.employee?.firstname || "",
        employment.payrollCode || "",
        "Retard",
        formatDateKey(toLocalDateKey(item?.start)),
        formatDateKey(toLocalDateKey(item?.end || item?.start)),
        toNumberCell(minutesToHours(item?.durationMinutes || 0)),
        toNumberCell(1),
      ]);
    });

    attendanceInsights.unjustifiedAbsences.forEach((item) => {
      rows.push([
        report?.employee?.lastname || "",
        report?.employee?.firstname || "",
        employment.payrollCode || "",
        "Absence injustifiee",
        formatDateKey(toLocalDateKey(item?.start)),
        formatDateKey(toLocalDateKey(item?.end || item?.start)),
        toNumberCell(minutesToHours(item?.durationMinutes || 0)),
        toNumberCell(item?.days || 0),
      ]);
    });
  });

  return rows.sort((left, right) => {
    const nameCompare = `${left[0]} ${left[1]}`.localeCompare(`${right[0]} ${right[1]}`);
    if (nameCompare !== 0) return nameCompare;
    return String(left[4] || "").localeCompare(String(right[4] || ""));
  });
}

function computeApprovedLeaveDaysForYear(report = {}, year) {
  const bounds = getYearBounds(year);

  return safeArr(report?.profile?.leaveRequests)
    .filter(
      (leaveRequest) =>
        leaveRequest?.status === "approved" &&
        overlapsRange(leaveRequest.start, leaveRequest.end, bounds),
    )
    .reduce((total, leaveRequest) => {
      const boundedLeave = clampLeaveRequestToBounds(leaveRequest, bounds);
      if (!boundedLeave) return total;
      return total + computeLeaveDays(boundedLeave);
    }, 0);
}

function buildLeaveBalanceRows(reports = [], referenceYear) {
  return reports.map((report) => {
    const employment = report?.profile?.employment || {};
    const previousYear = Number(referenceYear || new Date().getFullYear()) - 1;
    const currentYear = Number(referenceYear || new Date().getFullYear());
    const previousAcquired = Number(employment.leaveBalancePreviousYear || 0);
    const currentAcquired = Number(employment.leaveBalanceCurrentYear || 0);
    const previousTaken = computeApprovedLeaveDaysForYear(report, previousYear);
    const currentTaken = computeApprovedLeaveDaysForYear(report, currentYear);
    const previousBalance = Math.max(0, previousAcquired - previousTaken);
    const currentBalance = Math.max(0, currentAcquired - currentTaken);
    const availableBalance =
      Number(employment.leaveBalanceAvailable || 0) ||
      previousBalance + currentBalance;

    return [
      report?.employee?.lastname || "",
      report?.employee?.firstname || "",
      employment.payrollCode || "",
      toNumberCell(previousAcquired),
      toNumberCell(previousTaken),
      toNumberCell(previousBalance),
      toNumberCell(currentAcquired),
      toNumberCell(currentTaken),
      toNumberCell(currentBalance),
      toNumberCell(availableBalance),
    ];
  });
}

function buildEmployeeSheetRows(reports = []) {
  return reports.map((report) => {
    const employment = report?.profile?.employment || {};

    return [
      report?.employee?.firstname || "",
      report?.employee?.lastname || "",
      report?.employee?.email || "",
      report?.rawEmployee?.phone || "",
      report?.employee?.post || "",
      employment.payrollCode || "",
      employment.contractType || "",
      getContractualLabel(employment),
      employment.primaryEstablishment || "",
    ];
  });
}

function buildWorkbookDefinition({
  restaurantName = "Restaurant",
  startDate,
  endDate,
  reports = [],
  generatedAt = new Date(),
}) {
  const bounds = getDateBounds(startDate, endDate);
  const referenceYear = new Date(`${endDate}T12:00:00`).getFullYear();

  return [
    {
      name: formatRangeSheetName(startDate, endDate),
      title: "Synthese heures salaries",
      headers: [
        "Prenom",
        "Nom",
        "Poste",
        "Type de contrat",
        "Temps contractuel",
        "Temps contractuel periode (h)",
        "Heures travaillees (h)",
        "Heures supp (h)",
        "Absences (h)",
        "Conges (jours)",
        "Pause (h)",
        "Temps brut (h)",
        "Services",
        "Repas",
        "Jours actifs",
        "Anomalies",
      ],
      rows: buildSummaryRows(reports, bounds),
    },
    {
      name: "Fiche employes",
      title: "Fiche employes",
      headers: [
        "Prenom",
        "Nom",
        "Email",
        "Telephone",
        "Poste",
        "Code paie",
        "Type de contrat",
        "Temps contractuel",
        "Etablissement principal",
      ],
      rows: buildEmployeeSheetRows(reports),
    },
    {
      name: "Details",
      title: "Details heures et absences",
      headers: [
        "Prenom",
        "Nom",
        "Matricule de paie",
        "Type de contrat",
        "Temps contractuel",
        "Heures / jours",
        "Etablissement principal",
        "N semaine",
        "Date",
        "Travail / Absence",
        "Nom du poste / type d'absence",
        "Shift / absence effectue a",
        "Debut",
        "Fin",
        "Pause (h)",
        "Retard (h)",
        "Note",
        "Heures travaillees (h)",
        "Jours travailles (j)",
        "Absence / conge comptabilise (h)",
        "Heures jour ferie (h)",
        "Heures de nuit (22:00-07:00)",
        "Heures dimanche (h)",
        "Montant repas pris (EUR)",
        "Avantages nature",
        "Repas dus",
      ],
      rows: buildDetailRows(reports, bounds, restaurantName),
    },
    {
      name: "Absences Employes",
      title: "Absences employes",
      headers: [
        "Nom",
        "Prenom",
        "Matricule de paie",
        "Type absence",
        "Date de debut",
        "Date de fin",
        "Nb heures",
        "Nb jours",
      ],
      rows: buildLeaveRows(reports, bounds),
    },
    {
      name: "Solde Conges",
      title: "Solde conges",
      headers: [
        "Nom",
        "Prenom",
        "Matricule de paie",
        "N-1 : Conges payes acquis",
        "N-1 : Conges payes poses",
        "N-1 : Solde de conges payes",
        "N : Conges payes acquis",
        "N : Conges payes poses",
        "N : Solde des conges payes",
        "Conges disponibles",
      ],
      rows: buildLeaveBalanceRows(reports, referenceYear),
    },
  ].map((sheet) => ({
    ...sheet,
    restaurantName,
    startDate,
    endDate,
    generatedAt,
  }));
}

function columnNumberToLetters(value) {
  let column = Number(value || 1);
  let out = "";

  while (column > 0) {
    const remainder = (column - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    column = Math.floor((column - 1) / 26);
  }

  return out || "A";
}

function normalizeCell(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      value: value.value ?? "",
      type: value.type === "Number" ? "Number" : "String",
    };
  }

  return { value: value ?? "", type: "String" };
}

function getCellDisplayValue(cell) {
  const normalized = normalizeCell(cell);
  return String(normalized.value ?? "");
}

function computeColumnWidths(sheet) {
  const widthByColumn = [];
  const metadataRow = [
    "Restaurant",
    sheet.restaurantName,
    "Periode",
    `${formatDateKey(sheet.startDate)} au ${formatDateKey(sheet.endDate)}`,
    "Genere le",
    formatDateTime(sheet.generatedAt),
  ];
  const allRows = [[sheet.title], metadataRow, [], sheet.headers, ...safeArr(sheet.rows)];

  allRows.forEach((row) => {
    safeArr(row).forEach((cell, index) => {
      const longestLine = getCellDisplayValue(cell)
        .split(/\r?\n/u)
        .reduce((max, line) => Math.max(max, line.length), 0);

      widthByColumn[index] = Math.max(widthByColumn[index] || 0, longestLine);
    });
  });

  return widthByColumn.map((length, index) => ({
    index: index + 1,
    width: Math.max(8, Math.min(60, Number(length || 0) + 2)),
  }));
}

function renderColumnsXml(columnWidths = []) {
  if (!Array.isArray(columnWidths) || !columnWidths.length) return "";

  const columns = columnWidths
    .map(
      ({ index, width }) =>
        `<col min="${index}" max="${index}" width="${width}" bestFit="1" customWidth="1"/>`,
    )
    .join("");

  return `<cols>${columns}</cols>`;
}

function renderCellXml(cell, rowIndex, columnIndex, styleIndex = 0) {
  const normalized = normalizeCell(cell);
  const ref = `${columnNumberToLetters(columnIndex)}${rowIndex}`;
  const styleAttr = styleIndex > 0 ? ` s="${styleIndex}"` : "";

  if (normalized.type === "Number") {
    return `<c r="${ref}"${styleAttr}><v>${escapeXml(normalized.value)}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(normalized.value)}</t></is></c>`;
}

function renderRowXml(cells = [], rowIndex, styleIndex = 0) {
  if (!Array.isArray(cells) || !cells.length) {
    return `<row r="${rowIndex}"/>`;
  }

  const renderedCells = cells
    .map((cell, index) => renderCellXml(cell, rowIndex, index + 1, styleIndex))
    .join("");

  return `<row r="${rowIndex}">${renderedCells}</row>`;
}

function renderWorksheetXml(sheet) {
  const rows = [];
  let rowIndex = 1;
  const metadataRow = [
    "Restaurant",
    sheet.restaurantName,
    "Periode",
    `${formatDateKey(sheet.startDate)} au ${formatDateKey(sheet.endDate)}`,
    "Genere le",
    formatDateTime(sheet.generatedAt),
  ];
  const columnsXml = renderColumnsXml(computeColumnWidths(sheet));

  rows.push(renderRowXml([sheet.title], rowIndex, 2));
  rowIndex += 1;

  rows.push(renderRowXml(metadataRow, rowIndex, 0));
  rowIndex += 1;

  rows.push(renderRowXml([], rowIndex));
  rowIndex += 1;

  rows.push(renderRowXml(sheet.headers, rowIndex, 1));
  rowIndex += 1;

  safeArr(sheet.rows).forEach((row) => {
    rows.push(renderRowXml(row, rowIndex, 0));
    rowIndex += 1;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  ${columnsXml}
  <sheetData>
    ${rows.join("")}
  </sheetData>
</worksheet>`;
}

function buildWorkbookXml(sheets = []) {
  const sheetNodes = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sanitizeWorksheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook
  xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheetNodes}
  </sheets>
</workbook>`;
}

function buildWorkbookRelsXml(sheets = []) {
  const relationships = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .concat([
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    ])
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relationships}
</Relationships>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF9"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

function buildContentTypesXml(sheets = []) {
  const worksheetOverrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${worksheetOverrides}
</Types>`;
}

function buildAppPropsXml(sheets = []) {
  const titles = sheets.map((sheet) => `<vt:lpstr>${escapeXml(sheet.name)}</vt:lpstr>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties
  xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Gusto Manager</Application>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="${sheets.length}" baseType="lpstr">
      ${titles}
    </vt:vector>
  </TitlesOfParts>
</Properties>`;
}

function buildCorePropsXml(generatedAt = new Date()) {
  const isoDate = new Date(generatedAt).toISOString();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Gusto Manager</dc:creator>
  <cp:lastModifiedBy>Gusto Manager</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${isoDate}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${isoDate}</dcterms:modified>
</cp:coreProperties>`;
}

function createCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let current = index;

    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }

    table[index] = current >>> 0;
  }

  return table;
}

const CRC32_TABLE = createCrc32Table();

function crc32(buffer) {
  let current = 0xffffffff;

  for (const byte of buffer) {
    current = CRC32_TABLE[(current ^ byte) & 0xff] ^ (current >>> 8);
  }

  return (current ^ 0xffffffff) >>> 0;
}

function toDosDateTime(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function buildZip(entries = [], generatedAt = new Date()) {
  const fileParts = [];
  const centralDirectoryParts = [];
  let offset = 0;
  const dos = toDosDateTime(generatedAt);

  entries.forEach((entry) => {
    const nameBuffer = Buffer.from(entry.name);
    const dataBuffer = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(String(entry.data || ""), "utf8");
    const checksum = crc32(dataBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dos.time, 10);
    localHeader.writeUInt16LE(dos.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    fileParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dos.time, 12);
    centralHeader.writeUInt16LE(dos.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralDirectoryParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  });

  const centralDirectoryBuffer = Buffer.concat(centralDirectoryParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryBuffer.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([
    ...fileParts,
    centralDirectoryBuffer,
    endOfCentralDirectory,
  ]);
}

function buildWorkbookBuffer({
  restaurantName = "Restaurant",
  startDate,
  endDate,
  reports = [],
  generatedAt = new Date(),
}) {
  const sheets = buildWorkbookDefinition({
    restaurantName,
    startDate,
    endDate,
    reports,
    generatedAt,
  });

  const entries = [
    {
      name: "[Content_Types].xml",
      data: buildContentTypesXml(sheets),
    },
    {
      name: "_rels/.rels",
      data: buildRootRelsXml(),
    },
    {
      name: "docProps/app.xml",
      data: buildAppPropsXml(sheets),
    },
    {
      name: "docProps/core.xml",
      data: buildCorePropsXml(generatedAt),
    },
    {
      name: "xl/workbook.xml",
      data: buildWorkbookXml(sheets),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: buildWorkbookRelsXml(sheets),
    },
    {
      name: "xl/styles.xml",
      data: buildStylesXml(),
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: renderWorksheetXml(sheet),
    })),
  ];

  return buildZip(entries, generatedAt);
}

module.exports = {
  buildWorkbookBuffer,
};
