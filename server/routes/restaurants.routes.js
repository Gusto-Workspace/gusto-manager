const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const VisitCounterModel = require("../models/visit-counter.model");
const EmployeeModel = require("../models/employee.model");

// Ajoute le restaurant dans employee.restaurants s'il n'y est pas déjà
function ensureEmployeeRestaurantLink(employee, restaurantId) {
  const idStr = String(restaurantId);
  if (!Array.isArray(employee.restaurants)) {
    employee.restaurants = [];
  }
  const alreadyLinked = employee.restaurants.some(
    (rId) => String(rId) === idStr
  );
  if (!alreadyLinked) {
    employee.restaurants.push(restaurantId);
  }
}

// Crée un profil "snapshot" pour ce restaurant si inexistant
function getOrCreateRestaurantProfile(employee, restaurantId) {
  const idStr = String(restaurantId);

  if (!Array.isArray(employee.restaurantProfiles)) {
    employee.restaurantProfiles = [];
  }

  let profile = employee.restaurantProfiles.find(
    (p) => String(p.restaurant) === idStr
  );

  if (!profile) {
    profile = {
      restaurant: restaurantId,
      options: {},
      documents: [],
      shifts: [],
      leaveRequests: [],
      snapshot: {
        firstname: employee.firstname || "",
        lastname: employee.lastname || "",
        email: employee.email || "",
        phone: employee.phone || "",
        secuNumber: employee.secuNumber || "",
        address: employee.address || "",
        emergencyContact: employee.emergencyContact || "",
        post: employee.post || "",
        dateOnPost: employee.dateOnPost || null,
      },
    };

    employee.restaurantProfiles.push(profile);
  }

  return profile;
}

// Fonction pour mettre à jour le statut des cartes cadeaux expirées
async function updateExpiredStatus(restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId);

  if (!restaurant) {
    console.error("Restaurant not found with ID:", restaurantId);
    return;
  }

  const now = new Date();

  restaurant.purchasesGiftCards.forEach((purchase) => {
    if (purchase.status === "Valid" && purchase.validUntil < now) {
      purchase.status = "Expired";
    }
  });

  await restaurant.save();
}

// Trouve le profil de restaurant pour cet employé
function findRestaurantProfile(employee, restaurantId) {
  if (!Array.isArray(employee.restaurantProfiles)) return null;
  const target = String(restaurantId);
  return employee.restaurantProfiles.find(
    (p) => String(p.restaurant) === target
  );
}

