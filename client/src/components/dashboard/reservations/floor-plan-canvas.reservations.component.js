import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  Stage,
  Layer,
  Rect,
  Text,
  Group,
  Line,
  Arc,
  Circle,
} from "react-konva";
import { RotateCcw } from "lucide-react";

function safeArr(a) {
  return Array.isArray(a) ? a : [];
}

function getReservationTableIds(reservation) {
  if (Array.isArray(reservation?.table?.tableIds)) {
    return reservation.table.tableIds
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  return [];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function polygonPoints(cx, cy, radius, sides, rotationRad = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides + rotationRad;
    pts.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  }
  return pts;
}

function clipPolygon(ctx, pts) {
  if (!pts || pts.length < 6) return;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

function clipRoundedRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(Number(r || 0), w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function minutesFromHHmm(timeStr) {
  const [h, m] = String(timeStr || "00:00")
    .split(":")
    .map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function getServiceBucketFromTime(reservationTime) {
  const [hh = "0"] = String(reservationTime || "00:00").split(":");
  return Number(hh) < 16 ? "lunch" : "dinner";
}

function getOccupancyMinutes(parameters, reservationTime) {
  const bucket = getServiceBucketFromTime(reservationTime);
  const v =
    bucket === "lunch"
      ? parameters?.table_occupancy_lunch_minutes
      : parameters?.table_occupancy_dinner_minutes;

  const n = Number(v || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function buildReservationDateTime(referenceDate, timeStr) {
  const d =
    referenceDate instanceof Date
      ? new Date(referenceDate)
      : new Date(referenceDate);
  if (Number.isNaN(d.getTime())) return null;

  const [hh = 0, mm = 0] = String(timeStr || "00:00")
    .split(":")
    .map(Number);

  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    Number(hh) || 0,
    Number(mm) || 0,
    0,
    0,
  );
}

function isPendingStillBlocking(reservation) {
  if (!reservation) return false;
  if (reservation.status !== "Pending") return false;
  if (reservation.pendingExpiresAt == null) return true;
  return new Date(reservation.pendingExpiresAt).getTime() > Date.now();
}

function isBlockingReservation(reservation) {
  if (!reservation) return false;
  if (
    ["AwaitingBankHold", "Confirmed", "Active", "Late"].includes(
      reservation.status,
    )
  ) {
    return true;
  }
  if (reservation.status === "Pending") {
    return isPendingStillBlocking(reservation);
  }
  return false;
}

function areSameReservation(a, b) {
  if (!a || !b) return false;

  const aId = String(a?._id || a?.id || "");
  const bId = String(b?._id || b?.id || "");

  if (aId && bId) return aId === bId;

  return (
    String(a?.reservationDate || "") === String(b?.reservationDate || "") &&
    String(a?.reservationTime || "") === String(b?.reservationTime || "") &&
    String(a?.table?.toString?.() || a?.table || "") ===
      String(b?.table?.toString?.() || b?.table || "") &&
    String(a?.firstName || "") === String(b?.firstName || "") &&
    String(a?.lastName || "") === String(b?.lastName || "") &&
    Number(a?.numberOfGuests || 0) === Number(b?.numberOfGuests || 0)
  );
}

function getDisplayName(reservation) {
  const first = String(reservation?.customerFirstName || "").trim();
  const last = String(reservation?.customerLastName || "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  return String(reservation?.customerName || "").trim() || "Réservation";
}

function getReservationWindow(reservation, parameters) {
  const start = minutesFromHHmm(reservation?.reservationTime);
  const occupancy = getOccupancyMinutes(
    parameters,
    reservation?.reservationTime,
  );
  const end = start + occupancy;
  return { start, end, occupancy };
}

function getReferenceMinute({ liveMode, selectedTime }) {
  if (liveMode) {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
  return minutesFromHHmm(selectedTime || "00:00");
}

function getReferenceTimeString({ liveMode, selectedTime }) {
  if (!liveMode) {
    return String(selectedTime || "00:00").slice(0, 5);
  }

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getReferenceOccupancyMinutes({ parameters, liveMode, selectedTime }) {
  const referenceTime = getReferenceTimeString({ liveMode, selectedTime });
  return getOccupancyMinutes(parameters, referenceTime);
}

function getTableReservationState({
  reservations,
  parameters,
  liveMode,
  selectedTime,
}) {
  const refMinute = getReferenceMinute({ liveMode, selectedTime });

  const blocking = safeArr(reservations)
    .filter((r) => isBlockingReservation(r))
    .map((r) => {
      const window = getReservationWindow(r, parameters);
      return { reservation: r, ...window };
    });

  const livePriority = {
    Active: 5,
    Late: 4,
    Confirmed: 3,
    Pending: 2,
  };

  // 1) Réservation réelle en cours côté métier
  const realCurrent =
    blocking
      .filter((x) => ["Active", "Late"].includes(x.reservation?.status))
      .sort((a, b) => {
        const pa = livePriority[a.reservation?.status] || 0;
        const pb = livePriority[b.reservation?.status] || 0;
        if (pa !== pb) return pb - pa;

        return (
          minutesFromHHmm(b.reservation?.reservationTime) -
          minutesFromHHmm(a.reservation?.reservationTime)
        );
      })[0]?.reservation || null;

  // 2) Toutes les résas qui couvrent théoriquement le créneau affiché
  const overlapping = blocking.filter(
    (x) => refMinute >= x.start && refMinute < x.end,
  );

  let theoreticalCurrent = null;

  if (liveMode) {
    theoreticalCurrent =
      overlapping.sort((a, b) => {
        const pa = livePriority[a.reservation?.status] || 0;
        const pb = livePriority[b.reservation?.status] || 0;
        if (pa !== pb) return pb - pa;

        return (
          minutesFromHHmm(a.reservation?.reservationTime) -
          minutesFromHHmm(b.reservation?.reservationTime)
        );
      })[0]?.reservation || null;
  } else {
    theoreticalCurrent =
      overlapping.sort((a, b) => {
        const aExact = a.start === refMinute ? 1 : 0;
        const bExact = b.start === refMinute ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        if (a.start !== b.start) return b.start - a.start;

        return (
          minutesFromHHmm(a.reservation?.reservationTime) -
          minutesFromHHmm(b.reservation?.reservationTime)
        );
      })[0]?.reservation || null;
  }

  // 3) Résa théorique en conflit avec la résa réelle en cours
  // -> utile quand la prochaine résa a déjà atteint son heure
  const conflictingReservation =
    overlapping
      .map((x) => x.reservation)
      .filter((r) => !areSameReservation(r, realCurrent))
      .sort(
        (a, b) =>
          minutesFromHHmm(a?.reservationTime) -
          minutesFromHHmm(b?.reservationTime),
      )[0] || null;

  // 4) Prochaine résa théorique future
  const nextReservation =
    blocking
      .filter((x) => x.start > refMinute)
      .filter((x) => !areSameReservation(x.reservation, realCurrent))
      .sort((a, b) => a.start - b.start)[0]?.reservation || null;

  // 5) Réservation à afficher dans le tooltip / drawer
  const displayReservation = liveMode
    ? realCurrent || theoreticalCurrent || nextReservation || null
    : theoreticalCurrent || nextReservation || null;

  // 6) Réservation utilisée pour le statut visuel
  const currentReservation = liveMode
    ? realCurrent || theoreticalCurrent || null
    : theoreticalCurrent || null;

  return {
    currentReservation,
    nextReservation,
    theoreticalCurrent,
    realCurrent,
    conflictingReservation,
    displayReservation,
  };
}

function getTableStatus({
  currentReservation,
  nextReservation,
  theoreticalCurrent,
  realCurrent,
  conflictingReservation,
  parameters,
  liveMode,
  selectedTime,
}) {
  const refMinute = getReferenceMinute({ liveMode, selectedTime });

  if (currentReservation) {
    const currentStatus = currentReservation?.status;

    // 1) Seules les résas réellement passées en cours sont "occupées"
    if (currentStatus === "Active") {
      // une autre résa devrait déjà être sur cette table
      if (
        conflictingReservation &&
        !areSameReservation(conflictingReservation, currentReservation)
      ) {
        return "to_release";
      }

      // une autre résa arrive bientôt
      if (
        nextReservation &&
        !areSameReservation(nextReservation, currentReservation)
      ) {
        const nextStart = minutesFromHHmm(nextReservation?.reservationTime);
        const minutesBeforeNext = nextStart - refMinute;

        if (minutesBeforeNext <= 15) {
          return "to_release";
        }
      }

      return "occupied";
    }

    // 2) Un client en retard reste en retard
    if (currentStatus === "Late") {
      if (
        conflictingReservation &&
        !areSameReservation(conflictingReservation, currentReservation)
      ) {
        return "to_release";
      }

      if (
        nextReservation &&
        !areSameReservation(nextReservation, currentReservation)
      ) {
        const nextStart = minutesFromHHmm(nextReservation?.reservationTime);
        const minutesBeforeNext = nextStart - refMinute;

        if (minutesBeforeNext <= 15) {
          return "to_release";
        }
      }

      return "late";
    }

    // 3) AwaitingBankHold / Confirmed / Pending ne deviennent jamais occupées automatiquement
    if (["AwaitingBankHold", "Confirmed", "Pending"].includes(currentStatus)) {
      return "assigned";
    }
  }

  // 4) Sinon, on regarde la prochaine résa future
  if (nextReservation) {
    const nextStart = minutesFromHHmm(nextReservation?.reservationTime);
    const remainingMinutes = nextStart - refMinute;

    const neededMinutes = getReferenceOccupancyMinutes({
      parameters,
      liveMode,
      selectedTime,
    });

    return remainingMinutes < neededMinutes ? "assigned" : "free";
  }

  return "free";
}

function statusTheme(status) {
  switch (status) {
    case "occupied":
      return {
        fill: "rgba(42, 136, 90, 0.22)",
        stroke: "rgba(56, 161, 105, 0.95)",
      };
    case "late":
      return {
        fill: "rgba(255, 159, 10, 0.22)",
        stroke: "rgba(255, 159, 10, 0.98)",
      };
    case "assigned":
      return {
        fill: "rgba(36, 99, 235, 0.18)",
        stroke: "rgba(37, 99, 235, 0.96)",
      };
    case "to_release":
      return {
        fill: "rgba(239, 68, 68, 0.20)",
        stroke: "rgba(220, 38, 38, 0.98)",
      };
    case "blocked":
      return {
        fill: "rgba(255, 244, 244, 0.98)",
        stroke: "rgba(148, 163, 184, 0.55)",
      };
    case "internal_only":
      return {
        fill: "rgba(107, 114, 128, 0.16)",
        stroke: "rgba(75, 85, 99, 0.92)",
      };
    default:
      return {
        fill: "rgba(255,255,255,0.96)",
        stroke: "rgba(148, 163, 184, 0.55)",
      };
  }
}

function getBlockedTableIdsMap(parameters, referenceDate, selectedTime) {
  const ranges = Array.isArray(parameters?.table_blocked_ranges)
    ? parameters.table_blocked_ranges
    : [];

  const start = buildReservationDateTime(
    referenceDate,
    selectedTime || "00:00",
  );

  if (!start) return new Set();

  const occupancyMinutes = getOccupancyMinutes(
    parameters,
    selectedTime || "00:00",
  );
  const end = new Date(
    start.getTime() + Math.max(0, occupancyMinutes) * 60 * 1000,
  );

  const ids = new Set();

  ranges.forEach((range) => {
    const rStart = new Date(range.startAt).getTime();
    const rEnd = new Date(range.endAt).getTime();

    if (!Number.isFinite(rStart) || !Number.isFinite(rEnd)) return;

    if (start.getTime() < rEnd && end.getTime() > rStart) {
      ids.add(String(range.tableId));
    }
  });

  return ids;
}

function getVisualTableState({ tableStatus, ref, blockedTableIds }) {
  const refId = String(ref?._id || "");

  if (blockedTableIds.has(refId)) return "blocked";
  if (ref?.onlineBookable === false) return "internal_only";

  return tableStatus;
}

function getTableDimensions(seatsCount) {
  let w = 96;
  let h = 56;

  if (seatsCount <= 2) {
    w = 60;
    h = 60;
  } else if (seatsCount <= 4) {
    w = 88;
    h = 58;
  } else if (seatsCount <= 6) {
    w = 102;
    h = 60;
  } else {
    w = 120;
    h = 64;
  }

  return { w, h };
}

function degToRad(deg) {
  return (Number(deg || 0) * Math.PI) / 180;
}

function rotatePoint(px, py, cx, cy, rad) {
  const dx = px - cx;
  const dy = py - cy;

  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

function aabbFromPoints(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return { x1: 0, y1: 0, x2: 0, y2: 0 };
  }

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { x1: minX, y1: minY, x2: maxX, y2: maxY };
}

function getRotatedRectAABB(x, y, w, h, rotationDeg = 0) {
  const rad = degToRad(rotationDeg);

  if (!rad) {
    return { x1: x, y1: y, x2: x + w, y2: y + h };
  }

  const cx = x + w / 2;
  const cy = y + h / 2;

  const corners = [
    rotatePoint(x, y, cx, cy, rad),
    rotatePoint(x + w, y, cx, cy, rad),
    rotatePoint(x + w, y + h, cx, cy, rad),
    rotatePoint(x, y + h, cx, cy, rad),
  ];

  return aabbFromPoints(corners);
}

function getRotatedLineAABB(x, y, relPoints, rotationDeg = 0, strokeWidth = 8) {
  const p = Array.isArray(relPoints) ? relPoints : [];
  if (p.length < 4) {
    return { x1: x, y1: y, x2: x, y2: y };
  }

  const rad = degToRad(rotationDeg);

  const p1 = { x: x + Number(p[0] || 0), y: y + Number(p[1] || 0) };
  const p2 = { x: x + Number(p[2] || 0), y: y + Number(p[3] || 0) };

  let pts = [p1, p2];

  if (rad) {
    const cx = x;
    const cy = y;
    pts = [
      rotatePoint(p1.x, p1.y, cx, cy, rad),
      rotatePoint(p2.x, p2.y, cx, cy, rad),
    ];
  }

  const bb = aabbFromPoints(pts);
  const pad = Number(strokeWidth || 8) / 2;

  return {
    x1: bb.x1 - pad,
    y1: bb.y1 - pad,
    x2: bb.x2 + pad,
    y2: bb.y2 + pad,
  };
}

function getObjectVisualBounds(o, tablesCatalog) {
  return getAABB(o, tablesCatalog);
}

function getObjectVisualCenter(o, tablesCatalog) {
  const bb = getObjectVisualBounds(o, tablesCatalog);
  return {
    x: (bb.x1 + bb.x2) / 2,
    y: (bb.y1 + bb.y2) / 2,
  };
}

function getAABB(o, tablesCatalog) {
  if (!o) return { x1: 0, y1: 0, x2: 0, y2: 0 };

  if (o.type === "table") {
    const ref = safeArr(tablesCatalog).find(
      (t) => String(t._id) === String(o.tableRefId),
    );
    const seats = Number(ref?.seats || 2);
    const { w, h } = getTableDimensions(seats);
    const x = Number(o.x || 0);
    const y = Number(o.y || 0);
    const rotation = Number(o.rotation || 0);

    return getRotatedRectAABB(x, y, w, h, rotation);
  }

  if (o.type === "decor") {
    if (o.shape === "rect") {
      const x = Number(o.x || 0);
      const y = Number(o.y || 0);
      const w = Number(o.w || 0);
      const h = Number(o.h || 0);
      const rotation = Number(o.rotation || 0);

      return getRotatedRectAABB(x, y, w, h, rotation);
    }

    if (o.shape === "circle") {
      const x = Number(o.x || 0);
      const y = Number(o.y || 0);
      const r = Number(o.r || 0);

      return { x1: x - r, y1: y - r, x2: x + r, y2: y + r };
    }

    if (o.shape === "line") {
      const pts = Array.isArray(o.points) ? o.points : [];
      const cx = (Number(pts[0] || 0) + Number(pts[2] || 0)) / 2;
      const cy = (Number(pts[1] || 0) + Number(pts[3] || 0)) / 2;
      const rel =
        pts.length >= 4
          ? [
              Number(pts[0] || 0) - cx,
              Number(pts[1] || 0) - cy,
              Number(pts[2] || 0) - cx,
              Number(pts[3] || 0) - cy,
            ]
          : [0, 0, 0, 0];

      return getRotatedLineAABB(
        cx,
        cy,
        rel,
        Number(o.rotation || 0),
        Number(o?.style?.strokeWidth || 8),
      );
    }
  }

  return { x1: 0, y1: 0, x2: 0, y2: 0 };
}

function unionBounds(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2),
  };
}

function boundsFromObjects(objs, canvasW, canvasH, tablesCatalog) {
  const arr = safeArr(objs).filter(Boolean);
  if (arr.length === 0) {
    return { x1: 0, y1: 0, x2: canvasW, y2: canvasH };
  }

  let bb = null;

  for (const o of arr) {
    if (!o.type) continue;
    const b = getAABB(o, tablesCatalog);
    if (!b) continue;
    bb = unionBounds(bb, b);
  }

  if (!bb) return { x1: 0, y1: 0, x2: canvasW, y2: canvasH };
  return bb;
}

function fitToBounds({
  bounds,
  stageW,
  stageH,
  paddingPx = 60,
  minScale = 0.15,
  maxScale = 2,
}) {
  const bw = Math.max(1, bounds.x2 - bounds.x1);
  const bh = Math.max(1, bounds.y2 - bounds.y1);

  const availW = Math.max(1, stageW - paddingPx * 2);
  const availH = Math.max(1, stageH - paddingPx * 2);

  const s = clamp(Math.min(availW / bw, availH / bh), minScale, maxScale);

  const cx = bounds.x1 + bw / 2;
  const cy = bounds.y1 + bh / 2;

  return {
    scale: s,
    pos: {
      x: stageW / 2 - cx * s,
      y: stageH / 2 - cy * s,
    },
    centerWorld: { x: cx, y: cy },
  };
}

function reservationStatusLabel(status) {
  const map = {
    AwaitingBankHold: "Empreinte en attente",
    Pending: "En attente",
    Confirmed: "Confirmée",
    Active: "Installée",
    Late: "En retard",
    Finished: "Terminée",
    Canceled: "Annulée",
    Rejected: "Refusée",
    NoShow: "No show",
  };
  return map[status] || status || "-";
}

export default function FloorPlanCanvasReservationsComponent({
  room,
  reservations,
  tablesCatalog,
  reservationParameters,
  selectedDate,
  selectedTime,
  liveMode,
  selectedTableState,
  onSelectTable,
  shouldResetView,
}) {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const panRef = useRef({ lastX: 0, lastY: 0 });
  const pinchRef = useRef({
    active: false,
    startDist: 0,
    startScale: 1,
    startPos: { x: 0, y: 0 },
    worldPoint: { x: 0, y: 0 },
  });

  const canvasW = Number(room?.canvas?.width || 2000);
  const canvasH = Number(room?.canvas?.height || 2000);
  const grid = Number(room?.canvas?.gridSize || 50);

  const centerWorldRef = useRef({ x: canvasW / 2, y: canvasH / 2 });
  const stageSizeRef = useRef({ w: 0, h: 0 });
  const posRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(0.7);
  const didInitialFitRef = useRef(false);
  const hasUserMovedViewRef = useRef(false);

  const tooltipRef = useRef(null);
  const [tooltipSize, setTooltipSize] = useState({ w: 220, h: 140 });
  const [tooltipReady, setTooltipReady] = useState(false);

  const [stageSize, setStageSize] = useState({ w: null, h: null });
  const [scale, setScale] = useState(0.7);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const catalog = useMemo(() => safeArr(tablesCatalog), [tablesCatalog]);
  const objects = useMemo(() => safeArr(room?.objects), [room?.objects]);
  const roomLayoutSnap = useMemo(() => {
    return JSON.stringify({
      id: String(room?._id || ""),
      canvas: room?.canvas || {},
      objects: safeArr(room?.objects),
    });
  }, [room?._id, room?.canvas, room?.objects]);

  const isMobile = !!stageSize.w && stageSize.w < 768;

  const dateKey = useMemo(() => {
    const d = selectedDate instanceof Date ? selectedDate : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(d.getDate()).padStart(2, "0")}`;
  }, [selectedDate]);

  const decorObjects = useMemo(
    () => objects.filter((obj) => obj?.type && obj.type !== "table"),
    [objects],
  );

  const tableObjects = useMemo(
    () => objects.filter((obj) => obj?.type === "table"),
    [objects],
  );

  const catalogById = useMemo(() => {
    const map = new Map();
    for (const item of catalog) {
      map.set(String(item?._id || ""), item);
    }
    return map;
  }, [catalog]);

  const reservationsByTableId = useMemo(() => {
    const map = new Map();

    for (const r of safeArr(reservations)) {
      const reservationTableIds = getReservationTableIds(r);
      if (reservationTableIds.length === 0) continue;

      const date = new Date(r?.reservationDate);
      if (Number.isNaN(date.getTime())) continue;

      const rDateKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (rDateKey !== dateKey) continue;

      reservationTableIds.forEach((tableId) => {
        const arr = map.get(tableId) || [];
        arr.push(r);
        map.set(tableId, arr);
      });
    }

    return map;
  }, [reservations, dateKey]);

  const tableUiByObjectId = useMemo(() => {
    const map = new Map();
    const blockedTableIds = getBlockedTableIdsMap(
      reservationParameters,
      selectedDate || new Date(),
      liveMode
        ? getReferenceTimeString({ liveMode, selectedTime })
        : selectedTime,
    );

    for (const obj of tableObjects) {
      const ref = catalogById.get(String(obj?.tableRefId || "")) || null;
      const tableReservations =
        reservationsByTableId.get(String(obj?.tableRefId || "")) || [];

      const {
        currentReservation,
        nextReservation,
        theoreticalCurrent,
        realCurrent,
        conflictingReservation,
        displayReservation,
      } = getTableReservationState({
        reservations: tableReservations,
        parameters: reservationParameters,
        liveMode,
        selectedTime,
      });

      const baseTableStatus = getTableStatus({
        currentReservation,
        nextReservation,
        theoreticalCurrent,
        realCurrent,
        conflictingReservation,
        parameters: reservationParameters,
        liveMode,
        selectedTime,
      });

      const tableStatus = getVisualTableState({
        tableStatus: baseTableStatus,
        ref,
        blockedTableIds,
      });

      map.set(String(obj.id), {
        ref,
        tableReservations,
        currentReservation,
        nextReservation,
        theoreticalCurrent,
        realCurrent,
        conflictingReservation,
        displayReservation,
        tableStatus,
      });
    }

    return map;
  }, [
    tableObjects,
    catalogById,
    reservationsByTableId,
    reservationParameters,
    selectedDate,
    liveMode,
    selectedTime,
  ]);

  useLayoutEffect(() => {
    didInitialFitRef.current = false;
    hasUserMovedViewRef.current = false;
  }, [roomLayoutSnap]);

  useEffect(() => {
    setTooltipReady(false);
  }, [selectedTableState]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));

      const prev = stageSizeRef.current;
      const sc = scaleRef.current || 1;
      const p = posRef.current;

      if (prev.w && prev.h) {
        const cx = prev.w / 2;
        const cy = prev.h / 2;

        centerWorldRef.current = {
          x: (cx - p.x) / sc,
          y: (cy - p.y) / sc,
        };
      } else {
        centerWorldRef.current = { x: canvasW / 2, y: canvasH / 2 };
      }

      setStageSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };

    measure();

    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(el);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [canvasW, canvasH]);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    if (stageSize.w && stageSize.h) stageSizeRef.current = stageSize;
  }, [stageSize.w, stageSize.h]);

  function applyInitialView(objsOverride) {
    if (!stageSize.w || !stageSize.h) return;

    const objs = objsOverride ?? objects;
    const hasObjects = safeArr(objs).length > 0;
    const bounds = hasObjects
      ? boundsFromObjects(objs, canvasW, canvasH, catalog)
      : { x1: 0, y1: 0, x2: canvasW, y2: canvasH };

    if (isMobile) {
      const {
        scale: s,
        pos: p,
        centerWorld,
      } = fitToBounds({
        bounds,
        stageW: stageSize.w,
        stageH: stageSize.h,
        paddingPx: 24,
        minScale: 0.25,
        maxScale: 1.2,
      });

      centerWorldRef.current = centerWorld;
      scaleRef.current = s;
      posRef.current = p;

      setScale(s);
      setPos(p);

      return;
    }

    const {
      scale: s,
      pos: p,
      centerWorld,
    } = fitToBounds({
      bounds,
      stageW: stageSize.w,
      stageH: stageSize.h,
      paddingPx: 80,
      minScale: 0.15,
      maxScale: 2,
    });

    centerWorldRef.current = centerWorld;
    scaleRef.current = s;
    posRef.current = p;

    setScale(s);
    setPos(p);
  }

  function resetView() {
    applyInitialView(objects);
  }

  useEffect(() => {
    if (shouldResetView) {
      resetView();
    }
  }, [shouldResetView]);

  useLayoutEffect(() => {
    if (!room?._id) return;
    if (!stageSize.w || !stageSize.h) return;
    if (didInitialFitRef.current) return;

    didInitialFitRef.current = true;

    applyInitialView(objects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomLayoutSnap, stageSize.w, stageSize.h, isMobile]);

  useEffect(() => {
    if (!stageSize.w || !stageSize.h) return;

    const sc = scaleRef.current || 1;
    const cw = centerWorldRef.current?.x ?? canvasW / 2;
    const ch = centerWorldRef.current?.y ?? canvasH / 2;

    const nextPos = {
      x: stageSize.w / 2 - cw * sc,
      y: stageSize.h / 2 - ch * sc,
    };

    posRef.current = nextPos;
    setPos(nextPos);
  }, [stageSize.w, stageSize.h, canvasW, canvasH]);

  const gridLines = useMemo(() => {
    const lines = [];
    for (let x = 0; x <= canvasW; x += grid) {
      lines.push(
        <Line
          key={`v_${x}`}
          points={[x, 0, x, canvasH]}
          stroke="rgba(19,30,54,0.06)"
          strokeWidth={1}
          listening={false}
          perfectDrawEnabled={false}
        />,
      );
    }
    for (let y = 0; y <= canvasH; y += grid) {
      lines.push(
        <Line
          key={`h_${y}`}
          points={[0, y, canvasW, y]}
          stroke="rgba(19,30,54,0.06)"
          strokeWidth={1}
          listening={false}
          perfectDrawEnabled={false}
        />,
      );
    }
    return lines;
  }, [canvasW, canvasH, grid]);

  function handleWheel(e) {
    e.evt.preventDefault();
    hasUserMovedViewRef.current = true;

    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = scaleRef.current || scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = 1.08;
    const newScale = clamp(
      direction > 0 ? oldScale * factor : oldScale / factor,
      0.04,
      2,
    );

    const mousePointTo = {
      x: (pointer.x - posRef.current.x) / oldScale,
      y: (pointer.y - posRef.current.y) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    scaleRef.current = newScale;
    posRef.current = newPos;
    centerWorldRef.current = {
      x: (stageSize.w / 2 - newPos.x) / newScale,
      y: (stageSize.h / 2 - newPos.y) / newScale,
    };

    setScale(newScale);
    setPos(newPos);
  }

  function getClientXY(evt) {
    if (evt?.touches?.[0]) {
      return { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
    }
    if (evt?.changedTouches?.[0]) {
      return {
        x: evt.changedTouches[0].clientX,
        y: evt.changedTouches[0].clientY,
      };
    }
    return { x: evt?.clientX ?? 0, y: evt?.clientY ?? 0 };
  }

  function getTouchPoints(evt) {
    const touches = evt?.touches;
    if (!touches || touches.length < 2) return null;

    return {
      p1: {
        x: touches[0].clientX,
        y: touches[0].clientY,
      },
      p2: {
        x: touches[1].clientX,
        y: touches[1].clientY,
      },
    };
  }

  function getDistance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  function getMidpoint(p1, p2) {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
  }

  function preventIfCancelable(evt) {
    if (evt?.cancelable) {
      evt.preventDefault();
    }
  }

  function startPan(e) {
    const evt = e?.evt;
    preventIfCancelable(evt);

    const stage = stageRef.current;
    if (!stage) return;

    // ✅ PINCH START
    if (evt?.touches?.length >= 2) {
      hasUserMovedViewRef.current = true;
      setIsPanning(false);

      const pts = getTouchPoints(evt);
      if (!pts) return;

      const mid = getMidpoint(pts.p1, pts.p2);
      const dist = getDistance(pts.p1, pts.p2);

      const currentScale = scaleRef.current || scale || 1;
      const currentPos = posRef.current || pos || { x: 0, y: 0 };

      pinchRef.current = {
        active: true,
        startDist: dist,
        startScale: currentScale,
        startPos: currentPos,
        worldPoint: {
          x: (mid.x - currentPos.x) / currentScale,
          y: (mid.y - currentPos.y) / currentScale,
        },
      };

      return;
    }

    // ✅ PAN 1 doigt / souris
    if (e.target === e.target.getStage()) {
      pinchRef.current.active = false;
      hasUserMovedViewRef.current = true;
      onSelectTable?.(null);
      setIsPanning(true);

      const { x, y } = getClientXY(evt);
      panRef.current.lastX = x;
      panRef.current.lastY = y;
    }
  }

  function movePan(e) {
    const evt = e?.evt;
    if (!evt) return;

    // ✅ PINCH MOVE
    if (evt?.touches?.length >= 2) {
      preventIfCancelable(evt);

      const pts = getTouchPoints(evt);
      if (!pts) return;

      const mid = getMidpoint(pts.p1, pts.p2);
      const dist = getDistance(pts.p1, pts.p2);

      const pinch = pinchRef.current;
      if (!pinch.active || !pinch.startDist) return;

      const nextScale = clamp(
        pinch.startScale * (dist / pinch.startDist),
        0.04,
        2,
      );

      const nextPos = {
        x: mid.x - pinch.worldPoint.x * nextScale,
        y: mid.y - pinch.worldPoint.y * nextScale,
      };

      scaleRef.current = nextScale;
      posRef.current = nextPos;
      centerWorldRef.current = {
        x: (stageSize.w / 2 - nextPos.x) / nextScale,
        y: (stageSize.h / 2 - nextPos.y) / nextScale,
      };

      setScale(nextScale);
      setPos(nextPos);
      return;
    }

    // ✅ si on vient d’un pinch, on ne pan pas
    if (pinchRef.current.active) return;

    if (!isPanning) return;

    preventIfCancelable(evt);

    let dx = evt?.movementX;
    let dy = evt?.movementY;

    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      const { x, y } = getClientXY(evt);
      dx = x - panRef.current.lastX;
      dy = y - panRef.current.lastY;
      panRef.current.lastX = x;
      panRef.current.lastY = y;
    }

    setPos((prev) => {
      const next = {
        x: prev.x + dx,
        y: prev.y + dy,
      };

      posRef.current = next;
      centerWorldRef.current = {
        x: (stageSize.w / 2 - next.x) / (scaleRef.current || scale),
        y: (stageSize.h / 2 - next.y) / (scaleRef.current || scale),
      };

      return next;
    });
  }

  function endPan(e) {
    preventIfCancelable(e?.evt);

    if (pinchRef.current.active) {
      pinchRef.current.active = false;
    }

    setIsPanning(false);
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const container = stage.container();
    if (container) container.style.touchAction = "none";
  }, []);

  useLayoutEffect(() => {
    if (!tooltipRef.current) return;

    const measure = () => {
      const rect = tooltipRef.current.getBoundingClientRect();
      const w = Math.max(220, Math.ceil(rect.width || 220));
      const h = Math.max(78, Math.ceil(rect.height || 78));

      setTooltipSize((prev) => {
        if (prev.w === w && prev.h === h) return prev;
        return { w, h };
      });

      setTooltipReady(true);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(tooltipRef.current);

    return () => {
      ro.disconnect();
    };
  }, [selectedTableState]);

  function renderDecor(obj) {
    if (obj.shape === "line") {
      const pts = safeArr(obj.points).map((n) => Number(n || 0));
      const cx = (Number(pts[0] || 0) + Number(pts[2] || 0)) / 2;
      const cy = (Number(pts[1] || 0) + Number(pts[3] || 0)) / 2;
      const rel =
        pts.length >= 4
          ? [pts[0] - cx, pts[1] - cy, pts[2] - cx, pts[3] - cy]
          : [0, 0, 0, 0];

      const stroke = obj?.style?.stroke || "rgba(19,30,54,0.45)";
      const strokeWidth = Number(obj?.style?.strokeWidth || 4);

      return (
        <Group
          key={obj.id}
          x={cx}
          y={cy}
          rotation={Number(obj.rotation || 0)}
          listening={false}
        >
          {obj.decorKind === "window" &&
            Array.from({ length: Number(obj?.meta?.ticks || 4) }).map(
              (_, i) => {
                const t = (i + 1) / (Number(obj?.meta?.ticks || 4) + 1);
                const tx = rel[0] + (rel[2] - rel[0]) * t;
                const ty = rel[1] + (rel[3] - rel[1]) * t;

                return (
                  <Line
                    key={`tick_${obj.id}_${i}`}
                    points={[tx, ty - 10, tx, ty + 10]}
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth={2}
                    lineCap="round"
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                );
              },
            )}

          {obj.decorKind === "door" && (
            <Arc
              x={rel[0]}
              y={rel[1]}
              innerRadius={0}
              outerRadius={Number(obj?.meta?.arcRadius || 34)}
              angle={90}
              rotation={0}
              fill="rgba(255,255,255,0.10)"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={2}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}

          <Line
            points={rel}
            stroke={stroke}
            strokeWidth={strokeWidth}
            lineCap="round"
            lineJoin="round"
            perfectDrawEnabled={false}
            strokeScaleEnabled={false}
          />
        </Group>
      );
    }

    if (obj.shape === "circle") {
      const x = Number(obj.x || 0);
      const y = Number(obj.y || 0);
      const r = Number(obj.r || 16);

      const fill = obj?.style?.fill || "rgba(19,30,54,0.22)";
      const stroke = obj?.style?.stroke || "rgba(19,30,54,0.45)";
      const label = String(obj?.meta?.label || "");

      return (
        <Group
          key={obj.id}
          x={x}
          y={y}
          rotation={Number(obj.rotation || 0)}
          listening={false}
        >
          {obj.decorKind === "parasol" ? (
            (() => {
              const seg = Number(obj?.meta?.segments || 8);
              const ang = 360 / seg;
              const octPts = polygonPoints(0, 0, r, seg, -Math.PI / 2);

              return (
                <>
                  <Group clipFunc={(ctx) => clipPolygon(ctx, octPts)}>
                    {Array.from({ length: seg }).map((_, i) => (
                      <Arc
                        key={`parasol_seg_${obj.id}_${i}`}
                        x={0}
                        y={0}
                        innerRadius={0}
                        outerRadius={Math.max(6, r - 1)}
                        angle={ang}
                        rotation={i * ang}
                        fill={
                          i % 2 === 0
                            ? "rgba(255,255,255,0.65)"
                            : "rgba(59,130,246,0.35)"
                        }
                        stroke="rgba(19,30,54,0.18)"
                        strokeWidth={1}
                        perfectDrawEnabled={false}
                        shadowForStrokeEnabled={false}
                      />
                    ))}
                  </Group>

                  <Line
                    points={octPts}
                    closed
                    fill="rgba(255,255,255,0.10)"
                    stroke="rgba(19,30,54,0.35)"
                    strokeWidth={2}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />

                  <Circle
                    x={0}
                    y={0}
                    radius={Math.max(2, r * 0.12)}
                    fill="rgba(19,30,54,0.55)"
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                </>
              );
            })()
          ) : obj.decorKind === "plant" ? (
            <>
              {[
                { x: -r * 0.25, y: -r * 0.15, rr: 0.42, a: 0.55 },
                { x: r * 0.1, y: -r * 0.28, rr: 0.36, a: 0.5 },
                { x: r * 0.28, y: -r * 0.05, rr: 0.4, a: 0.58 },
                { x: r * 0.12, y: r * 0.22, rr: 0.38, a: 0.52 },
                { x: -r * 0.22, y: r * 0.22, rr: 0.36, a: 0.48 },
                { x: -r * 0.35, y: r * 0.02, rr: 0.34, a: 0.46 },
              ].map((p, i) => (
                <Circle
                  key={`leaf_${obj.id}_${i}`}
                  x={p.x}
                  y={p.y}
                  radius={Math.max(3, r * p.rr)}
                  fill={`rgba(34,139,34,${p.a})`}
                  stroke="rgba(19,30,54,0.10)"
                  strokeWidth={1}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              ))}

              <Circle
                x={0}
                y={0}
                radius={Math.max(3, r * 0.22)}
                fill="rgba(34,139,34,0.70)"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
                listening={false}
                perfectDrawEnabled={false}
              />
            </>
          ) : (
            <>
              <Circle
                x={0}
                y={0}
                radius={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={2}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
              />
              {label ? (
                <Text
                  text={label}
                  x={-r}
                  y={-8}
                  width={r * 2}
                  align="center"
                  fontSize={11}
                  fill="rgba(19,30,54,0.55)"
                  listening={false}
                />
              ) : null}
            </>
          )}
        </Group>
      );
    }

    const x = Number(obj.x || 0);
    const y = Number(obj.y || 0);
    const w = Number(obj.w || 200);
    const h = Number(obj.h || 40);
    const fill = obj?.style?.fill || "rgba(19,30,54,0.10)";
    const stroke = obj?.style?.stroke || "rgba(19,30,54,0.30)";
    const cornerRadius = Number(obj?.style?.cornerRadius || 16);
    const label = String(obj?.meta?.label || "");

    return (
      <Group key={obj.id} x={x} y={y} listening={false}>
        <Group
          rotation={Number(obj.rotation || 0)}
          offsetX={w / 2}
          offsetY={h / 2}
          x={w / 2}
          y={h / 2}
        >
          <Rect
            x={0}
            y={0}
            width={w}
            height={h}
            cornerRadius={cornerRadius}
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
          />

          {obj.decorKind === "stairs" && (
            <>
              {Array.from({ length: Number(obj?.meta?.steps || 6) }).map(
                (_, i) => {
                  const t = (i + 1) / (Number(obj?.meta?.steps || 6) + 1);
                  const yy = h * t;
                  return (
                    <Line
                      key={`step_${obj.id}_${i}`}
                      points={[8, yy, w - 8, yy]}
                      stroke="rgba(19,30,54,0.25)"
                      strokeWidth={2}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  );
                },
              )}
            </>
          )}

          {obj.decorKind === "no_zone" && obj?.meta?.hatch && (
            <Group
              listening={false}
              clipFunc={(ctx) => clipRoundedRect(ctx, 0, 0, w, h, cornerRadius)}
            >
              {(() => {
                const step = 18;
                const big = (w + h) * 2;
                const start = -big;
                const count = Math.ceil((big * 2) / step) + 2;

                return Array.from({ length: count }).map((_, i) => {
                  const x1 = start + i * step;
                  return (
                    <Line
                      key={`hatch_${obj.id}_${i}`}
                      points={[x1, big, x1 + big, -big]}
                      stroke="rgba(255,255,255,0.20)"
                      strokeWidth={2}
                      perfectDrawEnabled={false}
                      listening={false}
                    />
                  );
                });
              })()}
            </Group>
          )}

          {label ? (
            <Text
              text={label}
              x={0}
              y={0}
              width={w}
              height={h}
              align="center"
              verticalAlign="middle"
              fontSize={12}
              fill="rgba(19,30,54,0.60)"
              listening={false}
            />
          ) : null}
        </Group>
      </Group>
    );
  }

  function renderTable(obj) {
    const ui = tableUiByObjectId.get(String(obj.id)) || {};
    const ref = ui.ref || null;
    const label = ref?.name || "Table";
    const seatsCount = Number(ref?.seats || 0);
    const { w, h } = getTableDimensions(seatsCount);

    const currentReservation = ui.currentReservation || null;
    const nextReservation = ui.nextReservation || null;
    const theoreticalCurrent = ui.theoreticalCurrent || null;
    const realCurrent = ui.realCurrent || null;
    const conflictingReservation = ui.conflictingReservation || null;
    const displayReservation = ui.displayReservation || null;
    const tableStatus = ui.tableStatus || "free";

    const theme = statusTheme(tableStatus);
    const isSelected =
      String(selectedTableState?.object?.id || "") === String(obj.id);

    const chairR = 7;
    const chairOffset = 5;

    function buildChairs(n) {
      let top = 0;
      let bottom = 0;
      let left = 0;
      let right = 0;

      if (n <= 2) {
        left = 1;
        right = 1;
      } else if (n <= 4) {
        top = 2;
        bottom = 2;
      } else if (n <= 6) {
        top = 2;
        bottom = 2;
        left = 1;
        right = 1;
      } else {
        top = 2;
        bottom = 2;
        left = 2;
        right = 2;
      }

      const chairs = [];

      for (let i = 0; i < top; i++) {
        const x = w * (top === 1 ? 0.5 : i === 0 ? 0.33 : 0.67);
        chairs.push({ x, y: -chairOffset, rot: 0 });
      }
      for (let i = 0; i < bottom; i++) {
        const x = w * (bottom === 1 ? 0.5 : i === 0 ? 0.33 : 0.67);
        chairs.push({ x, y: h + chairOffset, rot: 180 });
      }
      for (let i = 0; i < left; i++) {
        const y = h * (left === 1 ? 0.5 : i === 0 ? 0.33 : 0.67);
        chairs.push({ x: -chairOffset, y, rot: -90 });
      }
      for (let i = 0; i < right; i++) {
        const y = h * (right === 1 ? 0.5 : i === 0 ? 0.33 : 0.67);
        chairs.push({ x: w + chairOffset, y, rot: 90 });
      }

      return chairs;
    }

    const chairs = buildChairs(seatsCount);

    return (
      <Group
        key={obj.id}
        x={Number(obj.x || 0)}
        y={Number(obj.y || 0)}
        onClick={() =>
          onSelectTable?.({
            object: obj,
            ref,
            reservation: displayReservation,
            currentReservation,
            nextReservation,
            theoreticalReservation: theoreticalCurrent,
            realReservation: realCurrent,
            conflictingReservation,
            tableStatus,
          })
        }
        onTap={() =>
          onSelectTable?.({
            object: obj,
            ref,
            reservation: displayReservation,
            currentReservation,
            nextReservation,
            theoreticalReservation: theoreticalCurrent,
            realReservation: realCurrent,
            conflictingReservation,
            tableStatus,
          })
        }
      >
        <Group
          rotation={Number(obj.rotation || 0)}
          offsetX={w / 2}
          offsetY={h / 2}
          x={w / 2}
          y={h / 2}
        >
          {chairs.map((c, idx) => (
            <Arc
              key={idx}
              x={c.x}
              y={c.y}
              innerRadius={0}
              outerRadius={chairR}
              angle={180}
              rotation={c.rot}
              fill={
                isSelected ? "rgba(37,99,235,0.65)" : "rgba(71,85,105,0.65)"
              }
              stroke="rgba(255,255,255,0.72)"
              strokeWidth={1}
              perfectDrawEnabled={false}
              shadowForStrokeEnabled={false}
            />
          ))}

          <Rect
            x={2}
            y={3}
            width={w}
            height={h}
            cornerRadius={12}
            fill="rgba(15,23,42,0.12)"
            listening={false}
          />

          <Rect
            width={w}
            height={h}
            cornerRadius={12}
            fill={theme.fill}
            stroke={isSelected ? "rgba(37,99,235,1)" : theme.stroke}
            strokeWidth={isSelected ? 3 : 2}
          />

          <Rect
            x={6}
            y={6}
            width={w - 12}
            height={h - 12}
            cornerRadius={10}
            fill="rgba(255,255,255,0.96)"
            stroke="rgba(19,30,54,0.10)"
            strokeWidth={1}
            listening={false}
          />

          {tableStatus === "blocked" ? (
            <Line
              points={[12, h - 10, w - 12, 10]}
              stroke="rgba(220, 38, 38, 0.38)"
              strokeWidth={4}
              lineCap="round"
              listening={false}
            />
          ) : null}
        </Group>

        <Text
          text={label}
          fontSize={12}
          fontStyle="600"
          fill="rgba(19,30,54,0.88)"
          width={w}
          height={h}
          align="center"
          verticalAlign="middle"
          offsetY={seatsCount ? 6 : 0}
          listening={false}
        />

        {seatsCount ? (
          <Text
            text={`${seatsCount}p`}
            fontSize={11}
            fill="rgba(19,30,54,0.55)"
            width={w}
            height={h}
            align="center"
            verticalAlign="middle"
            offsetY={-10}
            listening={false}
          />
        ) : null}
      </Group>
    );
  }

  const tooltipData = useMemo(() => {
    if (!selectedTableState?.object || !stageSize.w || !stageSize.h)
      return null;

    const ref = selectedTableState.ref || null;
    const reservation = selectedTableState.reservation || null;
    const currentReservation = selectedTableState.currentReservation || null;
    const nextReservation = selectedTableState.nextReservation || null;
    const theoreticalReservation =
      selectedTableState.theoreticalReservation || null;
    const realReservation = selectedTableState.realReservation || null;
    const tableStatus = selectedTableState.tableStatus || "free";
    const center = getObjectVisualCenter(selectedTableState.object, catalog);

    const worldX = center.x;
    const worldY = center.y;

    const screenX = pos.x + worldX * scale;
    const screenY = pos.y + worldY * scale;

    const tooltipW = tooltipSize.w || 220;
    const tooltipH = tooltipSize.h || (reservation ? 140 : 78);

    const margin = 16;
    const gap = 18;

    const candidates = [
      { left: screenX + gap, top: screenY + gap }, // bas droite
      { left: screenX - tooltipW - gap, top: screenY + gap }, // bas gauche
      { left: screenX + gap, top: screenY - tooltipH - gap }, // haut droite
      { left: screenX - tooltipW - gap, top: screenY - tooltipH - gap }, // haut gauche
    ];

    const fits = candidates.find(
      (c) =>
        c.left >= margin &&
        c.top >= margin &&
        c.left + tooltipW <= stageSize.w - margin &&
        c.top + tooltipH <= stageSize.h - margin,
    );

    const chosen = fits || candidates[0];

    const left = clamp(chosen.left, margin, stageSize.w - tooltipW - margin);
    const top = clamp(chosen.top, margin, stageSize.h - tooltipH - margin);
    return {
      left,
      top,
      ref,
      reservation,
      currentReservation,
      nextReservation,
      theoreticalReservation,
      realReservation,
      tableStatus,
    };
  }, [
    selectedTableState,
    pos,
    scale,
    stageSize.w,
    stageSize.h,
    tooltipSize.w,
    tooltipSize.h,
  ]);

  return (
    <div className="relative h-full min-h-[520px] rounded-[28px] border border-darkBlue/10 bg-[#667085] overflow-hidden flex flex-col shadow-inner">
      <button
        type="button"
        onClick={resetView}
        className="absolute z-50 right-4 top-4 inline-flex items-center justify-center size-11 rounded-full border border-white/25 bg-white/8 hover:bg-white/12 transition"
        title="Réinitialiser la vue"
        aria-label="Réinitialiser la vue"
      >
        <RotateCcw className="size-5 text-white/90" />
      </button>

      <div ref={wrapRef} className="flex-1 min-h-[440px] bg-[#667085]">
        {stageSize.w > 0 && stageSize.h > 0 && (
          <Stage
            ref={stageRef}
            width={stageSize.w}
            height={stageSize.h}
            onWheel={handleWheel}
            onMouseDown={startPan}
            onMouseMove={movePan}
            onMouseUp={endPan}
            onMouseLeave={endPan}
            onTouchStart={startPan}
            onTouchMove={movePan}
            onTouchEnd={endPan}
            onTouchCancel={endPan}
          >
            <Layer x={pos.x} y={pos.y} scaleX={scale} scaleY={scale}>
              {gridLines}
              {decorObjects.map((obj) => renderDecor(obj))}
              {tableObjects.map((obj) => renderTable(obj))}
            </Layer>
          </Stage>
        )}
      </div>

      {tooltipData ? (
        <div
          ref={tooltipRef}
          className="absolute z-[60] w-[220px] rounded-3xl border border-darkBlue/10 bg-white/95 shadow-xl p-4 pointer-events-none"
          style={{
            left: `${tooltipData.left}px`,
            top: `${tooltipData.top}px`,
            opacity: tooltipReady ? 1 : 0,
            visibility: tooltipReady ? "visible" : "hidden",
          }}
        >
          <div className="flex gap-1 justify-between items-start">
            <div className="flex flex-col gap-1">
              <div className="flex gap-1">
                <p className="text-[12px] uppercase tracking-[0.14em] text-darkBlue/70">
                  Table
                </p>
                <p className="text-[12px] uppercase tracking-[0.14em] text-darkBlue/70">
                  {tooltipData.ref?.name || "Table"}
                </p>
              </div>

              <p className="text-[10px] text-darkBlue/55 leading-none">
                {Number(tooltipData.ref?.seats || 0)} couvert
                {tooltipData.ref?.seats > 1 ? "s" : ""}
              </p>
              <p className="text-[10px] text-darkBlue/55 leading-none">
                Priorité : {Number(tooltipData.ref?.bookingPriority || 0)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {tooltipData.tableStatus === "occupied" ? (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium bg-green/15 text-green border border-green/20">
                  Table occupée
                </span>
              ) : null}

              {tooltipData.tableStatus === "late" ? (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium  text-[rgb(255,159,10)] border bg-[rgba(255,159,10,0.22)] border-[rgb(255,159,10)]">
                  Client en retard
                </span>
              ) : null}

              {tooltipData.tableStatus === "to_release" ? (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium bg-red/15 text-red border border-red/20">
                  À libérer
                </span>
              ) : null}

              {tooltipData.tableStatus === "assigned" ? (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium bg-blue/15 text-blue border border-blue/20">
                  Assignée
                </span>
              ) : null}

              {tooltipData.tableStatus === "blocked" ? (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium bg-[rgba(220,38,38,0.08)] text-[rgba(185,28,28,0.92)] border border-[rgba(220,38,38,0.14)]">
                  Table bloquée
                </span>
              ) : null}

              {tooltipData.ref?.onlineBookable === false ? (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium bg-darkBlue/10 text-darkBlue border border-darkBlue/10">
                  Non en ligne
                </span>
              ) : null}
            </div>
          </div>

          {tooltipData.reservation ? (
            <div className="mt-2 border-t border-darkBlue/10 pt-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-darkBlue/40">
                Réservation
              </p>

              <p className="mt-1 text-[13px] font-semibold text-darkBlue leading-snug line-clamp-2">
                {getDisplayName(tooltipData.reservation)}
              </p>

              <div className="mt-1 space-y-1 text-[12px] text-darkBlue/65 leading-snug">
                <div>
                  <span className="font-medium text-darkBlue">Heure :</span>{" "}
                  {String(tooltipData.reservation?.reservationTime || "").slice(
                    0,
                    5,
                  )}
                </div>
                <div>
                  <span className="font-medium text-darkBlue">Couverts :</span>{" "}
                  {tooltipData.reservation?.numberOfGuests || "-"}
                </div>
                <div>
                  <span className="font-medium text-darkBlue">Statut :</span>{" "}
                  {reservationStatusLabel(tooltipData.reservation?.status)}
                </div>
                {tooltipData.reservation?.customerPhone ? (
                  <div className="truncate">
                    <span className="font-medium text-darkBlue">Tél :</span>{" "}
                    {tooltipData.reservation.customerPhone}
                  </div>
                ) : null}
              </div>

              {tooltipData.tableStatus === "to_release" &&
              tooltipData.nextReservation ? (
                <div className="mt-3 rounded-2xl border border-red/15 bg-red/5 px-3 py-2 text-[12px] text-darkBlue/70">
                  Prochaine arrivée à{" "}
                  {String(
                    tooltipData.nextReservation?.reservationTime || "",
                  ).slice(0, 5)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 border-t border-darkBlue/10 pt-3 text-[12px] text-darkBlue/55 leading-snug">
              Aucune réservation.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
