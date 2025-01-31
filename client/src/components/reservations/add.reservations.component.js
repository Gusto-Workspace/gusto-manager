import { useState, useEffect, useContext } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";

// DATE
import { format } from "date-fns";

// I18N
import { useTranslation } from "next-i18next";

// CALENDAR
const Calendar = dynamic(() => import("react-calendar"), { ssr: false });
import "react-calendar/dist/Calendar.css";

// SVG
import { ReservationSvg } from "../_shared/_svgs/reservation.svg";

// AXIOS
import axios from "axios";

export default function AddReservationComponent(props) {
  const { t } = useTranslation("reservations");

  const router = useRouter();

  const [reservationData, setReservationData] = useState({
    reservationDate: new Date(),
    reservationTime: "",
    numberOfGuests: 1,
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    commentary: "",
  });

  const [availableTimes, setAvailableTimes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (props?.restaurantData?.reservations) {
      const selectedDay = reservationData.reservationDate.getDay();
      const dayIndex = selectedDay === 0 ? 6 : selectedDay - 1;
      const parameters = props.restaurantData.reservations.parameters;
      const dayHours = parameters.same_hours_as_restaurant
        ? props.restaurantData.opening_hours[dayIndex]
        : parameters.reservation_hours[dayIndex];

      if (dayHours.isClosed) {
        setAvailableTimes([]);
      } else {
        if (Array.isArray(dayHours.hours) && dayHours.hours.length > 0) {
          const interval = parameters.interval || 30;
          const allAvailableTimes = dayHours.hours.flatMap(({ open, close }) =>
            generateTimeOptions(open, close, interval)
          );
          setAvailableTimes(allAvailableTimes);
        } else {
          setAvailableTimes([]);
        }
      }

      setReservationData((prevData) => ({
        ...prevData,
        reservationTime: "",
      }));

      setIsLoading(false);
    }
  }, [
    reservationData.reservationDate,
    props.restaurantData.opening_hours,
    props.restaurantData.reservations.parameters.reservation_hours,
    props.restaurantData.reservations.parameters.interval,
  ]);

  function generateTimeOptions(openTime, closeTime, interval) {
    const times = [];
    const [openHour, openMinute] = openTime.split(":").map(Number);
    const [closeHour, closeMinute] = closeTime.split(":").map(Number);

    const start = openHour * 60 + openMinute;
    const end = closeHour * 60 + closeMinute;

    const intervalMinutes = parseInt(interval, 10);
    if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
      console.error("Intervalle de réservation invalide :", interval);
      return times;
    }

    for (
      let minutes = start;
      minutes <= end - intervalMinutes;
      minutes += intervalMinutes
    ) {
      const hour = Math.floor(minutes / 60)
        .toString()
        .padStart(2, "0");
      const minute = (minutes % 60).toString().padStart(2, "0");
      times.push(`${hour}:${minute}`);
    }

    return times;
  }

  function handleTimeSelect(reservationTime) {
    setReservationData((prevData) => ({
      ...prevData,
      reservationTime,
    }));
  }

  function formatTimeDisplay(reservationTime) {
    const [hour, minute] = reservationTime.split(":");
    return `${hour}h${minute}`;
  }

  async function handleFormSubmit(e) {
    e.preventDefault();

    const formattedDate = format(reservationData.reservationDate, "yyyy-MM-dd");
    const formattedTime = reservationData.reservationTime;

    const reservation = {
      reservationDate: formattedDate,
      reservationTime: formattedTime,
      numberOfGuests: reservationData.numberOfGuests,
      customerName: reservationData.customerName,
      customerEmail: reservationData.customerEmail,
      customerPhone: reservationData.customerPhone,
      commentary: reservationData.commentary,
      status: "Confirmed",
    };

    try {
      const token = localStorage.getItem("token");

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations`,
        reservation,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Réinitialiser le formulaire
      setReservationData({
        reservationDate: new Date(),
        reservationTime: "",
        numberOfGuests: 1,
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        commentary: "",
      });

      props.setRestaurantData(response.data.restaurant);

      router.push("/reservations");
    } catch (error) {
      console.error("Erreur lors de la création de la réservation :", error);
      setError(
        "Une erreur est survenue lors de la création de la réservation."
      );
    }
  }

  function handleInputChange(e) {
    const { name, value } = e.target;
    setReservationData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  }

  function handleDateChange(selectedDate) {
    setReservationData((prevData) => ({
      ...prevData,
      reservationDate: selectedDate,
    }));
  }

  function handleFormCancel() {
    setReservationData({
      reservationDate: new Date(),
      reservationTime: "",
      numberOfGuests: 1,
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      commentary: "",
    });

    router.push("/reservations");
  }

  function disableClosedDays({ date, view }) {
    if (view !== "month") {
      return false;
    }

    const selectedDay = date.getDay();
    const dayIndex = selectedDay === 0 ? 6 : selectedDay - 1;
    const parameters = props.restaurantData.reservations.parameters;
    const dayHours = parameters.same_hours_as_restaurant
      ? props.restaurantData.opening_hours[dayIndex]
      : parameters.reservation_hours[dayIndex];

    return dayHours.isClosed;
  }

  // Afficher un message d'erreur si nécessaire
  if (isLoading) {
    return (
      <section className="flex items-center justify-center flex-1">
        <p className="italic">Chargement ...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex flex-col items-center justify-center flex-1">
        <p className="text-red text-xl">{error}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-4 flex-wrap justify-between">
        <div className="flex gap-2 items-center min-h-[40px]">
          <ReservationSvg
            width={30}
            height={30}
            className="min-h-[30px] min-w-[30px]"
            fillColor="#131E3690"
          />

          <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
            <span
              className="cursor-pointer hover:underline"
              onClick={() => router.push("/reservations")}
            >
              {t("titles.main")}
            </span>

            <span>/</span>

            <span>{props.menu ? t("buttons.edit") : t("buttons.add")}</span>
          </h1>
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
        {/* Date de réservation */}
        <div>
          <label
            htmlFor="reservationDate"
            className="block text-sm font-medium mb-2"
          >
            {t("form.reservationDate")}
          </label>

          <Calendar
            onChange={handleDateChange}
            value={reservationData.reservationDate}
            minDate={new Date()}
            view="month"
            locale="fr-FR"
            tileDisabled={disableClosedDays}
          />
        </div>

        {/* Sélection de l'heure */}
        <div>
          <label
            htmlFor="reservationTime"
            className="block text-sm font-medium mb-2"
          >
            {t("form.reservationTime")}
          </label>

          {availableTimes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableTimes.map((reservationTime) => (
                <button
                  type="button"
                  key={reservationTime}
                  onClick={() => handleTimeSelect(reservationTime)}
                  className={`px-3 py-1 rounded-md border text-sm ${
                    reservationData.reservationTime === reservationTime
                      ? "bg-blue text-white border-blue"
                      : "bg-white text-black"
                  }`}
                  aria-pressed={
                    reservationData.reservationTime === reservationTime
                  }
                >
                  {formatTimeDisplay(reservationTime)}
                </button>
              ))}
            </div>
          ) : (
            <p className="">{t("messages.closed")}</p>
          )}
        </div>

        {/* Nombre de personnes */}
        <div>
          <label htmlFor="numberOfGuests" className="block text-sm font-medium">
            {t("form.numberOfGuests")}
          </label>
          <input
            type="number"
            id="numberOfGuests"
            name="numberOfGuests"
            min="1"
            value={reservationData.numberOfGuests}
            onChange={handleInputChange}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          />
        </div>

        {/* Nom */}
        <div>
          <label htmlFor="customerName" className="block text-sm font-medium">
            {t("form.customerName")}
          </label>
          <input
            type="text"
            id="customerName"
            name="customerName"
            value={reservationData.customerName}
            onChange={handleInputChange}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="customerEmail" className="block text-sm font-medium">
            {t("form.customerEmail")}
          </label>
          <input
            type="email"
            id="customerEmail"
            name="customerEmail"
            value={reservationData.customerEmail}
            onChange={handleInputChange}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          />
        </div>

        {/* Phone Number */}
        <div>
          <label htmlFor="customerPhone" className="block text-sm font-medium">
            {t("form.customerPhone")}
          </label>
          <input
            type="phone"
            id="customerPhone"
            name="customerPhone"
            value={reservationData.customerPhone}
            onChange={handleInputChange}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          />
        </div>

        {/* Commentary */}
        <div>
          <label htmlFor="commentary" className="block text-sm font-medium">
            {t("form.commentary")}
          </label>
          <textarea
            id="commentary"
            name="commentary"
            value={reservationData.commentary}
            onChange={handleInputChange}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2 resize-none"
          />
        </div>

        {/* Boutons Valider et Annuler */}
        <div className="flex justify-center gap-4 mt-4">
          <button
            type="submit"
            className={`px-4 py-2 rounded-lg bg-blue text-white w-[150px] ${
              !reservationData.reservationTime
                ? "opacity-50 cursor-not-allowed"
                : ""
            }`}
            disabled={!reservationData.reservationTime}
          >
            {t("buttons.validate")}
          </button>

          <button
            type="button"
            onClick={handleFormCancel}
            className="px-4 py-2 rounded-lg bg-red text-white w-[150px]"
          >
            {t("buttons.cancel")}
          </button>
        </div>

        {error && <p className="text-red text-center mt-4">{error}</p>}
      </form>
    </section>
  );
}
