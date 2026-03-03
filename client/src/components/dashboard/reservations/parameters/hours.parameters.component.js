// components/dashboard/webapp/reservations/parameters/hours.parameters.component.jsx
import axios from "axios";
import { CalendarDays } from "lucide-react";
import HoursRestaurantComponent from "../../restaurant/hours.restaurant.component";

export default function HoursParametersComponent({
  // RHF
  register,
  same_hours_as_restaurant,

  // Data
  restaurantId,
  reservationHours,
  setReservationHours,
  setRestaurantData,

  // Context flags
  dataLoading,
  closeEditing,
}) {
  const card = "rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm";
  const cardInner = "px-2 py-4 mobile:p-4 midTablet:p-6";
  const sectionTitle =
    "text-base font-semibold text-darkBlue flex items-center gap-2";
  const hint = "text-sm text-darkBlue/60";
  const divider = "h-px bg-darkBlue/10 my-4";

  const toggleWrap = "inline-flex items-center gap-2 select-none";
  const toggleBase =
    "relative inline-flex h-8 w-14 items-center rounded-full border transition";
  const toggleOn = "bg-blue border-blue/40";
  const toggleOff = "bg-darkBlue/10 border-darkBlue/10";
  const toggleDot =
    "absolute top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white shadow-sm transition";
  const toggleDotOn = "translate-x-7";
  const toggleDotOff = "translate-x-1";

  const inputBase =
    "h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/35 focus:border-blue/60 focus:ring-2 focus:ring-blue/20";
  const selectBase =
    "h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition focus:border-blue/60 focus:ring-2 focus:ring-blue/20";

  const chip =
    "inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-2 text-xs text-darkBlue/60";

  function onReservationHoursChange(data) {
    setReservationHours?.(data.hours);
  }

  // ✅ API call direct dans l’enfant
  async function saveReservationHoursImmediate(newHours) {
    try {
      const token = localStorage.getItem("token");
      if (!restaurantId) return;

      // On ne veut pas écraser tout le parameters ici.
      // On envoie uniquement ce qui est nécessaire.
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/parameters`,
        {
          parameters: {
            same_hours_as_restaurant: false,
            reservation_hours: newHours,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setRestaurantData?.(response.data.restaurant);
      setReservationHours?.(newHours);
    } catch (e) {
      console.error("Erreur sauvegarde heures de réservation :", e);
    }
  }

  return (
    <div className={card}>
      <div className={cardInner}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={sectionTitle}>
              <CalendarDays className="size-4 shrink-0 opacity-60" />
              Heures de réservation
            </p>

            <p className={hint}>
              {same_hours_as_restaurant
                ? "Utilise les horaires du restaurant."
                : "Définis des horaires spécifiques aux réservations."}
            </p>
          </div>

          <label className={toggleWrap}>
            <span
              className={[
                toggleBase,
                same_hours_as_restaurant ? toggleOn : toggleOff,
              ].join(" ")}
            >
              <input
                type="checkbox"
                className="sr-only"
                id="same_hours_as_restaurant"
                {...register("same_hours_as_restaurant")}
              />
              <span
                className={[
                  toggleDot,
                  same_hours_as_restaurant ? toggleDotOn : toggleDotOff,
                ].join(" ")}
              />
            </span>
          </label>
        </div>

        {!same_hours_as_restaurant && (
          <>
            <div className={divider} />
            <HoursRestaurantComponent
              restaurantId={restaurantId}
              dataLoading={dataLoading}
              closeEditing={closeEditing}
              reservations
              reservationHours={reservationHours}
              onChange={onReservationHoursChange}
              onSaveReservationHours={saveReservationHoursImmediate}
            />
          </>
        )}
      </div>
    </div>
  );
}
