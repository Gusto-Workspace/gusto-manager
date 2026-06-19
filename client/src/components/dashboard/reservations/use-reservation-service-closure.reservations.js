import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import {
  getNextReservationServiceBoundaryAt,
  getReservationServiceClosureState,
} from "./service-closure.reservations";

export function useReservationServiceClosure({
  restaurantData,
  setRestaurantData,
}) {
  const [serviceClock, setServiceClock] = useState(() => Date.now());
  const [serviceFullSaving, setServiceFullSaving] = useState(false);
  const [serviceFullError, setServiceFullError] = useState("");

  const serviceClosureState = useMemo(
    () =>
      getReservationServiceClosureState(restaurantData, new Date(serviceClock)),
    [restaurantData, serviceClock],
  );

  useEffect(() => {
    const now = new Date();
    const boundary = getNextReservationServiceBoundaryAt(restaurantData, now);
    const untilBoundary = boundary
      ? boundary.getTime() - now.getTime() + 100
      : 60 * 1000;
    const delay = Math.min(Math.max(untilBoundary, 250), 60 * 1000);

    const timer = window.setTimeout(() => {
      setServiceClock(Date.now());
    }, delay);

    return () => window.clearTimeout(timer);
  }, [restaurantData, serviceClock]);

  const handleToggleServiceFull = useCallback(
    async (nextActive) => {
      if (
        serviceFullSaving ||
        serviceClosureState.automatic ||
        !serviceClosureState.currentService ||
        !restaurantData?._id
      ) {
        return;
      }

      try {
        setServiceFullSaving(true);
        setServiceFullError("");

        const token = localStorage.getItem("token");
        const response = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantData._id}/reservations/parameters`,
          {
            parameters: {
              manual_service_full_until: nextActive
                ? serviceClosureState.currentService.endAt.toISOString()
                : null,
            },
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );

        setRestaurantData?.(response.data.restaurant);
        setServiceClock(Date.now());
      } catch (toggleError) {
        setServiceFullError(
          toggleError?.response?.data?.message ||
            "Impossible de modifier la fermeture du service.",
        );
      } finally {
        setServiceFullSaving(false);
      }
    },
    [
      restaurantData?._id,
      serviceClosureState,
      serviceFullSaving,
      setRestaurantData,
    ],
  );

  return {
    serviceClosureState,
    serviceFullSaving,
    serviceFullError,
    handleToggleServiceFull,
  };
}
