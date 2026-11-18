import { CheckCircle2 } from "lucide-react";
import {
  canShowReservationArrival,
  formatReservationArrivalTime,
} from "@/_assets/utils/reservation-arrival";
import { CONFIRMED_RESERVATION_TEXT_CLASS } from "./reservation-status.utils";

export default function ReservationArrivalIndicator({ reservation, t }) {
  if (!canShowReservationArrival(reservation)) return null;

  const label = t("arrival.indicator", {
    time: formatReservationArrivalTime(reservation.arrivedAt),
  });
  return (
    <span className={`inline-flex shrink-0 ${CONFIRMED_RESERVATION_TEXT_CLASS}`} title={label}>
      <CheckCircle2 aria-hidden="true" className="size-4" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
