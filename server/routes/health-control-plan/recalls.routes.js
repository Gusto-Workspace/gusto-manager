// server/routes/health-control-plan/recall.routes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { Types } = mongoose;

const authenticateToken = require("../../middleware/authentificate-token");
const Recall = require("../../models/logs/recall.model");
const InventoryLot = require("../../models/logs/inventory-lot.model");

/* ---------- ARRONDI & UNITÉS (helpers locaux) ---------- */
function decimalsForUnit(u) {
  const unit = String(u || "").trim();
  if (unit === "unit") return 0; // unités comptées
  return 3; // kg, g, L, mL
}
function roundByUnit(val, unit) {
  const n = Number(val);
  if (!Number.isFinite(n)) return n;
  const d = decimalsForUnit(unit);
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
const UNIT_GROUP = {
  MASS: new Set(["kg", "g"]),
  VOL: new Set(["L", "mL"]),
  COUNT: new Set(["unit"]),
};
function sameGroup(a, b) {
  if (UNIT_GROUP.MASS.has(a) && UNIT_GROUP.MASS.has(b)) return "MASS";
  if (UNIT_GROUP.VOL.has(a) && UNIT_GROUP.VOL.has(b)) return "VOL";
  if (UNIT_GROUP.COUNT.has(a) && UNIT_GROUP.COUNT.has(b)) return "COUNT";
  return null;
}
function convertQty(qty, from, to) {
  if (qty == null) return null;
  if (from === to) return qty;
  const g = sameGroup(from, to);
  if (!g) return null;
  if (g === "MASS") {
    if (from === "kg" && to === "g") return qty * 1000;
    if (from === "g" && to === "kg") return qty / 1000;
  }
  if (g === "VOL") {
    if (from === "L" && to === "mL") return qty * 1000;
    if (from === "mL" && to === "L") return qty / 1000;
  }
  if (g === "COUNT") return qty;
  return null;
}

/* ---------- helpers génériques ---------- */
function currentUserFromToken(req) {
  const u = req.user || {};
  const role = (u.role || "").toLowerCase();
  if (!["owner", "employee"].includes(role) || !u.id) return null;
  return {
    userId: u.id,
    role,
    firstName: u.firstname || u.firstName || "",
    lastName: u.lastname || u.lastName || "",
  };
}
const normStr = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};
const normDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const normNum = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const normObjId = (v) => {
  if (!v) return null;
  const s = String(v);
  return Types.ObjectId.isValid(s) ? s : null;
};
function normStringArray(input) {
  if (!input) return [];
  if (Array.isArray(input))
    return input
      .map((x) => normStr(x))
      .filter(Boolean)
      .slice(0, 100);
  return String(input)
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
}
function clampQtyRemaining(qtyRemaining, qtyReceived) {
  const q = Number.isFinite(Number(qtyRemaining)) ? Number(qtyRemaining) : 0;
  const r = Number.isFinite(Number(qtyReceived)) ? Number(qtyReceived) : 0;
  return Math.max(0, Math.min(q, r));
}

const ALLOWED_SOURCE = ["supplier", "authority", "internal"];
function listSortExpr() {
  return { initiatedAt: -1, createdAt: -1, _id: -1 };
}

function normItem(i = {}) {
  const productName = normStr(i.productName);
  const lotNumber = normStr(i.lotNumber);
  const quantity = normNum(i.quantity);
  const unit = normStr(i.unit);
  const bestBefore = normDate(i.bestBefore);
  const note = normStr(i.note);
  const inventoryLotId = normObjId(i.inventoryLotId);
  if (!productName && !inventoryLotId) return null;

  return {
    productName: productName || undefined,
    lotNumber: lotNumber || undefined,
    quantity: quantity ?? undefined,
    unit: unit ?? undefined,
    bestBefore: bestBefore ?? undefined,
    note: note ?? undefined,
    inventoryLotId: inventoryLotId ?? undefined,
  };
}

