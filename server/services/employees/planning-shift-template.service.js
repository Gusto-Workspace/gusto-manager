const { readWorkDetails } = require("./planning-shift.service");

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY = 86_400_000;

function prepareShiftTemplate(input, titleKey) {
  const { name, title, startTime, endTime, endDayOffset } = input || {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80 || /\p{Cc}/u.test(name) ||
      typeof title !== "string" || title.length > 200 || /\p{Cc}/u.test(title) ||
      ["conge", "conges"].includes(titleKey(title)) ||
      typeof startTime !== "string" || !TIME.test(startTime) || typeof endTime !== "string" || !TIME.test(endTime) ||
      !Number.isSafeInteger(endDayOffset) || endDayOffset < 0) return null;

  const start = new Date(`2000-01-01T${startTime}:00Z`);
  const end = new Date(Date.parse(`2000-01-01T${endTime}:00Z`) + endDayOffset * DAY);
  const details = readWorkDetails(input, null, start, end);
  if (!details || !Number.isFinite(+end)) return null;
  return { name: name.trim(), title: title.trim(), startTime, endTime, endDayOffset, ...details };
}

function templateNameKey(name) {
  return name.normalize("NFKC").toLocaleLowerCase("fr-FR").replace(/\s+/gu, " ");
}

module.exports = { prepareShiftTemplate, templateNameKey };
