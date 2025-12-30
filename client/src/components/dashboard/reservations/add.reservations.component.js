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
import { ReservationSvg } from "../../_shared/_svgs/reservation.svg";

// AXIOS
import axios from "axios";

// SVG
import {
  CommunitySvg,
  UserSvg,
  EmailSvg,
  PhoneSvg,
  CommentarySvg,
  ClockSvg,
  CalendarSvg,
  TableSvg,
} from "../../_shared/_svgs/_index";

export default function AddReservationComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  const isEditing = !!props.reservation;

  const [reservationData, setReservationData] = useState({
    reservationDate: new Date(),
    reservationTime: "",
    numberOfGuests: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    commentary: "",
    table: "",
  });

  const [availableTimes, setAvailableTimes] = useState([]);
  const [availableTables, setAvailableTables] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fonction pour vérifier si une date est aujourd'hui
  function isToday(date) {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  useEffect(() => {
    // Si nous sommes en mode création (pas en mode édition)
    if (!props.reservation) {
      const manageDisponibilities =
        props.restaurantData?.reservations?.parameters?.manage_disponibilities;
      // Si la gestion des disponibilités est activée, on initialise à "auto"
      // Sinon, on laisse le champ vide.
      setReservationData((prevData) => ({
        ...prevData,
        table: manageDisponibilities ? "auto" : "",
      }));
    }
  }, [props.reservation]);

  // Pré-remplir le formulaire si on est en mode édition
  useEffect(() => {
    if (props.reservation) {
      let tableValue = "";
      const manageDisponibilities =
        props.restaurantData?.reservations?.parameters?.manage_disponibilities;
      if (manageDisponibilities) {
        // Si manage_disponibilities est true, on cherche dans les tables paramétrées celle qui a le même nom
        if (props?.reservation?.table?.name) {
          if (
            props.restaurantData?.reservations?.parameters &&
            Array.isArray(props.restaurantData.reservations.parameters.tables)
          ) {
            const foundTable =
              props.restaurantData.reservations.parameters.tables.find(
                (t) => t.name === props.reservation.table.name
              );
            if (foundTable && foundTable._id) {
              tableValue = foundTable._id.toString();
            }
          }
        }
      } else {
        // Si manage_disponibilities est false, on affiche directement le nom de la table
        if (props.reservation.table && props.reservation.table.name) {
          tableValue = props.reservation.table.name;
        }
      }
      setReservationData({
        reservationDate: props.reservation.reservationDate
          ? new Date(props.reservation.reservationDate)
          : new Date(),
        reservationTime: props.reservation.reservationTime || "",
        numberOfGuests: props.reservation.numberOfGuests || 1,
        customerName: props.reservation.customerName || "",
        customerEmail: props.reservation.customerEmail || "",
        customerPhone: props.reservation.customerPhone || "",
        commentary: props.reservation.commentary || "",
        table: tableValue,
      });
    }
  }, [props.reservation]);

  // Calcul des heures disponibles (avec gestion de la durée et exclusion de la réservation en cours)
  useEffect(() => {
    if (
      !props?.restaurantData?.reservations ||
      !reservationData.reservationDate
    )
      return;

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
        let allAvailableTimes = dayHours.hours.flatMap(({ open, close }) =>
          generateTimeOptions(open, close, interval)
        );

        // Filtrer les créneaux déjà passés si la date sélectionnée est aujourd'hui
        if (isToday(reservationData.reservationDate)) {
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          allAvailableTimes = allAvailableTimes.filter((time) => {
            const [hour, minute] = time.split(":").map(Number);
            const timeInMinutes = hour * 60 + minute;
            return timeInMinutes > currentMinutes;
          });
        }

        // Si l'option manage_disponibilities est activée
        if (parameters.manage_disponibilities) {
          if (reservationData.numberOfGuests) {
            const numGuests = Number(reservationData.numberOfGuests);
            const requiredTableSize =
              numGuests % 2 === 0 ? numGuests : numGuests + 1;
            const formattedSelectedDate = format(
              reservationData.reservationDate,
              "yyyy-MM-dd"
            );

            if (parameters.reservation_duration) {
              const duration = Number(parameters.reservation_duration_minutes);
              allAvailableTimes = allAvailableTimes.filter((time) => {
                const [hour, minute] = time.split(":").map(Number);
                const candidateMinutes = hour * 60 + minute;
                const candidateEnd = candidateMinutes + duration;

                const reservationsForSlot =
                  props.restaurantData.reservations.list.filter(
                    (reservation) => {
                      const resDate = new Date(reservation.reservationDate);
                      const formattedResDate = format(resDate, "yyyy-MM-dd");
                      if (formattedResDate !== formattedSelectedDate)
                        return false;
                      if (
                        !["Confirmed", "Late", "Active"].includes(
                          reservation.status
                        )
                      )
                        return false;
                      if (
                        !reservation.table ||
                        Number(reservation.table.seats) !== requiredTableSize
                      )
                        return false;
                      // Exclure la réservation en cours de modification
                      if (
                        isEditing &&
                        reservation._id === props.reservation._id
                      )
                        return false;
                      const [resHour, resMinute] = reservation.reservationTime
                        .split(":")
                        .map(Number);
                      const reservationStart = resHour * 60 + resMinute;
                      const reservationEnd = reservationStart + duration;
                      return (
                        candidateMinutes < reservationEnd &&
                        candidateEnd > reservationStart
                      );
                    }
                  );
                return (
                  reservationsForSlot.length <
                  parameters.tables.filter(
                    (table) => Number(table.seats) === requiredTableSize
                  ).length
                );
              });
            } else {
              allAvailableTimes = allAvailableTimes.filter((time) => {
                const reservationsForSlot =
                  props.restaurantData.reservations.list.filter(
                    (reservation) => {
                      const resDate = new Date(reservation.reservationDate);
                      const formattedResDate = format(resDate, "yyyy-MM-dd");
                      if (formattedResDate !== formattedSelectedDate)
                        return false;
                      if (reservation.reservationTime !== time) return false;
                      if (
                        !["Confirmed", "Late", "Active"].includes(
                          reservation.status
                        )
                      )
                        return false;
                      if (
                        !reservation.table ||
                        Number(reservation.table.seats) !== requiredTableSize
                      )
                        return false;
                      if (
                        isEditing &&
                        reservation._id === props.reservation._id
                      )
                        return false;
                      return true;
                    }
                  );
                return (
                  reservationsForSlot.length <
                  parameters.tables.filter(
                    (table) => Number(table.seats) === requiredTableSize
                  ).length
                );
              });
            }
          }
        }

        setAvailableTimes(allAvailableTimes);
      } else {
        setAvailableTimes([]);
      }
    }
    setIsLoading(false);
  }, [
    reservationData.reservationDate,
    reservationData.numberOfGuests,
    props.restaurantData.opening_hours,
    props.restaurantData.reservations.parameters.reservation_hours,
    props.restaurantData.reservations.parameters.interval,
    props.restaurantData.reservations.parameters.manage_disponibilities,
    props.restaurantData.reservations.parameters.reservation_duration,
  ]);

  // Calcul des tables disponibles (uniquement si manage_disponibilities est activé)
  useEffect(() => {
    const parameters = props.restaurantData.reservations.parameters;
    if (!parameters.manage_disponibilities) {
      setAvailableTables([]);
      return;
    }
    if (
      !reservationData.numberOfGuests ||
      !reservationData.reservationDate ||
      !reservationData.reservationTime
    ) {
      setAvailableTables([]);
      return;
    }
    const numGuests = Number(reservationData.numberOfGuests);
    const requiredTableSize = numGuests % 2 === 0 ? numGuests : numGuests + 1;
    // Récupérer les tables éligibles
    const eligibleTables = parameters.tables.filter(
      (table) => Number(table.seats) === requiredTableSize
    );

    let duration = 0;
    if (parameters.reservation_duration) {
      duration = Number(parameters.reservation_duration_minutes);
    }

    const formattedSelectedDate = format(
      reservationData.reservationDate,
      "yyyy-MM-dd"
    );
    const [selectedHour, selectedMinute] = reservationData.reservationTime
      .split(":")
      .map(Number);
    const candidateStart = selectedHour * 60 + selectedMinute;
    const candidateEnd = candidateStart + duration;

    const available = eligibleTables.filter((table) => {
      // Pour chaque table éligible, on vérifie qu'aucune réservation existante ne bloque ce créneau.
      const overlappingReservation =
        props.restaurantData.reservations.list.find((reservation) => {
          const resDate = new Date(reservation.reservationDate);
          const formattedResDate = format(resDate, "yyyy-MM-dd");
          if (formattedResDate !== formattedSelectedDate) return false;
          if (!reservation.table) return false;

          // Comparaison des tables : si _id est présent, on compare par _id,
          // sinon on compare par le nom
          if (reservation.table._id) {
            if (reservation.table._id.toString() !== table._id.toString())
              return false;
          } else {
            if (reservation.table.name !== table.name) return false;
          }

          if (isEditing && reservation._id === props.reservation._id)
            return false;

          if (parameters.reservation_duration) {
            const [resHour, resMinute] = reservation.reservationTime
              .split(":")
              .map(Number);
            const reservationStart = resHour * 60 + resMinute;
            const reservationEnd = reservationStart + duration;
            return (
              candidateStart < reservationEnd && candidateEnd > reservationStart
            );
          } else {
            return (
              reservation.reservationTime === reservationData.reservationTime
            );
          }
        });
      return !overlappingReservation;
    });

    setAvailableTables(available);
  }, [
    reservationData.reservationDate,
    reservationData.reservationTime,
    reservationData.numberOfGuests,
    isEditing,
    props.reservation,
  ]);

  // Générer les options d'heures disponibles
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

  // Sélectionner une heure de réservation
  function handleTimeSelect(reservationTime) {
    setReservationData((prevData) => ({
      ...prevData,
      reservationTime,
    }));
  }

  // Formater l'affichage de l'heure
  function formatTimeDisplay(reservationTime) {
    const [hour, minute] = reservationTime.split(":");
    return `${hour}h${minute}`;
  }

  // Gérer les changements dans les champs du formulaire
  function handleInputChange(e) {
    const { name, value } = e.target;
    setReservationData((prevData) => ({
      ...prevData,
      [name]: value,
      ...(name === "numberOfGuests" ? { reservationTime: "" } : {}),
    }));
  }

  // Gérer le changement de date dans le calendrier
  function handleDateChange(selectedDate) {
    setReservationData((prevData) => ({
      ...prevData,
      reservationDate: selectedDate,
      reservationTime: "",
    }));
  }

  // Désactiver les jours fermés dans le calendrier
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

  // Gérer la soumission du formulaire
  async function handleFormSubmit(e) {
    e.preventDefault();

    if (!reservationData.reservationTime) {
      setError(t("errors.selectTime"));
      return;
    }

    setIsSubmitting(true);

    // Copie des données de réservation pour la transformation
    const updatedData = { ...reservationData };

    // Vérifier si en création (non editing) et que la valeur du champ table est "auto"
    if (!isEditing && updatedData.table === "auto") {
      if (
        availableTables &&
        availableTables.length > 0 &&
        availableTables[0] &&
        availableTables[0]._id
      ) {
        updatedData.table = availableTables[0]._id.toString();
      } else {
        updatedData.table = null;
      }
    }

    const formattedDate = format(updatedData.reservationDate, "yyyy-MM-dd");
    const formattedTime = updatedData.reservationTime;

    const reservationPayload = {
      reservationDate: formattedDate,
      reservationTime: formattedTime,
      numberOfGuests: updatedData.numberOfGuests,
      customerName: updatedData.customerName,
      customerEmail: updatedData.customerEmail,
      customerPhone: updatedData.customerPhone,
      commentary: updatedData.commentary,
      table: updatedData.table,
    };

    try {
      const token = localStorage.getItem("token");
      let response;
      if (isEditing) {
        response = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations/${props.reservation._id}`,
          reservationPayload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
      } else {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations`,
          { ...reservationPayload, status: "Confirmed" },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        // Envoyer l'email de confirmation uniquement si un email est renseigné
        if (reservationData.customerEmail) {
          await axios.post("/api/confirm-reservation-email", {
            customerName: reservationData.customerName,
            customerEmail: reservationData.customerEmail,
            reservationDate: format(
              reservationData.reservationDate,
              "dd/MM/yyyy"
            ),
            reservationTime: reservationData.reservationTime,
            numberOfGuests: reservationData.numberOfGuests,
            restaurantName: props.restaurantData.name,
          });
        }
      }

      props.setRestaurantData(response.data.restaurant);
      router.push("/dashboard/reservations");
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Une erreur est survenue lors de la soumission de la réservation."
      );
    } finally {
      // Désactiver le loader
      setIsSubmitting(false);
    }
  }

  // Rendu du composant
  if (isLoading) {
    return (
      <section className="flex items-center justify-center flex-1">
        <p className="italic">{t("messages.loading")}</p>
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
              onClick={() => router.push("/dashboard/reservations")}
            >
              {t("titles.main")}
            </span>
            <span>/</span>
            <span>{isEditing ? t("buttons.edit") : t("buttons.add")}</span>
          </h1>
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="flex flex-col gap-8">
        {/* Nombre de personnes */}
        <div className="flex flex-col gap-4">
          <label
            htmlFor="numberOfGuests"
            className="text-md font-medium flex gap-2"
          >
            <CommunitySvg width={20} height={20} className="opacity-50" />
            {t("labels.add.guests")}
          </label>
          <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-8">
            <input
              type="number"
              id="numberOfGuests"
              name="numberOfGuests"
              value={reservationData.numberOfGuests}
              onWheel={(e) => e.target.blur()}
              onChange={handleInputChange}
              required
              className="h-11 w-full rounded-xl border border-darkBlue/10 bg-white/90 px-3 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30"
            />
          </div>
        </div>

        {/* Date et Heure */}
        <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-8">
          {/* Date de réservation */}
          <div className="flex flex-col gap-4">
            <label
              htmlFor="reservationDate"
              className="text-md font-medium flex gap-2"
            >
              <CalendarSvg width={20} height={20} className="opacity-50" />
              {t("labels.add.date")}
            </label>
            <Calendar
              onChange={handleDateChange}
              value={reservationData.reservationDate}
              view="month"
              locale="fr-FR"
              tileDisabled={disableClosedDays}
              className="drop-shadow-sm"
            />
          </div>

          {/* Sélection de l'heure */}
          <div className="flex flex-col gap-4">
            <label
              htmlFor="reservationTime"
              className="text-md font-medium flex gap-2"
            >
              <ClockSvg width={20} height={20} className="opacity-50" />
              {t("labels.add.time")}
            </label>
            {availableTimes.length > 0 ? (
              <div className="flex flex-wrap gap-4">
                {availableTimes.map((reservationTime) => (
                  <button
                    type="button"
                    key={reservationTime}
                    onClick={() => handleTimeSelect(reservationTime)}
                    disabled={!reservationData.numberOfGuests}
                    className={`px-3 py-1 transition-all duration-200 ease-in-out rounded-md drop-shadow-md text-sm disabled:hover:bg-white disabled:opacity-40 ${
                      reservationData.reservationTime === reservationTime
                        ? "bg-blue text-white border-blue"
                        : "bg-white text-black hover:bg-blue hover:bg-opacity-10"
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
              <p className="">{t("labels.add.close")}</p>
            )}
          </div>
        </div>

        {/* Informations Client et Table */}
        <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-8">
          {/* Nom */}
          <div className="flex flex-col gap-4">
            <label
              htmlFor="customerName"
              className="text-md font-medium flex gap-2"
            >
              <UserSvg width={20} height={20} className="opacity-50" />
              {t("labels.add.name")}
            </label>
            <input
              type="text"
              id="customerName"
              name="customerName"
              value={reservationData.customerName}
              onChange={handleInputChange}
              required
              className="h-11 w-full rounded-xl border border-darkBlue/10 bg-white/90 px-3 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30"
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-4">
            <label
              htmlFor="customerEmail"
              className="text-md font-medium flex items-center gap-2"
            >
              <EmailSvg width={20} height={20} className="opacity-50" />
              {t("labels.add.email")}{" "}
              <span className="text-xs opacity-50 italic">
                {t("labels.optional")}
              </span>
            </label>
            <input
              type="email"
              id="customerEmail"
              name="customerEmail"
              value={reservationData.customerEmail}
              onChange={handleInputChange}
              className="h-11 w-full rounded-xl border border-darkBlue/10 bg-white/90 px-3 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30"
            />
          </div>

          {/* Téléphone */}
          <div className="flex flex-col gap-4">
            <label
              htmlFor="customerPhone"
              className="text-md font-medium flex items-center gap-2"
            >
              <PhoneSvg width={20} height={20} className="opacity-50" />
              {t("labels.add.phone")}
            </label>
            <input
              type="tel"
              id="customerPhone"
              name="customerPhone"
              value={reservationData.customerPhone}
              onChange={handleInputChange}
              required
              className="h-11 w-full rounded-xl border border-darkBlue/10 bg-white/90 px-3 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30"
            />
          </div>

          {/* Champ Table */}
          <div className="flex flex-col gap-4">
            <label
              htmlFor="table"
              className="text-md font-medium flex items-center gap-2"
            >
              <TableSvg width={20} height={20} className="opacity-50" />
              {t("labels.add.table")}
            </label>
            {props.restaurantData.reservations.parameters
              .manage_disponibilities ? (
              <select
                id="table"
                name="table"
                value={reservationData.table}
                onChange={handleInputChange}
                required
                className="h-11 w-full rounded-xl border border-darkBlue/10 bg-white/90 px-3 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30"
              >
                {/* En création, on affiche une option "Automatique" dont la valeur est "auto" */}
                {!isEditing && (
                  <option value="auto">{t("labels.add.automatic")}</option>
                )}
                {availableTables.map((table) => (
                  <option key={table._id} value={table._id}>
                    {table.name ? table.name : `Table de ${table.seats} places`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                id="table"
                name="table"
                value={reservationData.table}
                onChange={handleInputChange}
                className="h-11 w-full rounded-xl border border-darkBlue/10 bg-white/90 px-3 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30"
              />
            )}
          </div>
        </div>

        {/* Commentaire */}
        <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-8">
          <div className="flex flex-col gap-4">
            <label
              htmlFor="commentary"
              className="text-md font-medium flex gap-2"
            >
              <CommentarySvg width={20} height={20} className="opacity-50" />
              {t("labels.add.commentary")}
            </label>
            <textarea
              id="commentary"
              name="commentary"
              value={reservationData.commentary}
              onChange={handleInputChange}
              rows={5}
              className="w-full p-2 rounded-xl border border-darkBlue/10 bg-white/90 px-3 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30 resize-none"
            />
          </div>
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
            disabled={
              !reservationData.reservationTime || isLoading || isSubmitting
            }
          >
            {isSubmitting
              ? t("buttons.loading")
              : isEditing
                ? t("buttons.update")
                : t("buttons.validate")}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/reservations")}
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