/* --------- autocomplete inventory lots --------- */
router.get(
  "/restaurants/:restaurantId/recalls/select/inventory-lots",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { q = "", limit = 20, status = "in_stock" } = req.query;

      const query = { restaurantId };
      if (status) query.status = String(status);

      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [
          { productName: rx },
          { lotNumber: rx },
          { supplier: rx },
          { unit: rx },
        ];
      }

      const items = await InventoryLot.find(query)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(Math.max(1, Math.min(100, Number(limit))));

      const results = items.map((l) => ({
        _id: String(l._id),
        productName: l.productName || "",
        lotNumber: l.lotNumber || "",
        supplier: l.supplier || "",
        unit: l.unit || "",
        qtyRemaining: roundByUnit(l.qtyRemaining ?? null, l.unit), // sortie propre
        dlc: l.dlc || null,
        ddm: l.ddm || null,
        status: l.status || "",
      }));

      return res.json({ items: results });
    } catch (err) {
      console.error("GET /recalls/select/inventory-lots:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la recherche de lots" });
    }
  }
);

/* ------------------ CREATE ------------------ */
router.post(
  "/restaurants/:restaurantId/recalls",
  authenticateToken,
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser) {
        await session.abortTransaction();
        return res.status(400).json({ error: "Utilisateur non reconnu" });
      }

      const source = ALLOWED_SOURCE.includes(String(inData.source))
        ? String(inData.source)
        : "supplier";

      const supplierId = normObjId(inData.supplierId);
      const supplierName = normStr(inData.supplierName);

      let items = Array.isArray(inData.items)
        ? inData.items.map(normItem).filter(Boolean)
        : [];
      if (!items.length) {
        await session.abortTransaction();
        return res
          .status(400)
          .json({ error: "Au moins un produit est requis" });
      }

      // enrich with inventory lots (map aussi utilisé pour conversions)
      const lotIds = [
        ...new Set(
          items
            .map((it) => it.inventoryLotId)
            .filter(Boolean)
            .map(String)
        ),
      ];
      const lotsById = {};
      if (lotIds.length) {
        const lots = await InventoryLot.find({
          _id: { $in: lotIds },
          restaurantId,
        }).session(session);
        lots.forEach((l) => (lotsById[String(l._id)] = l));
      }
      items = items.map((it) => {
        if (!it.inventoryLotId) return it;
        const lot = lotsById[String(it.inventoryLotId)];
        if (!lot) {
          const { inventoryLotId, ...rest } = it;
          return rest;
        }
        return {
          ...it,
          productName: it.productName || lot.productName || "Produit",
          lotNumber: it.lotNumber || lot.lotNumber || undefined,
          unit: it.unit || lot.unit || undefined,
          bestBefore: it.bestBefore || lot.dlc || lot.ddm || undefined,
        };
      });

      const doc = new Recall({
        restaurantId,
        source,
        supplierId: supplierId ?? undefined,
        supplierName: supplierName ?? undefined,
        initiatedAt: normDate(inData.initiatedAt) ?? new Date(),
        items,
        actionsTaken: normStr(inData.actionsTaken) ?? undefined,
        attachments: normStringArray(inData.attachments),
        closedAt: normDate(inData.closedAt) ?? undefined,
        recordedBy: currentUser,
      });

      await doc.save({ session });

      // decrement qtyRemaining per lot (sum quantities en unité du lot + arrondi)
      const sumByLot = {};
      for (const it of items) {
        if (!it.inventoryLotId) continue;
        const lot = lotsById[String(it.inventoryLotId)];
        if (!lot) continue;

        const q = Number(it.quantity || 0);
        if (!Number.isFinite(q) || q <= 0) continue;

        const fromUnit = it.unit || lot.unit;
        const toUnit = lot.unit;
        const converted = convertQty(q, fromUnit, toUnit);
        if (converted == null) {
          await session.abortTransaction();
          return res.status(409).json({
            error: `Unité incompatible pour le lot ${lot._id}: item=${fromUnit} vs lot=${toUnit}`,
          });
        }
        const rounded = roundByUnit(converted, toUnit);
        const id = String(it.inventoryLotId);
        sumByLot[id] = (sumByLot[id] || 0) + rounded;
      }

      for (const id of Object.keys(sumByLot)) {
        const lot =
          lotsById[id] ||
          (await InventoryLot.findOne({ _id: id, restaurantId }).session(
            session
          ));
        if (!lot) continue;

        const dec = sumByLot[id];
        let newRemaining = (lot.qtyRemaining ?? 0) - dec;
        // arrondi à l’unité du lot puis clamp [0..qtyReceived]
        newRemaining = roundByUnit(newRemaining, lot.unit);
        newRemaining = clampQtyRemaining(newRemaining, lot.qtyReceived);

        const patch = { qtyRemaining: newRemaining };
        if (newRemaining === 0) {
          patch.status = "returned";
          patch.disposalReason = "recall";
        } else if (lot.status === "returned") {
          patch.status = "in_stock";
          patch.disposalReason = undefined;
        }
        await InventoryLot.updateOne(
          { _id: id, restaurantId },
          { $set: patch },
          { session }
        );
      }

      await session.commitTransaction();
      return res.status(201).json(doc);
    } catch (err) {
      console.error("POST /recalls:", err);
      await session.abortTransaction();
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du retour NC" });
    } finally {
      session.endSession();
    }
  }
);

