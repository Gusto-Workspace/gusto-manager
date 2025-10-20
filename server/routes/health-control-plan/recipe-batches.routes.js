const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const authenticateToken = require("../../middleware/authentificate-token");
const RecipeBatch = require("../../models/logs/recipe-batch.model");
const InventoryLot = require("../../models/logs/inventory-lot.model");

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

/* ---------- helpers ---------- */
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

/* ---------- moteur d'ajustement inventaire ---------- */
/**
 * direction: "consume" | "restore"
 * - consume  : décrémente qtyRemaining (autorise négatif)
 * - restore  : incrémente qtyRemaining (⚠️ plafonné au qtyReceived)
 * Arrondi: toujours arrondir qtyRemaining à l’unité du lot après $inc
 * Statut:
 *  - qtyRemaining <= 0  -> used
 *  - qtyRemaining  > 0  -> in_stock
 */
async function applyInventoryAdjustments(
  restaurantId,
  ingredients,
  direction,
  session
) {
  if (!Array.isArray(ingredients) || !ingredients.length) return;

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

    // 1) $inc
    const updated = await InventoryLot.findOneAndUpdate(
      { _id: lot._id, restaurantId },
      { $inc: { qtyRemaining: delta } },
      { new: true, session }
    );
    if (!updated) continue;

    // 2) Arrondi + plafonnement upper-bound (pas de floor à 0 ici: négatif autorisé)
    const rounded = roundByUnit(updated.qtyRemaining, updated.unit);
    const capped =
      updated.qtyReceived != null
        ? Math.min(rounded, Number(updated.qtyReceived))
        : rounded;

    if (capped !== updated.qtyRemaining) {
      updated.qtyRemaining = capped;
      await updated.save({ session });
    }

    // 3) statut
    const nextStatus = updated.qtyRemaining <= 0 ? "used" : "in_stock";
    if (updated.status !== nextStatus) {
      await InventoryLot.updateOne(
        { _id: updated._id, restaurantId },
        { $set: { status: nextStatus } },
        { session }
      );
    }
  }
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

      await session.withTransaction(async () => {
        await applyInventoryAdjustments(
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
        res.status(201).json(doc);
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

      const query = { restaurantId };

      if (date_from || date_to) {
        query.preparedAt = {};
        if (date_from) query.preparedAt.$gte = new Date(date_from);
        if (date_to) {
          const end = new Date(date_to);
          end.setDate(end.getDate() + 1);
          end.setMilliseconds(end.getMilliseconds() - 1);
          query.preparedAt.$lte = end;
        }
      }

      if (q && String(q).trim().length) {
        const rx = new RegExp(String(q).trim(), "i");
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

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        RecipeBatch.find(query)
          .sort({ preparedAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        RecipeBatch.countDocuments(query),
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

      await session.withTransaction(async () => {
        // 1) restituer l'ancien stock
        await applyInventoryAdjustments(
          restaurantId,
          prev.ingredients || [],
          "restore",
          session
        );
        // 2) consommer le nouveau
        await applyInventoryAdjustments(
          restaurantId,
          next.ingredients || [],
          "consume",
          session
        );
        // 3) sauvegarder
        Object.assign(prev, next);
        await prev.save({ session });
        res.json(prev);
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

      await session.withTransaction(async () => {
        await applyInventoryAdjustments(
          restaurantId,
          doc.ingredients || [],
          "restore",
          session
        );
        await RecipeBatch.deleteOne(
          { _id: batchId, restaurantId },
          { session }
        );
        res.json({ success: true });
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

      // sortie propre: qtyRemaining arrondi à l’unité du lot
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
