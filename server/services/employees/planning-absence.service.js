const ABSENCE_TYPES = Object.freeze([
  "weekly_rest",
  "paid_leave",
  "unpaid_leave",
  "sick_leave",
  "authorized_absence",
  "unauthorized_absence",
  "work_accident",
  "commuting_accident",
  "maternity_leave",
  "paternity_leave",
  "parental_leave",
  "adoption_leave",
  "family_event",
  "child_sick_leave",
  "training",
  "public_holiday",
  "compensatory_rest",
  "rtt",
  "other",
]);

const ABSENCE_DURATIONS = Object.freeze([
  "full",
  "morning",
  "afternoon",
  "custom",
]);

function resolvePlanningAbsence(
  { absenceType, absenceDuration },
  { manualAbsence, currentShift, datesChanged = false },
) {
  if (absenceType != null && !ABSENCE_TYPES.includes(absenceType)) return null;
  if (absenceDuration != null && !ABSENCE_DURATIONS.includes(absenceDuration))
    return null;
  if (!manualAbsence) {
    return absenceType == null && absenceDuration == null
      ? { absenceType: null, absenceDuration: null }
      : null;
  }

  return {
    absenceType:
      absenceType === undefined
        ? (currentShift?.absenceType ?? null)
        : absenceType,
    absenceDuration:
      absenceDuration === undefined
        ? datesChanged
          ? null
          : (currentShift?.absenceDuration ?? null)
        : absenceDuration,
  };
}

module.exports = { ABSENCE_TYPES, ABSENCE_DURATIONS, resolvePlanningAbsence };
