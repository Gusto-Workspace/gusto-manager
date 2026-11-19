import {
  isLeaveShiftRecord,
  getParisPlanningInstant,
  normalizePlanningText,
  parisPlanningDateTime as parisDateTime,
  parisPlanningDateKey as dateKey,
  parisPlanningTime as timeKey,
  parsePlanningDate,
  plannedShiftMinutes,
} from "./planning-grid.utils.mjs";

const padTime = (value) => String(value).padStart(2, "0");
const MAX_BATCH_SHIFTS = 200;
export const MAX_SHIFT_BLOCKS = 12;
const MAX_REPEAT_DAYS = 365;
const DAY = 86_400_000;
const civilDay = (key) => Date.parse(`${key}T00:00:00Z`);
const civilKey = (time) => new Date(time).toISOString().slice(0, 10);
export const shiftWeekday = (key) => new Date(civilDay(key)).getUTCDay();
export const defaultShiftRepeat = {
  frequency: "none", interval: "1", days: [], end: "count", count: "2", until: "",
};

const ABSENCE_HOURS = {
  full: ["00:00", "23:59"],
  morning: ["00:00", "12:00"],
  afternoon: ["12:00", "23:59"],
};

export const isHalfDayAbsence = (duration) =>
  duration === "morning" || duration === "afternoon";

export const SHIFT_TIME_OPTIONS = Array.from(
  { length: 96 },
  (_, index) =>
    `${padTime(Math.floor(index / 4))}:${padTime((index % 4) * 15)}`,
);

export function normalizeShiftTime(value) {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "";
  return `${padTime(match[1])}:${match[2]}`;
}

export function makeShiftDraft({ employeeId, position = "", slot, event }) {
  const { start, end } = event || slot;
  const startDate = dateKey(start);
  const endDate = dateKey(end);
  const isLeave = Boolean(event?.isLeave);
  const absenceDuration =
    event?.absenceDuration ?? (isLeave && !event.fullDay ? "custom" : "full");
  const startTime = timeKey(start);
  const endTime = timeKey(end);
  const inferredOvernight =
    !(isLeave && absenceDuration === "full") &&
    endDate === civilKey(civilDay(startDate) + DAY) &&
    endTime < startTime;
  return {
    employeeId: event?.resourceId ?? employeeId ?? "",
    shiftId: event?.id ?? null,
    leaveRequestId: event?.leaveRequestId ?? null,
    isLeave,
    absenceType: event?.absenceType ?? "",
    absenceDuration,
    title: event?.shiftLabel ?? "",
    position: event?.position ?? position,
    breakMinutes: String(event?.breakMinutes ?? 0),
    notes: event?.notes ?? "",
    seriesId: event?.seriesId ?? null,
    date: startDate,
    endDate: endDate === startDate || inferredOvernight ? "" : endDate,
    startTime,
    endTime,
    originalStart: start,
    originalEnd: end,
  };
}

export function getShiftDraftRange(draft) {
  const { date, isLeave, absenceDuration, originalStart, originalEnd } = draft;
  const explicitEnd =
    isLeave && isHalfDayAbsence(absenceDuration) ? "" : draft.endDate;
  let endDate = explicitEnd || date;
  if (!parsePlanningDate(date) || !parsePlanningDate(endDate)) return { error: "invalidDates" };

  const presetHours = isLeave && ABSENCE_HOURS[absenceDuration];
  const startTime = presetHours?.[0] ?? normalizeShiftTime(draft.startTime);
  const endTime = presetHours?.[1] ?? normalizeShiftTime(draft.endTime);
  if (!startTime || !endTime) return { error: "invalidTimes" };
  // Preserve an existing shift during the repeated hour when clocks go back.
  const sameOriginalHours =
    originalStart && originalEnd &&
    `${date}T${startTime}` === parisDateTime(originalStart) &&
    `${date}T${endTime}` === parisDateTime(originalEnd);
  if (!explicitEnd && endTime < startTime && !sameOriginalHours) {
    endDate = civilKey(civilDay(date) + DAY);
  }
  const start = getParisPlanningInstant(date, startTime, originalStart);
  const end = getParisPlanningInstant(endDate, endTime, originalEnd);
  if (!start || !end) return { error: "invalidLocalTime" };
  if (end <= start) return { error: "invalidRange" };
  return {
    start,
    end,
    endDate,
    minutes: Math.round((end - start) / 60_000),
    endsAnotherDay: date !== endDate,
  };
}

export function findDraftConflict(shifts, shiftId, range) {
  if (range.error) return null;
  const shift = (shifts || []).find(
    (item) =>
      String(item._id) !== String(shiftId) &&
      new Date(item.start) < range.end &&
      new Date(item.end) > range.start,
  );
  return shift ? { ...shift, isLeave: isLeaveShiftRecord(shift) } : null;
}

export function validateShiftDraft(draft, range) {
  if (!draft.employeeId) return "employeeRequired";
  if (range.error) return range.error;
  if (draft.isLeave) return null;
  if (["conge", "conges"].includes(normalizePlanningText(draft.title))) return "leaveTitle";
  const pause = Number(draft.breakMinutes);
  if (!/^\d*$/.test(draft.breakMinutes) || !Number.isInteger(pause) ||
      pause * 60_000 >= range.end - range.start) return "invalidBreak";
  if (draft.position.trim().length > 80 || draft.notes.length > 2000 ||
      draft.title.length > 200) return "invalidDetails";
  return null;
}

