const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const authenticateToken = require("../../middleware/authentificate-token");
const RecipeBatch = require("../../models/logs/recipe-batch.model");
const InventoryLot = require("../../models/logs/inventory-lot.model");
// NEW: on synchronise aussi la qtyRemaining sur les lignes de réception
const ReceptionDelivery = require("../../models/logs/reception-delivery.model");

/* ---------- ARRONDI (helper local au fichier) ---------- */
function decimalsForUnit(u) {
  const unit = String(u || "").trim();
  if (unit === "unit") return 0;
  return 3; // kg/g/L/mL : 3 décimales
}
function roundByUnit(val, unit) {
  const n = Number(val);
  if (!Number.isFinite(n)) return n;
  const d = decimalsForUnit(unit);
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
function clampQtyRemaining(qtyRemaining, qtyReceived, unit) {
  const rounded = roundByUnit(qtyRemaining, unit);
  const capBase =
    qtyReceived != null ? roundByUnit(qtyReceived, unit) : rounded;
  return Math.max(
    // on autorise négatif côté inventaire, donc pas de floor 0 ici
    Number.NEGATIVE_INFINITY,
    Math.min(rounded, capBase)
  );
}

/* ---------- helpers ---------- */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function currentUserFromToken(req) {
  const u = req.user || {};
  const role = (u.role || "").toLowerCase();
  if (!["owner", "employee"].includes(role) || !u.id) return null;
  return {
    userId: u.id,
    role,
    firstName: u.firstname || "",
    lastName: u.lastname || "",
  };
}
const normalizeStr = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};
function normalizeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function normalizeNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function normalizeIngredient(l = {}) {
  const name = normalizeStr(l.name);
  const lotNumber = normalizeStr(l.lotNumber);
  const qty = normalizeNumber(l.qty);
  const unit = normalizeStr(l.unit);
  const inventoryLotId =
    l.inventoryLotId && mongoose.Types.ObjectId.isValid(l.inventoryLotId)
      ? l.inventoryLotId
      : null;

  return {
    name: name ?? undefined,
    lotNumber: lotNumber ?? undefined,
    qty: qty ?? undefined,
    unit: unit ?? undefined,
    inventoryLotId: inventoryLotId ?? undefined,
  };
}
function normalizeIngredients(inLines) {
  const arr = Array.isArray(inLines) ? inLines : [];
  return arr
    .map(normalizeIngredient)
    .filter(
      (x) =>
        x.name || x.lotNumber || x.qty != null || x.unit || x.inventoryLotId
    );
}

/* ---------- conversions unités ---------- */
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

/* ---------- Sync Reception Line qtyRemaining ---------- */
async function syncReceptionLineRemaining({ restaurantId, lot, session }) {
  if (!lot?.receptionId) return;

  // 1) si on a un lineId -> update via arrayFilters
  if (lot.receptionLineId) {
    await ReceptionDelivery.updateOne(
      { _id: lot.receptionId, restaurantId },
      {
        $set: {
          "lines.$[ln].qtyRemaining": roundByUnit(lot.qtyRemaining, lot.unit),
        },
      },
      {
        arrayFilters: [{ "ln._id": lot.receptionLineId }],
        session,
      }
    );
    return;
  }

  // 2) fallback : on retrouve la ligne par (lotNumber + productName + unit)
  const doc = await ReceptionDelivery.findOne(
    { _id: lot.receptionId, restaurantId },
    null,
    { session }
  );
  if (!doc) return;

  const idx = (doc.lines || []).findIndex((ln) => {
    const sameLot = String(ln?.lotNumber || "") === String(lot.lotNumber || "");
    const sameProd =
      String(ln?.productName || "") === String(lot.productName || "");
    const sameUnit = String(ln?.unit || "") === String(lot.unit || "");
    return sameLot && sameProd && sameUnit;
  });
  if (idx === -1) return;

  const baseQty = Number.isFinite(Number(doc.lines[idx].qty))
    ? Number(doc.lines[idx].qty)
    : 0;
  const roundedRemaining = roundByUnit(lot.qtyRemaining, lot.unit);
  const boundedRemaining = Math.max(
    0,
    Math.min(roundedRemaining, roundByUnit(baseQty, lot.unit))
  );

  doc.lines[idx].qtyRemaining = boundedRemaining;
  await doc.save({ session });
}

