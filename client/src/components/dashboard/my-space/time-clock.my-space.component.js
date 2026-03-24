import TimeClockSummaryComponent from "../time-clock/summary.time-clock.component";

export default function TimeClockMySpaceComponent({ restaurantId }) {
  return (
    <TimeClockSummaryComponent
      restaurantId={restaurantId}
      selfView={true}
      title="Mes horaires pointés"
      subtitle="Consultez vos heures, vos pauses et l'état actuel de votre journée."
    />
  );
}
