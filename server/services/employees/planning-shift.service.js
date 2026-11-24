const { createHash } = require("node:crypto");

const MAX_BATCH_SHIFTS = 200;
const MAX_SHIFT_NOTES = 2000;
const MAX_SHIFT_POST = 80;
const MAX_SERIES_SPAN = 365 * 86_400_000;
const parisDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
});

function parseBatchInstant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(+date) && date.toISOString() === value ? date : null;
}

function plannedMinutes(start, end, breakMinutes = 0) {
  return Math.max(0, Math.round((+end - +start) / 60_000) - breakMinutes);
}

function hasControlCharacters(value, allowLineBreaks = false) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return (code < 32 || code === 127) &&
      !(allowLineBreaks && [9, 10, 13].includes(code));
  });
}

function readWorkDetails(input, current, start, end, defaultPost, isLeave) {
  if (isLeave) {
    if (["breakMinutes", "position", "notes"].some((key) => input[key] != null && input[key] !== "" && input[key] !== 0)) {
      return null;
    }
    return { breakMinutes: 0, position: null, notes: "" };
  }

  const breakMinutes = input.breakMinutes === undefined ? (current?.breakMinutes ?? 0) : input.breakMinutes;
  const position = input.position === undefined ? (current?.position ?? defaultPost ?? "") : input.position;
  const notes = input.notes === undefined ? (current?.notes ?? "") : input.notes;
  if (
    !Number.isFinite(+start) || !(end > start) || !Number.isInteger(breakMinutes) || breakMinutes < 0 ||
    breakMinutes * 60_000 >= +end - +start ||
    typeof position !== "string" || position.trim().length > MAX_SHIFT_POST ||
    hasControlCharacters(position) ||
    typeof notes !== "string" || notes.length > MAX_SHIFT_NOTES ||
    hasControlCharacters(notes, true)
  ) {
    return null;
  }
  return { breakMinutes, position: position.trim(), notes: notes.trim() };
}

function prepareShiftBatch(body, titleKey) {
  if (
    !body || !Array.isArray(body.shifts) ||
    body.shifts.length < 1 || body.shifts.length > MAX_BATCH_SHIFTS ||
    typeof body.requestId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId) ||
    typeof body.repeating !== "boolean"
  ) return { status: 400, message: "La demande de création groupée est invalide." };

  const shifts = [];
  for (const [index, entry] of body.shifts.entries()) {
    if (!entry || Array.isArray(entry) ||
        typeof entry.title !== "string" || entry.title.length > 200 || entry.isLeave || entry.leaveRequestId ||
        ["conge", "conges"].includes(titleKey(entry.title))) {
      return { status: 400, message: `Intitulé ou horaires invalides pour le shift ${index + 1}.` };
    }
    const start = parseBatchInstant(entry.start);
    const end = parseBatchInstant(entry.end);
    const details = readWorkDetails(entry, null, start, end);
    if (!start || !end || !(end > start) || !details) {
      return { status: 400, message: `Horaires, pause, poste ou notes invalides pour le shift ${index + 1}.` };
    }
    shifts.push({ start, end, title: entry.title.trim(), ...details, isLeave: false });
  }
  const ordered = shifts.map((shift, index) => ({ ...shift, index })).sort((a, b) => a.start - b.start);
  const firstDay = parisDate.format(ordered[0].start);
  const lastDay = parisDate.format(ordered.at(-1).start);
  if (body.repeating !== (firstDay !== lastDay)) {
    return { status: 400, message: "Les dates de création groupée ne correspondent pas au mode de répétition." };
  }
  if (Date.parse(lastDay) - Date.parse(firstDay) > MAX_SERIES_SPAN) {
    return { status: 400, message: "Une répétition est limitée à un an." };
  }
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end) {
      const conflict = ordered[index - 1];
      return {
        status: 409,
        conflictType: "batch_overlap",
        message: `Les shifts ${conflict.index + 1} et ${ordered[index].index + 1} se chevauchent.`,
        attempted: ordered[index],
        conflict,
      };
    }
  }
  const signature = createHash("sha256").update(JSON.stringify({ shifts, repeating: body.repeating })).digest("hex");
  return { shifts, signature, key: body.requestId.toLowerCase(), repeating: body.repeating };
}

function noShiftOverlap(shifts, excludeId) {
  const ranges = shifts.map(({ start, end }) => ({
    start: { $lt: end },
    end: { $gt: start },
  }));
  return { $not: { $elemMatch: {
    ...(excludeId && { _id: { $ne: excludeId } }),
    $or: ranges,
  } } };
}

module.exports = { MAX_SHIFT_NOTES, MAX_SHIFT_POST, plannedMinutes, readWorkDetails, prepareShiftBatch, noShiftOverlap };
