export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function setupPushForModule({
  module,
  restaurantId,
  token,
  apiUrl,
}) {
  if (typeof window === "undefined") return;
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return;

  const isReservations = module === "reservations";
  const swUrl = isReservations ? "/sw-reservations.js" : "/sw-giftcards.js";
  const scope = isReservations
    ? "/dashboard/webapp/reservations/"
    : "/dashboard/webapp/gift-cards/";

  // 1) register SW spécifique
  const reg = await navigator.serviceWorker.register(swUrl, { scope });

  // 2) permission
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return;

  // 3) subscribe
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  // 4) envoyer au backend
  await fetch(`${apiUrl}/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ restaurantId, module, subscription: sub }),
  });
}
