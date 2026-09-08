export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function getPushPermissionStatus() {
  if (typeof window === "undefined") return "loading";
  if (
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }

  return Notification.permission;
}

function getPushDisabledPreferenceKey(restaurantId, module) {
  return `gusto-push-disabled:${restaurantId}:${module}`;
}

export function isPushDisabledForModule(restaurantId, module) {
  if (typeof window === "undefined" || !restaurantId) return false;

  try {
    return (
      localStorage.getItem(
        getPushDisabledPreferenceKey(restaurantId, module),
      ) === "1"
    );
  } catch {
    return false;
  }
}

export function setPushDisabledForModule(restaurantId, module, disabled) {
  if (typeof window === "undefined" || !restaurantId) return;

  try {
    const key = getPushDisabledPreferenceKey(restaurantId, module);
    if (disabled) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // La désinscription reste effective même si le stockage local est bloqué.
  }
}

function createPushError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function waitForActiveServiceWorker(registration) {
  if (registration.active) return Promise.resolve(registration);

  const worker = registration.installing || registration.waiting;
  if (!worker) {
    return Promise.reject(
      createPushError(
        "Le service de notifications n’est pas encore actif.",
        "SERVICE_WORKER_NOT_ACTIVE",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener("statechange", handleStateChange);
      reject(
        createPushError(
          "Le service de notifications met trop de temps à démarrer.",
          "SERVICE_WORKER_ACTIVATION_TIMEOUT",
        ),
      );
    }, 15000);

    function handleStateChange() {
      if (registration.active || worker.state === "activated") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", handleStateChange);
        resolve(registration);
        return;
      }

      if (worker.state === "redundant") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", handleStateChange);
        reject(
          createPushError(
            "Le service de notifications n’a pas pu démarrer.",
            "SERVICE_WORKER_REDUNDANT",
          ),
        );
      }
    }

    worker.addEventListener("statechange", handleStateChange);
    handleStateChange();
  });
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return response.json().catch(() => null);
}

function getPushServiceWorkerConfig(module) {
  const swVersion = "2026-09-08-webapp-notifications-1";
  const configurations = {
    reservations: {
      swUrl: `/sw-reservations.js?v=${swVersion}`,
      scope: "/dashboard/webapp/reservations/",
    },
    gift_cards: {
      swUrl: `/sw-giftcards.js?v=${swVersion}`,
      scope: "/dashboard/webapp/gift-cards/",
    },
    take_away: {
      swUrl: `/sw-take-away.js?v=${swVersion}`,
      scope: "/dashboard/webapp/take-away/",
    },
  };

  return configurations[module] || configurations.reservations;
}

async function cleanupLegacyTakeAwayPush({ restaurantId, token, apiUrl }) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const legacyRegistration = registrations.find((registration) => {
      const pathname = new URL(registration.scope).pathname.replace(/\/+$/, "");
      return pathname === "/dashboard/take-away";
    });

    if (!legacyRegistration) return;

    const legacySubscription =
      await legacyRegistration.pushManager.getSubscription();

    if (legacySubscription) {
      try {
        await fetch(`${String(apiUrl).replace(/\/+$/, "")}/push/unsubscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            restaurantId,
            module: "take_away",
            endpoint: legacySubscription.endpoint,
          }),
        });
      } catch {
        // La souscription locale obsolète doit tout de même être supprimée.
      }

      await legacySubscription.unsubscribe();
    }

    await legacyRegistration.unregister();
  } catch {
    // Cette migration ne doit jamais empêcher l'activation de la webapp.
  }
}

export async function setupPushForModule({
  module,
  restaurantId,
  token,
  apiUrl,
  requestPermission = false,
}) {
  const { swUrl, scope } = getPushServiceWorkerConfig(module);

  try {
    const initialStatus = getPushPermissionStatus();
    if (initialStatus === "loading") {
      throw createPushError(
        "Le navigateur n’est pas encore prêt.",
        "NOT_READY",
      );
    }
    if (initialStatus === "unsupported") {
      throw createPushError(
        "Les notifications ne sont pas disponibles sur ce navigateur ou cette connexion.",
        "UNSUPPORTED",
      );
    }

    // La permission doit être demandée directement depuis le clic utilisateur,
    // avant tout autre await, sinon Chrome Android peut ignorer le prompt.
    let permission = initialStatus;
    if (permission === "default" && requestPermission) {
      permission = await Notification.requestPermission();
    }
    if (permission === "default") {
      return { status: "permission_required" };
    }
    if (permission !== "granted") {
      return { status: "denied" };
    }

    if (!restaurantId || !token || !apiUrl) {
      throw createPushError(
        "La session ou le restaurant n’est pas disponible.",
        "MISSING_CONTEXT",
      );
    }

    const publicKey = String(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
    ).trim();
    if (!publicKey) {
      throw createPushError(
        "La clé de notification du site est absente.",
        "MISSING_VAPID_KEY",
      );
    }

    if (module === "take_away") {
      await cleanupLegacyTakeAwayPush({ restaurantId, token, apiUrl });
    }

    // 1) register SW spécifique
    const reg = await navigator.serviceWorker.register(swUrl, { scope });
    try {
      await reg.update();
    } catch {}
    await waitForActiveServiceWorker(reg);

    // 2) subscribe
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // 3) envoyer au backend
    const response = await fetch(
      `${String(apiUrl).replace(/\/+$/, "")}/push/subscribe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ restaurantId, module, subscription: sub }),
      },
    );

    const responseBody = await parseResponseBody(response);
    if (!response.ok) {
      const error = createPushError(
        responseBody?.error ||
          responseBody?.message ||
          "L’abonnement aux notifications n’a pas pu être enregistré.",
        "SUBSCRIPTION_REJECTED",
      );
      error.statusCode = response.status;
      throw error;
    }

    return {
      status: "subscribed",
      subscription: sub,
      endpointHash: responseBody?.endpointHash || null,
    };
  } catch (error) {
    throw error;
  }
}

export async function disablePushForModule({
  module,
  restaurantId,
  token,
  apiUrl,
}) {
  const permission = getPushPermissionStatus();
  if (permission === "loading" || permission === "unsupported") {
    throw createPushError(
      "Les notifications ne sont pas disponibles sur cet appareil.",
      "UNSUPPORTED",
    );
  }
  if (!restaurantId || !token || !apiUrl) {
    throw createPushError(
      "La session n’est pas disponible.",
      "MISSING_CONTEXT",
    );
  }

  const { scope } = getPushServiceWorkerConfig(module);
  const registration = await navigator.serviceWorker.getRegistration(scope);
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) {
    if (module === "take_away") {
      await cleanupLegacyTakeAwayPush({ restaurantId, token, apiUrl });
    }
    return { status: "unsubscribed" };
  }

  const response = await fetch(
    `${String(apiUrl).replace(/\/+$/, "")}/push/unsubscribe`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        restaurantId,
        module,
        endpoint: subscription.endpoint,
      }),
    },
  );
  const responseBody = await parseResponseBody(response);
  if (!response.ok) {
    throw createPushError(
      responseBody?.error ||
        responseBody?.message ||
        "La désactivation des notifications a échoué.",
      "UNSUBSCRIPTION_REJECTED",
    );
  }

  await subscription.unsubscribe();
  if (module === "take_away") {
    await cleanupLegacyTakeAwayPush({ restaurantId, token, apiUrl });
  }
  return { status: "unsubscribed" };
}
