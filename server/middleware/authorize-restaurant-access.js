const RestaurantModel = require("../models/restaurant.model");
const EmployeeModel = require("../models/employee.model");
const { isObjectIdOrHexString } = require("mongoose");

function getEmployeeProfile(employee, restaurantId) {
  return (employee?.restaurantProfiles || []).find(
    (profile) =>
      String(profile?.restaurant?._id || profile?.restaurant || "") ===
      String(restaurantId || ""),
  );
}

async function userCanAccessRestaurant(
  user,
  restaurant,
  { requiredOption = null, requiredOptionsAny = null, ownerOnly = false } = {},
) {
  if (!user || !restaurant) return false;

  if (user.role === "owner") {
    return (
      String(restaurant.owner_id?._id || restaurant.owner_id || "") ===
      String(user.id || "")
    );
  }

  if (ownerOnly || user.role !== "employee") return false;

  const restaurantId = String(restaurant._id || "");
  const isListed = (restaurant.employees || []).some(
    (employee) => String(employee?._id || employee || "") === String(user.id),
  );
  if (!isListed) return false;
  const requiredOptions = Array.isArray(requiredOptionsAny)
    ? requiredOptionsAny.filter(Boolean)
    : requiredOption
      ? [requiredOption]
      : [];
  if (!requiredOptions.length) return true;

  if (
    String(user.restaurantId || "") === restaurantId &&
    requiredOptions.some((option) => user.options?.[option] === true)
  ) {
    return true;
  }

  const populatedEmployee = (restaurant.employees || []).find(
    (employee) => String(employee?._id || employee || "") === String(user.id),
  );
  let profile = getEmployeeProfile(populatedEmployee, restaurantId);

  if (!profile) {
    const employee = await EmployeeModel.findById(user.id)
      .select("restaurantProfiles")
      .lean();
    profile = getEmployeeProfile(employee, restaurantId);
  }

  return requiredOptions.some((option) => profile?.options?.[option] === true);
}

function authorizeRestaurantAccess({
  paramName = "restaurantId",
  requiredOption = null,
  requiredOptionsAny = null,
  ownerOnly = false,
} = {}) {
  return async function authorizeRestaurantAccessMiddleware(req, res, next) {
    try {
      const restaurantId = req.params?.[paramName];
      if (!isObjectIdOrHexString(restaurantId)) {
        return res.status(400).json({ message: "Invalid restaurant" });
      }
      if (req.user?.role !== "owner" && (ownerOnly || req.user?.role !== "employee")) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const restaurant = await RestaurantModel.findById(restaurantId)
        .select("_id owner_id employees options.take_away options.customers")
        .populate("employees", "restaurantProfiles");

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const authorized = await userCanAccessRestaurant(req.user, restaurant, {
        requiredOption,
        requiredOptionsAny,
        ownerOnly,
      });
      if (!authorized) {
        return res.status(403).json({ message: "Forbidden" });
      }

      req.authorizedRestaurant = restaurant;
      return next();
    } catch (error) {
      console.error("Restaurant authorization error:", error?.message || error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}

module.exports = {
  authorizeRestaurantAccess,
  userCanAccessRestaurant,
};
