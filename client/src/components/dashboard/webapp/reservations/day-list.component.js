// I18N
import { useTranslation } from "next-i18next";
import { useMemo, useState } from "react";

// COMPONENTS
import CardReservationComponent from "./card.reservations.component";
import DetailsDrawerReservationsComponent from "./details-drawer.reservations.component";

export default function DayListComponent(props) {
  const { t } = useTranslation("reservations");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);

  const list = props?.dayData?.byStatus?.[props.activeDayTab] || [];

  const openDetails = (reservation) => {
    setSelectedReservation(reservation);
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
  };

  // Actions depuis le drawer
  const handleDrawerAction = (reservation, actionType) => {
    setDetailsOpen(false);
    if (!reservation) return;

    if (actionType === "edit") {
      props.handleEditClick(reservation);
      return;
    }

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

  return (
    <>
      <div className="flex flex-col gap-6">
        {orderedTimes.map((time) => (
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
                <CardReservationComponent
                  key={reservation._id}
                  reservation={reservation}
                  openModalForAction={props.openModalForAction}
                  handleEditClick={props.handleEditClick}
                  onOpenDetails={openDetails}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <DetailsDrawerReservationsComponent
        open={detailsOpen}
        onClose={closeDetails}
        reservation={selectedReservation}
        t={t}
        onAction={handleDrawerAction}
      />
    </>
  );
}
