import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Group,
  Line,
  Arc,
  Circle,
  Image as KonvaImage,
  Path,
} from "react-konva";
import { Plus, Trash2, RotateCcw, Save, X } from "lucide-react";

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeArr(a) {
  return Array.isArray(a) ? a : [];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeDeg(deg) {
  const n = Number(deg) || 0;
  return ((n % 360) + 360) % 360;
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

function svgToDataUri(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function makeLucideSvg({ pathD, size = 24, stroke = "#fff", strokeWidth = 2 }) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
       viewBox="0 0 24 24" fill="none" stroke="${stroke}"
       stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
    <path d="${pathD}" />
  </svg>`;
}

export default function RoomEditorComponent({
  restaurantId,
  room,
  tablesCatalog,
  placedTableRefIdsOtherRooms,
  onCatalogUpdated,
  onSaved,
  onSaveRequest,
  onDirtyChange,
}) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const justDraggedRef = useRef(false);

  const canvasW = Number(room?.canvas?.width || 2000);
  const canvasH = Number(room?.canvas?.height || 2000);
  const grid = Number(room?.canvas?.gridSize || 50);

  const SNAP_UNIT = grid / 2;
  const PAD = 0;

  const [objects, setObjects] = useState(() => safeArr(room?.objects));
  const [selectedId, setSelectedId] = useState(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 520 });
  const [rotationInput, setRotationInput] = useState("0");

  // view
  const [scale, setScale] = useState(0.7);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // add table
  const [selectedRefId, setSelectedRefId] = useState("");

  // decor modal
  const [decorModalOpen, setDecorModalOpen] = useState(false);

  // ✅ create table modal
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableSeats, setNewTableSeats] = useState("2");
  const [createTableError, setCreateTableError] = useState("");
  const [createTableLoading, setCreateTableLoading] = useState(false);

  // delete from catalog modal
  const [deleteCatalogOpen, setDeleteCatalogOpen] = useState(false);
  const [deleteCatalogLoading, setDeleteCatalogLoading] = useState(false);
  const [deleteCatalogError, setDeleteCatalogError] = useState("");

  const newTableNameRef = useRef(null);

  const [saveError, setSaveError] = useState("");

  const usedOtherRooms = useMemo(() => {
    if (placedTableRefIdsOtherRooms instanceof Set)
      return placedTableRefIdsOtherRooms;
    if (Array.isArray(placedTableRefIdsOtherRooms)) {
      return new Set(placedTableRefIdsOtherRooms.map((x) => String(x)));
    }
    return new Set();
  }, [placedTableRefIdsOtherRooms]);

  const initialSnapRef = useRef("");

  function stableRoomSnap(objs, canvasW, canvasH, grid) {
    const normalized = safeArr(objs).map((o) => {
      const base = {
        id: String(o.id || ""),
        type: String(o.type || ""),
        rotation: Number(o.rotation || 0),
        shape: o.shape ? String(o.shape) : undefined,
        decorKind: o.decorKind ? String(o.decorKind) : undefined,
        locked: Boolean(o.locked),
        tableRefId: o.tableRefId ? String(o.tableRefId) : undefined,
      };

      if (o.type === "table") {
        return {
          ...base,
          x: Number(o.x || 0),
          y: Number(o.y || 0),
          w: Number(o.w || 0),
          h: Number(o.h || 0),
        };
      }

      if (o.type === "decor") {
        if (o.shape === "line") {
          return {
            ...base,
            points: safeArr(o.points).map((n) => Number(n || 0)),
            meta: o.meta || {},
            style: o.style || {},
          };
        }
        if (o.shape === "circle") {
          return {
            ...base,
            x: Number(o.x || 0),
            y: Number(o.y || 0),
            r: Number(o.r || 0),
            meta: o.meta || {},
            style: o.style || {},
          };
        }
        if (o.shape === "rect") {
          return {
            ...base,
            x: Number(o.x || 0),
            y: Number(o.y || 0),
            w: Number(o.w || 0),
            h: Number(o.h || 0),
            meta: o.meta || {},
            style: o.style || {},
          };
        }
      }

      return base;
    });

    // ✅ important : tri par id => un changement d’ordre (z-index) ne rend PAS dirty
    normalized.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    return JSON.stringify({
      canvas: {
        w: Number(canvasW || 0),
        h: Number(canvasH || 0),
        grid: Number(grid || 0),
      },
      objects: normalized,
    });
  }

  /* ===========================
   * COLLISION / SNAP HELPERS
   * =========================== */

  function aabbIntersects(a, b) {
    return !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2);
  }

  function inflate(bb, pad) {
    if (!pad) return bb; // ✅ PAD=0 => on ne gonfle rien
    return {
      x1: bb.x1 - pad,
      y1: bb.y1 - pad,
      x2: bb.x2 + pad,
      y2: bb.y2 + pad,
    };
  }

  function getAABB(o) {
    if (!o) return { x1: 0, y1: 0, x2: 0, y2: 0 };

    if (o.type === "table") {
      const x = Number(o.x || 0);
      const y = Number(o.y || 0);
      const w = Number(o.w || 0);
      const h = Number(o.h || 0);
      // ✅ collision = rectangle réel uniquement (PAS les chaises)
      return { x1: x, y1: y, x2: x + w, y2: y + h };
    }

    if (o.type === "decor") {
      if (o.shape === "rect") {
        const x = Number(o.x || 0);
        const y = Number(o.y || 0);
        const w = Number(o.w || 0);
        const h = Number(o.h || 0);
        return { x1: x, y1: y, x2: x + w, y2: y + h };
      }

      if (o.shape === "circle") {
        const x = Number(o.x || 0);
        const y = Number(o.y || 0);
        const r = Number(o.r || 0);
        return { x1: x - r, y1: y - r, x2: x + r, y2: y + r };
      }

      if (o.shape === "line") {
        const p = Array.isArray(o.points) ? o.points : [];
        if (p.length >= 4) {
          const x1 = Number(p[0] || 0);
          const y1 = Number(p[1] || 0);
          const x2 = Number(p[2] || 0);
          const y2 = Number(p[3] || 0);
          const minX = Math.min(x1, x2);
          const minY = Math.min(y1, y2);
          const maxX = Math.max(x1, x2);
          const maxY = Math.max(y1, y2);
          const sw = Number(o?.style?.strokeWidth || 8);
          const pad = sw / 2; // épaisseur approx de la ligne
          return {
            x1: minX - pad,
            y1: minY - pad,
            x2: maxX + pad,
            y2: maxY + pad,
          };
        }
      }
    }

    return { x1: 0, y1: 0, x2: 0, y2: 0 };
  }

  function snapCenterToUnit(x, y, w, h, unit) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const scx = Math.round(cx / unit) * unit;
    const scy = Math.round(cy / unit) * unit;
    return { x: scx - w / 2, y: scy - h / 2 };
  }

  function isFree(candidate, others, pad) {
    const bb = inflate(getAABB(candidate), pad);
    for (const o of others) {
      const obb = inflate(getAABB(o), pad);
      if (aabbIntersects(bb, obb)) return false;
    }
    return true;
  }

  // Recherche par anneaux (pas = SNAP_UNIT)
  function findNearestFree(candidate, others, step, pad) {
    if (isFree(candidate, others, pad))
      return { x: candidate.x, y: candidate.y };

    const maxRing = 40;

    const sx = candidate.x;
    const sy = candidate.y;

    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        const dy = ring - Math.abs(dx);
        const tries = [
          { x: sx + dx * step, y: sy + dy * step },
          { x: sx + dx * step, y: sy - dy * step },
        ];

        for (const t of tries) {
          const test = { ...candidate, x: t.x, y: t.y };
          if (isFree(test, others, pad)) return t;
        }
      }
    }

    return { x: candidate.x, y: candidate.y };
  }

  function shiftLinePoints(points, dx, dy) {
    const p = safeArr(points);
    if (p.length < 4) return p;
    return [p[0] + dx, p[1] + dy, p[2] + dx, p[3] + dy];
  }

  /* ===========================
   * INIT / RESIZE
   * =========================== */

 useEffect(() => {
  const initObjs = safeArr(room?.objects);
  setObjects(initObjs);
  setSelectedId(null);
  setScale(0.7);
  setPos({ x: 0, y: 0 });

  // ✅ reset snapshot (room chargée = clean)
  const snap = stableRoomSnap(initObjs, canvasW, canvasH, grid);
  initialSnapRef.current = snap;
  if (typeof onDirtyChange === "function") onDirtyChange(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [room?._id]);

  useEffect(() => {
    const snap = stableRoomSnap(objects, canvasW, canvasH, grid);
    const dirty = snap !== initialSnapRef.current;
    if (typeof onDirtyChange === "function") onDirtyChange(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, canvasW, canvasH, grid]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const w = Math.max(320, Math.round(r.width));
      const h = Math.max(320, Math.round(r.height));
      setStageSize((prev) => {
        if (prev.w === w && prev.h === h) return prev;
        return { w, h };
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const catalog = useMemo(() => safeArr(tablesCatalog), [tablesCatalog]);

  const placedTableRefIds = useMemo(() => {
    return new Set(
      objects
        .filter((o) => o?.type === "table" && o?.tableRefId)
        .map((o) => String(o.tableRefId)),
    );
  }, [objects]);

  const availableTables = useMemo(() => {
    return catalog
      .filter((t) => !placedTableRefIds.has(String(t._id)))
      .filter((t) => !usedOtherRooms.has(String(t._id)))
      .sort((a, b) =>
        String(a.name).localeCompare(String(b.name), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
  }, [catalog, placedTableRefIds, usedOtherRooms]);

  const remainingTablesCount = availableTables.length;

  // ✅ Lucide SVG paths (simplifiés mais fidèles)
  const LUCIDE_TRASH2_PATH =
    "M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14 M10 11v6 M14 11v6";
  const LUCIDE_ROTATECCW_PATH =
    "M3 2v6h6 M21 12a9 9 0 0 0-15.36-6.36L3 8 M3 12a9 9 0 0 0 15.36 6.36";

  const [trashImg, setTrashImg] = useState(null);
  const [rotateImg, setRotateImg] = useState(null);

  useEffect(() => {
    // Trash (blanc)
    const trashSvg = makeLucideSvg({
      pathD: LUCIDE_TRASH2_PATH,
      size: 22,
      stroke: "#ffffff",
      strokeWidth: 2,
    });

    // Rotate (gris foncé)
    const rotateSvg = makeLucideSvg({
      pathD: LUCIDE_ROTATECCW_PATH,
      size: 22,
      stroke: "#1f2a44",
      strokeWidth: 2,
    });

    const ti = new window.Image();
    ti.src = svgToDataUri(trashSvg);
    ti.onload = () => setTrashImg(ti);

    const ri = new window.Image();
    ri.src = svgToDataUri(rotateSvg);
    ri.onload = () => setRotateImg(ri);
  }, []);

  const selectedObj = useMemo(
    () => objects.find((o) => String(o.id) === String(selectedId)) || null,
    [objects, selectedId],
  );

  const activeCatalogId =
    selectedObj?.type === "table"
      ? String(selectedObj.tableRefId || "")
      : String(selectedRefId || "");

  const activeCatalogTable = useMemo(() => {
    if (!activeCatalogId) return null;
    return (
      catalog.find((t) => String(t._id) === String(activeCatalogId)) || null
    );
  }, [catalog, activeCatalogId]);

  useEffect(() => {
    if (!selectedObj) return;
    const r = Number(selectedObj.rotation || 0);
    setRotationInput(String(Math.round(r)));
  }, [selectedObj?.id, selectedObj?.rotation]);

  function updateSelected(patch) {
    if (!selectedId) return;
    setObjects((prev) =>
      prev.map((o) =>
        String(o.id) === String(selectedId) ? { ...o, ...patch } : o,
      ),
    );
  }

  function bringToFront(id) {
    if (!id) return;
    setObjects((prev) => {
      const idx = prev.findIndex((o) => String(o.id) === String(id));
      if (idx < 0) return prev;
      const next = prev.slice();
      const [picked] = next.splice(idx, 1);
      next.push(picked);
      return next;
    });
  }

  function applyRotation(value) {
    if (!selectedId) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;

    setObjects((prev) =>
      prev.map((o) =>
        o.id === selectedId ? { ...o, rotation: normalizeDeg(n) } : o,
      ),
    );
  }

  function worldCenter() {
    const stage = stageRef.current;
    if (!stage) return { x: canvasW / 2, y: canvasH / 2 };

    const size = stage.size();
    const cx = size.width / 2;
    const cy = size.height / 2;

    return {
      x: (cx - pos.x) / scale,
      y: (cy - pos.y) / scale,
    };
  }

  useEffect(() => {
    if (!createTableOpen) return;
    setCreateTableError("");
    setTimeout(() => {
      if (newTableNameRef.current) {
        newTableNameRef.current.focus();
        newTableNameRef.current.setSelectionRange(
          0,
          newTableNameRef.current.value.length,
        );
      }
    }, 0);
  }, [createTableOpen]);

  useEffect(() => {
    if (!selectedRefId) return;

    const stillExists = availableTables.some(
      (t) => String(t._id) === String(selectedRefId),
    );

    if (!stillExists) setSelectedRefId("");
  }, [availableTables, selectedRefId]);

  /* ===========================
   * ADD TABLE (✅ quantized)
   * =========================== */

  function addTableInstanceFromRef(ref) {
    if (!ref?._id) return;

    const c = worldCenter();

    const seats = Number(ref.seats || 2);
    let w = 96,
      h = 56;

    if (seats <= 2) {
      w = 60;
      h = 60;
    } else if (seats <= 4) {
      w = 110;
      h = 60;
    } else if (seats <= 6) {
      w = 110;
      h = 60;
    } else {
      w = 112;
      h = 60;
    }

    const next = {
      id: uid(),
      type: "table",
      tableRefId: String(ref._id),
      x: c.x - w / 2,
      y: c.y - h / 2,
      w,
      h,
      rotation: 0,
    };

    setObjects((prev) => [...prev, next]);
    setSelectedId(next.id);
  }

  async function createConfiguredTableAndPlace() {
    try {
      setCreateTableLoading(true);
      setCreateTableError("");

      const name = String(newTableName || "").trim();
      const seats = Number(newTableSeats);

      if (!name) {
        setCreateTableError("Nom / n° de table obligatoire.");
        return;
      }
      if (!Number.isFinite(seats) || seats < 1) {
        setCreateTableError("Nombre de places invalide.");
        return;
      }

      // ✅ anti-doublon (case-insensitive)
      const exists = catalog.some(
        (t) =>
          String(t?.name || "")
            .trim()
            .toLowerCase() === name.toLowerCase(),
      );
      if (exists) {
        setCreateTableError("Une table avec ce nom existe déjà.");
        return;
      }

      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/floorplans/catalog/tables`,
        { name, seats },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const savedTables = Array.isArray(res.data?.tables)
        ? res.data.tables
        : [];
      const created = res.data?.created || null;

      // ✅ sync parent + select + place
      if (typeof onCatalogUpdated === "function") {
        onCatalogUpdated(savedTables);
      }

      if (created?._id) {
        setSelectedRefId(String(created._id));
        addTableInstanceFromRef(created);

        setTimeout(() => setSelectedRefId(""), 0);
      }

      setCreateTableOpen(false);
      setNewTableName("");
      setNewTableSeats("2");
    } catch (e) {
      setCreateTableError(
        e?.response?.data?.message || "Impossible de créer la table.",
      );
    } finally {
      setCreateTableLoading(false);
    }
  }

  async function deleteTableFromCatalog() {
    try {
      if (!activeCatalogId) return;

      setDeleteCatalogLoading(true);
      setDeleteCatalogError("");

      const res = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/floorplans/catalog/tables/${activeCatalogId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const savedTables = Array.isArray(res.data?.tables)
        ? res.data.tables
        : [];

      // ✅ sync le catalogue parent
      if (typeof onCatalogUpdated === "function") {
        onCatalogUpdated(savedTables);
      }

      // ✅ UX instant : retire aussi les instances dans la room courante
      // (le backend les a déjà supprimées partout, mais ça évite d’attendre un refetch)
      setObjects((prev) =>
        prev.filter(
          (o) =>
            !(
              o?.type === "table" &&
              String(o.tableRefId) === String(activeCatalogId)
            ),
        ),
      );

      setSelectedId(null);
      setSelectedRefId("");
      setDeleteCatalogOpen(false);
    } catch (e) {
      setDeleteCatalogError(
        e?.response?.data?.message ||
          "Impossible de supprimer la table du catalogue.",
      );
    } finally {
      setDeleteCatalogLoading(false);
    }
  }

  /* ===========================
   * DECOR FACTORY
   * =========================== */

  function addDecor(kind) {
    const c = worldCenter();

    const base = {
      id: uid(),
      type: "decor",
      decorKind: kind,
      rotation: 0,
      meta: {},
    };

    const makeRect = (w, h, extra = {}) => ({
      ...base,
      shape: "rect",
      x: c.x - w / 2,
      y: c.y - h / 2,
      w,
      h,
      ...extra,
    });

    const makeCircle = (r, extra = {}) => ({
      ...base,
      shape: "circle",
      x: c.x,
      y: c.y,
      r,
      ...extra,
    });

    const makeLine = (len, extra = {}) => ({
      ...base,
      shape: "line",
      points: [c.x - len / 2, c.y, c.x + len / 2, c.y],
      ...extra,
    });

    let next = null;

    // 1) STRUCTURE
    if (kind === "wall") {
      next = makeLine(260, {
        style: { stroke: "rgba(19,30,54,0.80)", strokeWidth: 12 },
      });
    } else if (kind === "door") {
      next = makeLine(120, {
        meta: { arcRadius: 34 },
        style: { stroke: "rgba(19,30,54,0.75)", strokeWidth: 6 },
      });
    } else if (kind === "bar") {
      next = makeRect(240, 46, {
        style: {
          fill: "rgba(19,30,54,0.15)",
          stroke: "rgba(19,30,54,0.45)",
          cornerRadius: 18,
        },
        meta: { label: "Bar" },
      });
    } else if (kind === "kitchen") {
      next = makeRect(260, 120, {
        style: {
          fill: "rgba(19,30,54,0.10)",
          stroke: "rgba(19,30,54,0.35)",
          cornerRadius: 22,
        },
        meta: { label: "Cuisine" },
      });
    } else if (kind === "window") {
      next = makeLine(160, {
        style: { stroke: "rgba(255,255,255,0.75)", strokeWidth: 4 },
        meta: { ticks: 4 },
      });
    }

    // 2) OBSTACLES
    else if (kind === "pillar_round") {
      next = makeCircle(20, {
        style: {
          fill: "rgba(19,30,54,0.22)",
          stroke: "rgba(19,30,54,0.55)",
        },
      });
    } else if (kind === "pillar_square") {
      next = makeRect(44, 44, {
        style: {
          fill: "rgba(19,30,54,0.22)",
          stroke: "rgba(19,30,54,0.55)",
          cornerRadius: 10,
        },
      });
    } else if (kind === "stairs") {
      next = makeRect(180, 90, {
        style: {
          fill: "rgba(19,30,54,0.10)",
          stroke: "rgba(19,30,54,0.35)",
          cornerRadius: 18,
        },
        meta: { steps: 6, label: "Escalier" },
      });
    } else if (kind === "no_zone") {
      next = makeRect(240, 160, {
        style: {
          fill: "rgba(255,255,255,0.06)",
          stroke: "rgba(255,255,255,0.35)",
          cornerRadius: 22,
        },
        meta: { hatch: true, label: "Zone interdite" },
      });
    }

    // 3) AMBIANCE / DECO
    else if (kind === "plant") {
      next = makeCircle(18, {
        style: {
          fill: "rgba(34,139,34,0.28)",
          stroke: "rgba(19,30,54,0.35)",
        },
      });
    } else if (kind === "parasol") {
      next = makeCircle(26, {
        style: {
          fill: "rgba(255,255,255,0.10)",
          stroke: "rgba(19,30,54,0.35)",
        },
        meta: { segments: 8 },
      });
    } else if (kind === "bench") {
      next = makeRect(110, 20, {
        style: {
          fill: "rgba(255,255,255,0.70)",
          stroke: "rgba(19,30,54,0.25)",
          cornerRadius: 26,
        },
        meta: { label: "Banquette" },
      });
    } else if (kind === "decor") {
      next = makeCircle(16, {
        style: {
          fill: "rgba(255,255,255,0.40)",
          stroke: "rgba(19,30,54,0.35)",
        },
      });
    } else if (kind === "wc") {
      next = makeRect(120, 90, {
        style: {
          fill: "rgba(255,255,255,0.60)",
          stroke: "rgba(19,30,54,0.25)",
          cornerRadius: 18,
        },
        meta: { label: "WC" },
      });
    }

    if (!next) return;

    setObjects((prev) => [...prev, next]);
    setSelectedId(next.id);
    setDecorModalOpen(false);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setObjects((prev) =>
      prev.filter((o) => String(o.id) !== String(selectedId)),
    );
    setSelectedId(null);
  }

  function resetView() {
    setScale(0.7);
    setPos({ x: 0, y: 0 });
  }

  async function saveRoom() {
    try {
      setSaveError("");

      const payload = {
        canvas: { width: canvasW, height: canvasH, gridSize: grid },
        objects,
      };

      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/floorplans/rooms/${room._id}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const nextRoom = res.data?.room;
      const nextRooms = res.data?.rooms;
      if (onSaved) onSaved(nextRoom || { ...room, ...payload }, nextRooms);
      initialSnapRef.current = stableRoomSnap(objects, canvasW, canvasH, grid);
      if (typeof onDirtyChange === "function") onDirtyChange(false);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        "Impossible d’enregistrer la salle. Vérifie que les tables ne sont pas déjà placées dans une autre salle.";
      setSaveError(msg);
      if (typeof window !== "undefined") window.alert(msg);
      throw e;
    }
  }

  useEffect(() => {
    if (typeof onSaveRequest === "function") {
      onSaveRequest(saveRoom);
    }
  }, [objects]);

  /* ===========================
   * GRID LINES
   * =========================== */

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

  /* ===========================
   * ZOOM / PAN
   * =========================== */

  function handleWheel(e) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = 1.08;
    const newScale = clamp(
      direction > 0 ? oldScale * factor : oldScale / factor,
      0.4,
      2,
    );

    const mousePointTo = {
      x: (pointer.x - pos.x) / oldScale,
      y: (pointer.y - pos.y) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    setScale(newScale);
    setPos(newPos);
  }

  const [isPanning, setIsPanning] = useState(false);

  function handleStageMouseDown(e) {
    if (e.target === e.target.getStage()) {
      setSelectedId(null);
      setIsPanning(true);
    }
  }
  function handleStageMouseUp() {
    setIsPanning(false);
  }
  function handleStageMouseMove(e) {
    if (!isPanning) return;
    const p = e.target.getStage().getPointerPosition();
    if (!p) return;
    const evt = e.evt;
    setPos((prev) => ({
      x: prev.x + evt.movementX,
      y: prev.y + evt.movementY,
    }));
  }

  function bumpRotate15ById(id, e) {
    if (e) e.cancelBubble = true;

    setObjects((prev) => {
      const idx = prev.findIndex((o) => String(o.id) === String(id));
      if (idx < 0) return prev;

      const curr = Number(prev[idx].rotation || 0);
      const nextRot = normalizeDeg(curr + 15);

      const updated = { ...prev[idx], rotation: nextRot };

      // conserve ton z-order : on pousse l’élément à la fin
      const next = prev.slice();
      next.splice(idx, 1);
      next.push(updated);
      return next;
    });
  }

  function removeObjectById(id, e) {
    if (e) e.cancelBubble = true;
    setObjects((prev) => prev.filter((o) => String(o.id) !== String(id)));
    if (String(selectedId) === String(id)) setSelectedId(null);
  }

  function ActionButtons({ xOff, startY, onRotate, onDelete }) {
    const BTN_R = 16;
    const GAP = 10;

    return (
      <Group x={xOff} y={0}>
        {/* ROTATE */}
        <Group
          x={0}
          y={startY}
          onMouseDown={(e) => (e.cancelBubble = true)}
          onClick={onRotate}
          onTap={onRotate}
        >
          <Circle
            x={0}
            y={0}
            radius={BTN_R}
            fill="rgba(255,255,255,0.95)"
            stroke="rgba(19,30,54,0.25)"
            strokeWidth={1}
          />
          {rotateImg && (
            <KonvaImage
              image={rotateImg}
              x={-11}
              y={-11}
              width={22}
              height={22}
              listening={false}
            />
          )}
        </Group>

        {/* TRASH */}
        <Group
          x={0}
          y={startY + BTN_R * 2 + GAP}
          onMouseDown={(e) => (e.cancelBubble = true)}
          onClick={onDelete}
          onTap={onDelete}
        >
          <Circle
            x={0}
            y={0}
            radius={BTN_R}
            fill="rgba(255,59,48,0.95)"
            stroke="rgba(255,59,48,1)"
            strokeWidth={1}
          />
          {trashImg && (
            <KonvaImage
              image={trashImg}
              x={-11}
              y={-11}
              width={22}
              height={22}
              listening={false}
            />
          )}
        </Group>
      </Group>
    );
  }
  /* ===========================
   * SHAPES
   * =========================== */

  function TableShape({ obj }) {
    const isSelected = String(obj.id) === String(selectedId);
    const ref = catalog.find((t) => String(t._id) === String(obj.tableRefId));
    const label = ref?.name || "Table";
    const seatsCount = Number(ref?.seats || 0);

    const w = obj.w;
    const h = obj.h;

    const stroke = isSelected ? "rgba(0,122,255,0.9)" : "rgba(19,30,54,0.18)";
    const fill = isSelected ? "rgba(0,122,255,0.12)" : "rgba(255,255,255,0.90)";
    const topFill = isSelected
      ? "rgba(255,255,255,0.92)"
      : "rgba(255,255,255,0.98)";

    const chairR = 7;
    const chairOffset = 5;

    function buildChairs(n) {
      let top = 0,
        bottom = 0,
        left = 0,
        right = 0;

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
        x={obj.x}
        y={obj.y}
        draggable
        onDragStart={(e) => {
          justDraggedRef.current = true;

          e.target.moveToTop();
          e.target.getLayer()?.batchDraw();
        }}
        onDragEnd={(e) => {
          const nx = e.target.x();
          const ny = e.target.y();

          const snapped = snapCenterToUnit(nx, ny, w, h, SNAP_UNIT);
          const candidate = { ...obj, x: snapped.x, y: snapped.y };
          const others = objects.filter((o) => String(o.id) !== String(obj.id));
          const best = findNearestFree(candidate, others, SNAP_UNIT, PAD);

          setObjects((prev) => {
            const idx = prev.findIndex((o) => String(o.id) === String(obj.id));
            if (idx < 0) return prev;

            // 1) update position
            const updated = { ...prev[idx], x: best.x, y: best.y };

            // 2) rebuild array and push updated last (persist z-order)
            const next = prev.slice();
            next.splice(idx, 1);
            next.push(updated);
            return next;
          });
        }}
       onClick={() => setSelectedId(obj.id)}
       onTap={() => setSelectedId(obj.id)}
      >
        <Group
          rotation={obj.rotation || 0}
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
              fill={isSelected ? "rgba(0,122,255,0.6)" : "rgba(19,30,54,0.55)"}
              stroke="rgba(255,255,255,0.6)"
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
            fill="rgba(19,30,54,0.10)"
            listening={false}
          />

          <Rect
            width={w}
            height={h}
            cornerRadius={12}
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
          />

          <Rect
            x={6}
            y={6}
            width={w - 12}
            height={h - 12}
            cornerRadius={10}
            fill={topFill}
            stroke="rgba(19,30,54,0.10)"
            strokeWidth={1}
            listening={false}
          />
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

        {isSelected &&
          (() => {
            const BTN_R = 16; // rayon bouton
            const GAP = 10; // gap entre les deux
            const totalH = BTN_R * 2 * 2 + GAP; // 2 boutons
            const startY = h / 2 - totalH / 2 + BTN_R; // centre vertical
            const xOff = w + 26; // ✅ un peu plus à droite

            return (
              <Group x={xOff} y={0}>
                {/* ROTATE */}
                <Group
                  x={0}
                  y={startY}
                  onMouseDown={(e) => (e.cancelBubble = true)}
                  onClick={(e) => bumpRotate15ById(obj.id, e)}
                  onTap={(e) => bumpRotate15ById(obj.id, e)}
                >
                  <Circle
                    x={0}
                    y={0}
                    radius={BTN_R}
                    fill="rgba(255,255,255,0.95)"
                    stroke="rgba(19,30,54,0.25)"
                    strokeWidth={1}
                  />

                  {/* ✅ icône centrée + plus grosse */}
                  {rotateImg && (
                    <KonvaImage
                      image={rotateImg}
                      x={-11}
                      y={-11}
                      width={22}
                      height={22}
                      listening={false}
                    />
                  )}
                </Group>

                {/* TRASH */}
                <Group
                  x={0}
                  y={startY + BTN_R * 2 + GAP}
                  onMouseDown={(e) => (e.cancelBubble = true)}
                  onClick={(e) => removeObjectById(obj.id, e)}
                  onTap={(e) => removeObjectById(obj.id, e)}
                >
                  <Circle
                    x={0}
                    y={0}
                    radius={BTN_R}
                    fill="rgba(255,59,48,0.95)" // ✅ rouge
                    stroke="rgba(255,59,48,1)"
                    strokeWidth={1}
                  />

                  {/* ✅ lucide trash centré */}
                  {trashImg && (
                    <KonvaImage
                      image={trashImg}
                      x={-11}
                      y={-11}
                      width={22}
                      height={22}
                      listening={false}
                    />
                  )}
                </Group>
              </Group>
            );
          })()}
      </Group>
    );
  }

  function DecorShape({ obj }) {
    const isSelected = String(obj.id) === String(selectedId);
    const shape = obj.shape;

    const strokeSelected = "rgba(0,122,255,0.9)";
    const onClick = () => setSelectedId(obj.id);

    if (shape === "line") {
      const pts = safeArr(obj.points);
      if (pts.length < 4) return null;

      const stroke = obj?.style?.stroke || "rgba(19,30,54,0.7)";
      const strokeWidth = Number(obj?.style?.strokeWidth || 8);

      const cx = (Number(pts[0]) + Number(pts[2])) / 2;
      const cy = (Number(pts[1]) + Number(pts[3])) / 2;
      const rel = [pts[0] - cx, pts[1] - cy, pts[2] - cx, pts[3] - cy];

      return (
        <Group
          x={cx}
          y={cy}
          draggable={!obj.locked}
          onDragStart={(e) => {
            justDraggedRef.current = true;
            e.target.moveToTop();
            e.target.getLayer()?.batchDraw();
          }}
          onClick={() => {
            setSelectedId(obj.id);
            bringToFront(obj.id);
          }}
          onTap={() => {
            setSelectedId(obj.id);
            bringToFront(obj.id);
          }}
          onDragEnd={(e) => {
            const nx = e.target.x();
            const ny = e.target.y();
            const dx = nx - cx;
            const dy = ny - cy;

            const baseDx = Math.round(dx / SNAP_UNIT) * SNAP_UNIT;
            const baseDy = Math.round(dy / SNAP_UNIT) * SNAP_UNIT;

            const others = objects.filter(
              (o) => String(o.id) !== String(obj.id),
            );

            const baseCandidate = {
              ...obj,
              points: shiftLinePoints(obj.points, baseDx, baseDy),
            };

            const applyShiftAndBringFront = (dx2, dy2) => {
              setObjects((prev) => {
                const idx = prev.findIndex(
                  (o) => String(o.id) === String(obj.id),
                );
                if (idx < 0) return prev;

                const updated = {
                  ...prev[idx],
                  points: shiftLinePoints(prev[idx].points, dx2, dy2),
                };

                const next = prev.slice();
                next.splice(idx, 1);
                next.push(updated);
                return next;
              });
            };

            if (isFree(baseCandidate, others, PAD)) {
              applyShiftAndBringFront(baseDx, baseDy);
              e.target.position({ x: cx, y: cy });
              return;
            }

            const maxRing = 40;
            for (let ring = 1; ring <= maxRing; ring++) {
              for (let ix = -ring; ix <= ring; ix++) {
                const iy = ring - Math.abs(ix);
                const tries = [
                  { dx: baseDx + ix * SNAP_UNIT, dy: baseDy + iy * SNAP_UNIT },
                  { dx: baseDx + ix * SNAP_UNIT, dy: baseDy - iy * SNAP_UNIT },
                ];

                for (const t of tries) {
                  const test = {
                    ...obj,
                    points: shiftLinePoints(obj.points, t.dx, t.dy),
                  };
                  if (isFree(test, others, PAD)) {
                    applyShiftAndBringFront(t.dx, t.dy);
                    e.target.position({ x: cx, y: cy });
                    return;
                  }
                }
              }
            }

            e.target.position({ x: cx, y: cy });
          }}
        >
          {/* ✅ ICI : on applique la rotation uniquement à la ligne et ses éléments */}
          <Group rotation={Number(obj.rotation || 0)}>
            {obj.decorKind === "window" && (
              <>
                {Array.from({ length: Number(obj?.meta?.ticks || 4) }).map(
                  (_, i) => {
                    const t = (i + 1) / (Number(obj?.meta?.ticks || 4) + 1);
                    const x = rel[0] + (rel[2] - rel[0]) * t;
                    const y = rel[1] + (rel[3] - rel[1]) * t;

                    return (
                      <Line
                        key={`tick_${obj.id}_${i}`}
                        points={[x, y - 10, x, y + 10]}
                        stroke="rgba(255,255,255,0.65)"
                        strokeWidth={2}
                        lineCap="round"
                        listening={false}
                        perfectDrawEnabled={false}
                      />
                    );
                  },
                )}
              </>
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

          {/* ✅ Boutons : hors du Group rotaté => ils ne tournent plus */}
          {isSelected &&
            (() => {
              const BTN_R = 16;
              const GAP = 10;
              const totalH = BTN_R * 2 * 2 + GAP;
              const startY = -totalH / 2 + BTN_R;

              const halfW = Math.max(Math.abs(rel[0]), Math.abs(rel[2]));
              const xOff = halfW + 26;

              return (
                <ActionButtons
                  xOff={xOff}
                  startY={startY}
                  onRotate={(e) => bumpRotate15ById(obj.id, e)}
                  onDelete={(e) => removeObjectById(obj.id, e)}
                />
              );
            })()}
        </Group>
      );
    }

    if (shape === "circle") {
      const x = Number(obj.x || 0);
      const y = Number(obj.y || 0);
      const r = Number(obj.r || 16);

      const fill = obj?.style?.fill || "rgba(19,30,54,0.22)";
      const stroke = isSelected
        ? strokeSelected
        : obj?.style?.stroke || "rgba(19,30,54,0.45)";

      const label = String(obj?.meta?.label || "");

      return (
        <Group
          x={x}
          y={y}
          draggable
          onDragStart={(e) => {
            justDraggedRef.current = true;
            e.target.moveToTop();
            e.target.getLayer()?.batchDraw();
          }}
          onClick={() => {
            setSelectedId(obj.id);
            bringToFront(obj.id);
          }}
          onTap={() => {
            setSelectedId(obj.id);
            bringToFront(obj.id);
          }}
          onDragEnd={(e) => {
            let { x, y } = e.target.position();

            x = Math.round(x / SNAP_UNIT) * SNAP_UNIT;
            y = Math.round(y / SNAP_UNIT) * SNAP_UNIT;

            const candidate = { ...obj, x, y };
            const others = objects.filter(
              (o) => String(o.id) !== String(obj.id),
            );

            const best = findNearestFree(candidate, others, SNAP_UNIT, PAD);

            setObjects((prev) => {
              const idx = prev.findIndex(
                (o) => String(o.id) === String(obj.id),
              );
              if (idx < 0) return prev;

              const updated = { ...prev[idx], x: best.x, y: best.y };

              const next = prev.slice();
              next.splice(idx, 1);
              next.push(updated);
              return next;
            });
          }}
        >
          <Group rotation={Number(obj.rotation || 0)}>
            {(() => {
              const octPts = polygonPoints(0, 0, r, 8, -Math.PI / 8);

              // ---------- PLANTE : uniquement feuillage ----------
              if (obj.decorKind === "plant") {
                return (
                  <>
                    {/* feuillage (top view) */}
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

                    {/* coeur */}
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

                    {/* ✅ hit-area + highlight (invisible) pour rester cliquable/drag + montrer sélection */}
                    <Circle
                      x={0}
                      y={0}
                      radius={r}
                      fill="rgba(0,0,0,0)"
                      stroke={isSelected ? strokeSelected : "rgba(0,0,0,0)"}
                      strokeWidth={isSelected ? 2 : 0}
                      perfectDrawEnabled={false}
                      shadowForStrokeEnabled={false}
                    />
                  </>
                );
              }

              // ---------- PARASOL : même rendu mais octogone ----------
              if (obj.decorKind === "parasol") {
                const seg = Number(obj?.meta?.segments || 8);
                const ang = 360 / seg;

                return (
                  <>
                    {/* ✅ Clip des arcs à l’intérieur de l’octogone */}
                    <Group
                      listening={false}
                      clipFunc={(ctx) => clipPolygon(ctx, octPts)}
                    >
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
                              : "rgba(0,122,255,0.25)"
                          }
                          stroke="rgba(19,30,54,0.18)"
                          strokeWidth={1}
                          perfectDrawEnabled={false}
                          shadowForStrokeEnabled={false}
                        />
                      ))}
                    </Group>

                    {/* ✅ contour octogone (sert aussi de sélection) */}
                    <Line
                      points={octPts}
                      closed
                      fill="rgba(255,255,255,0.10)"
                      stroke={
                        isSelected ? strokeSelected : "rgba(19,30,54,0.35)"
                      }
                      strokeWidth={2}
                      perfectDrawEnabled={false}
                      shadowForStrokeEnabled={false}
                    />

                    {/* mât */}
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
              }

              // ---------- DEFAULT : tes cercles normaux ----------
              return (
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
              );
            })()}
          </Group>
          {isSelected &&
            (() => {
              const BTN_R = 16;
              const GAP = 10;
              const totalH = BTN_R * 2 * 2 + GAP;
              const startY = -totalH / 2 + BTN_R;

              const xOff = r + 26; // cercle centré

              return (
                <ActionButtons
                  xOff={xOff}
                  startY={startY}
                  onRotate={(e) => bumpRotate15ById(obj.id, e)}
                  onDelete={(e) => removeObjectById(obj.id, e)}
                />
              );
            })()}
        </Group>
      );
    }

    // rect
    const x = Number(obj.x || 0);
    const y = Number(obj.y || 0);
    const w = Number(obj.w || 200);
    const h = Number(obj.h || 40);

    const fill = obj?.style?.fill || "rgba(19,30,54,0.10)";
    const stroke = isSelected
      ? "rgba(0,122,255,0.9)"
      : obj?.style?.stroke || "rgba(19,30,54,0.30)";
    const cornerRadius = Number(obj?.style?.cornerRadius || 16);

    const label = String(obj?.meta?.label || "");

    return (
      <Group
        x={x}
        y={y}
        draggable
        onDragStart={(e) => {
          justDraggedRef.current = true;
          e.target.moveToTop();
          e.target.getLayer()?.batchDraw();
        }}
        onClick={() => {
          setSelectedId(obj.id);
          bringToFront(obj.id);
        }}
        onTap={() => {
          setSelectedId(obj.id);
          bringToFront(obj.id);
        }}
        onDragEnd={(e) => {
          const nx = e.target.x();
          const ny = e.target.y();

          const snapped = snapCenterToUnit(nx, ny, w, h, SNAP_UNIT);

          const candidate = { ...obj, x: snapped.x, y: snapped.y };
          const others = objects.filter((o) => String(o.id) !== String(obj.id));

          const best = findNearestFree(candidate, others, SNAP_UNIT, PAD);

          setObjects((prev) => {
            const idx = prev.findIndex((o) => String(o.id) === String(obj.id));
            if (idx < 0) return prev;

            const updated = { ...prev[idx], x: best.x, y: best.y };

            const next = prev.slice();
            next.splice(idx, 1);
            next.push(updated);
            return next;
          });
        }}
      >
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

          {obj.decorKind === "wc" && (
            <Group listening={false}>
              <Circle
                x={w * 0.35}
                y={h * 0.48}
                radius={10}
                fill="rgba(19,30,54,0.25)"
              />
              <Rect
                x={w * 0.5}
                y={h * 0.3}
                width={22}
                height={38}
                cornerRadius={10}
                fill="rgba(19,30,54,0.18)"
              />
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
        {isSelected &&
          (() => {
            const BTN_R = 16;
            const GAP = 10;
            const totalH = BTN_R * 2 * 2 + GAP;
            const startY = h / 2 - totalH / 2 + BTN_R;

            const xOff = w + 26;

            return (
              <ActionButtons
                xOff={xOff}
                startY={startY}
                onRotate={(e) => bumpRotate15ById(obj.id, e)}
                onDelete={(e) => removeObjectById(obj.id, e)}
              />
            );
          })()}
      </Group>
    );
  }

  /* ===========================
   * UI
   * =========================== */

  const canRotate =
    selectedObj &&
    (selectedObj.type === "table" ||
      (selectedObj.type === "decor" && !!selectedObj.shape));

  return (
    <div className="rounded-3xl border border-darkBlue/10 bg-white/60 p-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tables */}
          <select
            value={selectedRefId}
            disabled={availableTables.length === 0}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedRefId(id);

              const ref = availableTables.find(
                (t) => String(t._id) === String(id),
              );
              if (ref) addTableInstanceFromRef(ref);

              // ✅ reset pour pouvoir en ajouter plusieurs rapidement
              setTimeout(() => setSelectedRefId(""), 0);
            }}
            className="h-10 rounded-2xl border border-darkBlue/10 bg-white/80 px-3 text-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {availableTables.length === 0 ? (
              <option value="">Toutes les tables sont déjà placées</option>
            ) : (
              <>
                <option value="" disabled>
                  Sélectionnez une table
                </option>

                {availableTables.map((t) => (
                  <option key={String(t._id)} value={String(t._id)}>
                    {t.name} • {t.seats} pers.
                  </option>
                ))}
              </>
            )}
          </select>

          <button
            type="button"
            onClick={() => {
              setNewTableName("");
              setNewTableSeats("2");
              setCreateTableOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/80 px-4 h-10 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 transition"
          >
            <Plus className="size-4 text-darkBlue/60" />
            Nouvelle table
          </button>

          {selectedObj?.type === "table" && (
            <button
              type="button"
              onClick={() => {
                setDeleteCatalogError("");
                setDeleteCatalogOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-red/20 bg-white/80 px-4 h-10 text-sm font-semibold text-red hover:bg-red/5 transition"
              title="Supprimer du catalogue"
            >
              <Trash2 className="size-4" />
              Supprimer du catalogue
            </button>
          )}

          <button
            type="button"
            onClick={() => setDecorModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/80 px-4 h-10 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 transition"
          >
            <Plus className="size-4" />
            Ajouter un élément
          </button>

          <button
            type="button"
            onClick={resetView}
            className="inline-flex items-center justify-center size-10 rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition"
            title="Réinitialiser la vue"
            aria-label="Réinitialiser la vue"
          >
            <RotateCcw className="size-4 text-darkBlue/70" />
          </button>
        </div>
      </div>

      {saveError ? (
        <div className="mt-3 rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
          {saveError}
        </div>
      ) : null}

      {/* Stage */}
      <div
        ref={wrapRef}
        className="mt-3 rounded-2xl overflow-hidden border border-darkBlue/10 bg-[#5d6675] w-full"
        style={{ aspectRatio: "16/9" }}
      >
        <Stage
          ref={stageRef}
          width={stageSize.w}
          height={stageSize.h}
          scaleX={scale}
          scaleY={scale}
          x={pos.x}
          y={pos.y}
          onWheel={handleWheel}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage()) setSelectedId(null);
          }}
        >
          <Layer>
            {gridLines}

            {objects.map((o) => {
              if (!o?.type) return null;
              if (o.type === "table") return <TableShape key={o.id} obj={o} />;
              if (o.type === "decor") return <DecorShape key={o.id} obj={o} />;
              return null;
            })}
          </Layer>
        </Stage>
      </div>

      {createTableOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-end mobile:items-center justify-center bg-black/40 p-3"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateTableOpen(false);
          }}
        >
          <div className="w-full max-w-[520px] rounded-3xl border border-darkBlue/10 bg-lightGrey shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-darkBlue/10">
              <div className="min-w-0">
                <p className="text-base font-semibold text-darkBlue">
                  Nouvelle table
                </p>
                <p className="text-xs text-darkBlue/60">
                  Créez une table, elle sera placée automatiquement au centre du
                  plan.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCreateTableOpen(false)}
                className="inline-flex items-center justify-center size-10 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                aria-label="Fermer"
              >
                <X className="size-4 text-darkBlue/70" />
              </button>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-1 mobile:grid-cols-2 gap-3">
                <input
                  ref={newTableNameRef}
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="Nom / n° table (ex: 10)"
                  className="h-11 rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createConfiguredTableAndPlace();
                  }}
                />

                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={newTableSeats}
                  onChange={(e) => setNewTableSeats(e.target.value)}
                  placeholder="Places"
                  className="h-11 rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none focus:border-blue/60 focus:ring-2 focus:ring-blue/20 text-center"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createConfiguredTableAndPlace();
                  }}
                />
              </div>

              {createTableError && (
                <p className="mt-3 text-sm text-red">{createTableError}</p>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateTableOpen(false)}
                  className="inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-4 h-11 text-sm font-semibold text-darkBlue"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={createConfiguredTableAndPlace}
                  disabled={createTableLoading}
                  className="inline-flex items-center justify-center rounded-2xl bg-blue text-white px-4 h-11 text-sm font-semibold hover:bg-blue/90 active:scale-[0.98] transition disabled:opacity-50"
                >
                  {createTableLoading ? "Création…" : "Créer & placer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteCatalogOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-end mobile:items-center justify-center bg-black/40 p-3"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeleteCatalogOpen(false);
          }}
        >
          <div className="w-full max-w-[560px] rounded-3xl border border-darkBlue/10 bg-lightGrey shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-darkBlue/10">
              <div className="min-w-0">
                <p className="text-base font-semibold text-darkBlue">
                  Supprimer du catalogue
                </p>
                <p className="text-xs text-darkBlue/60">
                  Cette action supprime définitivement la table{" "}
                  <span className="font-semibold text-darkBlue">
                    {activeCatalogTable?.name
                      ? `"${activeCatalogTable.name}"`
                      : ""}
                  </span>{" "}
                  du catalogue.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDeleteCatalogOpen(false)}
                className="inline-flex items-center justify-center size-10 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                aria-label="Fermer"
              >
                <X className="size-4 text-darkBlue/70" />
              </button>
            </div>

            <div className="p-4">
              <div className="rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm text-darkBlue/80">
                Le table déjà placée sur le plan sera supprimée automatiquement.
              </div>

              {deleteCatalogError && (
                <p className="mt-3 text-sm text-red">{deleteCatalogError}</p>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteCatalogOpen(false)}
                  className="inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-4 h-11 text-sm font-semibold text-darkBlue"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={deleteTableFromCatalog}
                  disabled={deleteCatalogLoading || !activeCatalogId}
                  className="inline-flex items-center justify-center rounded-2xl bg-red text-white px-4 h-11 text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
                >
                  {deleteCatalogLoading
                    ? "Suppression…"
                    : "Supprimer définitivement"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decor Modal */}
      {decorModalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-end mobile:items-center justify-center bg-black/40 p-3"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDecorModalOpen(false);
          }}
        >
          <div className="w-full max-w-[720px] rounded-3xl border border-darkBlue/10 bg-lightGrey shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-darkBlue/10">
              <div className="min-w-0">
                <p className="text-base font-semibold text-darkBlue">
                  Ajouter un élément
                </p>
                <p className="text-xs text-darkBlue/60">
                  Clique sur un élément pour l’ajouter au centre du plan.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDecorModalOpen(false)}
                className="inline-flex items-center justify-center size-10 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                aria-label="Fermer"
              >
                <X className="size-4 text-darkBlue/70" />
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 mobile:grid-cols-2 gap-4">
              {/* 1) STRUCTURE */}
              <div className="rounded-3xl border border-darkBlue/10 bg-white/70 p-3">
                <p className="text-sm font-semibold text-darkBlue">
                  1) Structure
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <ItemBtn
                    label="Mur / cloison"
                    onClick={() => addDecor("wall")}
                  />

                  <ItemBtn
                    label="Porte / entrée"
                    onClick={() => addDecor("door")}
                  />
                  <ItemBtn
                    label="Bar / comptoir"
                    onClick={() => addDecor("bar")}
                  />
                  <ItemBtn
                    label="Cuisine / passe"
                    onClick={() => addDecor("kitchen")}
                  />
                  <ItemBtn label="Fenêtre" onClick={() => addDecor("window")} />
                  <ItemBtn label="Toilettes" onClick={() => addDecor("wc")} />
                </div>
              </div>

              {/* 2) OBSTACLES */}
              <div className="rounded-3xl border border-darkBlue/10 bg-white/70 p-3">
                <p className="text-sm font-semibold text-darkBlue">
                  2) Obstacles
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <ItemBtn
                    label="Pilier (rond)"
                    onClick={() => addDecor("pillar_round")}
                  />
                  <ItemBtn
                    label="Pilier (carré)"
                    onClick={() => addDecor("pillar_square")}
                  />
                  <ItemBtn
                    label="Escalier"
                    onClick={() => addDecor("stairs")}
                  />
                  <ItemBtn
                    label="Zone interdite"
                    onClick={() => addDecor("no_zone")}
                  />
                </div>
              </div>

              {/* 3) AMBIANCE */}
              <div className="rounded-3xl border border-darkBlue/10 bg-white/70 p-3 mobile:col-span-2">
                <p className="text-sm font-semibold text-darkBlue">
                  3) Ambiance / déco
                </p>

                <div className="mt-3 grid grid-cols-1 mobile:grid-cols-2 gap-2">
                  <ItemBtn label="Plante" onClick={() => addDecor("plant")} />
                  <ItemBtn
                    label="Parasol"
                    onClick={() => addDecor("parasol")}
                  />
                  <ItemBtn
                    label="Banquette"
                    onClick={() => addDecor("bench")}
                  />
                  <ItemBtn
                    label="Décoration générique"
                    onClick={() => addDecor("decor")}
                  />
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-darkBlue/10 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setDecorModalOpen(false)}
                className="inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white px-4 h-10 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemBtn({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-darkBlue/10 bg-white/80 px-3 py-2 hover:bg-darkBlue/5 transition"
    >
      <p className="text-sm font-semibold text-darkBlue">{label}</p>
    </button>
  );
}