/* ---------- moteur d'ajustement inventaire ---------- */
/**
 * direction: "consume" | "restore"
 * - consume  : décrémente qtyRemaining (autorise négatif)
 * - restore  : incrémente qtyRemaining (⚠️ plafonné à qtyReceived)
 * Retourne la liste finale des lots modifiés (objets minimaux pour mise à jour front)
 */
async function applyInventoryAdjustments(
  restaurantId,
  ingredients,
  direction,
  session
) {
  if (!Array.isArray(ingredients) || !ingredients.length) return [];

  const touchedIds = new Set();

  for (const ing of ingredients) {
    if (ing.qty == null || !ing.unit) continue;
    let lot = null;

    if (ing.inventoryLotId) {
      lot = await InventoryLot.findOne(
        { _id: ing.inventoryLotId, restaurantId },
        null,
        { session }
      );
    } else if (ing.lotNumber) {
      lot = await InventoryLot.findOne(
        { restaurantId, lotNumber: ing.lotNumber },
        null,
        { session }
      ).sort({ createdAt: -1, _id: -1 });
    }

    if (!lot) continue;

    // conversion vers l’unité du lot
    const adj = convertQty(Number(ing.qty), ing.unit, lot.unit);
    if (adj == null) {
      throw new Error(
        `Unité incompatible pour le lot ${lot._id}: ingr=${ing.unit} vs lot=${lot.unit}`
      );
    }
    const delta = direction === "consume" ? -Math.abs(adj) : Math.abs(adj);

    // 1) $inc qtyRemaining
    const afterInc = await InventoryLot.findOneAndUpdate(
      { _id: lot._id, restaurantId },
      { $inc: { qtyRemaining: delta } },
      { new: true, session }
    );
    if (!afterInc) continue;

    // 2) arrondi + cap upper-bound (pas de floor 0 ici)
    const capped = clampQtyRemaining(
      afterInc.qtyRemaining,
      afterInc.qtyReceived,
      afterInc.unit
    );
    if (capped !== afterInc.qtyRemaining) {
      afterInc.qtyRemaining = capped;
      await afterInc.save({ session });
    }

    // 3) statut
    const nextStatus = afterInc.qtyRemaining <= 0 ? "used" : "in_stock";
    if (afterInc.status !== nextStatus) {
      await InventoryLot.updateOne(
        { _id: afterInc._id, restaurantId },
        { $set: { status: nextStatus } },
        { session }
      );
      afterInc.status = nextStatus;
    }

    // 4) sync ligne de réception liée
    await syncReceptionLineRemaining({
      restaurantId,
      lot: afterInc,
      session,
    });

    touchedIds.add(String(afterInc._id));
  }

  if (!touchedIds.size) return [];

  // Retourner l'état FINAL des lots touchés
  const finalLots = await InventoryLot.find(
    { _id: { $in: [...touchedIds] }, restaurantId },
    "_id productName lotNumber unit qtyRemaining qtyReceived status receptionId receptionLineId"
  ).session(session);

  return finalLots.map((it) => ({
    _id: String(it._id),
    productName: it.productName,
    lotNumber: it.lotNumber,
    unit: it.unit,
    qtyRemaining: roundByUnit(it.qtyRemaining, it.unit),
    qtyReceived: roundByUnit(it.qtyReceived, it.unit),
    status: it.status,
    receptionId: it.receptionId || null,
    receptionLineId: it.receptionLineId || null,
  }));
}

/* ------------------ CREATE ------------------ */
router.post(
  "/restaurants/:restaurantId/recipe-batches",
  authenticateToken,
  async (req, res) => {
    const session = await mongoose.startSession();
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const recipeId = normalizeStr(inData.recipeId);
      const batchId = normalizeStr(inData.batchId);
      if (!recipeId)
        return res.status(400).json({ error: "recipeId est requis" });
      if (!batchId)
        return res.status(400).json({ error: "batchId est requis" });

      const preparedAt = normalizeDate(inData.preparedAt) || new Date();
      const usedByServiceDate = normalizeDate(inData.usedByServiceDate);
      const notes = normalizeStr(inData.notes);
      const ingredients = normalizeIngredients(inData.ingredients);

      let inventoryLotsUpdates = [];

      await session.withTransaction(async () => {
        inventoryLotsUpdates = await applyInventoryAdjustments(
          restaurantId,
          ingredients,
          "consume",
          session
        );

        const doc = new RecipeBatch({
          restaurantId,
          recipeId,
          batchId,
          preparedAt,
          usedByServiceDate,
          ingredients,
          createdBy: currentUser,
          notes: notes ?? undefined,
        });

        await doc.save({ session });

        // Réponse: batch + lots mis à jour pour rafraîchir le front
        res.status(201).json({
          ...doc.toObject(),
          inventoryLotsUpdates,
        });
      });
    } catch (err) {
      console.error("POST /recipe-batches:", err);
      res.status(409).json({
        error: err.message || "Erreur lors de la création du batch recette",
      });
    } finally {
      session.endSession();
    }
  }
);

