function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

function buildPath(basePath, query = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    const normalized = String(value).trim();
    if (!normalized) return;
    params.set(key, normalized);
  });

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function getNotificationTargetPath(
  notification,
  { pathname = "" } = {},
) {
  const preferWebapp = String(pathname || "").startsWith("/dashboard/webapp/");
  const module = String(notification?.module || "");
  const type = String(notification?.type || "");
  const meta = notification?.meta || {};
  const data = notification?.data || {};

  if (module === "reservations") {
    const reservationId =
      meta?.reservationId || data?._id || data?.reservationId;
    const day = toDateKey(meta?.reservationDate || data?.reservationDate);
    const basePath = preferWebapp
      ? "/dashboard/webapp/reservations"
      : "/dashboard/reservations";

    return buildPath(basePath, {
      day,
      reservationId,
    });
  }

  if (module === "gift_cards") {
    const purchaseId = meta?.purchaseId || data?._id || data?.purchaseId;
    const basePath = preferWebapp
      ? "/dashboard/webapp/gift-cards"
      : "/dashboard/gift-cards";

    return buildPath(basePath, {
      purchaseId,
    });
  }

  if (module === "employees" && type === "leave_request_created") {
    return buildPath("/dashboard/employees/planning/days-off", {
      employeeId: meta?.employeeId || data?.employeeId,
    });
  }

  return notification?.link || "/dashboard";
}
