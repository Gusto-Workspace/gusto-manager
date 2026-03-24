import TimeClockSummaryComponent from "../time-clock/summary.time-clock.component";

export default function TimeClockEmployeesComponent({ restaurantId, employeeId }) {
  return (
    <TimeClockSummaryComponent
      restaurantId={restaurantId}
      employeeId={employeeId}
      title="Pointeuse"
      subtitle="Historique, récapitulatifs et signatures des pointages."
      allowOpenKiosk={true}
    />
  );
}
