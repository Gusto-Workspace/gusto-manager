const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_API_SECRET_KEY);

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const RestaurantModel = require("../models/restaurant.model");
const {
  sanitizePublicRestaurantData,
} = require("../services/shared/public-restaurant-serialization.service");
const VisitCounterModel = require("../models/visit-counter.model");
const EmployeeModel = require("../models/employee.model");
const {
  signAccountToken,
  stripJwtMetadata,
} = require("../services/shared/account-session.service");
const {
  findRestaurantSubscription,
  listSubscriptionInvoicesHistory,
} = require("../services/billing/stripe-billing.service");
const {
  buildSubscriptionSummary,
} = require("../services/billing/stripe-subscription-catalog.service");
const {
  decorateRestaurantEmployees,
  sanitizeEmployeeForRestaurants,
} = require("../services/employees/employee-serialization.service");
const { clockPinWriteProblem, provisionInitialClockPin, withClockPinTransaction } = require("../services/employees/time-clock-pin.service");
const {
  buildPublicReservationServiceBlockedRange,
} = require("../services/reservations/reservation-service-closure.service");

// Build a new profile without hydrating or serializing the other profiles.
function createRestaurantProfile(employee, restaurantId) {
  return {
    restaurant: restaurantId,
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
}

// Trouve le profil de restaurant pour cet employé
function findRestaurantProfile(employee, restaurantId) {
  if (!Array.isArray(employee.restaurantProfiles)) return null;
  const target = String(restaurantId);
  return employee.restaurantProfiles.find(
    (p) => String(p.restaurant) === target,
  );
}

// GET ALL OWNER RESTAURANTS
router.get("/owner/restaurants", authenticateToken, async (req, res) => {
  if (req.user?.role !== "owner") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const ownerId = req.user.id;

  try {
    const restaurants = await RestaurantModel.find(
      { owner_id: ownerId },
      "name _id options.reservations options.gift_card",
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

  const updatedToken = signAccountToken({
    ...stripJwtMetadata(decodedToken),
    restaurantId,
  });

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
        (id) => String(id) === String(restaurantId),
      );
      if (!worksHere) {
        return res.status(403).json({
          message: "Employee is not linked to this restaurant",
        });
      }

      const profile = findRestaurantProfile(emp, restaurantId);

      // On repart du token courant, mais SANS exp / iat
      const decodedToken = req.user;
      const rest = stripJwtMetadata(decodedToken);

      const payload = {
        ...rest,
        restaurantId,
        options: profile?.options || {},
      };

      // 🔴 IMPORTANT : pas d'option expiresIn ici
      const updatedToken = signAccountToken(payload);

      return res.status(200).json({ token: updatedToken });
    } catch (e) {
      console.error("Error in /employees/change-restaurant:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// GET RESTAURANT DETAILS FROM PANEL
router.get("/owner/restaurants/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const reservationsScope = req.query?.scope === "reservations";

    let restaurantQuery = RestaurantModel.findById(id);
    if (reservationsScope) {
      restaurantQuery = restaurantQuery.select(
        "_id name website opening_hours exceptional_closures options reservationsSettings owner_id employees",
      );
    }
    restaurantQuery = restaurantQuery.populate("owner_id", "firstname");
    if (reservationsScope) {
      restaurantQuery = restaurantQuery.populate(
        "employees",
        "_id firstname lastname restaurantProfiles",
      );
    } else {
      restaurantQuery = restaurantQuery.populate("menus").populate("employees");
    }
    const restaurant = await restaurantQuery;

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    if (req.user?.role !== "owner") {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (
      String(restaurant.owner_id?._id || restaurant.owner_id) !==
      String(req.user.id)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const decoratedRestaurant = decorateRestaurantEmployees(
      restaurant,
      id,
      restaurant.employees || [],
    );

    res.status(200).json({ restaurant: decoratedRestaurant });
  } catch (error) {
    console.error("Erreur lors de la récupération du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// GET RESTAURANT DETAILS FROM SITE
router.get("/restaurants/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await RestaurantModel.findById(id).populate("menus");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const resolveDish = (dishId, menu) => {
      for (const category of restaurant.dish_categories || []) {
        const categoryDish = category.dishes.find(
          (currentDish) => currentDish._id.toString() === dishId.toString(),
        );
        const subCategory = (category.subCategories || []).find((candidate) =>
          candidate.dishes.some(
            (currentDish) => currentDish._id.toString() === dishId.toString(),
          ),
        );
        const dish =
          categoryDish ||
          subCategory?.dishes.find(
            (currentDish) => currentDish._id.toString() === dishId.toString(),
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
            subCategory: subCategory?.name || "",
          };
        }
      }

      return (
        (menu.menuDishes || []).find(
          (dish) => dish._id.toString() === dishId.toString(),
        ) || dishId
      );
    };

    let restaurantData = {
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
        dishes: menu.dishes.map((dishId) => resolveDish(dishId, menu)),
        customGroups: (menu.customGroups || []).map((group) => ({
          categoryId: group.categoryId,
          categoryName: group.categoryName,
          relation: group.relation,
          relations: group.relations || [],
          dishes: (group.dishes || []).map((dishId) => resolveDish(dishId, menu)),
        })),
      })),
    };

    const serviceBlockedRange = buildPublicReservationServiceBlockedRange({
      restaurant: restaurantData,
    });

    if (serviceBlockedRange) {
      const reservationSettings = restaurantData.reservationsSettings || {};
      restaurantData.reservationsSettings = {
        ...reservationSettings,
        blocked_ranges: [
          ...(Array.isArray(reservationSettings.blocked_ranges)
            ? reservationSettings.blocked_ranges
            : []),
          serviceBlockedRange,
        ],
      };
    }

    // Les contenus vitrine restent inchangés ; seuls les champs d'exploitation
    // dont aucun site client n'a besoin sont retirés du contrat public.
    restaurantData = sanitizePublicRestaurantData(restaurantData);

    res.status(200).json({ restaurant: restaurantData });
  } catch (error) {
    console.error("Erreur lors de la récupération du restaurant:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// GET CURRENT SUBSCRIPTION FOR A RESTAURANT
router.get("/restaurant-subscription", authenticateToken, async (req, res) => {
  const { restaurantId } = req.query;
  if (!restaurantId) {
    return res
      .status(400)
      .json({ message: "restaurantId est requis pour cette requête." });
  }

  try {
    const { subscription: restaurantSubscription } =
      await findRestaurantSubscription({
        restaurantId,
      });

    if (!restaurantSubscription) {
      return res
        .status(404)
        .json({ message: "Aucun abonnement trouvé pour ce restaurant." });
    }

    const hydratedSubscription = await stripe.subscriptions.retrieve(
      restaurantSubscription.id,
      {
        expand: ["items.data.price"],
      },
    );
    const summary = await buildSubscriptionSummary(hydratedSubscription);

    // Récupérer les factures associées à l'abonnement
    const invoices = await listSubscriptionInvoicesHistory({
      subscriptionId: hydratedSubscription.id,
      limitPerSubscription: 100,
    });

    const subscriptionDetails = {
      name: summary.plan?.productName || "",
      amount: summary.totalAmount,
      currency: summary.currency,
      nextChargeAt:
        typeof hydratedSubscription.current_period_end === "number"
          ? hydratedSubscription.current_period_end
          : 0,
      plan: summary.plan
        ? {
            name: summary.plan.productName,
            amount: summary.plan.amount,
            currency: summary.plan.currency,
          }
        : null,
      addons: summary.addons.map((item) => ({
        name: item.productName,
        amount: item.amount,
        currency: item.currency,
      })),
      status: hydratedSubscription.status,
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        amount_due: invoice.amount_due / 100,
        amount: invoice.amount_due / 100,
        currency: invoice.currency.toUpperCase(),
        status: invoice.status,
        date: invoice.created,
        download_url: invoice.invoice_pdf,
      })),
    };

    res.status(200).json({ subscription: subscriptionDetails });
  } catch (error) {
    console.error("Erreur lors de la récupération de l'abonnement:", error);
    res.status(error?.statusCode || 500).json({
      message:
        error?.message || "Erreur lors de la récupération de l'abonnement",
    });
  }
});

// COUNT ANALYTICS VISITS FROM WEBSITE
router.post("/restaurants/:id/visits", async (req, res) => {
  const restaurantId = req.params.id;
  const now = new Date();
  // Format YYYY-MM, ex. "2025-07"
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}`;

  try {
    // 1) On essaye d'incrémenter dans le sous-doc "periods" existant
    const updateResult = await VisitCounterModel.updateOne(
      { restaurant: restaurantId, "periods.period": period },
      { $inc: { "periods.$.count": 1 } },
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
        { upsert: true },
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
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
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
router.get("/owner/employees", authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== "owner") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const ownerId = req.user.id;

    // Tous les restos du propriétaire
    const restaurants = await RestaurantModel.find(
      { owner_id: ownerId },
      "_id name",
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
        accountType firstname lastname email phone restaurants
      `,
      )
      .populate("restaurants", "name _id")
      .lean();

    return res.json({
      employees: employees
        .map((employee) =>
          sanitizeEmployeeForRestaurants(employee, restaurantIds),
        )
        .filter(Boolean),
    });
  } catch (e) {
    console.error("Error fetching owner employees:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ----------------- IMPORT EMPLOYÉ EXISTANT DANS UN RESTO -----------------
router.post(
  "/restaurants/:restaurantId/employees/import",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { employeeId } = req.body;

      const restaurant = await RestaurantModel.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      if (req.user?.role !== "owner") {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (String(restaurant.owner_id) !== String(req.user.id)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (restaurant.options?.employees !== true || !mongoose.isValidObjectId(employeeId)) {
        return res.status(400).json({ message: "Rattachement indisponible." });
      }

      const employee = await EmployeeModel.findById(employeeId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // sécurité : si déjà rattaché à ce resto, on refuse
      const alreadyInRestaurant =
        Array.isArray(employee.restaurants) &&
        employee.restaurants.some(
          (rId) => String(rId) === String(restaurantId),
        );

      if (alreadyInRestaurant) {
        return res
          .status(409)
          .json({ message: "Employee already in this restaurant" });
      }
      const canLink = await RestaurantModel.exists({
        _id: { $in: employee.restaurants },
        owner_id: req.user.id,
        employees: employee._id,
      });
      if (!canLink) return res.status(404).json({ message: "Compte à rattacher introuvable." });

      const existingProfile = findRestaurantProfile(employee, restaurantId);
      const profile = existingProfile || {
        ...createRestaurantProfile(employee, restaurantId),
        _id: new mongoose.Types.ObjectId(),
      };
      const linked = await withClockPinTransaction(async (session) => {
        const result = await EmployeeModel.updateOne(
          {
            _id: employee._id,
            restaurants: { $ne: restaurantId },
            __v: employee.__v ?? { $exists: false },
          },
          {
            $addToSet: { restaurants: restaurantId },
            $inc: { __v: 1 },
            ...(!existingProfile && { $push: { restaurantProfiles: profile } }),
          },
          { session, runValidators: true },
        );
        if (!result.modifiedCount) return false;
        await RestaurantModel.updateOne(
          { _id: restaurantId }, { $addToSet: { employees: employee._id } }, { session },
        );
        if (employee.accountType !== "accountant") {
          await provisionInitialClockPin({
            restaurant: restaurantId, employee: employee._id, profile: String(profile._id || ""),
            changedBy: String(req.user.id), session,
          });
        }
        return true;
      });
      if (!linked) return res.status(409).json({ message: "Le rattachement du salarié a changé." });

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");

      const decoratedRestaurant = decorateRestaurantEmployees(
        updatedRestaurant,
        restaurantId,
        updatedRestaurant?.employees || [],
      );

      return res.json({ restaurant: decoratedRestaurant });
    } catch (e) {
      const problem = clockPinWriteProblem(e);
      if (problem) return res.status(409).json(problem);
      console.error("Error importing employee", { code: e.code || e.name });
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

module.exports = router;
