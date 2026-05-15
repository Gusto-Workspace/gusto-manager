function toPlainObject(value) {
  if (!value) return null;
  if (typeof value.toObject === "function") return value.toObject();
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
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => value === "lunch" || value === "dinner"),
    ),
  );
}

function buildRestaurantProfileView(profile, { safe = false } = {}) {
  if (!profile) return null;

  return {
    _id: profile?._id || null,
    restaurant: profile?.restaurant || null,
    options: { ...(profile?.options || {}) },
    snapshot: { ...(profile?.snapshot || {}) },
    employment: { ...(profile?.employment || {}) },
    documents: safe ? [] : [...(profile?.documents || [])],
    shifts: safe ? [] : [...(profile?.shifts || [])],
    leaveRequests: safe ? [] : [...(profile?.leaveRequests || [])],
  };
}

function decorateEmployeeForRestaurant(
  employee,
  restaurantId,
  { safe = false } = {},
) {
  const plainEmployee = toPlainObject(employee);
  if (!plainEmployee) return null;

  const profile = findRestaurantProfile(plainEmployee, restaurantId);
  const profileView = buildRestaurantProfileView(profile, { safe });

  const next = {
    ...plainEmployee,
    currentRestaurantProfileId: profileView?._id || null,
    snapshot: { ...(profileView?.snapshot || {}) },
    options: { ...(profileView?.options || {}) },
    employment: { ...(profileView?.employment || {}) },
    shifts: safe ? [] : [...(profileView?.shifts || [])],
    leaveRequests: safe ? [] : [...(profileView?.leaveRequests || [])],
    documents: safe ? [] : [...(profileView?.documents || [])],
  };

  if (safe) {
    delete next.email;
    delete next.phone;
    delete next.secuNumber;
    delete next.address;
    delete next.emergencyContact;
    delete next.resetCode;
    delete next.resetCodeExpires;

    next.restaurantProfiles = profileView ? [profileView] : [];
  }

  next.shifts = (next.shifts || []).map((shift) => ({
    ...shift,
    mealCount: Math.max(0, Number(shift?.mealCount || 0)),
    mealPeriods: normalizeMealPeriods(shift?.mealPeriods),
  }));

  return next;
}

function decorateRestaurantEmployees(restaurant, restaurantId, employees = [], options) {
  const plainRestaurant = toPlainObject(restaurant);
  if (!plainRestaurant) return null;

  return {
    ...plainRestaurant,
    employees: (employees || [])
      .map((employee) =>
        decorateEmployeeForRestaurant(employee, restaurantId, options),
      )
      .filter(Boolean),
  };
}

module.exports = {
  decorateEmployeeForRestaurant,
  decorateRestaurantEmployees,
  findRestaurantProfile,
  toPlainObject,
};
