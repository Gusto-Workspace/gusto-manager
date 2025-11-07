// server/routes/health-control-plan/cooking-equipments.routes.js
const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");
const CookingEquipment = require("../../models/logs/cooking-equipment.model");

function normalizeStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

router.use(authenticateToken);

/** LIST
 * GET /restaurants/:restaurantId/cooking-equipments?active=1&q=...
 */
router.get("/restaurants/:restaurantId/cooking-equipments", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { q, active } = req.query;
    const query = { restaurantId };
    if (active === "1" || active === "true") query.isActive = true;
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), "i");
      query.$or = [
        { name: rx },
        { equipmentCode: rx },
        { location: rx },
        { locationCode: rx },
      ];
    }
    const items = await CookingEquipment.find(query).sort({ isActive: -1, name: 1 });
    res.json({ items });
  } catch (err) {
    console.error("GET /cooking-equipments:", err);
    res.status(500).json({ error: "Erreur lors du chargement des appareils" });
  }
});

/** CREATE */
router.post("/restaurants/:restaurantId/cooking-equipments", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { name, equipmentCode, location, locationCode, unit, isActive } = req.body;

    if (!name || !String(name).trim())
      return res.status(400).json({ error: "name est requis" });

    const doc = new CookingEquipment({
      restaurantId,
      name: String(name).trim(),
      equipmentCode: normalizeStr(equipmentCode),
      location: normalizeStr(location),
      locationCode: normalizeStr(locationCode),
      unit: unit === "°F" ? "°F" : "°C",
      isActive: !!isActive,
    });

    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Un appareil avec ce nom existe déjà." });
    }
    console.error("POST /cooking-equipments:", err);
    res.status(500).json({ error: "Erreur lors de la création de l’appareil" });
  }
});

/** UPDATE */
router.put("/restaurants/:restaurantId/cooking-equipments/:id", async (req, res) => {
  try {
    const { restaurantId, id } = req.params;
    const f = await CookingEquipment.findOne({ _id: id, restaurantId });
    if (!f) return res.status(404).json({ error: "Appareil introuvable" });

    const { name, equipmentCode, location, locationCode, unit, isActive } = req.body;

    if (name !== undefined) f.name = String(name || "").trim();
    if (equipmentCode !== undefined) f.equipmentCode = normalizeStr(equipmentCode);
    if (location !== undefined) f.location = normalizeStr(location);
    if (locationCode !== undefined) f.locationCode = normalizeStr(locationCode);
    if (unit !== undefined) f.unit = unit === "°F" ? "°F" : "°C";
    if (isActive !== undefined) f.isActive = !!isActive;

    await f.save();
    res.json(f);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Un appareil avec ce nom existe déjà." });
    }
    console.error("PUT /cooking-equipments/:id:", err);
    res.status(500).json({ error: "Erreur lors de la mise à jour de l’appareil" });
  }
});

/** DELETE */
router.delete("/restaurants/:restaurantId/cooking-equipments/:id", async (req, res) => {
  try {
    const { restaurantId, id } = req.params;
    const doc = await CookingEquipment.findOneAndDelete({ _id: id, restaurantId });
    if (!doc) return res.status(404).json({ error: "Appareil introuvable" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /cooking-equipments/:id:", err);
    res.status(500).json({ error: "Erreur lors de la suppression de l’appareil" });
  }
});

module.exports = router;
