import { addDays, addMonths, startOfMonth, startOfWeek } from "date-fns";

export const PLANNING_VIEWS = { DAY: "day", WEEK: "week", MONTH: "month" };
export const PLANNING_GROUPS = { EMPLOYEES: "employees", POSTS: "posts" };
const MINUTE = 60_000;
export const PLANNING_TIME_ZONE = "Europe/Paris";
const parisClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: PLANNING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export const parisPlanningDateTime = (date) => parisClock.format(date).replace(" ", "T");
export const parisPlanningDateKey = (date) => parisPlanningDateTime(date).slice(0, 10);
export const parisPlanningTime = (date) => parisPlanningDateTime(date).slice(11);

export function getParisPlanningInstant(key, time = "00:00", original) {
  const wall = `${key}T${time}`;
  if (original && parisPlanningDateTime(original) === wall) return new Date(+original);
  const utc = Date.parse(`${wall}:00Z`);
  if (!Number.isFinite(utc)) return null;
  // The first matching offset selects the earlier instant during the repeated hour.
  for (const offset of [120, 60]) {
    const candidate = new Date(utc - offset * MINUTE);
    if (parisPlanningDateTime(candidate) === wall) return candidate;
  }
  return null;
}

export function planningDateKey(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

export function parsePlanningDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(+date) && planningDateKey(date) === value
    ? date
    : null;
}

export function movePlanningDate(date, view, direction) {
  if (view === PLANNING_VIEWS.MONTH) return addMonths(date, direction);
  return addDays(
    date,
    view === PLANNING_VIEWS.WEEK ? 7 * direction : direction,
  );
}

export function restorePlanningConsultation(
  saved,
  restaurantId,
  now = new Date(),
) {
  const sameRestaurant =
    Boolean(restaurantId) &&
    String(saved?.restaurantId) === String(restaurantId);
  return {
    date: parsePlanningDate(saved?.date) || parsePlanningDate(parisPlanningDateKey(now)),
    view: Object.values(PLANNING_VIEWS).includes(saved?.view)
      ? saved.view
      : PLANNING_VIEWS.WEEK,
    group: Object.values(PLANNING_GROUPS).includes(saved?.group)
      ? saved.group
      : PLANNING_GROUPS.EMPLOYEES,
    query:
      sameRestaurant && typeof saved?.query === "string" ? saved.query : "",
    employeeId:
      sameRestaurant && typeof saved?.employeeId === "string"
        ? saved.employeeId
        : null,
  };
}

export function getPlanningPeriod(date, view) {
  const day = parsePlanningDate(planningDateKey(date));
  const start =
    view === PLANNING_VIEWS.DAY ? day : view === PLANNING_VIEWS.MONTH
      ? startOfMonth(day)
      : startOfWeek(day, { weekStartsOn: 1 });
  const endExclusive =
    view === PLANNING_VIEWS.MONTH ? addMonths(start, 1) :
      addDays(start, view === PLANNING_VIEWS.DAY ? 1 : 7);
  const days = [];
  for (let cursor = start; cursor < endExclusive; cursor = addDays(cursor, 1))
    days.push(cursor);
  const dayInstants = days.map((value) => getParisPlanningInstant(planningDateKey(value)));
  return {
    start, endExclusive, days, dayInstants,
    startInstant: dayInstants[0],
    endInstant: getParisPlanningInstant(planningDateKey(endExclusive)),
  };
}

export function normalizePlanningText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function getPlanningEmployees(employees, restaurantId) {
  return (employees || [])
    .filter((employee) => employee.accountType !== "accountant")
    .map((employee) => {
      const profile = employee.restaurantProfiles?.find(
        (item) =>
          String(item.restaurant?._id ?? item.restaurant) ===
          String(restaurantId),
      );
      const snapshot = profile?.snapshot || employee.snapshot || {};
      const firstname = snapshot.firstname ?? employee.firstname ?? "";
      const lastname = snapshot.lastname ?? employee.lastname ?? "";
      return {
        _id: employee._id,
        firstname,
        lastname,
        name: `${firstname} ${lastname}`.trim(),
        post: String(snapshot.post ?? employee.post ?? "").trim(),
        employment: profile?.employment || employee.employment || {},
        // The decorated roster and SSE update this top-level projection.
        shifts: employee.shifts ?? profile?.shifts ?? [],
        leaveRequests: employee.leaveRequests ?? profile?.leaveRequests ?? [],
      };
    });
}

export function isLeaveShiftRecord(shift) {
  return Boolean(
    shift?.isLeave ||
      shift?.leaveRequestId ||
      ["conges", "conge"].includes(normalizePlanningText(shift?.title ?? "")),
  );
}

function getLegacyAbsenceDuration(start, end) {
  const startTime = parisPlanningTime(start);
  const endTime = parisPlanningTime(end);
  if (startTime === "00:00" && endTime === "23:59") return "full";
  if (parisPlanningDateKey(start) === parisPlanningDateKey(end)) {
    if (startTime === "00:00" && endTime === "12:00") return "morning";
    if (startTime === "12:00" && endTime === "23:59") return "afternoon";
  }
  return "custom";
}

export function formatPlanningDuration(minutes) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

export function plannedShiftMinutes(start, end, breakMinutes = 0) {
  return Math.max(0, Math.round((end - start) / MINUTE) - breakMinutes);
}

