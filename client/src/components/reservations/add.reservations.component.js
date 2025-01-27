import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

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

  const [reservationData, setReservationData] = useState({
    date: new Date(),
    time: "",
    numberOfPeople: 1,
    name: "",
    email: "",
  });

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  function generateTimeOptions() {
    const times = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        const formattedHour = hour.toString().padStart(2, "0");
        const formattedMinutes = minutes.toString().padStart(2, "0");
        times.push(`${formattedHour}:${formattedMinutes}`);
      }
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
    });
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

          <h1 className="pl-2 text-xl tablet:text-2xl flex items-center flex-wrap">
            {t("titles.main")} /{" "}
            {props.reservations ? t("buttons.edit") : t("buttons.add")}
          </h1>
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="date" className="block text-sm font-medium mb-2">
            {t("form.date")}
          </label>

          {isClient && (
            <Calendar
              onChange={handleDateChange}
              value={reservationData.date}
              minDate={new Date()}
              view="month"
              locale="fr-FR"
            />
          )}
        </div>

        {/* Sélection de l'heure */}
        <div>
          <label htmlFor="time" className="block text-sm font-medium mb-2">
            {t("form.time")}
          </label>

          <div className="flex flex-wrap gap-2">
            {generateTimeOptions().map((time) => (
              <button
                type="button"
                key={time}
                onClick={() => handleTimeSelect(time)}
                className={`px-3 py-1 rounded-md border text-sm ${
                  reservationData.time === time
                    ? "bg-blue text-white border-blue"
                    : "bg-white text-black border-gray-300 hover:bg-gray-100"
                }`}
                aria-pressed={reservationData.time === time}
              >
                {formatTimeDisplay(time)}
              </button>
            ))}
          </div>
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

        {/* Boutons Valider et Annuler */}
        <div className="flex justify-start gap-4 mt-4">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue text-white"
          >
            {t("buttons.validate")}
          </button>

          <button
            type="button"
            onClick={handleFormCancel}
            className="px-4 py-2 rounded-lg bg-red text-white"
          >
            {t("buttons.cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