/* ------------------ LIST ------------------ */
router.get(
  "/restaurants/:restaurantId/list-recalls",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 20,
        date_from,
        date_to,
        q,
        source,
        closed,
      } = req.query;

      const query = { restaurantId };

      if (source && ALLOWED_SOURCE.includes(String(source)))
        query.source = String(source);

      // closed: "open" / "closed"
      if (closed === "open") query.closedAt = { $exists: false };
      if (closed === "closed") query.closedAt = { $exists: true, $ne: null };

      // date range on initiatedAt
      if (date_from || date_to) {
        const from = normDate(date_from);
        const to = normDate(date_to);
        const range = {};
        if (from) range.$gte = from;
        if (to) {
          const end = new Date(to);
          end.setDate(end.getDate() + 1);
          end.setMilliseconds(end.getMilliseconds() - 1);
          range.$lte = end;
        }
        if (Object.keys(range).length) query.initiatedAt = range;
      }

      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        (query.$or ||= []).push(
          { supplierName: rx },
          { actionsTaken: rx },
          { attachments: rx },
          { "items.productName": rx },
          { "items.lotNumber": rx },
          { "items.unit": rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx }
        );
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        Recall.find(query).sort(listSortExpr()).skip(skip).limit(Number(limit)),
        Recall.countDocuments(query),
      ]);

      return res.json({
        items,
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.max(1, Math.ceil(total / Number(limit))),
        },
      });
    } catch (err) {
      console.error("GET /list-recalls:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des retours NC" });
    }
  }
);

/* ------------------ READ ONE ------------------ */
router.get(
  "/restaurants/:restaurantId/recalls/:recallId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, recallId } = req.params;
      const doc = await Recall.findOne({ _id: recallId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Retour NC introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /recalls/:recallId:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération" });
    }
  }
);