// GET ALL OWNER RESTAURANTS
router.get("/owner/restaurants", authenticateToken, async (req, res) => {
  const ownerId = req.query.ownerId;

  try {
    const restaurants = await RestaurantModel.find(
      { owner_id: ownerId },
      "name _id"
    );

    res.status(200).json({ restaurants });
  } catch (error) {
    console.error("Erreur lors de la récupération des restaurants:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// CHANGE RESTAURANT SELECTED
router.post("/owner/change-restaurant", authenticateToken, (req, res) => {
  const { restaurantId } = req.body;

  const decodedToken = req.user;

  const updatedToken = jwt.sign({ ...decodedToken, restaurantId }, JWT_SECRET);

  res.status(200).json({ token: updatedToken });
});

// CHANGE RESTAURANT SELECTED POUR EMPLOYÉ
router.post(
  "/employees/change-restaurant",
  authenticateToken,
  async (req, res) => {
    try {
      if (req.user.role !== "employee") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { restaurantId } = req.body;
      if (!restaurantId) {
        return res.status(400).json({ message: "restaurantId is required" });
      }

      const emp = await EmployeeModel.findById(req.user.id);
      if (!emp) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Sécurité : l'employé doit vraiment être rattaché à ce resto
      const worksHere = (emp.restaurants || []).some(
        (id) => String(id) === String(restaurantId)
      );
      if (!worksHere) {
        return res.status(403).json({
          message: "Employee is not linked to this restaurant",
        });
      }

      const profile = findRestaurantProfile(emp, restaurantId);

      // On repart du token courant, mais SANS exp / iat
      const decodedToken = req.user;
      const { exp, iat, ...rest } = decodedToken; // on enlève ces champs

      const payload = {
        ...rest,
        restaurantId,
        options: profile?.options || {},
      };

      // 🔴 IMPORTANT : pas d'option expiresIn ici
      const updatedToken = jwt.sign(payload, JWT_SECRET);

      return res.status(200).json({ token: updatedToken });
    } catch (e) {
      console.error("Error in /employees/change-restaurant:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET RESTAURANT DETAILS FROM PANEL
router.get("/owner/restaurants/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Met à jour les statuts des cartes expirées avant de récupérer les données
    await updateExpiredStatus(id);

    const restaurant = await RestaurantModel.findById(id)
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate({
        path: "reservations.list",
        populate: { path: "table" },
      })
      .populate("employees");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({ restaurant });
  } catch (error) {
    console.error("Erreur lors de la récupération du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// GET RESTAURANT DETAILS FROM SITE
router.get("/restaurants/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await RestaurantModel.findById(id)
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate({
        path: "reservations.list",
        populate: { path: "table" },
      });

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const restaurantData = {
      ...restaurant.toObject(),
      menus: restaurant.menus.map((menu) => ({
        _id: menu._id,
        name: menu.name,
        description: menu.description,
        price: menu.price,
        type: menu.type,
        visible: menu.visible,
        created_at: menu.created_at,
        combinations: menu.combinations,
        dishes: menu.dishes.map((dishId) => {
          for (const category of restaurant.dish_categories) {
            const dish = category.dishes.find(
              (dish) => dish._id.toString() === dishId.toString()
            );
            if (dish) {
              return {
                _id: dish._id,
                name: dish.name,
                description: dish.description,
                price: dish.price,
                showOnWebsite: dish.showOnWebsite,
                vegan: dish.vegan,
                vegetarian: dish.vegetarian,
                bio: dish.bio,
                glutenFree: dish.glutenFree,
                category: category.name,
              };
            }
          }
          return dishId;
        }),
      })),
    };

    res.status(200).json({ restaurant: restaurantData });
  } catch (error) {
    console.error("Erreur lors de la récupération du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// GET CURRENT SUBSCRIPTION FOR A RESTAURANT BY CUSTOMER ID
router.get("/restaurant-subscription", authenticateToken, async (req, res) => {
  const { restaurantId } = req.query;
  const stripeCustomerId = req.user?.stripeCustomerId;

  if (!stripeCustomerId) {
    return res.status(400).json({
      message:
        "stripeCustomerId est manquant dans les informations d'utilisateur.",
    });
  }

  try {
    // Récupère les abonnements spécifiques au client
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      expand: ["data.items.data.price"], // Expansion nécessaire
    });

    // Cherche l'abonnement correspondant dans les métadonnées
    const restaurantSubscription = subscriptions.data.find(
      (subscription) => subscription.metadata.restaurantId === restaurantId
    );

    if (!restaurantSubscription) {
      return res
        .status(404)
        .json({ message: "Aucun abonnement trouvé pour ce restaurant." });
    }

    // Récupère l'ID du produit associé à l'abonnement
    const price = restaurantSubscription.items.data[0].price;
    const product = await stripe.products.retrieve(price.product);

    // Récupérer les factures associées à l'abonnement
    const invoices = await stripe.invoices.list({
      subscription: restaurantSubscription.id,
      limit: 100, // Ajustez cette limite si nécessaire
    });

    const subscriptionDetails = {
      name: product.name,
      amount: price.unit_amount / 100,
      currency: price.currency.toUpperCase(),
      status: restaurantSubscription.status,
      invoices: invoices.data.map((invoice) => ({
        id: invoice.id,
        amount_due: invoice.amount_due / 100,
        currency: invoice.currency.toUpperCase(),
        status: invoice.status,
        date: invoice.created,
        download_url: invoice.invoice_pdf,
      })),
    };

    res.status(200).json({ subscription: subscriptionDetails });
  } catch (error) {
    console.error("Erreur lors de la récupération de l'abonnement:", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération de l'abonnement" });
  }
});

// Route pour mettre à jour le lastNotificationCheck
router.put(
  "/restaurants/:id/notification-check",
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;
    try {
      await RestaurantModel.updateOne(
        { _id: id },
        { $set: { lastNotificationCheck: new Date() } }
      );
      res
        .status(200)
        .json({ message: "Notification check updated successfully" });
    } catch (error) {
      console.error("Error updating lastNotificationCheck:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// COUNT ANALYTICS VISITS FROM WEBSITE
router.post("/restaurants/:id/visits", async (req, res) => {
  const restaurantId = req.params.id;
  const now = new Date();
  // Format YYYY-MM, ex. "2025-07"
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;

  try {
    // 1) On essaye d'incrémenter dans le sous-doc "periods" existant
    const updateResult = await VisitCounterModel.updateOne(
      { restaurant: restaurantId, "periods.period": period },
      { $inc: { "periods.$.count": 1 } }
    );

    // Si aucun count n'a été modifié, c'est qu'il n'y a pas encore de document pour ce mois
    if (updateResult.modifiedCount === 0) {
      await VisitCounterModel.updateOne(
        { restaurant: restaurantId },
        {
          // Si le document restaurant n'existe pas encore, on le crée → upsert
          $setOnInsert: { restaurant: restaurantId },
          // On pousse la nouvelle période avec count = 1
          $push: { periods: { period, count: 1 } },
        },
        { upsert: true }
      );
    }

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Erreur log visite :", err);
    return res.status(500).json({ error: "Impossible de logger la visite" });
  }
});

// Récupère les N derniers mois de visites pour un restaurant
router.get("/restaurants/:id/visits/monthly", async (req, res) => {
  const restaurantId = req.params.id;
  const months = parseInt(req.query.months, 10) || 6;

  // 1) Construire la liste des labels attendus, ex. ["2025-01","2025-02",...]
  const periods = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  try {
    // 2) Récupérer le document unique pour ce restaurant
    const doc = await VisitCounterModel.findOne({
      restaurant: restaurantId,
    }).lean();
    // Si aucun document, on renvoie un tableau de zéros
    const mapCounts = {};
    if (doc && Array.isArray(doc.periods)) {
      doc.periods.forEach(({ period, count }) => {
        mapCounts[period] = count;
      });
    }

    // 3) Composer le tableau final dans l'ordre des periods
    const data = periods.map((label) => ({
      label,
      visits: mapCounts[label] || 0,
    }));

    return res.status(200).json({ data });
  } catch (err) {
    console.error("Erreur fetching monthly visits:", err);
    return res
      .status(500)
      .json({ error: "Impossible de récupérer les visites mensuelles" });
  }
});

// ----------------- OWNER : LISTE DES EMPLOYÉS EXISTANTS -----------------
router.get("/owner/employees", async (req, res) => {
  try {
    const ownerId = req.query.ownerId;
    if (!ownerId) {
      return res.status(400).json({ message: "ownerId is required" });
    }

    // Tous les restos du propriétaire
    const restaurants = await RestaurantModel.find(
      { owner_id: ownerId },
      "_id name"
    ).lean();

    const restaurantIds = restaurants.map((r) => r._id);
    if (restaurantIds.length === 0) {
      return res.json({ employees: [] });
    }

    // Tous les employés rattachés à au moins un de ces restos
    const employees = await EmployeeModel.find({
      restaurants: { $in: restaurantIds },
    })
      .select(
        `
        firstname lastname email phone secuNumber address emergencyContact
        post dateOnPost profilePicture
        restaurants restaurantProfiles
      `
      )
      .populate("restaurants", "name _id")
      .lean();

    return res.json({ employees });
  } catch (e) {
    console.error("Error fetching owner employees:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ----------------- IMPORT EMPLOYÉ EXISTANT DANS UN RESTO -----------------
router.post("/restaurants/:restaurantId/employees/import", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { employeeId } = req.body;

    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const employee = await EmployeeModel.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // sécurité : si déjà rattaché à ce resto, on refuse
    const alreadyInRestaurant =
      Array.isArray(employee.restaurants) &&
      employee.restaurants.some((rId) => String(rId) === String(restaurantId));

    if (alreadyInRestaurant) {
      return res
        .status(409)
        .json({ message: "Employee already in this restaurant" });
    }

    // On lie l'employé à ce resto + on crée le profil pour ce resto au besoin
    ensureEmployeeRestaurantLink(employee, restaurantId);
    getOrCreateRestaurantProfile(employee, restaurantId);

    await employee.save();

    if (
      !restaurant.employees.some((id) => String(id) === String(employee._id))
    ) {
      restaurant.employees.push(employee._id);
      await restaurant.save();
    }

    const updatedRestaurant = await RestaurantModel.findById(restaurantId)
      .populate("owner_id", "firstname")
      .populate("menus")
      .populate("employees");

    return res.json({ restaurant: updatedRestaurant });
  } catch (e) {
    console.error("Error importing employee:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
