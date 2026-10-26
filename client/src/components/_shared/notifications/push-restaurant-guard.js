import { useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";
import {
  canUsePushModule,
  getPushModuleFromPath,
} from "@/_assets/utils/push-window";

// Hold the deep-link page (and its entity fetching effects) until its restaurant
// is active. Manual dashboard navigation and restaurant selection stay normal.
export default function PushRestaurantGuard({ children }) {
  const router = useRouter();
  const { restaurantContext: context } = useContext(GlobalContext);
  const [resolved, setResolved] = useState(null);
  const [error, setError] = useState("");
  const [validatedDestination, setValidatedDestination] = useState(null);
  const [attempted, setAttempted] = useState(null);
  const selectRestaurant = useRef(context.handleRestaurantSelect);
  selectRestaurant.current = context.handleRestaurantSelect;
  const { dataLoading, isAuth, restaurantData, restaurantsList } = context;
  const targetModule = getPushModuleFromPath(router.pathname || "");
  const notificationId =
    typeof router.query.notificationId === "string"
      ? router.query.notificationId
      : null;
  const requestedId =
    typeof router.query.restaurantId === "string"
      ? router.query.restaurantId
      : null;
  const isPush = Boolean(
    targetModule && (router.query.pushModule || requestedId || notificationId),
  );
  const canonical = router.asPath || "";
  const url = new URL(canonical || "/", "https://routing.invalid");
  url.searchParams.delete("pushModule");
  url.searchParams.delete("restaurantId");
  const cleanPath = `${url.pathname}${url.search}`;
  const key = JSON.stringify([
    targetModule,
    requestedId,
    notificationId,
    cleanPath,
  ]);
  const targetId =
    requestedId || (resolved?.key === key ? resolved.restaurantId : null);
  const hasRoutingMetadata =
    router.query.restaurantId !== undefined ||
    router.query.pushModule !== undefined;
  const validatedContinuation = Boolean(
    validatedDestination &&
      !hasRoutingMetadata &&
      validatedDestination.cleanedKey === key,
  );
  const sameValidatedRestaurant =
    String(restaurantData?._id || "") === validatedDestination?.restaurantId;
  // The cleaned URL is only a continuation of a completed validation. A new
  // push carrying routing metadata must match its own full destination key.
  const ready = Boolean(
    validatedDestination &&
      isAuth &&
      !dataLoading &&
      sameValidatedRestaurant &&
      (!router.query.pushModule || router.query.pushModule === targetModule) &&
      (hasRoutingMetadata
        ? validatedDestination.key === key
        : validatedContinuation),
  );
  const currentDestinationKey = useRef(key);
  currentDestinationKey.current = key;
  const hash = url.hash;

  useEffect(() => {
    if (!router.isReady || dataLoading || !isAuth) return;
    if (validatedContinuation && !sameValidatedRestaurant) {
      // A subsequent manual restaurant change must not replay the old entity
      // deep link against the newly selected restaurant.
      const next = new URL(router.asPath, "https://routing.invalid");
      for (const name of [
        "notificationId",
        "reservationId",
        "purchaseId",
        "orderId",
      ])
        next.searchParams.delete(name);
      router
        .replace(`${next.pathname}${next.search}${next.hash}`, undefined, {
          shallow: true,
          scroll: false,
        })
        .catch(() =>
          setError("Impossible d’ouvrir le restaurant sélectionné."),
        );
      return;
    }
    if (!isPush || ready) return;
    let cancelled = false;
    if (!canUsePushModule(targetModule)) {
      setError(
        "Ouvrez cette notification depuis la webapp correspondante. Cette fenêtre appartient à une autre application.",
      );
      return;
    }
    if (router.query.pushModule && router.query.pushModule !== targetModule) {
      setError("Cette notification appartient à une autre application.");
      return;
    }
    if (!targetId) {
      if (!notificationId) {
        setError(
          "Le restaurant de cette ancienne notification ne peut pas être identifié. Retrouvez-la dans les notifications du restaurant concerné.",
        );
        return;
      }
      const token = localStorage.getItem("token");
      axios
        .get(
          `${process.env.NEXT_PUBLIC_API_URL}/push/notifications/${encodeURIComponent(notificationId)}/context`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        )
        .then(({ data }) => {
          if (cancelled) return;
          if (data.module !== targetModule || !data.restaurantId)
            throw new Error("targetModule");
          setResolved({ key, restaurantId: data.restaurantId });
        })
        .catch(() => {
          if (!cancelled)
            setError(
              "Cette notification n’est plus disponible ou vous n’avez pas accès à son restaurant.",
            );
        });
      return () => {
        cancelled = true;
      };
    }
    if (String(restaurantData?._id || "") === targetId) {
      // Remove only routing metadata before the page consumes its deep link.
      router
        .replace(`${cleanPath}${hash}`, undefined, {
          shallow: true,
          scroll: false,
        })
        .then((result) => {
          const cleanedKey = JSON.stringify([
            targetModule,
            null,
            notificationId,
            cleanPath,
          ]);
          if (
            result !== false &&
            [key, cleanedKey].includes(currentDestinationKey.current)
          ) {
            setValidatedDestination({
              key,
              cleanedKey,
              restaurantId: targetId,
            });
          }
        })
        .catch(() => {
          if (!cancelled) setError("Impossible d’ouvrir cette notification.");
        });
      return () => {
        cancelled = true;
      };
    }
    if (!(restaurantsList || []).some((r) => String(r._id) === targetId)) {
      setError("Vous n’avez pas accès au restaurant de cette notification.");
      return;
    }
    if (attempted === key) {
      setError("Impossible de charger le restaurant de cette notification.");
      return;
    }
    setAttempted(key);
    selectRestaurant.current(targetId);
  }, [
    isPush,
    ready,
    router.isReady,
    key,
    targetId,
    notificationId,
    targetModule,
    dataLoading,
    isAuth,
    restaurantData?._id,
    restaurantsList,
    router,
    cleanPath,
    hash,
    attempted,
    validatedContinuation,
    sameValidatedRestaurant,
  ]);

  if (targetModule && !router.isReady) return null;
  if ((!isPush && !validatedContinuation) || ready) return children;
  if (!error || dataLoading || !isAuth) return null;
  return (
    <div role="alert" className="p-6 text-darkBlue">
      <p>{error}</p>
      <button
        className="mt-4 underline"
        onClick={() => {
          const base = router.pathname;
          router.replace(base);
        }}
      >
        Revenir à l’application
      </button>
    </div>
  );
}