/* ------------------ UPDATE (apply diff per lot) ------------------ */
router.put(
  "/restaurants/:restaurantId/recalls/:recallId",
  authenticateToken,
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { restaurantId, recallId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;
      delete inData.restaurantId;

      const prev = await Recall.findOne({
        _id: recallId,
        restaurantId,
      }).session(session);
      if (!prev) {
        await session.abortTransaction();
        return res.status(404).json({ error: "Retour NC introuvable" });
      }

      // NEW items normalized
      let nextItems =
        inData.items !== undefined && Array.isArray(inData.items)
          ? inData.items.map(normItem).filter(Boolean)
          : prev.items || [];

      // lots utilisés (prev + next) pour conversions
      const lotIds = [
        ...new Set(
          []
            .concat((prev.items || []).map((x) => x.inventoryLotId))
            .concat((nextItems || []).map((x) => x.inventoryLotId))
            .filter(Boolean)
            .map(String)
        ),
      ];
      const lotsById = {};
      if (lotIds.length) {
        const lots = await InventoryLot.find({
          _id: { $in: lotIds },
          restaurantId,
        }).session(session);
        lots.forEach((l) => (lotsById[String(l._id)] = l));
      }

      nextItems = (nextItems || []).map((it) => {
        if (!it.inventoryLotId) return it;
        const lot = lotsById[String(it.inventoryLotId)];
        if (!lot) {
          const { inventoryLotId, ...rest } = it;
          return rest;
        }
        return {
          ...it,
          productName: it.productName || lot.productName || "Produit",
          lotNumber: it.lotNumber || lot.lotNumber || undefined,
          unit: it.unit || lot.unit || undefined,
          bestBefore: it.bestBefore || lot.dlc || lot.ddm || undefined,
        };
      });

      // sums per lot (prev vs next) en unité du lot + arrondi
      const sumPrev = {};
      for (const it of prev.items || []) {
        if (!it.inventoryLotId) continue;
        const lot = lotsById[String(it.inventoryLotId)];
        if (!lot) continue;
        const q = Number(it.quantity || 0);
        if (!Number.isFinite(q) || q <= 0) continue;
        const fromUnit = it.unit || lot.unit;
        const toUnit = lot.unit;
        const conv = convertQty(q, fromUnit, toUnit);
        if (conv == null) {
          await session.abortTransaction();
          return res.status(409).json({
            error: `Unité incompatible pour le lot ${lot._id}: item=${fromUnit} vs lot=${toUnit}`,
          });
        }
        const rounded = roundByUnit(conv, toUnit);
        const id = String(it.inventoryLotId);
        sumPrev[id] = (sumPrev[id] || 0) + rounded;
      }
      const sumNext = {};
      for (const it of nextItems || []) {
        if (!it.inventoryLotId) continue;
        const lot = lotsById[String(it.inventoryLotId)];
        if (!lot) continue;
        const q = Number(it.quantity || 0);
        if (!Number.isFinite(q) || q <= 0) continue;
        const fromUnit = it.unit || lot.unit;
        const toUnit = lot.unit;
        const conv = convertQty(q, fromUnit, toUnit);
        if (conv == null) {
          await session.abortTransaction();
          return res.status(409).json({
            error: `Unité incompatible pour le lot ${lot._id}: item=${fromUnit} vs lot=${toUnit}`,
          });
        }
        const rounded = roundByUnit(conv, toUnit);
        const id = String(it.inventoryLotId);
        sumNext[id] = (sumNext[id] || 0) + rounded;
      }

      const lotIdsAll = new Set([
        ...Object.keys(sumPrev),
        ...Object.keys(sumNext),
      ]);

      for (const id of lotIdsAll) {
        const lot =
          lotsById[id] ||
          (await InventoryLot.findOne({ _id: id, restaurantId }).session(
            session
          ));
        if (!lot) continue;

        const prevQ = sumPrev[id] || 0;
        const nextQ = sumNext[id] || 0;
        const delta = nextQ - prevQ; // >0 more returned, <0 less returned (give back to stock)

        if (delta === 0) continue;

        let newRemaining = (lot.qtyRemaining ?? 0) - delta;
        newRemaining = roundByUnit(newRemaining, lot.unit);
        newRemaining = clampQtyRemaining(newRemaining, lot.qtyReceived);

        const patch = { qtyRemaining: newRemaining };
        if (newRemaining === 0) {
          patch.status = "returned";
          patch.disposalReason = "recall";
        } else if (lot.status === "returned") {
          patch.status = "in_stock";
          patch.disposalReason = undefined;
        }
        await InventoryLot.updateOne(
          { _id: id, restaurantId },
          { $set: patch },
          { session }
        );
      }

      // patch recall
      prev.source =
        inData.source !== undefined &&
        ALLOWED_SOURCE.includes(String(inData.source))
          ? String(inData.source)
          : prev.source;
      prev.supplierId =
        inData.supplierId !== undefined
          ? normObjId(inData.supplierId)
          : prev.supplierId;
      prev.supplierName =
        inData.supplierName !== undefined
          ? normStr(inData.supplierName)
          : prev.supplierName;
      prev.initiatedAt =
        inData.initiatedAt !== undefined
          ? normDate(inData.initiatedAt)
          : prev.initiatedAt;
      prev.items = nextItems;
      prev.actionsTaken =
        inData.actionsTaken !== undefined
          ? normStr(inData.actionsTaken)
          : prev.actionsTaken;
      prev.attachments =
        inData.attachments !== undefined
          ? normStringArray(inData.attachments)
          : prev.attachments || [];
      prev.closedAt =
        inData.closedAt !== undefined
          ? normDate(inData.closedAt)
          : prev.closedAt;

      await prev.save({ session });

      await session.commitTransaction();
      return res.json(prev);
    } catch (err) {
      console.error("PUT /recalls/:recallId:", err);
      await session.abortTransaction();
      return res.status(500).json({ error: "Erreur lors de la mise à jour" });
    } finally {
      session.endSession();
    }
  }
);

