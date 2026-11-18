import { useCallback, useEffect, useMemo, useState } from "react";
import { getReservationServiceClock } from "@/_assets/utils/reservation-service-time";

export default function useFloorPlanClock(enabled = true) {
  const [now, setNow] = useState(() => new Date());
  const refreshClock = useCallback(() => setNow(new Date()), []);

  useEffect(() => {
    if (!enabled) return;
    refreshClock();
    const timer = window.setInterval(refreshClock, 15000);
    return () => window.clearInterval(timer);
  }, [enabled, refreshClock]);

  return useMemo(
    () => ({ ...getReservationServiceClock(now), refreshClock }),
    [now, refreshClock],
  );
}
