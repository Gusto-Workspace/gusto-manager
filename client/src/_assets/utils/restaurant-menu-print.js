export function buildRestaurantMenuPrintUrl(website) {
  if (typeof website !== "string" || !website.trim()) return null;

  const rawWebsite = website.trim();
  const value = /^[a-z][a-z\d+.-]*:\/\//i.test(rawWebsite)
    ? rawWebsite
    : `https://${rawWebsite}`;

  try {
    const url = new URL(value);
    const protocolAllowed =
      url.protocol === "https:" ||
      (process.env.NODE_ENV !== "production" && url.protocol === "http:");
    if (!protocolAllowed || !url.hostname) {
      return null;
    }
    if (url.username || url.password) return null;

    url.pathname = "/menus";
    url.search = "";
    url.hash = "";
    url.searchParams.set("gustoPrint", "1");
    return url.toString();
  } catch {
    return null;
  }
}
