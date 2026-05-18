export const DASHBOARD_HREF_OPTION_KEYS = {
  "/dashboard/my-space": "my-space",
  "/dashboard": "dashboard",
  "/dashboard/restaurant": "restaurant",
  "/dashboard/dishes": "dishes",
  "/dashboard/menus": "menus",
  "/dashboard/drinks": "drinks",
  "/dashboard/wines": "wines",
  "/dashboard/news": "news",
  "/dashboard/employees": "employees",
  "/dashboard/gift-cards": "gift_card",
  "/dashboard/reservations": "reservations",
  "/dashboard/take-away": "take_away",
  "/dashboard/health-control-plan": "health_control_plan",
  "/dashboard/customers": "customers",
};

const DASHBOARD_ROUTE_RULES = [
  { href: "/dashboard/my-space", exact: true },
  { href: "/dashboard/health-control-plan" },
  { href: "/dashboard/gift-cards" },
  { href: "/dashboard/reservations" },
  { href: "/dashboard/employees" },
  { href: "/dashboard/customers" },
  { href: "/dashboard/restaurant" },
  { href: "/dashboard/dishes" },
  { href: "/dashboard/menus" },
  { href: "/dashboard/drinks" },
  { href: "/dashboard/wines" },
  { href: "/dashboard/news" },
  { href: "/dashboard/take-away" },
  { href: "/dashboard", exact: true },
].map((rule) => ({
  ...rule,
  optionKey: DASHBOARD_HREF_OPTION_KEYS[rule.href],
}));

const RESTAURANT_SUBSCRIPTION_OPTION_KEYS = new Set([
  "dishes",
  "menus",
  "drinks",
  "wines",
  "news",
  "employees",
  "gift_card",
  "reservations",
  "take_away",
  "health_control_plan",
  "customers",
]);

export function normalizeDashboardPath(pathname = "") {
  const rawPath = String(pathname || "")
    .split("?")[0]
    .split("#")[0]
    .trim();

  if (!rawPath) return "/";

  const pathWithoutLocale = rawPath.replace(/^\/(fr|en)(?=\/|$)/, "") || "/";

  if (pathWithoutLocale.length > 1 && pathWithoutLocale.endsWith("/")) {
    return pathWithoutLocale.slice(0, -1);
  }

  return pathWithoutLocale;
}

export function getDashboardOptionKeyFromPath(pathname = "") {
  const normalizedPath = normalizeDashboardPath(pathname);

  for (const rule of DASHBOARD_ROUTE_RULES) {
    if (rule.exact) {
      if (normalizedPath === rule.href) return rule.optionKey;
      continue;
    }

    if (
      normalizedPath === rule.href ||
      normalizedPath.startsWith(`${rule.href}/`)
    ) {
      return rule.optionKey;
    }
  }

  return null;
}

export function getEmployeeDashboardOptions(restaurantData, userConnected) {
  const restaurantId = restaurantData?._id || userConnected?.restaurantId;
  const employeeId = userConnected?.id;

  if (!restaurantId || !employeeId) {
    return userConnected?.options || null;
  }

  const employees = Array.isArray(restaurantData?.employees)
    ? restaurantData.employees
    : [];

  const employeeInRestaurant = employees.find(
    (employee) =>
      String(employee?._id) === String(employeeId) ||
      String(employee?.id) === String(employeeId),
  );

  const profiles = Array.isArray(employeeInRestaurant?.restaurantProfiles)
    ? employeeInRestaurant.restaurantProfiles
    : [];

  const profile = profiles.find(
    (candidate) => String(candidate?.restaurant) === String(restaurantId),
  );

  return profile?.options || userConnected?.options || null;
}

export function isEmployeeDashboardRouteAllowed(
  pathname,
  { restaurantData, userConnected } = {},
) {
  const optionKey = getDashboardOptionKeyFromPath(pathname);

  if (!optionKey) return true;
  if (optionKey === "my-space") return true;

  const employeeOptions = getEmployeeDashboardOptions(
    restaurantData,
    userConnected,
  );

  if (!employeeOptions?.[optionKey]) return false;

  if (!RESTAURANT_SUBSCRIPTION_OPTION_KEYS.has(optionKey)) return true;

  return restaurantData?.options?.[optionKey] === true;
}
