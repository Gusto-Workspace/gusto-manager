const { serializeEmployeeDocuments } = require("./employee-documents.service");

function toPlainObject(value) {
  if (!value) return null;
  if (typeof value.toObject === "function") {
    return value.toObject({ transform: false });
  }
  return { ...value };
}

function findRestaurantProfile(employee, restaurantId) {
  if (!Array.isArray(employee?.restaurantProfiles)) return null;

  return employee.restaurantProfiles.find(
    (profile) => String(profile?.restaurant) === String(restaurantId),
  );
}

function normalizeMealPeriods(periods = []) {
  return Array.from(
    new Set(
      (Array.isArray(periods) ? periods : [])
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase(),
        )
        .filter((value) => value === "lunch" || value === "dinner"),
    ),
  );
}

function buildRestaurantProfileView(
  profile,
  { safe = false, includeDocuments = false } = {},
) {
  if (!profile) return null;

  return {
    _id: profile?._id || null,
    restaurant: profile?.restaurant || null,
    options: { ...(profile?.options || {}) },
    snapshot: { ...(profile?.snapshot || {}) },
    employment: { ...(profile?.employment || {}) },
    documents:
      safe || !includeDocuments
        ? []
        : serializeEmployeeDocuments(profile?.documents || []),
    shifts: safe ? [] : [...(profile?.shifts || [])],
    leaveRequests: safe ? [] : [...(profile?.leaveRequests || [])],
  };
}

function decorateEmployeeForRestaurant(
  employee,
  restaurantId,
  { safe = false, includeDocuments = false } = {},
) {
  const plainEmployee = toPlainObject(employee);
  if (!plainEmployee) return null;

  const profile = findRestaurantProfile(plainEmployee, restaurantId);
  const profileView = buildRestaurantProfileView(profile, {
    safe,
    includeDocuments,
  });

  const next = {
    ...plainEmployee,
    currentRestaurantProfileId: profileView?._id || null,
    snapshot: { ...(profileView?.snapshot || {}) },
    options: { ...(profileView?.options || {}) },
    employment: { ...(profileView?.employment || {}) },
    shifts: safe ? [] : [...(profileView?.shifts || [])],
    leaveRequests: safe ? [] : [...(profileView?.leaveRequests || [])],
    documents:
      safe || !includeDocuments
        ? []
        : serializeEmployeeDocuments(profileView?.documents),
    restaurantProfiles: profileView ? [profileView] : [],
  };

  if (safe) {
    delete next.email;
    delete next.phone;
    delete next.secuNumber;
    delete next.address;
    delete next.emergencyContact;
    delete next.resetCode;
    delete next.resetCodeExpires;
  }

  next.shifts = (next.shifts || []).map((shift) => ({
    ...shift,
    mealCount: Math.max(0, Number(shift?.mealCount || 0)),
    mealPeriods: normalizeMealPeriods(shift?.mealPeriods),
  }));

  return next;
}

function sanitizeEmployeeForRestaurants(employee, restaurantIds = []) {
  const plainEmployee = toPlainObject(employee);
  if (!plainEmployee) return null;

  const allowedRestaurantIds = new Set(
    (restaurantIds || []).map((restaurantId) => String(restaurantId)),
  );
  const profiles = (plainEmployee.restaurantProfiles || [])
    .filter((profile) =>
      allowedRestaurantIds.has(
        String(profile?.restaurant?._id || profile?.restaurant || ""),
      ),
    )
    .map((profile) => buildRestaurantProfileView(profile));
  const restaurants = (plainEmployee.restaurants || []).filter((restaurant) =>
    allowedRestaurantIds.has(String(restaurant?._id || restaurant || "")),
  );

  return {
    ...plainEmployee,
    restaurants,
    restaurantProfiles: profiles,
    documents: [],
  };
}

function decorateRestaurantEmployees(
  restaurant,
  restaurantId,
  employees = [],
  options,
) {
  const plainRestaurant = toPlainObject(restaurant);
  if (!plainRestaurant) return null;

  const decoratedAccounts = (employees || [])
    .map((employee) =>
      decorateEmployeeForRestaurant(employee, restaurantId, options),
    )
    .filter(Boolean);

  return {
    ...plainRestaurant,
    employees: decoratedAccounts.filter(
      (employee) => employee.accountType !== "accountant",
    ),
    accountants: decoratedAccounts.filter(
      (employee) => employee.accountType === "accountant",
    ),
  };
}

module.exports = {
  decorateEmployeeForRestaurant,
  decorateRestaurantEmployees,
  findRestaurantProfile,
  sanitizeEmployeeForRestaurants,
  toPlainObject,
};