export function makeExtraShift(draft, previous) {
  const range = getShiftDraftRange(previous);
  const nextStart = !range.error && dateKey(range.end) === draft.date ? timeKey(range.end) : "18:00";
  const [hours, minutes] = nextStart.split(":").map(Number);
  const nextEnd = `${padTime((hours + 4) % 24)}:${padTime(minutes)}`;
  return { ...draft, title: "", notes: "", breakMinutes: "0", endDate: "",
    startTime: nextStart, endTime: nextEnd, originalStart: null, originalEnd: null };
}

function repeatDates(date, repeat, maxDates) {
  if (repeat.frequency === "none") return [date];
  const interval = Number(repeat.interval);
  const count = Number(repeat.count);
  const start = civilDay(date);
  const until = civilDay(repeat.until);
  if (!Number.isInteger(interval) || interval < 1 || interval > 52 ||
      (repeat.frequency === "weekly" && !repeat.days.length) ||
      (repeat.end === "count" && (!Number.isInteger(count) || count < 2 || count > maxDates)) ||
      (repeat.end === "until" && (!parsePlanningDate(repeat.until) || until <= start || until - start > MAX_REPEAT_DAYS * DAY))) {
    return [];
  }
  const dates = [date];
  const weekOffset = (shiftWeekday(date) + 6) % 7;
  for (let offset = 1; offset <= MAX_REPEAT_DAYS; offset += 1) {
    const next = start + offset * DAY;
    if (repeat.end === "until" && next > until) break;
    const key = civilKey(next);
    const occurs = repeat.frequency === "daily" ? offset % interval === 0 :
      Math.floor((offset + weekOffset) / 7) % interval === 0 && repeat.days.includes(shiftWeekday(key));
    if (!occurs) continue;
    dates.push(key);
    if (dates.length > maxDates) return [];
    if (repeat.end === "count" && dates.length === count) return dates;
  }
  return repeat.end === "until" && dates.length > 1 ? dates : [];
}

export function getShiftBatch(draft, extra, repeat) {
  const blocks = [draft, ...extra.map((block) => ({ ...block, date: draft.date }))];
  const ranges = blocks.map(getShiftDraftRange);
  const blockErrors = blocks.map((block, index) => validateShiftDraft(block, ranges[index]));
  if (blockErrors.some(Boolean)) return { ranges, blockErrors, error: "invalidBatch" };
  const dates = repeatDates(draft.date, repeat, Math.floor(MAX_BATCH_SHIFTS / blocks.length));
  if (!dates.length) return { ranges, blockErrors, error: "invalidRepeat" };
  const occurrences = [];
  for (const date of dates) {
    for (const [index, block] of blocks.entries()) {
      const offset = civilDay(date) - civilDay(block.date);
      const occurrence = offset === 0 ? block : {
        ...block, date,
        endDate: block.endDate ? civilKey(civilDay(block.endDate) + offset) : "",
        originalStart: null, originalEnd: null,
      };
      const range = offset === 0 ? ranges[index] : getShiftDraftRange(occurrence);
      const error = validateShiftDraft(occurrence, range);
      if (error) return { ranges, blockErrors, error, date };
      occurrences.push({ draft: occurrence, range });
    }
  }
  const ordered = [...occurrences].sort((a, b) => a.range.start - b.range.start);
  const overlap = ordered.find((entry, index) => index > 0 && entry.range.start < ordered[index - 1].range.end);
  return {
    ranges, blockErrors, occurrences, count: dates.length,
    minutes: occurrences.reduce((total, { draft, range }) =>
      total + plannedShiftMinutes(range.start, range.end, Number(draft.breakMinutes)), 0),
    ...(overlap && { error: "batchOverlap", date: overlap.draft.date }),
  };
}

function shiftPayload(draft, range) {
  return {
    isLeave: draft.isLeave,
    title: draft.isLeave ? "" : draft.title.trim(),
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    ...(draft.isLeave ? {
      absenceType: draft.absenceType || null,
      absenceDuration: draft.absenceDuration,
    } : {
      breakMinutes: Number(draft.breakMinutes),
      position: draft.position.trim(),
      notes: draft.notes.trim(),
    }),
  };
}

export function planningShiftCollection(apiUrl, restaurantId, employeeId) {
  return `${apiUrl}/restaurants/${restaurantId}/employees/${employeeId}/shifts`;
}

export async function savePlanningShiftBatch(http, collection, batch, requests) {
  const payload = {
    shifts: batch.occurrences.map(({ draft, range }) => shiftPayload(draft, range)),
    repeating: batch.count > 1,
  };
  const signature = JSON.stringify(payload);
  if (!requests.has(signature)) requests.set(signature, globalThis.crypto.randomUUID());
  const { data } = await http.post(`${collection}/batch`, {
    ...payload, requestId: requests.get(signature),
  });
  return data.shifts;
}

export async function savePlanningShift(
  http,
  apiUrl,
  restaurantId,
  draft,
  range,
) {
  if (
    !restaurantId ||
    draft.leaveRequestId ||
    validateShiftDraft(draft, range)
  ) {
    throw new Error("Invalid planning shift");
  }
  const collection = planningShiftCollection(apiUrl, restaurantId, draft.employeeId);
  const payload = shiftPayload(draft, range);
  const { data } = draft.shiftId
    ? await http.put(`${collection}/${draft.shiftId}`, payload)
    : await http.post(collection, payload);
  return data.shifts;
}

export function updatePlanningEmployee(
  restaurant,
  restaurantId,
  employeeId,
  update,
) {
  if (!restaurant || String(restaurant._id) !== String(restaurantId))
    return restaurant;
  return {
    ...restaurant,
    employees: (restaurant.employees || []).map((employee) =>
      String(employee._id) === String(employeeId) ? update(employee) : employee,
    ),
  };
}
