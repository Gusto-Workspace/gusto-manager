const GUSTO_MENU_PRINT_RETURN_PATH_KEY = "gustoMenuPrintReturnPath";
const GUSTO_MENU_PRINT_RETURN_PATH_MAX_AGE = 10 * 60 * 1000;
const GUSTO_MENU_PRINT_RETURN_PATHS = new Set([
  "/dashboard/menus",
  "/dashboard/dishes",
]);

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

export function rememberGustoMenuPrintReturnPath(path) {
  if (
    typeof window === "undefined" ||
    !GUSTO_MENU_PRINT_RETURN_PATHS.has(path)
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      GUSTO_MENU_PRINT_RETURN_PATH_KEY,
      JSON.stringify({ path, createdAt: Date.now() }),
    );
  } catch {}
}

export function consumeGustoMenuPrintReturnPath() {
  if (typeof window === "undefined") return null;

  let storedValue;
  try {
    storedValue = window.localStorage.getItem(
      GUSTO_MENU_PRINT_RETURN_PATH_KEY,
    );
    if (!storedValue) return null;

    window.localStorage.removeItem(GUSTO_MENU_PRINT_RETURN_PATH_KEY);
  } catch {
    return null;
  }

  try {
    const { path, createdAt } = JSON.parse(storedValue);
    const age = Date.now() - createdAt;

    if (
      !GUSTO_MENU_PRINT_RETURN_PATHS.has(path) ||
      !Number.isFinite(createdAt) ||
      age < 0 ||
      age > GUSTO_MENU_PRINT_RETURN_PATH_MAX_AGE
    ) {
      return null;
    }

    return path;
  } catch {
    return null;
  }
}
