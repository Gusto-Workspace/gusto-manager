import { useRef, useState } from "react";
import axios from "axios";
import { CheckCircle2 } from "lucide-react";
import {
  canShowReservationArrival,
  canSignalReservationArrival,
  formatReservationArrivalTime,
} from "@/_assets/utils/reservation-arrival";
import { CONFIRMED_RESERVATION_TEXT_CLASS } from "./reservation-status.utils";

export default function ReservationArrivalRow({
  reservation,
  restaurantId,
  applyReservationArrival,
  buttonClassName,
  t,
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const isHistory = reservation.status === "Finished" && Boolean(reservation.arrivedAt);
  const hasArrival = isHistory || canShowReservationArrival(reservation);
  if (!hasArrival && !canSignalReservationArrival(reservation)) return null;

  async function updateArrival() {
    if (savingRef.current) return;
    const token = localStorage.getItem("token");
    if (!token) {
      setError(t("arrival.session"));
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setError("");
    try {
      const { data } = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/${reservation._id}/arrival`,
        { arrived: !hasArrival },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      applyReservationArrival?.(data.arrival, restaurantId);
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 401 || status === 403) setError(t("arrival.session"));
      else if (status === 404 || status === 409) setError(t("arrival.ineligible"));
      else setError(t("arrival.error"));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-2 border-t border-darkBlue/10 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span
          role="status"
          className={`inline-flex items-center gap-1.5 text-xs ${hasArrival ? "font-semibold text-darkBlue" : "text-darkBlue/70"}`}
        >
          {hasArrival ? (
            <>
              <CheckCircle2
                aria-hidden="true"
                className={`size-4 shrink-0 ${CONFIRMED_RESERVATION_TEXT_CLASS}`}
              />
              {t(isHistory ? "arrival.history" : "arrival.marked", {
                time: formatReservationArrivalTime(reservation.arrivedAt),
              })}
            </>
          ) : t("arrival.unmarked")}
        </span>
        <button
          type="button"
          aria-disabled={isSaving}
          aria-busy={isSaving}
          onClick={updateArrival}
          className={`${buttonClassName} shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/70 aria-disabled:opacity-60`}
        >
          {t(isSaving ? "arrival.saving" : hasArrival ? "arrival.clear" : "arrival.mark")}
        </button>
      </div>
      {error ? <p role="alert" className="text-xs font-semibold text-red">{error}</p> : null}
    </div>
  );
}