/* ------------------ DELETE (recrédite les lots) ------------------ */
router.delete(
  "/restaurants/:restaurantId/recalls/:recallId",
  authenticateToken,
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { restaurantId, recallId } = req.params;

      const doc = await Recall.findOne({ _id: recallId, restaurantId }).session(
        session
      );
      if (!doc) {
        await session.abortTransaction();
        return res.status(404).json({ error: "Retour NC introuvable" });
      }

      // reverse lot decrements (convert + round à l’unité du lot)
      const lotIds = [
        ...new Set(
          (doc.items || [])
            .map((x) => x.inventoryLotId)
            .filter(Boolean)
            .map(String)
        ),
      ];
      const lotsById = {};
      if (lotIds.length) {
        const lots = await InventoryLot.find({
          _id: { $in: lotIds },
          restaurantId,
        }).session(session);
        lots.forEach((l) => (lotsById[String(l._id)] = l));
      }

      const sumByLot = {};
      for (const it of doc.items || []) {
        if (!it.inventoryLotId) continue;
        const lot = lotsById[String(it.inventoryLotId)];
        if (!lot) continue;
        const q = Number(it.quantity || 0);
        if (!Number.isFinite(q) || q <= 0) continue;

        const conv = convertQty(q, it.unit || lot.unit, lot.unit);
        if (conv == null) {
          await session.abortTransaction();
          return res.status(409).json({
            error: `Unité incompatible pour le lot ${lot._id}: item=${it.unit} vs lot=${lot.unit}`,
          });
        }
        const rounded = roundByUnit(conv, lot.unit);
        const id = String(it.inventoryLotId);
        sumByLot[id] = (sumByLot[id] || 0) + rounded;
      }

      for (const id of Object.keys(sumByLot)) {
        const lot =
          lotsById[id] ||
          (await InventoryLot.findOne({ _id: id, restaurantId }).session(
            session
          ));
        if (!lot) continue;

        let newRemaining = (lot.qtyRemaining ?? 0) + sumByLot[id];
        newRemaining = roundByUnit(newRemaining, lot.unit);
        newRemaining = clampQtyRemaining(newRemaining, lot.qtyReceived);

        const patch = { qtyRemaining: newRemaining };
        if (newRemaining > 0 && lot.status === "returned") {
          patch.status = "in_stock";
          patch.disposalReason = undefined;
        }
        await InventoryLot.updateOne(
          { _id: id, restaurantId },
          { $set: patch },
          { session }
        );
      }

      await Recall.deleteOne({ _id: recallId, restaurantId }).session(session);

      await session.commitTransaction();
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /recalls/:recallId:", err);
      await session.abortTransaction();
      return res.status(500).json({ error: "Erreur lors de la suppression" });
    } finally {
      session.endSession();
    }
  }
);

module.exports = router;
