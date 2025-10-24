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

function listSortExpr() {
  return { initiatedAt: -1, createdAt: -1, _id: -1 };
}

/* ---------- normalisation d’un item (1 produit) ---------- */
function normItem(i = {}) {
  const out = {};
  if (i.inventoryLotId != null) {
    const s = String(i.inventoryLotId);
    if (Types.ObjectId.isValid(s)) out.inventoryLotId = s;
  }
  const s = (x) => (x == null ? undefined : String(x).trim() || undefined);
  const n = (x) => {
    if (x === undefined || x === null || x === "") return undefined;
    const v = Number(x);
    return Number.isNaN(v) ? undefined : v;
  };
  const d = (x) => {
    if (!x) return undefined;
    const dt = new Date(x);
    return Number.isNaN(dt.getTime()) ? undefined : dt;
  };

  out.productName = s(i.productName);
  out.supplierName = s(i.supplierName);
  out.lotNumber = s(i.lotNumber);
  out.quantity = n(i.quantity);
  out.unit = s(i.unit);
  out.bestBefore = d(i.bestBefore);
  out.note = s(i.note);

  // pas de lot & pas de nom produit -> invalide
  if (!out.inventoryLotId && !out.productName) return null;
  return out;
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
        qtyRemaining: roundByUnit(l.qtyRemaining ?? null, l.unit),
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

/* ------------------ CREATE (1 produit) ------------------ */
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

      let item = normItem(inData.item);
      if (!item) {
        await session.abortTransaction();
        return res.status(400).json({ error: "Produit invalide/requis" });
      }

      // Si lot lié -> enrichissement snapshot + contrôle d'unité
      let lot = null;
      if (item.inventoryLotId) {
        lot = await InventoryLot.findOne({
          _id: item.inventoryLotId,
          restaurantId,
        }).session(session);
        if (!lot) {
          await session.abortTransaction();
          return res.status(404).json({ error: "Lot inventaire introuvable" });
        }
        item.productName ||= lot.productName || "Produit";
        item.lotNumber ||= lot.lotNumber || undefined;
        item.unit ||= lot.unit || undefined;
        item.bestBefore ||= lot.dlc || lot.ddm || undefined;
        item.supplierName ||= lot.supplier || undefined;
      }

      // sécurité min : exiger un nom produit au final
      if (!item.productName) {
        await session.abortTransaction();
        return res.status(400).json({ error: "productName requis" });
      }

      // Créer le doc
      const doc = new Recall({
        restaurantId,
        initiatedAt: normDate(inData.initiatedAt) ?? new Date(),
        item,
        actionsTaken: normStr(inData.actionsTaken) ?? undefined,
        attachments: normStringArray(inData.attachments),
        closedAt: normDate(inData.closedAt) ?? undefined,
        recordedBy: currentUser,
      });

      await doc.save({ session });

      // Impact inventaire si lot lié et qty > 0
      if (lot && Number.isFinite(Number(item.quantity)) && item.quantity > 0) {
        const fromUnit = item.unit || lot.unit;
        const toUnit = lot.unit;
        const conv = convertQty(Number(item.quantity), fromUnit, toUnit);
        if (conv == null) {
          await session.abortTransaction();
          return res.status(409).json({
            error: `Unité incompatible pour le lot ${lot._id}: item=${fromUnit} vs lot=${toUnit}`,
          });
        }
        const dec = roundByUnit(conv, toUnit);

        let newRemaining = (lot.qtyRemaining ?? 0) - dec;
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
          { _id: lot._id, restaurantId },
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
      const { page = 1, limit = 20, date_from, date_to, q, closed } = req.query;

      const query = { restaurantId };

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
          { "item.productName": rx },
          { "item.supplierName": rx },
          { "item.lotNumber": rx },
          { "item.unit": rx },
          { actionsTaken: rx },
          { attachments: rx },
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

/* ------------------ UPDATE (1 produit, diff par lot) ------------------ */
router.put(
  "/restaurants/:restaurantId/recalls/:recallId",
  authenticateToken,
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { restaurantId, recallId } = req.params;
      const inData = { ...req.body };

      // ne pas accepter d’override de champs protégés
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

      // normaliser l’item entrant (un seul)
      let nextItem =
        inData.item !== undefined ? normItem(inData.item) : { ...prev.item };
      if (!nextItem) nextItem = { ...prev.item }; // garde au moins l’existant

      // lots impliqués (ancien et/ou nouveau)
      const prevLotId = prev?.item?.inventoryLotId
        ? String(prev.item.inventoryLotId)
        : null;
      const nextLotId = nextItem?.inventoryLotId
        ? String(nextItem.inventoryLotId)
        : null;

      const lotIds = [...new Set([prevLotId, nextLotId].filter(Boolean))];

      // lire les lots nécessaires
      const lotsById = {};
      if (lotIds.length) {
        const lots = await InventoryLot.find({
          _id: { $in: lotIds },
          restaurantId,
        }).session(session);
        lots.forEach((l) => (lotsById[String(l._id)] = l));
      }

      // *** calcul des ajustements par lot ***
      // adj[lotId] = quantité (en unité du lot) à appliquer
      //  -> positive => décrémente qtyRemaining (retour supplémentaire)
      //  -> negative => incrémente qtyRemaining (on “rend” du stock)
      const adj = {};

      // 1) annuler l'effet "ancien item"
      if (prevLotId) {
        const lot = lotsById[prevLotId];
        if (lot) {
          const qPrev = Number(prev?.item?.quantity || 0);
          const uPrev = prev?.item?.unit || lot.unit;
          if (Number.isFinite(qPrev) && qPrev > 0) {
            const conv = convertQty(qPrev, uPrev, lot.unit);
            if (conv == null) {
              await session.abortTransaction();
              return res.status(409).json({
                error: `Unité incompatible (ancien item) pour le lot ${prevLotId}: item=${uPrev} vs lot=${lot.unit}`,
              });
            }
            const rounded = roundByUnit(conv, lot.unit);
            adj[prevLotId] = (adj[prevLotId] || 0) - rounded;
          }
        }
      }

      // 2) appliquer l'effet "nouvel item"
      if (nextLotId) {
        const lot = lotsById[nextLotId];
        if (!lot) {
          await session.abortTransaction();
          return res
            .status(404)
            .json({ error: `Lot lié introuvable (${nextLotId})` });
        }
        const qNext = Number(nextItem?.quantity || 0);
        const uNext = nextItem?.unit || lot.unit;
        if (Number.isFinite(qNext) && qNext > 0) {
          const conv = convertQty(qNext, uNext, lot.unit);
          if (conv == null) {
            await session.abortTransaction();
            return res.status(409).json({
              error: `Unité incompatible (nouvel item) pour le lot ${nextLotId}: item=${uNext} vs lot=${lot.unit}`,
            });
          }
          const rounded = roundByUnit(conv, lot.unit);
          adj[nextLotId] = (adj[nextLotId] || 0) + rounded;
        }
      }

      // 3) appliquer les ajustements de stock
      for (const id of Object.keys(adj)) {
        const lot =
          lotsById[id] ||
          (await InventoryLot.findOne({ _id: id, restaurantId }).session(
            session
          ));
        if (!lot) continue;

        let newRemaining = (lot.qtyRemaining ?? 0) - adj[id];
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

      // 4) enrichir/sauver le recall (compléter depuis le lot si besoin)
      if (nextLotId) {
        const lot = lotsById[nextLotId];
        if (lot) {
          if (!nextItem.productName)
            nextItem.productName = lot.productName || "Produit";
          if (!nextItem.unit) nextItem.unit = lot.unit || undefined;
          if (!nextItem.bestBefore)
            nextItem.bestBefore = lot.dlc || lot.ddm || undefined;
          if (!nextItem.supplierName && lot.supplier)
            nextItem.supplierName = lot.supplier;
          if (!nextItem.lotNumber)
            nextItem.lotNumber = lot.lotNumber || undefined;
        }
      }
      // garde une valeur métier minimale
      if (!nextItem.productName)
        nextItem.productName = prev?.item?.productName || "Produit";

      // patch root fields
      prev.initiatedAt =
        inData.initiatedAt !== undefined
          ? normDate(inData.initiatedAt) || prev.initiatedAt
          : prev.initiatedAt;

      prev.actionsTaken =
        inData.actionsTaken !== undefined
          ? normStr(inData.actionsTaken) || undefined
          : prev.actionsTaken;

      if (inData.attachments !== undefined) {
        prev.attachments = normStringArray(inData.attachments);
      }

      prev.closedAt =
        inData.closedAt !== undefined
          ? normDate(inData.closedAt)
          : prev.closedAt;

      // appliquer le nouvel item
      prev.item = nextItem;

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

/* ------------------ DELETE (recrédite le lot) ------------------ */
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

      const lotId = doc.item?.inventoryLotId
        ? String(doc.item.inventoryLotId)
        : null;

      if (lotId) {
        const lot = await InventoryLot.findOne({
          _id: lotId,
          restaurantId,
        }).session(session);
        if (lot) {
          const fromUnit = doc.item.unit || lot.unit;
          const toUnit = lot.unit;
          const conv = convertQty(
            Number(doc.item.quantity || 0),
            fromUnit,
            toUnit
          );
          if (conv == null) {
            await session.abortTransaction();
            return res.status(409).json({
              error: `Unité incompatible pour le lot ${lot._id}: item=${fromUnit} vs lot=${toUnit}`,
            });
          }
          const inc = roundByUnit(conv, toUnit);

          let newRemaining = (lot.qtyRemaining ?? 0) + inc;
          newRemaining = roundByUnit(newRemaining, lot.unit);
          newRemaining = clampQtyRemaining(newRemaining, lot.qtyReceived);

          const patch = { qtyRemaining: newRemaining };
          if (newRemaining > 0 && lot.status === "returned") {
            patch.status = "in_stock";
            patch.disposalReason = undefined;
          }
          await InventoryLot.updateOne(
            { _id: lot._id, restaurantId },
            { $set: patch },
            { session }
          );
        }
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
