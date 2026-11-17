function normalizeDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return "";
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function sanitizeExceptionalClosures(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map(normalizeDateKey).filter(Boolean))].sort();
}

function isRestaurantExceptionallyClosed(restaurant, date) {
  const dateKey = normalizeDateKey(date);
  if (!dateKey) return false;

  return sanitizeExceptionalClosures(restaurant?.exceptional_closures).includes(
    dateKey,
  );
}

module.exports = {
  isRestaurantExceptionallyClosed,
  normalizeDateKey,
  sanitizeExceptionalClosures,
};
