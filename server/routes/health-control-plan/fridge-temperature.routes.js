const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const Fridge = require("../../models/logs/fridge.model");
const FridgeTemperature = require("../../models/logs/fridge-temperature.model");

/* ---------- helpers ---------- */
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
function normalizeStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function normalizeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function normalizeDoor(v) {
  const s = String(v || "").toLowerCase();
  if (s === "open" || s === "closed") return s;
  // compat: si pas fourni, on force "closed"
  return "closed";
}
async function loadFridgeSnapshot(restaurantId, fridgeRef) {
  const f = await Fridge.findOne({ _id: fridgeRef, restaurantId });
  if (!f) return null;
  return {
    name: f.name,
    fridgeCode: f.fridgeCode || null,
    location: f.location || null,
    locationCode: f.locationCode || null,
    sensorIdentifier: f.sensorIdentifier || null,
    unit: f.unit || "°C",
  };
}

/* ============================================================
   A) CRUD ENCEINTES (modale "Liste des enceintes")
   ============================================================ */

router.use(authenticateToken);

/** LIST
 * GET /restaurants/:restaurantId/fridges?active=1&q=...
 */
router.get("/restaurants/:restaurantId/fridges", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { q, active } = req.query;
    const query = { restaurantId };
    if (active === "1" || active === "true") query.isActive = true;
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), "i");
      query.$or = [
        { name: rx },
        { fridgeCode: rx },
        { location: rx },
        { locationCode: rx },
        { sensorIdentifier: rx },
      ];
    }
    const items = await Fridge.find(query).sort({ isActive: -1, name: 1 });
    res.json({ items });
  } catch (err) {
    console.error("GET /fridges:", err);
    res.status(500).json({ error: "Erreur lors du chargement des enceintes" });
  }
});

/** CREATE
 * POST /restaurants/:restaurantId/fridges
 */
router.post("/restaurants/:restaurantId/fridges", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const {
      name,
      fridgeCode,
      location,
      locationCode,
      sensorIdentifier,
      unit,
      isActive,
    } = req.body;

    if (!name || !String(name).trim())
      return res.status(400).json({ error: "name est requis" });

    const doc = new Fridge({
      restaurantId,
      name: String(name).trim(),
      fridgeCode: normalizeStr(fridgeCode),
      location: normalizeStr(location),
      locationCode: normalizeStr(locationCode),
      sensorIdentifier: normalizeStr(sensorIdentifier),
      unit: unit === "°F" ? "°F" : "°C",
      isActive: !!isActive,
    });

    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ error: "Une enceinte avec ce nom existe déjà." });
    }
    console.error("POST /fridges:", err);
    res.status(500).json({ error: "Erreur lors de la création de l’enceinte" });
  }
});

/** UPDATE
 * PUT /restaurants/:restaurantId/fridges/:id
 */
router.put("/restaurants/:restaurantId/fridges/:id", async (req, res) => {
  try {
    const { restaurantId, id } = req.params;
    const f = await Fridge.findOne({ _id: id, restaurantId });
    if (!f) return res.status(404).json({ error: "Enceinte introuvable" });

    const {
      name,
      fridgeCode,
      location,
      locationCode,
      sensorIdentifier,
      unit,
      isActive,
    } = req.body;

    if (name !== undefined) f.name = String(name || "").trim();
    if (fridgeCode !== undefined) f.fridgeCode = normalizeStr(fridgeCode);
    if (location !== undefined) f.location = normalizeStr(location);
    if (locationCode !== undefined) f.locationCode = normalizeStr(locationCode);
    if (sensorIdentifier !== undefined)
      f.sensorIdentifier = normalizeStr(sensorIdentifier);
    if (unit !== undefined) f.unit = unit === "°F" ? "°F" : "°C";
    if (isActive !== undefined) f.isActive = !!isActive;

    await f.save();
    res.json(f);
  } catch (err) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ error: "Une enceinte avec ce nom existe déjà." });
    }
    console.error("PUT /fridges/:id:", err);
    res
      .status(500)
      .json({ error: "Erreur lors de la mise à jour de l’enceinte" });
  }
});

/** DELETE
 * DELETE /restaurants/:restaurantId/fridges/:id
 */
