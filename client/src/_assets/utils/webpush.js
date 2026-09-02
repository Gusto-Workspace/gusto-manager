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
  const isReservations = module === "reservations";
  const swVersion = "2026-09-01-notification-settings-1";

  return {
    swUrl: isReservations
      ? `/sw-reservations.js?v=${swVersion}`
      : `/sw-giftcards.js?v=${swVersion}`,
    scope: isReservations
      ? "/dashboard/webapp/reservations/"
      : "/dashboard/webapp/gift-cards/",
  };
}

async function hashPushEndpoint(endpoint) {
  if (!endpoint || !globalThis.crypto?.subtle) return null;

  try {
    const bytes = new TextEncoder().encode(String(endpoint));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);
  } catch {
    return null;
  }
}

function getWorkerScriptURL(registration) {
  return (
    registration?.active?.scriptURL ||
    registration?.waiting?.scriptURL ||
    registration?.installing?.scriptURL ||
    null
  );
}

async function getRegistrationDiagnostics(registration) {
  const [subscriptionResult, notificationsResult] = await Promise.allSettled([
    registration?.pushManager?.getSubscription?.(),
    registration?.getNotifications?.(),
  ]);
  const subscription =
    subscriptionResult.status === "fulfilled"
      ? subscriptionResult.value
      : null;
  const notifications =
    notificationsResult.status === "fulfilled" &&
    Array.isArray(notificationsResult.value)
      ? notificationsResult.value
      : [];

  return {
    scope: registration?.scope || null,
    workerScriptURL: getWorkerScriptURL(registration),
    workerState:
      registration?.active?.state ||
      registration?.waiting?.state ||
      registration?.installing?.state ||
      null,
    endpointHash: await hashPushEndpoint(subscription?.endpoint),
    notificationCount: notifications.length,
    notificationTags: notifications.map((notification) =>
      notification?.tag || null
    ),
  };
}

async function getServiceWorkerInventory() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return Promise.all(registrations.map(getRegistrationDiagnostics));
  } catch {
    return [];
  }
}

async function logPushClientSync(level, details) {
  const writer = level === "warn" ? console.warn : console.info;
  const registrations = await getServiceWorkerInventory();
  writer(
    "[webpush-client-sync]",
    JSON.stringify({
      ...details,
      registrations,
    }),
  );
}

export async function setupPushForModule({
  module,
  restaurantId,
  token,
  apiUrl,
  requestPermission = false,
  trigger = "unspecified",
}) {
  const { swUrl, scope } = getPushServiceWorkerConfig(module);
  const startedAt = Date.now();
  const diagnostics = {
    synchronizedAt: new Date().toISOString(),
    module,
    restaurantId: restaurantId ? String(restaurantId) : null,
    trigger,
    expectedScope: new URL(scope, window.location.origin).href,
    expectedWorkerScriptURL: new URL(swUrl, window.location.origin).href,
    registrationScope: null,
    workerScriptURL: null,
    controllerScriptURL:
      navigator.serviceWorker.controller?.scriptURL || null,
    permission: getPushPermissionStatus(),
    hadExistingSubscription: null,
    endpointHashBefore: null,
    subscribeCalled: false,
    endpointHashAfter: null,
  };

  try {
    const initialStatus = diagnostics.permission;
    if (initialStatus === "loading") {
      throw createPushError("Le navigateur n’est pas encore prêt.", "NOT_READY");
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
    diagnostics.permission = permission;

    if (permission === "default") {
      await logPushClientSync("info", {
        ...diagnostics,
        result: "permission_required",
        durationMs: Date.now() - startedAt,
      });
      return { status: "permission_required" };
    }
    if (permission !== "granted") {
      await logPushClientSync("info", {
        ...diagnostics,
        result: "denied",
        durationMs: Date.now() - startedAt,
      });
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

    // 1) register SW spécifique
    const reg = await navigator.serviceWorker.register(swUrl, { scope });
    diagnostics.registrationScope = reg.scope || null;
    diagnostics.workerScriptURL = getWorkerScriptURL(reg);
    try {
      await reg.update();
    } catch {}
    await waitForActiveServiceWorker(reg);
    diagnostics.workerScriptURL = getWorkerScriptURL(reg);
    diagnostics.controllerScriptURL =
      navigator.serviceWorker.controller?.scriptURL || null;

    // 2) subscribe
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    let sub = await reg.pushManager.getSubscription();
    diagnostics.hadExistingSubscription = Boolean(sub);
    diagnostics.endpointHashBefore = await hashPushEndpoint(sub?.endpoint);

    if (!sub) {
      diagnostics.subscribeCalled = true;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }
    diagnostics.endpointHashAfter = await hashPushEndpoint(sub?.endpoint);

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

    await logPushClientSync("info", {
      ...diagnostics,
      endpointHashBackend: responseBody?.endpointHash || null,
      result: "synchronized",
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
    });

    return {
      status: "subscribed",
      subscription: sub,
      endpointHash: responseBody?.endpointHash || null,
    };
  } catch (error) {
    await logPushClientSync("warn", {
      ...diagnostics,
      result: "failed",
      statusCode: error?.statusCode || null,
      errorName: error?.name || "Error",
      errorCode: error?.code || null,
      errorMessage: error?.message || "Push synchronization failed",
      durationMs: Date.now() - startedAt,
    });
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
    await logPushClientSync("info", {
      synchronizedAt: new Date().toISOString(),
      module,
      restaurantId: String(restaurantId),
      trigger: "settings_toggle_disable",
      registrationScope: registration?.scope || null,
      workerScriptURL: getWorkerScriptURL(registration),
      endpointHashBefore: null,
      unsubscribeCalled: false,
      result: "already_unsubscribed",
    });
    return { status: "unsubscribed" };
  }

  const endpointHash = await hashPushEndpoint(subscription.endpoint);

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
  await logPushClientSync("info", {
    synchronizedAt: new Date().toISOString(),
    module,
    restaurantId: String(restaurantId),
    trigger: "settings_toggle_disable",
    registrationScope: registration?.scope || null,
    workerScriptURL: getWorkerScriptURL(registration),
    endpointHashBefore: endpointHash,
    unsubscribeCalled: true,
    result: "unsubscribed",
  });
  return { status: "unsubscribed" };
}
