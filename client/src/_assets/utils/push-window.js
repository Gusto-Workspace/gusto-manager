const MODULE_PATHS = {
  reservations: "/dashboard/webapp/reservations",
  gift_cards: "/dashboard/webapp/gift-cards",
  take_away: "/dashboard/webapp/take-away",
};
const WORKERS = {
  reservations: "/sw-reservations.js",
  gift_cards: "/sw-giftcards.js",
  take_away: "/sw-take-away.js",
};
const IDENTITY_KEY = "gusto-push-window-module-v1";

export function getPushModuleFromPath(pathname) {
  return (
    Object.keys(MODULE_PATHS).find(
      (module) =>
        pathname === MODULE_PATHS[module] ||
        pathname.startsWith(`${MODULE_PATHS[module]}/`),
    ) || null
  );
}

// Capture before client-side routing. sessionStorage belongs to the window, not
// the shared origin, and survives reloads/login. Never change it on navigation.
// This is a window identity, not proof of which OS installation opened the URL.
export function getPushWindowIdentity() {
  if (typeof window === "undefined") return null;
  if (window.__gustoPushWindowIdentity) return window.__gustoPushWindowIdentity;
  let identity;
  try {
    identity = sessionStorage.getItem(IDENTITY_KEY);
  } catch {}
  if (![...Object.keys(MODULE_PATHS), "other"].includes(identity)) {
    identity = getPushModuleFromPath(window.location.pathname) || "other";
    // A fresh login window can retain its intended module through redirect.
    if (window.location.pathname === "/dashboard/login") {
      try {
        const redirect = new URLSearchParams(window.location.search).get(
          "redirect",
        );
        const url = redirect && new URL(redirect, window.location.origin);
        if (url?.origin === window.location.origin) {
          identity = getPushModuleFromPath(url.pathname) || "other";
        }
      } catch {}
    }
    try {
      sessionStorage.setItem(IDENTITY_KEY, identity);
    } catch {}
  }
  window.__gustoPushWindowIdentity = identity;
  return identity;
}

export function canUsePushModule(module) {
  return Boolean(
    module &&
      getPushWindowIdentity() === module &&
      getPushModuleFromPath(window.location.pathname) === module,
  );
}

export function trustedPushMessage(event) {
  const sourceModule = event?.data?.module;
  if (!Object.prototype.hasOwnProperty.call(WORKERS, sourceModule))
    return false;
  try {
    const source = new URL(event.source?.scriptURL);
    return (
      event.origin === window.location.origin &&
      source.origin === window.location.origin &&
      source.pathname === WORKERS[sourceModule] &&
      canUsePushModule(sourceModule)
    );
  } catch {
    return false;
  }
}

export function validPushTarget(rawUrl, module, restaurantId) {
  try {
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin &&
      getPushModuleFromPath(url.pathname) === module &&
      (!restaurantId ||
        url.searchParams.get("restaurantId") === String(restaurantId))
      ? url
      : null;
  } catch {
    return null;
  }
}

export async function handlePushWindowMessage(
  event,
  { router, restaurant, userId },
) {
  if (!trustedPushMessage(event)) return;
  const reply = (value) => event.ports?.[0]?.postMessage(value);
  const message = event.data;
  const restaurantId = String(restaurant?.restaurantData?._id || "");
  if (
    !router.isReady ||
    !restaurant?.isAuth ||
    restaurant.dataLoading ||
    !restaurantId ||
    !userId
  ) {
    reply(null);
    return;
  }
  if (message.type === "notification:context") {
    reply({ module: getPushWindowIdentity(), restaurantId, userId });
    return;
  }
  if (message.type !== "notification:navigate") return;
  const target = validPushTarget(
    message.targetUrl,
    message.module,
    restaurantId,
  );
  if (
    !target ||
    String(message.restaurantId || "") !== restaurantId ||
    (message.userId && message.userId !== userId)
  ) {
    reply({ navigated: false });
    return;
  }
  try {
    const path = `${target.pathname}${target.search}${target.hash}`;
    const result = await router.push(path, undefined, { scroll: false });
    reply({ navigated: result !== false });
  } catch {
    reply({ navigated: false });
  }
}

getPushWindowIdentity();
