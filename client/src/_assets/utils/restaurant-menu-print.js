export const GUSTO_MENU_PRINT_RETURN_STORAGE_KEY = "gustoMenuPrintReturnPath";

const GUSTO_MENU_PRINT_RETURN_MAX_AGE_MS = 10 * 60 * 1000;
const ALLOWED_GUSTO_MENU_PRINT_RETURN_PATHS = new Set([
  "/dashboard/menus",
  "/dashboard/dishes",
]);

function getAllowedGustoMenuPrintReturnPath(pathname) {
  const path = String(pathname || "")
    .split("?")[0]
    .split("#")[0]
    .replace(/^\/(?:fr|en)(?=\/)/, "");

  return ALLOWED_GUSTO_MENU_PRINT_RETURN_PATHS.has(path) ? path : null;
}

export function rememberGustoMenuPrintReturnPath(pathname) {
  if (typeof window === "undefined") return;

  const path = getAllowedGustoMenuPrintReturnPath(pathname);
  if (!path) return;

  try {
    localStorage.setItem(
      GUSTO_MENU_PRINT_RETURN_STORAGE_KEY,
      JSON.stringify({ path, createdAt: Date.now() }),
    );
  } catch {
    // Storage can be unavailable without blocking the print flow.
  }
}

export function consumeGustoMenuPrintReturnPath() {
  if (typeof window === "undefined") return null;

  let storedValue;
  try {
    storedValue = localStorage.getItem(GUSTO_MENU_PRINT_RETURN_STORAGE_KEY);
    localStorage.removeItem(GUSTO_MENU_PRINT_RETURN_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!storedValue) return null;

  try {
    const { path, createdAt } = JSON.parse(storedValue);
    const allowedPath = getAllowedGustoMenuPrintReturnPath(path);
    const age = Date.now() - Number(createdAt);

    if (!allowedPath || !Number.isFinite(age)) return null;
    if (age < 0 || age > GUSTO_MENU_PRINT_RETURN_MAX_AGE_MS) return null;

    return allowedPath;
  } catch {
    return null;
  }
}

export function buildRestaurantMenuPrintUrl(website) {
  if (typeof website !== "string" || !website.trim()) return null;

  const rawWebsite = website.trim();
  const value = /^[a-z][a-z\d+.-]*:\/\//i.test(rawWebsite)
    ? rawWebsite
    : `https://${rawWebsite}`;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
      return null;
    }
    if (url.username || url.password) return null;

    url.pathname = "/menus";
    url.hash = "";
    url.searchParams.set("gustoPrint", "1");
    url.searchParams.set("autoprint", "1");
    return url.toString();
  } catch {
    return null;
  }
}
