import { parisPlanningDateKey } from "./planning-grid.utils.mjs";

export const MAX_PLANNING_ACTION_SHIFTS = 200;
const DAY = 86_400_000;
const timestamp = (key) => Date.parse(`${key}T00:00:00Z`);
const dayDistance = (from, to) => (timestamp(to) - timestamp(from)) / DAY;
export const stepDate = (key, days) => new Date(timestamp(key) + days * DAY).toISOString().slice(0, 10);
export const cellKey = ({ employeeId, date }) => `${employeeId}:${date}`;

export function eventsInCell(segments) {
  return segments.filter(({ event, fromPreviousDay }) => event.isLeave || !fromPreviousDay)
    .map(({ event }) => event);
}

export function shiftSource(event) {
  return {
    employeeId: String(event.resourceId), shiftId: event.id,
    start: event.start.toISOString(), end: event.end.toISOString(),
  };
}

export function visiblePlanningEmployees(employees, hiddenShifts) {
  if (!hiddenShifts.size) return employees;
  return employees.map((employee) => ({
    ...employee,
    shifts: employee.shifts.filter(({ _id }) => !hiddenShifts.has(String(_id))),
  }));
}

export async function deletePlanningShift(event, hiddenShifts, { send, onChange, onDeleted, onError }) {
  const entry = shiftSource(event);
  const id = String(entry.shiftId);
  if (hiddenShifts.has(id)) return;
  // Keep the original in the roster until the server accepts the deletion.
  hiddenShifts.add(id);
  onChange(new Set(hiddenShifts));
  try {
    await send(entry);
  } catch (error) {
    hiddenShifts.delete(id);
    onChange(new Set(hiddenShifts));
    onError(error);
    return;
  }
  // A late roster response may still contain the shift. Keep it hidden in this view.
  onDeleted(entry);
}

export function reconcilePlanningShift(employee, shiftId, previousShift, serverShifts) {
  const matches = ({ _id }) => String(_id) === String(shiftId);
  if (!previousShift || employee.shifts?.find(matches) !== previousShift) return employee;
  const currentShift = serverShifts.find(matches);
  return { ...employee, shifts: employee.shifts.flatMap((shift) =>
    matches(shift) ? (currentShift ? [currentShift] : []) : [shift],
  ) };
}

export function dropEntry(event, { employeeId, date }) {
  return { ...shiftSource(event), targetEmployeeId: employeeId, date };
}

export function isSourceCell(event, { employeeId, date }) {
  return String(event.resourceId) === employeeId && parisPlanningDateKey(event.start) === date;
}

export function rectangleCells(rows, from, to) {
  const first = rows.indexOf(from.employeeId);
  const last = rows.indexOf(to.employeeId);
  if (first < 0 || last < 0) return [];
  const dates = [from.date, to.date].sort();
  const days = dayDistance(...dates) + 1;
  return rows.slice(Math.min(first, last), Math.max(first, last) + 1).flatMap((employeeId) =>
    Array.from({ length: days }, (_, day) => ({ employeeId, date: stepDate(dates[0], day) })));
}

export function copyDestinations(origin, ids, from, to, shiftCount) {
  const days = dayDistance(from, to) + 1;
  if (!Number.isInteger(days) || days < 1 || !shiftCount) return [];
  const includesOrigin = ids.includes(origin.employeeId) && from <= origin.date && origin.date <= to;
  if ((days * ids.length - Number(includesOrigin)) * shiftCount > MAX_PLANNING_ACTION_SHIFTS) return [];
  return ids.flatMap((employeeId) =>
    Array.from({ length: days }, (_, offset) => ({ employeeId, date: stepDate(from, offset) })))
    .filter((cell) => cellKey(cell) !== cellKey(origin));
}

export function cellCopyTargets(rows, origin, destination) {
  return rectangleCells(rows, origin, destination).filter((cell) => cellKey(cell) !== cellKey(origin));
}

export function cellShiftEntries(events, origin, destinations) {
  return destinations.flatMap((cell) => events.map((event) => ({
    ...dropEntry(event, cell),
    ...(event.isLeave && { sourceDate: origin.date }),
  })));
}

