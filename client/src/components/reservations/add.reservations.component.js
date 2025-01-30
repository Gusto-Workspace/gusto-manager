import { useState, useEffect } from "react";
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

export default function AddReservationComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  const [reservationData, setReservationData] = useState({
    date: new Date(),
    time: "",
    numberOfPeople: 1,
    name: "",
    email: "",
    phoneNumber: "",
    commentary: "",
  });

  const [availableTimes, setAvailableTimes] = useState([]);

  useEffect(() => {
    if (props?.restaurantData?.reservations) {
      const selectedDay = reservationData.date.getDay();
      const dayIndex = selectedDay === 0 ? 6 : selectedDay - 1;
      const dayHours = props.restaurantData.reservations.parameters
        .same_hours_as_restaurant
        ? props.restaurantData.opening_hours[dayIndex]
        : props.restaurantData.reservations.parameters.reservation_hours[
            dayIndex
          ];

      if (dayHours.isClosed) {
        setAvailableTimes([]);
      } else {
        if (Array.isArray(dayHours.hours) && dayHours.hours.length > 0) {
          const allAvailableTimes = dayHours.hours.flatMap(({ open, close }) =>
            generateTimeOptions(open, close)
          );
          setAvailableTimes(allAvailableTimes);
        } else {
          setAvailableTimes([]);
        }
      }

      setReservationData((prevData) => ({
        ...prevData,
        time: "",
      }));
    }
  }, [
    reservationData.date,
    props.restaurantData.opening_hours,
    props.restaurantData.reservations.parameters.reservation_hours,
  ]);

  function generateTimeOptions(openTime, closeTime) {
    const times = [];
    const [openHour, openMinute] = openTime.split(":").map(Number);
    const [closeHour, closeMinute] = closeTime.split(":").map(Number);

    const start = openHour * 60 + openMinute;
    const end = closeHour * 60 + closeMinute;

    for (
      let minutes = start;
      minutes <= end - props.restaurantData.reservations.parameters.interval;
      minutes += props.restaurantData.reservations.parameters.interval
    ) {
      const hour = Math.floor(minutes / 60)
        .toString()
        .padStart(2, "0");
      const minute = (minutes % 60).toString().padStart(2, "0");
      times.push(`${hour}:${minute}`);
    }

    return times;
  }

  function handleTimeSelect(time) {
    setReservationData((prevData) => ({
      ...prevData,
      time,
    }));
  }

  function formatTimeDisplay(time) {
    const [hour, minute] = time.split(":");
    return `${hour}h${minute}`;
  }

  function handleFormSubmit(e) {
    e.preventDefault();

    const formattedDate = format(reservationData.date, "yyyy-MM-dd");
    const formattedTime = reservationData.time;

    const reservation = {
      ...reservationData,
      date: formattedDate,
      time: formattedTime,
    };

    console.log("Données de la réservation :", reservation);

    setReservationData({
      date: new Date(),
      time: "",
      numberOfPeople: 1,
      name: "",
      email: "",
      phoneNumber: "",
      commentary: "",
    });
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
      date: selectedDate,
    }));
  }

  function handleFormCancel() {
    setReservationData({
      date: new Date(),
      time: "",
      numberOfPeople: 1,
      name: "",
      email: "",
      phoneNumber: "",
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
    const dayHours = props.restaurantData.reservations.parameters
      .same_hours_as_restaurant
      ? props.restaurantData.opening_hours[dayIndex]
      : props.restaurantData.reservations.parameters.reservation_hours[dayIndex];

    return dayHours.isClosed;
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
        <div>
          <label htmlFor="date" className="block text-sm font-medium mb-2">
            {t("form.date")}
          </label>

          <Calendar
            onChange={handleDateChange}
            value={reservationData.date}
            minDate={new Date()}
            view="month"
            locale="fr-FR"
            tileDisabled={disableClosedDays}
          />
        </div>

        {/* Sélection de l'heure */}
        <div>
          <label htmlFor="time" className="block text-sm font-medium mb-2">
            {t("form.time")}
          </label>

          {availableTimes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableTimes.map((time) => (
                <button
                  type="button"
                  key={time}
                  onClick={() => handleTimeSelect(time)}
                  className={`px-3 py-1 rounded-md border text-sm ${
                    reservationData.time === time
                      ? "bg-blue text-white border-blue"
                      : "bg-white text-black"
                  }`}
                  aria-pressed={reservationData.time === time}
                >
                  {formatTimeDisplay(time)}
                </button>
              ))}
            </div>
          ) : (
            <p className="">{t("messages.closed")}</p>
          )}
        </div>

        {/* Nombre de personnes */}
        <div>
          <label htmlFor="numberOfPeople" className="block text-sm font-medium">
            {t("form.numberOfPeople")}
          </label>
          <input
            type="number"
            id="numberOfPeople"
            name="numberOfPeople"
            min="1"
            value={reservationData.numberOfPeople}
            onChange={handleInputChange}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          />
        </div>

        {/* Nom */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            {t("form.name")}
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={reservationData.name}
            onChange={handleInputChange}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            {t("form.email")}
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={reservationData.email}
            onChange={handleInputChange}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          />
        </div>

        {/* Phone Number */}
        <div>
          <label htmlFor="phoneNumber" className="block text-sm font-medium">
            {t("form.phoneNumber")}
          </label>
          <input
            type="phone"
            id="phoneNumber"
            name="phoneNumber"
            value={reservationData.phoneNumber}
            onChange={handleInputChange}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          />
        </div>

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
              !reservationData.time ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={!reservationData.time}
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
      </form>
    </section>
  );
}
