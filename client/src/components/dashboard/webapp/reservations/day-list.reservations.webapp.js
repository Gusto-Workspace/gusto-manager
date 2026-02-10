// I18N
import { useTranslation } from "next-i18next";
import { useMemo, useState } from "react";

// COMPONENTS
import CardReservationWebapp from "./card.reservations.webapp";
import BottomSheetReservationsWebapp from "./bottom-sheet-details.reservations.webapp";

export default function DayListReservationsWebapp(props) {
  const { t } = useTranslation("reservations");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [actionError, setActionError] = useState("");

  const list = props?.dayData?.byStatus?.[props.activeDayTab] || [];

  const openDetails = (reservation) => {
    setSelectedReservation(reservation);
    setActionError("");
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
  };

  // Actions depuis le drawer
  const handleDrawerAction = async (reservation, actionType) => {
    setActionError("");
    if (!reservation) return;

    // ✅ interdit d'édit une canceled
    if (actionType === "edit" && reservation.status === "Canceled") {
      setActionError(
        "Impossible de modifier une réservation annulée. Repasse-la en confirmée d’abord.",
      );
      return; // ✅ drawer reste ouvert, message dedans
    }

    // ✅ restore canceled -> confirmed (avec vérif backend)
    if (actionType === "restore_confirmed") {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setActionError("Session expirée. Reconnecte-toi.");
          return; // ✅ drawer reste ouvert
        }

        const rid =
          reservation.restaurant_id ||
          props?.restaurantId ||
          props?.dayData?.restaurantId;

        if (!rid) {
          setActionError("Restaurant introuvable (rid manquant).");
          return; // ✅ drawer reste ouvert
        }

        await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/reservations/${reservation._id}/status`,
          { status: "Confirmed" },
          { headers: { Authorization: `Bearer ${token}` } },
        );

        // ✅ succès -> on peut fermer (SSE met à jour)
        setDetailsOpen(false);
        return;
      } catch (e) {
        // ✅ slot plus dispo -> afficher DANS le drawer
        const msg =
          e?.response?.status === 409
            ? "Le créneau n’est plus disponible."
            : "Erreur lors de la remise en confirmé.";
        setActionError(msg);
        return; // ✅ drawer reste ouvert
      }
    }

    if (actionType === "edit") {
      setDetailsOpen(false);
      props.handleEditClick(reservation);
      return;
    }

    setDetailsOpen(false);
    props.openModalForAction(reservation, actionType);
  };

  // ✅ Memo safe (même si list est vide)
  const { orderedTimes, byTime } = useMemo(() => {
    const map = {};
    list.forEach((r) => {
      const tkey = String(r.reservationTime || "--:--").slice(0, 5);
      if (!map[tkey]) map[tkey] = [];
      map[tkey].push(r);
    });

    const times = Object.keys(map).sort((a, b) => a.localeCompare(b));
    return { orderedTimes: times, byTime: map };
  }, [list]);

  if (!props.selectedDay) return null;

  const isEmpty = orderedTimes.length === 0;

  return (
    <>
      <div className="flex flex-col gap-6">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-semibold text-darkBlue/70">
              Auncune réservation ce jour-là
            </p>
          </div>
        ) : (
          orderedTimes.map((time) => (
            <div key={time} className="flex flex-col gap-3">
              <div className="relative flex items-center gap-3">
                <div className="h-px flex-1 bg-darkBlue/10" />

                <div className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white shadow-sm px-4 py-1.5">
                  <span className="text-sm font-semibold text-darkBlue tracking-wide">
                    {time}
                  </span>
                  <span className="h-4 w-px bg-darkBlue/10" />
                  <span className="text-xs text-darkBlue/60">
                    {byTime[time].length}
                  </span>
                </div>

                <div className="h-px flex-1 bg-darkBlue/10" />
              </div>

              <ul className="flex flex-col gap-2">
                {byTime[time].map((reservation) => (
                  <CardReservationWebapp
                    key={reservation._id}
                    reservation={reservation}
                    openModalForAction={props.openModalForAction}
                    handleEditClick={props.handleEditClick}
                    onOpenDetails={openDetails}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <BottomSheetReservationsWebapp
        open={detailsOpen}
        onClose={closeDetails}
        reservation={selectedReservation}
        t={t}
        onAction={handleDrawerAction}
        errorMessage={actionError}
      />
    </>
  );
}
