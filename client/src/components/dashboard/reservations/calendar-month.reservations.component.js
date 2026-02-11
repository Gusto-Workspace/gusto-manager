export default function CalendarMonthReservationsComponent(props) {
  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  return (
    <div className="flex flex-col gap-3 midTablet:mt-6">
      {/* en-têtes jours de semaine */}
      <div className="grid grid-cols-7 gap-1 midTablet:gap-2 text-center text-sm opacity-70">
        {weekDays.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      {/* grille jours */}
      <div className="grid grid-cols-7 gap-1 midTablet:gap-2">
        {props.monthGridDays.map((d) => {
          const isToday =
            props.toDateKey(d.date) === props.toDateKey(new Date());
          const isSelected =
            props.selectedDay &&
            props.toDateKey(d.date) === props.toDateKey(props.selectedDay);

          const baseInMonth = d.inMonth
            ? "bg-white/80 border border-[#131E3615]"
            : "bg-white/60 border-transparent opacity-60";

          const selectedOutline = isSelected
            ? " outline outline-2 outline-[#131E36]"
            : "";

          const isSearching = !!props.searchTerm.trim();

          const displayTotal = isSearching ? d.matchTotal : d.total;
          const displayByStatus = isSearching ? d.matchByStatus : d.byStatus;

          return (
            <button
              key={d.key}
              onClick={() => {
                props.setSelectedDay(new Date(d.date));
                props.setActiveDayTab("All");
              }}
              className={`relative p-1 midTablet:p-2 rounded-md midTablet:rounded-xl text-left transition ${baseInMonth}${selectedOutline}`}
              aria-label={`Ouvrir le ${d.date.toLocaleDateString("fr-FR")}`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`text-sm ${isToday ? "font-bold text-blue" : ""}`}
                >
                  {d.date.getDate()}
                </div>

                {displayTotal > 0 && (
                  <span className="text-xs px-1 py-0 midTablet:px-2 midTablet:py-0.5 rounded-full bg-[#131E3612] absolute -top-1 -right-1 midTablet:flex midTablet:top-auto midTablet:right-2">
                    {displayTotal}
                  </span>
                )}
              </div>

              <div className="mt-2 space-y-1">
                {props.statusList.map((s) => {
                  const pct = displayTotal
                    ? Math.round((displayByStatus[s] / displayTotal) * 100)
                    : 0;

                  return (
                    <div
                      key={s}
                      className="h-1 w-full rounded bg-[#131E3612] overflow-hidden"
                    >
                      <div
                        className="h-1"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            s === "Late"
                              ? "#FF914D"
                              : s === "Active"
                                ? "#22c55e"
                                : s === "Confirmed"
                                  ? "#3b82f6"
                                  : s === "Pending"
                                    ? "#93c5fd"
                                    : s === "Canceled"
                                      ? "#ff7664"
                                      : "#cbd5e1",
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
