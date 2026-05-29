export const STATUS_LABELS = {
  pending: "En attente",
  confirmed: "Confirmée",
  preparing: "En préparation",
  ready: "Prête",
  out_for_delivery: "En livraison",
  completed: "Terminée",
  canceled: "Annulée",
  rejected: "Refusée",
};

export const STATUS_ORDER = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "canceled",
  "rejected",
];

export const NEXT_STATUS = {
  pending: ["confirmed", "rejected"],
  confirmed: ["preparing", "canceled"],
  preparing: ["ready", "canceled"],
  ready: ["completed", "out_for_delivery"],
  out_for_delivery: ["completed"],
};

export const inputClass =
  "h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none transition focus:border-blue/50 focus:ring-2 focus:ring-blue/15";

export function fieldClass(hasError) {
  return `${inputClass} ${
    hasError
      ? "border-red focus:border-red focus:ring-red/15"
      : "border-darkBlue/10"
  }`;
}

export function toMoney(value) {
  return `${Number(value || 0).toFixed(2)} €`;
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function toDateKey(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function formatTime(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function getCatalogCategoryName(item) {
  if (item?.sourceType === "menu") return "Menus";
  return String(item?.categoryName || "À emporter").trim() || "À emporter";
}

export function getStatusTone(status) {
  if (status === "completed") return "bg-green/10 text-green border-green/20";
  if (status === "canceled" || status === "rejected") {
    return "bg-red/10 text-red border-red/20";
  }
  if (status === "pending") return "bg-blue/10 text-blue border-blue/20";
  return "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/10";
}

export function buildMonthGrid(currentMonth, orders, searchTerm = "") {
  const start = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1,
  );
  const end = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  );
  const firstWeekday = (start.getDay() + 6) % 7;
  const lastWeekday = end.getDay();
  const trailing = (7 - ((lastWeekday + 6) % 7) - 1 + 7) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - firstWeekday);
  const gridEnd = new Date(end);
  gridEnd.setDate(end.getDate() + trailing);

  const q = normalizeForMatch(searchTerm);
  const days = [];
  for (
    let cursor = new Date(gridStart);
    cursor <= gridEnd;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const date = new Date(cursor);
    const key = toDateKey(date);
    const dayOrders = orders.filter(
      (order) => toDateKey(order.scheduledFor) === key,
    );
    const matched = q
      ? dayOrders.filter((order) =>
          normalizeForMatch(
            `${order.orderNumber} ${order.customerFirstName} ${order.customerLastName} ${order.customerPhone} ${order.customerEmail}`,
          ).includes(q),
        )
      : dayOrders;
    const byStatus = {};
    matched.forEach((order) => {
      byStatus[order.status] = (byStatus[order.status] || 0) + 1;
    });
    days.push({
      key,
      date,
      inMonth: date.getMonth() === currentMonth.getMonth(),
      total: matched.length,
      byStatus,
      orders: matched,
    });
  }
  return days;
}

export function getDeliveryZoneForm(zone = {}, index = 0) {
  return {
    localId: String(zone._id || `zone-${index}-${zone.name || "new"}`),
    _id: zone._id || "",
    name: zone.name || "",
    zipCodesText: Array.isArray(zone.zipCodes) ? zone.zipCodes.join(", ") : "",
    fee: zone.fee ?? 0,
    minimumOrder: zone.minimumOrder ?? 0,
    estimatedMinutes: zone.estimatedMinutes ?? 30,
    active: zone.active !== false,
  };
}

export function buildDeliveryZonesPayload(zones) {
  return (zones || [])
    .map((zone) => ({
      _id: zone._id || undefined,
      name: String(zone.name || "").trim() || "Zone de livraison",
      zipCodes: String(zone.zipCodesText || "")
        .split(",")
        .map((zip) => zip.trim())
        .filter(Boolean),
      fee: Number(zone.fee || 0),
      minimumOrder: Number(zone.minimumOrder || 0),
      estimatedMinutes: Number(zone.estimatedMinutes || 30),
      active: zone.active !== false,
    }))
    .filter((zone) => zone.zipCodes.length > 0);
}