router.delete("/restaurants/:restaurantId/fridges/:id", async (req, res) => {
  try {
    const { restaurantId, id } = req.params;
    const doc = await Fridge.findOneAndDelete({ _id: id, restaurantId });
    if (!doc) return res.status(404).json({ error: "Enceinte introuvable" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /fridges/:id:", err);
    res
      .status(500)
      .json({ error: "Erreur lors de la suppression de l’enceinte" });
  }
});

/* ============================================================
   B) CRUD RELEVÉS T°
   ============================================================ */

/** CREATE
 * body: { fridgeRef, value, doorState, note, createdAt }
 */
router.post(
  "/restaurants/:restaurantId/fridge-temperatures",
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const inData = { ...req.body };

      const fridgeRef = inData.fridgeRef;
      if (!fridgeRef)
        return res.status(400).json({ error: "fridgeRef est requis" });

      if (inData.value === undefined || inData.value === null) {
        return res.status(400).json({ error: "value est requise" });
      }
      const numVal = Number(inData.value);
      if (Number.isNaN(numVal))
        return res.status(400).json({ error: "value doit être un nombre" });

      const currentUser = currentUserFromToken(req);
      if (!currentUser)
        return res.status(400).json({ error: "Utilisateur non reconnu" });

      const snapshot = await loadFridgeSnapshot(restaurantId, fridgeRef);
      if (!snapshot)
        return res.status(404).json({ error: "Enceinte inconnue" });

      const doc = new FridgeTemperature({
        restaurantId,
        fridgeRef,
        fridge: snapshot,
        value: numVal,
        unit: snapshot.unit || "°C",
        doorState: normalizeDoor(inData.doorState),
        recordedBy: currentUser,
        note: normalizeStr(inData.note),
        createdAt: normalizeDate(inData.createdAt) || new Date(),
      });

      await doc.save();
      return res.status(201).json(doc.toJSON());
    } catch (err) {
      console.error("POST /fridge-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création du relevé" });
    }
  }
);

/** LIST (pagination + filtres)
 * GET /restaurants/:restaurantId/fridge-temperatures?date_from=&date_to=&q=&fridgeRef=
 */
router.get(
  "/restaurants/:restaurantId/fridge-temperatures",
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const {
        page = 1,
        limit = 200, // un peu élevé pour les vues “mois”
        date_from,
        date_to,
        q,
        doorState,
        fridgeRef,
      } = req.query;

      const query = { restaurantId };

      if (date_from || date_to) {
        query.createdAt = {};
        if (date_from) query.createdAt.$gte = new Date(date_from);
        if (date_to) {
          const end = new Date(date_to);
          end.setDate(end.getDate() + 1);
          end.setMilliseconds(end.getMilliseconds() - 1);
          query.createdAt.$lte = end;
        }
      }
      if (doorState) query.doorState = doorState;
      if (fridgeRef) query.fridgeRef = fridgeRef;

      if (q && String(q).trim()) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [
          { "fridge.name": rx },
          { "fridge.fridgeCode": rx },
          { "fridge.location": rx },
          { "fridge.locationCode": rx },
          { "fridge.sensorIdentifier": rx },
          { note: rx },
          { "recordedBy.firstName": rx },
          { "recordedBy.lastName": rx },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [items, total] = await Promise.all([
        FridgeTemperature.find(query)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(Number(limit)),
        FridgeTemperature.countDocuments(query),
      ]);

      return res.json({
        items: items.map((d) => d.toJSON()),
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.max(1, Math.ceil(total / Number(limit))),
        },
      });
    } catch (err) {
      console.error("GET /fridge-temperatures:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération des relevés" });
    }
  }
);

/** READ ONE */
router.get(
  "/restaurants/:restaurantId/fridge-temperatures/:tempId",
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await FridgeTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json(doc.toJSON());
    } catch (err) {
      console.error("GET /fridge-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la récupération du relevé" });
    }
  }
);

/** UPDATE (cellule en ligne) */
router.put(
  "/restaurants/:restaurantId/fridge-temperatures/:tempId",
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const inData = { ...req.body };

      delete inData.recordedBy;

      const prev = await FridgeTemperature.findOne({
        _id: tempId,
        restaurantId,
      });
      if (!prev) return res.status(404).json({ error: "Relevé introuvable" });

      // Autoriser maj de valeur/porte/note/date; optionnellement changer d’enceinte
      if (inData.fridgeRef) {
        const snapshot = await loadFridgeSnapshot(
          restaurantId,
          inData.fridgeRef
        );
        if (!snapshot)
          return res.status(404).json({ error: "Enceinte inconnue" });
        prev.fridgeRef = inData.fridgeRef;
        prev.fridge = snapshot;
        prev.unit = snapshot.unit || "°C";
      }

      if (inData.value !== undefined) {
        const numVal = Number(inData.value);
        if (Number.isNaN(numVal))
          return res.status(400).json({ error: "value doit être un nombre" });
        prev.value = numVal;
      }
      if (inData.doorState !== undefined)
        prev.doorState = normalizeDoor(inData.doorState);
      if (inData.note !== undefined) prev.note = normalizeStr(inData.note);
      if (inData.createdAt !== undefined) {
        prev.createdAt = normalizeDate(inData.createdAt) || prev.createdAt;
      }

      await prev.save();
      return res.json(prev.toJSON());
    } catch (err) {
      console.error("PUT /fridge-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du relevé" });
    }
  }
);

/** DELETE */
router.delete(
  "/restaurants/:restaurantId/fridge-temperatures/:tempId",
  async (req, res) => {
    try {
      const { restaurantId, tempId } = req.params;
      const doc = await FridgeTemperature.findOneAndDelete({
        _id: tempId,
        restaurantId,
      });
      if (!doc) return res.status(404).json({ error: "Relevé introuvable" });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /fridge-temperatures/:tempId:", err);
      return res
        .status(500)
        .json({ error: "Erreur lors de la suppression du relevé" });
    }
  }
);

module.exports = router;