/* ------------------ LIST ------------------ */
router.get(
  "/restaurants/:restaurantId/list-recipe-batches",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { page = 1, limit = 20, date_from, date_to, q } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

      const query = { restaurantId };

      // Filtre dates sur preparedAt
      if (date_from || date_to) {
        query.preparedAt = {};
        if (date_from) {
          const start = new Date(date_from);
          if (!Number.isNaN(start.getTime())) {
            query.preparedAt.$gte = start;
          }
        }
        if (date_to) {
          const end = new Date(date_to);
          if (!Number.isNaN(end.getTime())) {
            // Fin de journée incluse
            end.setDate(end.getDate() + 1);
            end.setMilliseconds(end.getMilliseconds() - 1);
            query.preparedAt.$lte = end;
          }
        }
        // Si au final l'objet est vide, on le retire
        if (Object.keys(query.preparedAt).length === 0) {
          delete query.preparedAt;
        }
      }

      // Recherche texte multi-champs (regex escape)
      if (q && String(q).trim().length) {
        const safe = escapeRegExp(String(q).trim());
        const rx = new RegExp(safe, "i");
        query.$or = [
          { recipeId: rx },
          { batchId: rx },
          { notes: rx },
          { "createdBy.firstName": rx },
          { "createdBy.lastName": rx },
          { "ingredients.name": rx },
          { "ingredients.lotNumber": rx },
          { "ingredients.unit": rx },
        ];
      }

      const skip = (pageNum - 1) * limitNum;

      const [items, total] = await Promise.all([
        RecipeBatch.find(query)
          .sort({ preparedAt: -1, _id: -1 })
          .skip(skip)
          .limit(limitNum),
        RecipeBatch.countDocuments(query),
      ]);

      return res.json({
        items,
        meta: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.max(1, Math.ceil(total / limitNum)),
        },
      });
    } catch (err) {
      console.error("GET /list-recipe-batches:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des batches" });
    }
  }
);

/* ------------------ READ ONE ------------------ */
router.get(
  "/restaurants/:restaurantId/recipe-batches/:batchId",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, batchId } = req.params;
      const doc = await RecipeBatch.findOne({ _id: batchId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Batch introuvable" });
      return res.json(doc);
    } catch (err) {
      console.error("GET /recipe-batches/:batchId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération du batch" });
    }
  }
);

