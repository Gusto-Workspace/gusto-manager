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

export default function RoomEditorComponent({
  restaurantId,
  room,
  tablesCatalog,
  onSaved,
}) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const wrapRef = useRef(null);
  const stageRef = useRef(null);

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
  const [selectedRefId, setSelectedRefId] = useState(
    tablesCatalog?.[0]?._id ? String(tablesCatalog[0]._id) : "",
  );

  // decor modal
  const [decorModalOpen, setDecorModalOpen] = useState(false);

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
    setObjects(safeArr(room?.objects));
    setSelectedId(null);
    setScale(0.7);
    setPos({ x: 0, y: 0 });
  }, [room?._id]);

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

  const selectedObj = useMemo(
    () => objects.find((o) => String(o.id) === String(selectedId)) || null,
    [objects, selectedId],
  );

  useEffect(() => {
    if (!selectedObj) return;
    const r = Number(selectedObj.rotation || 0);
    setRotationInput(String(Math.round(r)));
  }, [selectedObj?.id]);

  function updateSelected(patch) {
    if (!selectedId) return;
    setObjects((prev) =>
      prev.map((o) =>
        String(o.id) === String(selectedId) ? { ...o, ...patch } : o,
      ),
    );
  }

  function applyRotation(value) {
    if (!selectedId) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;

    setObjects((prev) =>
      prev.map((o) => (o.id === selectedId ? { ...o, rotation: n } : o)),
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

  /* ===========================
   * ADD TABLE (✅ quantized)
   * =========================== */

  function addTableInstance() {
    if (!selectedRefId) return;
    const ref = catalog.find((t) => String(t._id) === String(selectedRefId));
    if (!ref) return;

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
    } else if (kind === "partition") {
      next = makeLine(220, {
        style: { stroke: "rgba(19,30,54,0.55)", strokeWidth: 6 },
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
  }

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
        top = 1;
        bottom = 1;
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
        onDragEnd={(e) => {
          const nx = e.target.x();
          const ny = e.target.y();

          // ✅ snap sur 1/2 case
          const snapped = snapCenterToUnit(nx, ny, w, h, SNAP_UNIT);

          const candidate = { ...obj, x: snapped.x, y: snapped.y };
          const others = objects.filter((o) => String(o.id) !== String(obj.id));

          // ✅ recherche aussi en 1/2 case
          const best = findNearestFree(candidate, others, SNAP_UNIT, PAD);

          setObjects((prev) =>
            prev.map((o) =>
              o.id === obj.id ? { ...o, x: best.x, y: best.y } : o,
            ),
          );
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
          rotation={Number(obj.rotation || 0)}
          draggable={!obj.locked}
          onClick={onClick}
          onTap={onClick}
          onDragEnd={(e) => {
            const nx = e.target.x();
            const ny = e.target.y();
            const dx = nx - cx;
            const dy = ny - cy;

            // ✅ snap en 1/2 case
            const baseDx = Math.round(dx / SNAP_UNIT) * SNAP_UNIT;
            const baseDy = Math.round(dy / SNAP_UNIT) * SNAP_UNIT;

            const others = objects.filter(
              (o) => String(o.id) !== String(obj.id),
            );

            // candidate avec points déplacés
            const baseCandidate = {
              ...obj,
              points: shiftLinePoints(obj.points, baseDx, baseDy),
            };

            // si libre, on applique direct
            if (isFree(baseCandidate, others, PAD)) {
              setObjects((prev) =>
                prev.map((o) =>
                  o.id === obj.id
                    ? {
                        ...o,
                        points: shiftLinePoints(o.points, baseDx, baseDy),
                      }
                    : o,
                ),
              );
              e.target.position({ x: cx, y: cy });
              return;
            }

            // sinon: recherche par anneaux en 1/2 case (comme les tables)
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
                    setObjects((prev) =>
                      prev.map((o) =>
                        o.id === obj.id
                          ? {
                              ...o,
                              points: shiftLinePoints(o.points, t.dx, t.dy),
                            }
                          : o,
                      ),
                    );
                    e.target.position({ x: cx, y: cy });
                    return;
                  }
                }
              }
            }

            // fallback
            e.target.position({ x: cx, y: cy });
          }}
        >
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
          onClick={onClick}
          onTap={onClick}
          onDragEnd={(e) => {
            let { x, y } = e.target.position();

            // ✅ snap centre sur 1/2 case (AVANT tu avais grid)
            x = Math.round(x / SNAP_UNIT) * SNAP_UNIT;
            y = Math.round(y / SNAP_UNIT) * SNAP_UNIT;

            const candidate = { ...obj, x, y };
            const others = objects.filter(
              (o) => String(o.id) !== String(obj.id),
            );

            const best = findNearestFree(candidate, others, SNAP_UNIT, PAD);

            setObjects((prev) =>
              prev.map((o) =>
                o.id === obj.id ? { ...o, x: best.x, y: best.y } : o,
              ),
            );
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

            {/* ⚠️ label pour plant/parasol : si tu en veux aussi, dis-moi, là je l’ai laissé dans le default seulement */}
          </Group>
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
        onClick={onClick}
        onTap={onClick}
        onDragEnd={(e) => {
          const nx = e.target.x();
          const ny = e.target.y();

          const snapped = snapCenterToUnit(nx, ny, w, h, SNAP_UNIT);

          const candidate = { ...obj, x: snapped.x, y: snapped.y };
          const others = objects.filter((o) => String(o.id) !== String(obj.id));

          const best = findNearestFree(candidate, others, SNAP_UNIT, PAD);

          setObjects((prev) =>
            prev.map((o) =>
              o.id === obj.id ? { ...o, x: best.x, y: best.y } : o,
            ),
          );
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
            onChange={(e) => setSelectedRefId(e.target.value)}
            className="h-10 rounded-2xl border border-darkBlue/10 bg-white/80 px-3 text-sm outline-none"
          >
            {catalog.map((t) => (
              <option key={String(t._id)} value={String(t._id)}>
                {t.name} • {t.seats}p
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={addTableInstance}
            disabled={!selectedRefId || catalog.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue text-white px-4 h-10 text-sm font-semibold hover:bg-blue/90 active:scale-[0.98] transition disabled:opacity-40"
          >
            <Plus className="size-4" />
            Ajouter table
          </button>

          <button
            type="button"
            onClick={() => setDecorModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-darkBlue text-white px-4 h-10 text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition"
          >
            <Plus className="size-4" />
            Ajouter un élément
          </button>

          <button
            type="button"
            onClick={deleteSelected}
            disabled={!selectedId}
            className="inline-flex items-center gap-2 rounded-2xl bg-red text-white px-4 h-10 text-sm font-semibold hover:opacity-90 transition disabled:opacity-40"
          >
            <Trash2 className="size-4" />
            Supprimer
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

          {canRotate && (
            <div className="flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 h-10">
              <span className="text-xs text-darkBlue/60">Rotation</span>

              <button
                type="button"
                onClick={() => {
                  const next = Number(selectedObj.rotation || 0) - 15;
                  updateSelected({ rotation: next });
                  setRotationInput(String(Math.round(next)));
                }}
                className="h-8 w-8 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                title="-15°"
              >
                −
              </button>

              <input
                type="number"
                value={rotationInput}
                onChange={(e) => {
                  setRotationInput(e.target.value);
                  applyRotation(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onBlur={() => {
                  let n = Number(rotationInput);
                  if (!Number.isFinite(n)) n = 0;
                  n = ((n % 360) + 360) % 360;
                  updateSelected({ rotation: n });
                  setRotationInput(String(Math.round(n)));
                }}
                className="w-20 h-8 rounded-xl border border-darkBlue/10 bg-white px-2 text-sm outline-none text-center"
                placeholder="0"
              />

              <button
                type="button"
                onClick={() => {
                  const next = Number(selectedObj.rotation || 0) + 15;
                  updateSelected({ rotation: next });
                  setRotationInput(String(Math.round(next)));
                }}
                className="h-8 w-8 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                title="+15°"
              >
                +
              </button>

              <span className="text-xs text-darkBlue/50">°</span>
            </div>
          )}
        </div>
      </div>

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

      {/* Decor Modal */}
      {decorModalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-end mobile:items-center justify-center bg-black/40 p-3"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDecorModalOpen(false);
          }}
        >
          <div className="w-full max-w-[720px] rounded-3xl border border-darkBlue/10 bg-white/95 shadow-xl overflow-hidden">
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
                    label="Cloison fine"
                    onClick={() => addDecor("partition")}
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
                  <ItemBtn label="Toilettes" onClick={() => addDecor("wc")} />
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

      <button
        type="button"
        onClick={saveRoom}
        className="inline-flex items-center gap-2 rounded-2xl bg-darkBlue text-white px-4 h-10 text-sm font-semibold hover:opacity-90 transition mt-2"
      >
        <Save className="size-4" />
        Enregistrer
      </button>
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
