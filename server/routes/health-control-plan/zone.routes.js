const express = require("express");
const router = express.Router();

// MIDDLEWARE
const authenticateToken = require("../../middleware/authentificate-token");

// MODEL
const Zone = require("../../models/logs/zone.model");

// Utils
function normalizeStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/**
 * GET /restaurants/:restaurantId/zones
 * Query:
 *  - active=1|true (optionnel, filtre sur isActive)
 *  - q=...        (optionnel, recherche nom/zoneCode/unit)
 */
router.get(
  "/restaurants/:restaurantId/zones",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { q, active } = req.query;

      const query = { restaurantId };
      if (active === "1" || active === "true") query.isActive = true;

      if (q && String(q).trim()) {
        const rx = new RegExp(String(q).trim(), "i");
        query.$or = [{ name: rx }, { zoneCode: rx }, { unit: rx }];
      }

      const items = await Zone.find(query).sort({ isActive: -1, name: 1 });
      res.json({ items });
    } catch (err) {
      console.error("GET /zones:", err);
      res.status(500).json({ error: "Erreur lors du chargement des zones" });
    }
  }
);

/**
 * POST /restaurants/:restaurantId/zones
 * body: { name, zoneCode?, unit("°C"|"°F")?, isActive? }
 */
router.post(
  "/restaurants/:restaurantId/zones",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { name, zoneCode, unit, isActive } = req.body;

      const cleanName = normalizeStr(name);
      if (!cleanName) {
        return res.status(400).json({ error: "name est requis" });
      }

      const doc = new Zone({
        restaurantId,
        name: cleanName,
        zoneCode: normalizeStr(zoneCode),
        unit: unit === "°F" ? "°F" : "°C",
        isActive: !!isActive,
      });

      await doc.save();
      res.status(201).json(doc);
    } catch (err) {
      if (err?.code === 11000) {
        // index unique { restaurantId, nameLower }
        return res
          .status(409)
          .json({ error: "Une zone avec ce nom existe déjà." });
      }
      console.error("POST /zones:", err);
      res.status(500).json({ error: "Erreur lors de la création de la zone" });
    }
  }
);

/**
 * PUT /restaurants/:restaurantId/zones/:id
 * body: { name?, zoneCode?, unit?, isActive? }
 */
router.put(
  "/restaurants/:restaurantId/zones/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const z = await Zone.findOne({ _id: id, restaurantId });
      if (!z) return res.status(404).json({ error: "Zone introuvable" });

      const { name, zoneCode, unit, isActive } = req.body;

      if (name !== undefined) z.name = normalizeStr(name) || "";
      if (zoneCode !== undefined) z.zoneCode = normalizeStr(zoneCode);
      if (unit !== undefined) z.unit = unit === "°F" ? "°F" : "°C";
      if (isActive !== undefined) z.isActive = !!isActive;

      await z.save();
      res.json(z);
    } catch (err) {
      if (err?.code === 11000) {
        return res
          .status(409)
          .json({ error: "Une zone avec ce nom existe déjà." });
      }
      console.error("PUT /zones/:id:", err);
      res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la zone" });
    }
  }
);

/**
 * DELETE /restaurants/:restaurantId/zones/:id
 */
router.delete(
  "/restaurants/:restaurantId/zones/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId, id } = req.params;
      const doc = await Zone.findOneAndDelete({ _id: id, restaurantId });
      if (!doc) return res.status(404).json({ error: "Zone introuvable" });
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /zones/:id:", err);
      res
        .status(500)
        .json({ error: "Erreur lors de la suppression de la zone" });
    }
  }
);

module.exports = router;