/* ------------------ UPDATE ------------------ */
router.put(
  "/restaurants/:restaurantId/recipe-batches/:batchId",
  authenticateToken,
  async (req, res) => {
    const session = await mongoose.startSession();
    try {
      const { restaurantId, batchId } = req.params;
      const inData = { ...req.body };

      delete inData.createdBy;
      delete inData.restaurantId;

      const prev = await RecipeBatch.findOne({ _id: batchId, restaurantId });
      if (!prev) return res.status(404).json({ error: "Batch introuvable" });

      const next = {
        recipeId:
          inData.recipeId !== undefined
            ? normalizeStr(inData.recipeId)
            : prev.recipeId,
        batchId:
          inData.batchId !== undefined
            ? normalizeStr(inData.batchId)
            : prev.batchId,
        preparedAt:
          inData.preparedAt !== undefined
            ? normalizeDate(inData.preparedAt) || prev.preparedAt
            : prev.preparedAt,
        usedByServiceDate:
          inData.usedByServiceDate !== undefined
            ? normalizeDate(inData.usedByServiceDate) || null
            : prev.usedByServiceDate,
        notes:
          inData.notes !== undefined ? normalizeStr(inData.notes) : prev.notes,
        ingredients:
          inData.ingredients !== undefined
            ? normalizeIngredients(inData.ingredients)
            : prev.ingredients || [],
      };

      if (!next.recipeId)
        return res.status(400).json({ error: "recipeId est requis" });
      if (!next.batchId)
        return res.status(400).json({ error: "batchId est requis" });

      let inventoryLotsUpdates = [];

      await session.withTransaction(async () => {
        // 1) restituer l'ancien stock
        const ups1 = await applyInventoryAdjustments(
          restaurantId,
          prev.ingredients || [],
          "restore",
          session
        );
        // 2) consommer le nouveau
        const ups2 = await applyInventoryAdjustments(
          restaurantId,
          next.ingredients || [],
          "consume",
          session
        );

        // Recalcule l'état final de tous les lots touchés (union des 2)
        const touched = new Set([
          ...ups1.map((x) => x._id),
          ...ups2.map((x) => x._id),
        ]);
        if (touched.size) {
          const finals = await InventoryLot.find(
            { _id: { $in: [...touched] }, restaurantId },
            "_id productName lotNumber unit qtyRemaining qtyReceived status receptionId receptionLineId"
          ).session(session);
          inventoryLotsUpdates = finals.map((it) => ({
            _id: String(it._id),
            productName: it.productName,
            lotNumber: it.lotNumber,
            unit: it.unit,
            qtyRemaining: roundByUnit(it.qtyRemaining, it.unit),
            qtyReceived: roundByUnit(it.qtyReceived, it.unit),
            status: it.status,
            receptionId: it.receptionId || null,
            receptionLineId: it.receptionLineId || null,
          }));
        }

        // 3) sauvegarder
        Object.assign(prev, next);
        await prev.save({ session });

        res.json({
          ...prev.toObject(),
          inventoryLotsUpdates,
        });
      });
    } catch (err) {
      console.error("PUT /recipe-batches/:batchId:", err);
      res.status(409).json({
        error: err.message || "Erreur lors de la mise à jour du batch",
      });
    } finally {
      session.endSession();
    }
  }
);

/* ------------------ DELETE ------------------ */
router.delete(
  "/restaurants/:restaurantId/recipe-batches/:batchId",
  authenticateToken,
  async (req, res) => {
    const session = await mongoose.startSession();
    try {
      const { restaurantId, batchId } = req.params;
      const doc = await RecipeBatch.findOne({ _id: batchId, restaurantId });
      if (!doc) return res.status(404).json({ error: "Batch introuvable" });

      let inventoryLotsUpdates = [];

      await session.withTransaction(async () => {
        const ups = await applyInventoryAdjustments(
          restaurantId,
          doc.ingredients || [],
          "restore",
          session
        );

        // État final des lots restaurés
        const touched = new Set(ups.map((x) => x._id));
        if (touched.size) {
          const finals = await InventoryLot.find(
            { _id: { $in: [...touched] }, restaurantId },
            "_id productName lotNumber unit qtyRemaining qtyReceived status receptionId receptionLineId"
          ).session(session);
          inventoryLotsUpdates = finals.map((it) => ({
            _id: String(it._id),
            productName: it.productName,
            lotNumber: it.lotNumber,
            unit: it.unit,
            qtyRemaining: roundByUnit(it.qtyRemaining, it.unit),
            qtyReceived: roundByUnit(it.qtyReceived, it.unit),
            status: it.status,
            receptionId: it.receptionId || null,
            receptionLineId: it.receptionLineId || null,
          }));
        }

        await RecipeBatch.deleteOne(
          { _id: batchId, restaurantId },
          { session }
        );

        res.json({ success: true, inventoryLotsUpdates });
      });
    } catch (err) {
      console.error("DELETE /recipe-batches/:batchId:", err);
      res.status(500).json({
        error: err.message || "Erreur lors de la suppression du batch",
      });
    } finally {
      session.endSession();
    }
  }
);

/* -------------------- SELECT LOTS -------------------- */
/**
 * On renvoie aussi les lots à 0 et négatifs.
 * ➜ On arrondit qtyRemaining ici pour éviter les artefacts d’affichage.
 */
router.get(
  "/restaurants/:restaurantId/inventory-lots-select",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { limit = 300, q } = req.query;

      const query = { restaurantId };
      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [{ productName: rx }, { lotNumber: rx }];
      }

      const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 500);

      const rows = await InventoryLot.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(safeLimit)
        .select(
          "_id productName lotNumber qtyRemaining unit dlc ddm createdAt status supplier"
        );

      const items = rows.map((it) => {
        const obj = it.toObject();
        obj.qtyRemaining = roundByUnit(obj.qtyRemaining, obj.unit);
        return obj;
      });

      return res.json({ items });
    } catch (err) {
      console.error("GET /inventory-lots/select:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des lots" });
    }
  }
);

module.exports = router;
