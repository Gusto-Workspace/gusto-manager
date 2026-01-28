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

// LUCIDE
import { Loader2, Save, X, ChevronLeft } from "lucide-react";

export default function AddReservationComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  const isEditing = !!props.reservation;

  const subtitle = isEditing
    ? t("buttons.edit", "Modifier une réservation")
    : t("buttons.add", "Ajouter une réservation");

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

  function isToday(date) {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  useEffect(() => {
    if (!props.reservation) {
      const manageDisponibilities =
        props.restaurantData?.reservations?.parameters?.manage_disponibilities;

      setReservationData((prevData) => ({
        ...prevData,
        table: manageDisponibilities ? "auto" : "",
      }));
    }
  }, [props.reservation, props.restaurantData]);

  useEffect(() => {
    if (props.reservation) {
      let tableValue = "";
      const manageDisponibilities =
        props.restaurantData?.reservations?.parameters?.manage_disponibilities;

      if (manageDisponibilities) {
        if (props?.reservation?.table?.name) {
          if (
            props.restaurantData?.reservations?.parameters &&
            Array.isArray(props.restaurantData.reservations.parameters.tables)
          ) {
            const foundTable =
              props.restaurantData.reservations.parameters.tables.find(
                (t) => t.name === props.reservation.table.name,
              );
            if (foundTable && foundTable._id) {
              tableValue = foundTable._id.toString();
            }
          }
        }
      } else {
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
  }, [props.reservation, props.restaurantData]);

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
          generateTimeOptions(open, close, interval),
        );

        if (isToday(reservationData.reservationDate)) {
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          allAvailableTimes = allAvailableTimes.filter((time) => {
            const [hour, minute] = time.split(":").map(Number);
            const timeInMinutes = hour * 60 + minute;
            return timeInMinutes > currentMinutes;
          });
        }

        if (parameters.manage_disponibilities) {
          if (reservationData.numberOfGuests) {
            const numGuests = Number(reservationData.numberOfGuests);
            const requiredTableSize =
              numGuests % 2 === 0 ? numGuests : numGuests + 1;
            const formattedSelectedDate = format(
              reservationData.reservationDate,
              "yyyy-MM-dd",
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
                          reservation.status,
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

                      const [resHour, resMinute] = reservation.reservationTime
                        .split(":")
                        .map(Number);
                      const reservationStart = resHour * 60 + resMinute;
                      const reservationEnd = reservationStart + duration;

                      return (
                        candidateMinutes < reservationEnd &&
                        candidateEnd > reservationStart
                      );
                    },
                  );

                return (
                  reservationsForSlot.length <
                  parameters.tables.filter(
                    (table) => Number(table.seats) === requiredTableSize,
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
                          reservation.status,
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
                    },
                  );

                return (
                  reservationsForSlot.length <
                  parameters.tables.filter(
                    (table) => Number(table.seats) === requiredTableSize,
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
    props.restaurantData.reservations.parameters.reservation_duration_minutes,
    props.restaurantData.reservations.parameters.same_hours_as_restaurant,
    props.restaurantData.reservations.parameters.tables,
    props.restaurantData.reservations.list,
    isEditing,
    props.reservation,
  ]);

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

    const eligibleTables = parameters.tables.filter(
      (table) => Number(table.seats) === requiredTableSize,
    );

    let duration = 0;
    if (parameters.reservation_duration) {
      duration = Number(parameters.reservation_duration_minutes);
    }

    const formattedSelectedDate = format(
      reservationData.reservationDate,
      "yyyy-MM-dd",
    );
    const [selectedHour, selectedMinute] = reservationData.reservationTime
      .split(":")
      .map(Number);
    const candidateStart = selectedHour * 60 + selectedMinute;
    const candidateEnd = candidateStart + duration;

    const available = eligibleTables.filter((table) => {
      const overlappingReservation =
        props.restaurantData.reservations.list.find((reservation) => {
          const resDate = new Date(reservation.reservationDate);
          const formattedResDate = format(resDate, "yyyy-MM-dd");
          if (formattedResDate !== formattedSelectedDate) return false;
          if (!reservation.table) return false;

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
    props.restaurantData.reservations.list,
    props.restaurantData.reservations.parameters,
  ]);

  function generateTimeOptions(openTime, closeTime, interval) {
    const times = [];
    const [openHour, openMinute] = openTime.split(":").map(Number);
    const [closeHour, closeMinute] = closeTime.split(":").map(Number);

    const start = openHour * 60 + openMinute;
    const end = closeHour * 60 + closeMinute;

    const intervalMinutes = parseInt(interval, 10);
    if (isNaN(intervalMinutes) || intervalMinutes <= 0) return times;

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

  function handleDateChange(selectedDate) {
    setReservationData((prevData) => ({
      ...prevData,
      reservationDate: selectedDate,
      reservationTime: "",
    }));
  }

  function disableClosedDays({ date, view }) {
    if (view !== "month") return false;

    const selectedDay = date.getDay();
    const dayIndex = selectedDay === 0 ? 6 : selectedDay - 1;
    const parameters = props.restaurantData.reservations.parameters;
    const dayHours = parameters.same_hours_as_restaurant
      ? props.restaurantData.opening_hours[dayIndex]
      : parameters.reservation_hours[dayIndex];

    return dayHours.isClosed;
  }

  function handleInputChange(e) {
    const { name, value } = e.target;
    setReservationData((prevData) => ({
      ...prevData,
      [name]: value,
      ...(name === "numberOfGuests" ? { reservationTime: "" } : {}),
    }));
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!reservationData.reservationTime) {
      setError(t("errors.selectTime"));
      return;
    }

    setIsSubmitting(true);

    const updatedData = { ...reservationData };

    if (!isEditing && updatedData.table === "auto") {
      if (availableTables?.[0]?._id) {
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
          },
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
          },
        );

        if (reservationData.customerEmail) {
          await axios.post("/api/confirm-reservation-email", {
            customerName: reservationData.customerName,
            customerEmail: reservationData.customerEmail,
            reservationDate: format(
              reservationData.reservationDate,
              "dd/MM/yyyy",
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
          "Une erreur est survenue lors de la soumission de la réservation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function formatTimeDisplay(reservationTime) {
    const [hour, minute] = reservationTime.split(":");
    return `${hour}h${minute}`;
  }

  function handleTimeSelect(reservationTime) {
    setReservationData((prevData) => ({
      ...prevData,
      reservationTime,
    }));
  }

  const manageDisponibilities =
    props.restaurantData?.reservations?.parameters?.manage_disponibilities;

  const canPickTime = Boolean(reservationData.numberOfGuests);
  const canSubmit = Boolean(reservationData.reservationTime) && !isSubmitting;

  const reservationDateLabel = reservationData?.reservationDate
    ? new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(reservationData.reservationDate)
    : "";

  if (isLoading) {
    return (
      <section className="flex items-center justify-center flex-1">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue/70">
          <Loader2 className="size-4 animate-spin" />
          <span className="italic">{t("messages.loading")}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {/* =========================
          ✅ MOBILE HEADER (copie du style DayHeader)
          ========================= */}
      <div className="midTablet:hidden safe-top bg-lightGrey">
        <div className="flex items-center justify-between gap-3 h-[50px]">
          {/* Left: back */}
          <button
            onClick={() => router.push("/dashboard/reservations")}
            className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-2"
            aria-label={t("calendar.back", "Retour au calendrier")}
            title={t("calendar.back", "Retour au calendrier")}
          >
            <ChevronLeft className="size-5 text-darkBlue/70" />
          </button>

          {/* Center: title + subtitle */}
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <ReservationSvg
              width={26}
              height={26}
              className="min-h-[26px] min-w-[26px]"
              fillColor="#131E3690"
            />

            <div className="min-w-0">
              <p className="text-xl font-semibold text-darkBlue truncate">
                {t("titles.main")}
              </p>
              <p className="text-sm text-darkBlue/50 truncate">
                {subtitle}
                {reservationDateLabel ? ` · ${reservationDateLabel}` : ""}
              </p>
            </div>
          </div>

          {/* Right: placeholder (pour garder le centrage visuel) */}
          <div className="shrink-0 w-[40px]" />
        </div>
      </div>

      {/* =========================
          ✅ midTablet+ (header desktop)
          ========================= */}
      <hr className="opacity-20 hidden midTablet:block" />

      <div className="hidden midTablet:flex items-center justify-between gap-4 flex-wrap">
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
            <span className="text-darkBlue/30 select-none">/</span>
            <span className="font-semibold">{subtitle}</span>
          </h1>
        </div>

        <button
          type="button"
          onClick={() => router.push("/dashboard/reservations")}
          className="inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-4 py-2 text-sm font-semibold text-darkBlue"
        >
          <ChevronLeft className="size-4 text-darkBlue/60" />
          {t("buttons.cancel")}
        </button>
      </div>

      {/* =========================
          ✅ FORM (inchangé)
          ========================= */}
      <form onSubmit={handleFormSubmit} className="flex flex-col gap-8">
        {/* 1) Nombre de personnes */}
        <div className="w-full midTablet:max-w-[550px] rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 text-base font-semibold text-darkBlue">
              <CommunitySvg width={20} height={20} className="opacity-50" />
              <span>{t("labels.add.guests")}</span>
            </div>
            <span className="text-xs text-darkBlue/50">
              {t("messages.guestsHint", "Étape 1")}
            </span>
          </div>

          <div className="w-full mt-4 grid grid-cols-1">
            <input
              type="number"
              id="numberOfGuests"
              name="numberOfGuests"
              value={reservationData.numberOfGuests}
              onWheel={(e) => e.target.blur()}
              onChange={handleInputChange}
              required
              className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
            />
          </div>
        </div>

        {/* 2) Date */}
        <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 text-base font-semibold text-darkBlue">
              <CalendarSvg width={20} height={20} className="opacity-50" />
              <span>{t("labels.add.date")}</span>
            </div>
            <span className="text-xs text-darkBlue/50">
              {t("messages.dateHintStep", "Étape 2")}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-darkBlue/10 bg-white/80 p-2">
            <Calendar
              onChange={handleDateChange}
              value={reservationData.reservationDate}
              view="month"
              locale="fr-FR"
              tileDisabled={disableClosedDays}
              className="drop-shadow-sm"
            />
          </div>
        </div>

        {/* 3) Créneau */}
        <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 text-base font-semibold text-darkBlue">
              <ClockSvg width={20} height={20} className="opacity-50" />
              <span>{t("labels.add.time")}</span>
            </div>
            <span className="text-xs text-darkBlue/50">
              {t("messages.timeHintStep", "Étape 3")}
            </span>
          </div>

          <div className="mt-4">
            {!canPickTime ? (
              <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 text-sm text-darkBlue/60">
                {t(
                  "messages.guestsFirst",
                  "Renseignez d’abord le nombre de personnes pour voir les créneaux.",
                )}
              </div>
            ) : availableTimes.length > 0 ? (
              <div className="grid grid-cols-5 midTablet:grid-cols-6 gap-2">
                {availableTimes.map((reservationTime) => {
                  const selected =
                    reservationData.reservationTime === reservationTime;
                  return (
                    <button
                      type="button"
                      key={reservationTime}
                      onClick={() => handleTimeSelect(reservationTime)}
                      className={[
                        "inline-flex items-center justify-center",
                        "h-10 px-4 rounded-lg midTablet:rounded-xl text-sm font-semibold",
                        "border transition",
                        selected
                          ? "bg-blue text-white border-blue shadow-sm"
                          : "bg-white/80 text-darkBlue border-darkBlue/10 hover:bg-darkBlue/5",
                      ].join(" ")}
                      aria-pressed={selected}
                    >
                      {formatTimeDisplay(reservationTime)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 text-sm text-darkBlue/60">
                {t("labels.add.close")}
              </div>
            )}
          </div>
        </div>

        {/* Informations Client et Table */}
        <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
          <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-6 midTablet:gap-8">
            <div className="flex flex-col gap-3">
              <label
                htmlFor="customerName"
                className="text-base font-semibold text-darkBlue inline-flex items-center gap-2"
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
                className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label
                htmlFor="customerEmail"
                className="text-base font-semibold text-darkBlue inline-flex items-center gap-2"
              >
                <EmailSvg width={20} height={20} className="opacity-50" />
                {t("labels.add.email")}
              </label>
              <input
                type="email"
                id="customerEmail"
                name="customerEmail"
                value={reservationData.customerEmail}
                onChange={handleInputChange}
                className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label
                htmlFor="customerPhone"
                className="text-base font-semibold text-darkBlue inline-flex items-center gap-2"
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
                className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label
                htmlFor="table"
                className="text-base font-semibold text-darkBlue inline-flex items-center gap-2"
              >
                <TableSvg width={20} height={20} className="opacity-50" />
                {t("labels.add.table")}
              </label>

              {manageDisponibilities ? (
                <select
                  id="table"
                  name="table"
                  value={reservationData.table}
                  onChange={handleInputChange}
                  required
                  className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                >
                  {!isEditing && (
                    <option value="auto">{t("labels.add.automatic")}</option>
                  )}
                  {availableTables.map((table) => (
                    <option key={table._id} value={table._id}>
                      {table.name
                        ? table.name
                        : `Table de ${table.seats} places`}
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
                  className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                />
              )}
            </div>
          </div>
        </div>

        {/* Commentaire */}
        <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
          <div className="flex flex-col gap-3">
            <label
              htmlFor="commentary"
              className="text-base font-semibold text-darkBlue inline-flex items-center gap-2"
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
              className="w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 py-3 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        {error && (
          <div className="rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
            {error}
          </div>
        )}

        <div className="flex flex-col midTablet:flex-row items-stretch midTablet:items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard/reservations")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-5 h-11 text-sm font-semibold text-darkBlue"
          >
            <X className="size-4 text-darkBlue/60" />
            {t("buttons.cancel")}
          </button>

          <button
            type="submit"
            disabled={!canSubmit || isLoading || isSubmitting}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-2xl px-5 h-11",
              "text-sm font-semibold text-white",
              "bg-blue hover:bg-blue/90 active:scale-[0.98] transition",
              !canSubmit || isLoading || isSubmitting
                ? "opacity-50 cursor-not-allowed"
                : "",
            ].join(" ")}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("buttons.loading")}
              </>
            ) : (
              <>
                <Save className="size-4" />
                {isEditing ? t("buttons.update") : t("buttons.validate")}
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
