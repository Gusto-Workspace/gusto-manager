import { STATUS_ORDER, toDateKey } from "./take-away.utils";

function getStatusBarColor(status) {
  if (status === "completed") return "#22c55e";
  if (status === "canceled" || status === "rejected") return "#ff7664";
  if (status === "pending") return "#93c5fd";
  if (status === "ready") return "#f59e0b";
  return "#3b82f6";
}

export default function CalendarMonthTakeAwayComponent({
  monthGridDays,
  selectedDay,
  setSelectedDay,
}) {
  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="flex flex-col gap-3 midTablet:mt-6">
      <div className="grid grid-cols-7 gap-1 text-center text-sm opacity-70 midTablet:gap-2">
        {weekDays.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 midTablet:gap-2">
        {monthGridDays.map((d) => {
          const isToday = toDateKey(d.date) === toDateKey(new Date());
          const isSelected =
            selectedDay && toDateKey(d.date) === toDateKey(selectedDay);
          const displayTotal = d.total;

          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setSelectedDay(new Date(d.date))}
              className={`relative rounded-md p-1 text-left transition midTablet:rounded-xl midTablet:p-2 ${
                d.inMonth
                  ? "border border-[#131E3615] bg-white/80"
                  : "border-transparent bg-white/60 opacity-60"
              } ${isSelected ? "outline outline-2 outline-[#131E36]" : ""}`}
              aria-label={`Ouvrir le ${d.date.toLocaleDateString("fr-FR")}`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`text-sm ${isToday ? "font-bold text-blue" : ""}`}
                >
                  {d.date.getDate()}
                </div>
                {displayTotal > 0 ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-[#131E3612] px-1 py-0 text-xs midTablet:right-2 midTablet:top-auto midTablet:px-2 midTablet:py-0.5">
                    {displayTotal}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 space-y-1">
                {STATUS_ORDER.slice(0, 6).map((status) => {
                  const value = d.byStatus[status] || 0;
                  const pct = displayTotal
                    ? Math.round((value / displayTotal) * 100)
                    : 0;
                  return (
                    <div
                      key={status}
                      className="h-1 w-full overflow-hidden rounded bg-[#131E3612]"
                    >
                      <div
                        className="h-1"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: getStatusBarColor(status),
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
