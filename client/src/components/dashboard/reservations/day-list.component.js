// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import CardReservationComponent from "./card.reservations.component";

export default function DayListComponent(props) {
  const { t } = useTranslation("reservations");
  if (!props.selectedDay) return null;

  const list = props.dayData.byStatus[props.activeDayTab] || [];

  if (!list.length) {
    return (
      <div className="p-6 bg-white bg-opacity-70 drop-shadow-sm rounded-lg w-full mx-auto text-center">
        <p className="italic">{t("list.card.empty")}</p>
      </div>
    );
  }

  // groupe par HH:mm pour séparateurs simples (optionnel)
  const byTime = {};
  list.forEach((r) => {
    const tkey = String(r.reservationTime || "--:--").slice(0, 5);
    if (!byTime[tkey]) byTime[tkey] = [];
    byTime[tkey].push(r);
  });
  const orderedTimes = Object.keys(byTime).sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-6">
      {orderedTimes.map((time) => (
        <div key={time} className="flex flex-col gap-3">
          <div className="relative">
            <h3 className="relative flex gap-2 items-center text-sm font-semibold w-fit px-4 mx-auto text-center uppercase bg-lightGrey z-20">
              {time}{" "}
              <span className="text-xs opacity-60">
                ({byTime[time].length})
              </span>
            </h3>
            <hr className="text-darkBlue/20 absolute h-[1px] w-full left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10" />
          </div>

          <ul className="grid grid-cols-1 midTablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-4 gap-4">
            {byTime[time].map((reservation) => (
              <CardReservationComponent
                key={reservation._id}
                reservation={reservation}
                openModalForAction={props.openModalForAction}
                handleEditClick={props.handleEditClick}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
