export default function ReservationsPeriodLoadingComponent() {
  return (
    <div
      className="animate-pulse rounded-2xl border border-darkBlue/10 bg-white/70 p-4"
      role="status"
      aria-label="Chargement des réservations"
    >
      <div className="mb-4 h-5 w-44 rounded bg-darkBlue/10" />
      <div className="grid grid-cols-2 gap-2 tablet:grid-cols-4 midTablet:grid-cols-7">
        {Array.from({ length: 28 }).map((_, index) => (
          <div
            key={index}
            className="h-20 rounded-xl bg-darkBlue/5 tablet:h-24"
          />
        ))}
      </div>
      <span className="sr-only">Chargement des réservations…</span>
    </div>
  );
}
