export const directoryPath = "/dashboard/employees";

export function canManagePersonnel(restaurant, user) {
  if (restaurant?.options?.employees !== true) return false;
  if (user?.role === "owner") return true;
  const employee = restaurant.employees?.find((item) => String(item._id) === String(user?.id));
  return user?.role === "employee" && employee?.accountType !== "accountant" &&
    employeeProfile(employee, restaurant._id)?.options?.employees === true;
}

export function employeeProfile(employee, restaurantId) {
  return employee?.restaurantProfiles?.find((profile) => String(profile.restaurant) === String(restaurantId));
}

export function employeeDirectoryEntry(employee, restaurantId) {
  const profile = employeeProfile(employee, restaurantId);
  const snapshot = profile?.snapshot || {};
  const firstname = snapshot.firstname ?? employee.firstname ?? "";
  const lastname = snapshot.lastname ?? employee.lastname ?? "";
  return {
    id: String(employee._id),
    employee,
    firstname,
    lastname,
    name: [firstname, lastname].filter(Boolean).join(" "),
    initials: [firstname, lastname].map((value) => value.trim().slice(0, 1).toUpperCase()).join(""),
    email: snapshot.email ?? employee.email ?? "",
    phone: snapshot.phone ?? employee.phone ?? "",
    post: snapshot.post ?? employee.post ?? "",
    contract: profile?.employment?.contractType || "",
    accountType: employee.accountType === "accountant" ? "accountant" : "employee",
  };
}

export function normalizePersonnelSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function filterDirectory(entries, { search, post, account, access }) {
  const terms = normalizePersonnelSearch(search).split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const searchable = normalizePersonnelSearch(`${entry.name} ${entry.email} ${entry.phone}`);
    return (!post || normalizePersonnelSearch(entry.post) === post) &&
      (!account || entry.accountType === account) &&
      (!access || Boolean(entry.email) === (access === "email")) &&
      terms.every((term) => searchable.includes(term));
  });
}

export function applyRosterResponse(previous, restaurantId, updated) {
  if (!previous || String(previous._id) !== String(restaurantId) ||
      String(updated?._id) !== String(restaurantId)) return previous;
  return { ...previous, employees: updated.employees || [], accountants: updated.accountants || [] };
}