export function getPlanningSlot(day, elapsedMinutes = null) {
  const civil = planningDateKey(day);
  const start = elapsedMinutes == null ? getParisPlanningInstant(civil, "09:00") :
    new Date(+getParisPlanningInstant(civil) + elapsedMinutes * MINUTE);
  return { start, end: new Date(+start + 30 * MINUTE) };
}

export function getPlanningTimeline(day, endExclusive) {
  const minutes = (+endExclusive - +day) / MINUTE;
  const hours = Array.from(
    { length: Math.ceil(minutes / 60) },
    (_, index) => new Date(+day + index * 60 * MINUTE),
  );
  return { minutes, hours };
}

export function layOutPlanningDay(segments, day, endExclusive) {
  const laneEnds = [];
  const duration = +endExclusive - +day;
  return segments.map((segment) => {
    let lane = laneEnds.findIndex((end) => end <= segment.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segment.end;
    return {
      ...segment,
      lane,
      left: (100 * (segment.start - day)) / duration,
      width: (100 * (segment.end - segment.start)) / duration,
    };
  });
}

export function buildPlanningGrid(employees, period, groupBy, noPost) {
  const { startInstant: start, endInstant: endExclusive, days, dayInstants } = period;
  const dailyMinutes = days.map(() => 0);
  const dayByKey = new Map(
    days.map((day, index) => [planningDateKey(day), index]),
  );
  const dayEnds = dayInstants.map((day, index) => dayInstants[index + 1] || endExclusive);
  let totalMinutes = 0;
  let carriedMinutes = 0;
  const groups = new Map();

  for (const employee of employees) {
    const employeeRows = new Map();
    const byPost = groupBy === PLANNING_GROUPS.POSTS;
    const getRow = (position) => {
      const groupLabel = byPost ? position || noPost : "";
      if (!employeeRows.has(groupLabel)) {
        employeeRows.set(groupLabel, { employee, position, minutes: 0, cells: days.map(() => []) });
      }
      return employeeRows.get(groupLabel);
    };
    getRow(employee.post);
    const requests = new Map(
      (employee.leaveRequests || []).map((request) => [
        String(request._id),
        request,
      ]),
    );

    for (const shift of employee.shifts) {
      if (shift.start == null || shift.end == null) continue;
      const shiftStart = new Date(shift.start);
      const shiftEnd = new Date(shift.end);
      if (
        !Number.isFinite(+shiftStart) ||
        !(shiftEnd > shiftStart) ||
        shiftStart >= endExclusive ||
        shiftEnd <= start
      )
        continue;

      const isLeave = isLeaveShiftRecord(shift);
      const request = requests.get(String(shift.leaveRequestId));
      const absenceDuration = isLeave
        ? (shift.absenceDuration ?? getLegacyAbsenceDuration(shiftStart, shiftEnd))
        : null;
      const breakMinutes = isLeave ? 0 : shift.breakMinutes ?? 0;
      const minutes = plannedShiftMinutes(shiftStart, shiftEnd, breakMinutes);
      const position = isLeave ? employee.post : shift.position ?? employee.post;
      const row = getRow(position);
      const event = {
        id: String(shift._id),
        resourceId: employee._id,
        start: shiftStart,
        end: shiftEnd,
        shiftLabel: isLeave ? "" : String(shift.title || "").trim(),
        position,
        breakMinutes,
        notes: isLeave ? "" : shift.notes ?? "",
        seriesId: isLeave ? null : shift.seriesId ?? null,
        leaveRequestId: shift.leaveRequestId,
        leaveType: request?.type ?? absenceDuration,
        absenceType: isLeave ? shift.absenceType : null,
        absenceDuration,
        isLeave,
        fullDay: absenceDuration === "full",
        minutes,
      };

      // Match the export: a timed shift belongs to its start day, without clipping its total.
      if (!isLeave) {
        row.minutes += minutes;
        const dayIndex = dayByKey.get(parisPlanningDateKey(shiftStart));
        if (dayIndex == null) carriedMinutes += minutes;
        else dailyMinutes[dayIndex] += minutes;
      }

      for (let index = 0; index < days.length; index += 1) {
        const day = dayInstants[index];
        const dayEnd = dayEnds[index];
        const segmentStart = new Date(Math.max(+shiftStart, +day));
        const segmentEnd = new Date(Math.min(+shiftEnd, +dayEnd));
        if (segmentEnd <= segmentStart) continue;
        row.cells[index].push({
          event,
          start: segmentStart,
          end: segmentEnd,
          fromPreviousDay: shiftStart < day,
          endsAtMidnight: +segmentEnd === +dayEnd,
        });
      }
    }

    for (const [groupLabel, row] of employeeRows) {
      row.cells.forEach((cell) =>
        cell.sort((a, b) => a.start - b.start || a.end - b.end),
      );
      totalMinutes += row.minutes;
      if (!groups.has(groupLabel))
        groups.set(groupLabel, { label: groupLabel, rows: [], minutes: 0 });
      const group = groups.get(groupLabel);
      group.rows.push({ ...row, position: byPost ? row.position ?? "" : undefined });
      group.minutes += row.minutes;
    }
  }

  return {
    groups: [...groups.values()],
    totalMinutes,
    dailyMinutes,
    carriedMinutes,
  };
}
