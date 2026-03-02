// routes/customers.routes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const CustomerModel = require("../models/customer.model");
const ReservationModel = require("../models/reservation.model");

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */

// ✅ normalize search input (lowercase + trim + remove accents)
function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function isValidObjectId(mongooseLib, id) {
  return mongooseLib.Types.ObjectId.isValid(String(id));
}

// ✅ avoid regex injection + improve perf predictability
function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Filtre purchasesGiftCards (embed) sur un customerId + pagination.
 * (Pour le moment on fait ça en mémoire. Plus tard, collection dédiée si besoin.)
 */
function pickGiftPurchasesForCustomer(restaurantDoc, customerId, page, limit) {
  const list = Array.isArray(restaurantDoc?.purchasesGiftCards)
    ? restaurantDoc.purchasesGiftCards
    : [];

  const filtered = list
    .filter((p) => String(p?.customer || "") === String(customerId))
    .sort(
      (a, b) =>
        new Date(b?.created_at).getTime() - new Date(a?.created_at).getTime(),
    );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const start = (safePage - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return { items, page: safePage, totalPages, total };
}

/* ---------------------------------------------------------
   GET LIST CUSTOMERS
   /restaurants/:id/customers?query=&tag=&source=&page=&limit=
   source: all | reservations | gift_cards
--------------------------------------------------------- */
router.get(
  "/restaurants/:id/customers",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;

    // ✅ recommended: avoid CastError => return 400
    if (!isValidObjectId(mongoose, restaurantId)) {
      return res.status(400).json({ message: "Invalid restaurant id" });
    }

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .select("_id options")
        .lean();

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const qRaw = String(req.query.query || "");
      const q = normalize(qRaw);
      const tag = String(req.query.tag || "all");
      const source = String(req.query.source || "all"); // all | reservations | gift_cards

      const page = Math.max(1, toInt(req.query.page, 1));
      const limit = Math.min(50, Math.max(5, toInt(req.query.limit, 12)));

      const filter = { restaurant_id: restaurantId };

      // tag filter
      if (tag && tag !== "all") {
        filter.tags = tag;
      }

      // source filter basé sur stats
      if (source === "reservations") {
        filter["stats.reservationsTotal"] = { $gt: 0 };
      } else if (source === "gift_cards") {
        filter["stats.giftCardsBought"] = { $gt: 0 };
      }

      // search filter (safer + more index-friendly on emailNorm/phoneNorm)
      if (q) {
        const qNoSpaces = q.replace(/\s+/g, "");
        const qEsc = escapeRegex(q);
        const qNoSpacesEsc = escapeRegex(qNoSpaces);

        // ✅ PERF NOTE:
        // - On emailNorm/phoneNorm we use prefix regex ^... to be more index-friendly
        // - On firstName/lastName we keep "contains" to preserve UX (can be heavier)
        filter.$or = [
          { emailNorm: { $regex: `^${qEsc}`, $options: "i" } },
          { phoneNorm: { $regex: `^${qNoSpacesEsc}`, $options: "i" } },
          { firstName: { $regex: qEsc, $options: "i" } },
          { lastName: { $regex: qEsc, $options: "i" } },
        ];
      }

      const total = await CustomerModel.countDocuments(filter);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);
      const skip = (safePage - 1) * limit;

      const customers = await CustomerModel.find(filter)
        .sort({ lastActivityAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "firstName lastName email phone tags notes stats lastReservationAt lastGiftCardAt lastActivityAt createdAt updatedAt",
        )
        .lean();

      return res.status(200).json({
        customers,
        pagination: {
          page: safePage,
          limit,
          total,
          totalPages,
        },
      });
    } catch (error) {
      console.error("Error fetching customers list:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   GET CUSTOMER DETAILS (+ history)
   /restaurants/:id/customers/:customerId
   Query:
     tab=reservations|gift_cards (optional)
     resaPage, resaLimit
     giftPage, giftLimit
--------------------------------------------------------- */
router.get(
  "/restaurants/:id/customers/:customerId",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;
    const customerId = req.params.customerId;

    // ✅ recommended: avoid CastError => return 400
    if (!isValidObjectId(mongoose, restaurantId)) {
      return res.status(400).json({ message: "Invalid restaurant id" });
    }
    if (!isValidObjectId(mongoose, customerId)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    try {
      const restaurant = await RestaurantModel.findById(restaurantId)
        .select("_id purchasesGiftCards options")
        .lean();

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const customer = await CustomerModel.findOne({
        _id: customerId,
        restaurant_id: restaurantId,
      }).lean();

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const resaPage = Math.max(1, toInt(req.query.resaPage, 1));
      const resaLimit = Math.min(
        50,
        Math.max(5, toInt(req.query.resaLimit, 20)),
      );

      const giftPage = Math.max(1, toInt(req.query.giftPage, 1));
      const giftLimit = Math.min(
        50,
        Math.max(5, toInt(req.query.giftLimit, 20)),
      );

      // ✅ Reservations history (collection)
      const resaFilter = {
        restaurant_id: restaurantId,
        customer: customerId,
      };

      const resaTotal = await ReservationModel.countDocuments(resaFilter);
      const resaTotalPages = Math.max(1, Math.ceil(resaTotal / resaLimit));
      const resaSafePage = Math.min(resaPage, resaTotalPages);

      const reservations = await ReservationModel.find(resaFilter)
        .sort({ reservationDate: -1, reservationTime: -1 })
        .skip((resaSafePage - 1) * resaLimit)
        .limit(resaLimit)
        .select(
          "reservationDate reservationTime numberOfGuests status createdAt updatedAt table",
        )
        .lean();

      // ✅ Gift purchases history (embed)
      const gift = pickGiftPurchasesForCustomer(
        restaurant,
        customerId,
        giftPage,
        giftLimit,
      );

      return res.status(200).json({
        customer,
        history: {
          reservations: {
            items: reservations,
            pagination: {
              page: resaSafePage,
              limit: resaLimit,
              total: resaTotal,
              totalPages: resaTotalPages,
            },
          },
          giftCards: {
            items: gift.items,
            pagination: {
              page: gift.page,
              limit: giftLimit,
              total: gift.total,
              totalPages: gift.totalPages,
            },
          },
        },
      });
    } catch (error) {
      console.error("Error fetching customer details:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   UPDATE CUSTOMER (identity/tags/notes)
   /restaurants/:id/customers/:customerId
   body: { firstName, lastName, email, phone, tags, notes }
--------------------------------------------------------- */
router.put(
  "/restaurants/:id/customers/:customerId",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;
    const customerId = req.params.customerId;

    // ✅ recommended: avoid CastError => return 400
    if (!isValidObjectId(mongoose, restaurantId)) {
      return res.status(400).json({ message: "Invalid restaurant id" });
    }
    if (!isValidObjectId(mongoose, customerId)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const { firstName, lastName, email, phone, tags, notes } = req.body || {};

    try {
      const customer = await CustomerModel.findOne({
        _id: customerId,
        restaurant_id: restaurantId,
      });

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // update champs (sans forcer)
      if (typeof firstName === "string") customer.firstName = firstName;
      if (typeof lastName === "string") customer.lastName = lastName;
      if (typeof email === "string") customer.email = email;
      if (typeof phone === "string") customer.phone = phone;

      if (Array.isArray(tags)) {
        // sécurité: uniquement strings uniques
        customer.tags = Array.from(
          new Set(tags.map((x) => String(x || "").trim()).filter(Boolean)),
        );
      }

      if (typeof notes === "string") customer.notes = notes;

      // pre-save recalc emailNorm/phoneNorm + index unique
      await customer.save();

      return res.status(200).json({ customer: customer.toObject() });
    } catch (error) {
      // cas typique: unique index conflict (emailNorm/phoneNorm déjà utilisé)
      if (String(error?.code) === "11000") {
        return res.status(409).json({
          message:
            "Email ou téléphone déjà utilisé par un autre client. Vérifie la fiche existante.",
        });
      }

      console.error("Error updating customer:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/* ---------------------------------------------------------
   DELETE CUSTOMER
   /restaurants/:id/customers/:customerId

   ⚠️ On “délie” les refs (reservations + purchasesGiftCards),
      puis on supprime le doc Customer.
--------------------------------------------------------- */
router.delete(
  "/restaurants/:id/customers/:customerId",
  authenticateToken,
  async (req, res) => {
    const restaurantId = req.params.id;
    const customerId = req.params.customerId;

    if (!isValidObjectId(mongoose, restaurantId)) {
      return res.status(400).json({ message: "Invalid restaurant id" });
    }
    if (!isValidObjectId(mongoose, customerId)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    try {
      const customer = await CustomerModel.findOne({
        _id: customerId,
        restaurant_id: restaurantId,
      }).lean();

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // 1) délier reservations (évite orphelins)
      await ReservationModel.updateMany(
        { restaurant_id: restaurantId, customer: customerId },
        { $set: { customer: null } },
      );

      // 2) délier purchasesGiftCards embed
      await RestaurantModel.updateOne(
        { _id: restaurantId },
        { $set: { "purchasesGiftCards.$[p].customer": null } },
        {
          arrayFilters: [{ "p.customer": customerId }],
        },
      );

      // 3) supprimer la fiche
      await CustomerModel.deleteOne({ _id: customerId });

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("Error deleting customer:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

module.exports = router;
