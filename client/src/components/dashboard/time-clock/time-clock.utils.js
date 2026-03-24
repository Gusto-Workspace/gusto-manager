export const TIME_CLOCK_ACTIONS = {
  CLOCK_IN: "clock_in",
  BREAK_START: "break_start",
  BREAK_END: "break_end",
  CLOCK_OUT: "clock_out",
};

export const TIME_CLOCK_REFRESH_EVENT = "gusto:time-clock-updated";
export const TIME_CLOCK_STORAGE_KEY = "gm:timeClock:lastUpdate";

export function getDashboardToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getAuthConfig(config = {}) {
  const token = getDashboardToken();
  if (!token) return config;

  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };
}

export function toLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getEmployeeDisplayName(employee) {
  const firstname =
    employee?.firstname ||
    employee?.employeeSnapshot?.firstname ||
    employee?.snapshot?.firstname ||
    "";
  const lastname =
    employee?.lastname ||
    employee?.employeeSnapshot?.lastname ||
    employee?.snapshot?.lastname ||
    "";

  return `${firstname} ${lastname}`.trim();
}

export function formatMinutes(value) {
  const minutes = Math.max(0, Number(value || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

export function formatTime(value) {
  if (!value) return "--:--";

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "--:--";
  }
}

export function formatDate(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export function formatDateTime(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export function formatDateKey(value) {
  if (!value) return "—";
  return formatDate(new Date(`${value}T12:00:00`));
}

export function getTimeClockActionLabel(action) {
  switch (action) {
    case TIME_CLOCK_ACTIONS.CLOCK_IN:
      return "Pointer l'arrivée";
    case TIME_CLOCK_ACTIONS.BREAK_START:
      return "Démarrer une pause";
    case TIME_CLOCK_ACTIONS.BREAK_END:
      return "Fin de pause";
    case TIME_CLOCK_ACTIONS.CLOCK_OUT:
      return "Pointer la sortie";
    default:
      return "Pointage";
  }
}

export function getTimeClockSituationLabel(situation) {
  switch (situation) {
    case "working":
      return "En service";
    case "on_break":
      return "En pause";
    default:
      return "Hors service";
  }
}

export function getTimeClockAnomalyLabel(code) {
  switch (code) {
    case "missing_clock_out":
      return "Sortie manquante";
    case "open_break":
      return "Pause en cours";
    case "long_break":
      return "Pause longue";
    case "long_shift":
      return "Amplitude longue";
    case "invalid_times":
      return "Horaires incohérents";
    default:
      return "Anomalie";
  }
}

export function cloneSignatureStrokes(strokes) {
  return (Array.isArray(strokes) ? strokes : []).map((stroke) => ({
    points: Array.isArray(stroke?.points)
      ? stroke.points.map((point) => ({
          x: Number(point.x),
          y: Number(point.y),
        }))
      : [],
  }));
}

export function drawSignatureOnCanvas(
  canvas,
  strokes,
  {
    lineWidth = 2.4,
    strokeStyle = "#131E36",
    backgroundColor = "#FFFFFF",
  } = {},
) {
  if (!canvas) return;

  const cssWidth = Math.max(1, canvas.clientWidth || 1);
  const cssHeight = Math.max(1, canvas.clientHeight || 1);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const realWidth = Math.max(1, Math.floor(cssWidth * dpr));
  const realHeight = Math.max(1, Math.floor(cssHeight * dpr));

  if (canvas.width !== realWidth) canvas.width = realWidth;
  if (canvas.height !== realHeight) canvas.height = realHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  if (backgroundColor && backgroundColor !== "transparent") {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }

  ctx.strokeStyle = strokeStyle;
  ctx.fillStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of Array.isArray(strokes) ? strokes : []) {
    const points = Array.isArray(stroke?.points) ? stroke.points : [];
    if (!points.length) continue;

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x * cssWidth, points[0].y * cssHeight, 1.5, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x * cssWidth, points[0].y * cssHeight);

    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x * cssWidth, points[index].y * cssHeight);
    }

    ctx.stroke();
  }
}

export function emitTimeClockRefresh() {
  if (typeof window === "undefined") return;

  const stamp = new Date().toISOString();
  window.dispatchEvent(
    new CustomEvent(TIME_CLOCK_REFRESH_EVENT, { detail: { stamp } }),
  );
  localStorage.setItem(TIME_CLOCK_STORAGE_KEY, stamp);
}

export function openTimeClockInNewTab() {
  if (typeof window === "undefined") return;
  window.open("/dashboard/webapp/time-clock", "_blank", "noopener,noreferrer");
}
