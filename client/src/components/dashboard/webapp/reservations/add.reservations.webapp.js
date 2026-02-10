import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";

// DATE
import { format } from "date-fns";

// I18N
import { useTranslation } from "next-i18next";

// CALENDAR
const Calendar = dynamic(() => import("react-calendar"), { ssr: false });
import "react-calendar/dist/Calendar.css";

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
  ReservationSvg,
} from "../../../_shared/_svgs/_index";

// LUCIDE
import { Loader2, Save, X, ChevronLeft } from "lucide-react";

/* ---------------------------------------
   ✅ Simple Modal (inline)
--------------------------------------- */
function InfoModal({ open, title, message, confirmLabel = "OK", onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000]">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-[520px] rounded-3xl border border-darkBlue/10 bg-white/90 shadow-xl backdrop-blur-md">
          <div className="p-5 midTablet:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-darkBlue">{title}</p>
                <p className="mt-2 text-sm text-darkBlue/70 whitespace-pre-line">
                  {message}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-2"
                aria-label="Fermer"
              >
                <X className="size-4 text-darkBlue/60" />
              </button>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-2xl px-5 h-11 text-sm font-semibold text-white bg-blue hover:bg-blue/90 active:scale-[0.98] transition"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getServiceBucketFromTime(reservationTime) {
  const [hh = "0"] = String(reservationTime || "00:00").split(":");
  return Number(hh) < 16 ? "lunch" : "dinner";
}

function getOccupancyMinutesFront(parameters, reservationTime) {
  const bucket = getServiceBucketFromTime(reservationTime);
  const v =
    bucket === "lunch"
      ? parameters?.table_occupancy_lunch_minutes
      : parameters?.table_occupancy_dinner_minutes;

  const n = Number(v || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function minutesFromHHmm(timeStr) {
  const [h, m] = String(timeStr || "00:00")
    .split(":")
    .map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

export default function AddReservationsWebapp(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  const isEditing = !!props.reservation;

  const manageDisponibilities =
    props.restaurantData?.reservations?.parameters?.manage_disponibilities;

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
  const [hasUserChangedSlot, setHasUserChangedSlot] = useState(false);

  // ✅ Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMsg, setModalMsg] = useState("");
  const [postModalRedirect, setPostModalRedirect] = useState(false);

  const closeModal = () => {
    setModalOpen(false);
    if (postModalRedirect) {
      setPostModalRedirect(false);
      router.push("/dashboard/reservations");
    }
  };

  function isToday(date) {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  useEffect(() => {
    if (!props.reservation) return;

    const r = props.reservation;

    let tableValue = "";

    if (manageDisponibilities) {
      // ✅ Source of truth en "configured" => tableId
      if (r?.table?.source === "configured" && r?.table?.tableId) {
        tableValue = String(r.table.tableId);
      }
      // ✅ "manual" => on stocke le nom (input texte côté front)
      else if (r?.table?.source === "manual") {
        tableValue = String(r?.table?.name || "").trim();
      }
    } else {
      // ✅ mode sans gestion intelligente => table = texte libre
      tableValue = String(r?.table?.name || "").trim();
    }

    setReservationData({
      reservationDate: r.reservationDate
        ? new Date(r.reservationDate)
        : new Date(),
      reservationTime: r.reservationTime || "",
      numberOfGuests: r.numberOfGuests || 1,
      customerName: r.customerName || "",
      customerEmail: r.customerEmail || "",
      customerPhone: r.customerPhone || "",
      commentary: r.commentary || "",
      table: tableValue,
    });
    setHasUserChangedSlot(false);
  }, [
    props.reservation,
    manageDisponibilities,
    props.restaurantData?.reservations?.parameters?.tables,
  ]);

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

    // -----------------------------
    // Helpers (front alignés backend)
    // -----------------------------
    const isBlockingReservationFront = (r) => {
      if (!r) return false;
      if (!["Pending", "Confirmed", "Active", "Late"].includes(r.status))
        return false;

      if (r.status !== "Pending") return true;

      // Pending => bloquant seulement si non expirée
      // (si pendingExpiresAt absent, on considère bloquant par safety)
      if (!r.pendingExpiresAt) return true;
      return new Date(r.pendingExpiresAt).getTime() > Date.now();
    };

    const requiredTableSizeFromGuestsFront = (n) => {
      const g = Number(n || 0);
      if (g <= 0) return 0;
      return g % 2 === 0 ? g : g + 1;
    };

    // -----------------------------
    // Si fermé => aucun créneau
    // -----------------------------
    if (dayHours?.isClosed) {
      setAvailableTimes([]);
      setIsLoading(false);
      return;
    }

    // -----------------------------
    // Génère les créneaux (base)
    // -----------------------------
    if (Array.isArray(dayHours.hours) && dayHours.hours.length > 0) {
      const interval = parameters.interval || 30;

      let allAvailableTimes = dayHours.hours.flatMap(({ open, close }) =>
        generateTimeOptions(open, close, interval),
      );

      // Filtre "aujourd’hui" => ne pas proposer dans le passé
      if (isToday(reservationData.reservationDate)) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        allAvailableTimes = allAvailableTimes.filter((time) => {
          const [hour, minute] = time.split(":").map(Number);
          const timeInMinutes = hour * 60 + minute;
          return timeInMinutes > currentMinutes;
        });
      }

      // -----------------------------
      // ✅ Filtre dispo basé sur capacité (si manage ON)
      // (aligné backend: pool éligible + overlap + manual unassigned)
      // -----------------------------
      if (parameters.manage_disponibilities) {
        const guests = Number(reservationData.numberOfGuests || 0);

        if (guests > 0) {
          const requiredTableSize = requiredTableSizeFromGuestsFront(guests);

          // pool éligible (tables configurées de la bonne taille)
          const eligibleTables = (parameters.tables || []).filter(
            (t) => Number(t.seats) === requiredTableSize,
          );
          const capacity = eligibleTables.length;

          // si aucune table configurée => aucun créneau (comme backend)
          if (!capacity) {
            setAvailableTimes([]);
            setIsLoading(false);
            return;
          }

          const eligibleIds = new Set(eligibleTables.map((t) => String(t._id)));

          const formattedSelectedDate = format(
            reservationData.reservationDate,
            "yyyy-MM-dd",
          );

          // on ne garde que les réservations du jour + bloquantes
          const dayReservations = (
            props.restaurantData.reservations.list || []
          ).filter((r) => {
            const resDate = new Date(r.reservationDate);
            const formattedResDate = format(resDate, "yyyy-MM-dd");
            if (formattedResDate !== formattedSelectedDate) return false;
            if (!isBlockingReservationFront(r)) return false;
            if (isEditing && String(r._id) === String(props.reservation?._id))
              return false;
            return true;
          });

          allAvailableTimes = allAvailableTimes.filter((time) => {
            const candidateStart = minutesFromHHmm(time);
            const durCandidate = getOccupancyMinutesFront(parameters, time);
            const candidateEnd = candidateStart + durCandidate;

            // helper overlap (comme backend)
            const overlaps = (r) => {
              const rTime = String(r.reservationTime || "").slice(0, 5);
              const rStart = minutesFromHHmm(rTime);
              const rDur = getOccupancyMinutesFront(parameters, rTime);
              const rEnd = rStart + rDur;

              if (durCandidate > 0 && rDur > 0) {
                return candidateStart < rEnd && candidateEnd > rStart;
              }
              return rTime === String(time).slice(0, 5);
            };

            // construit état capacité comme backend:
            const reservedIds = new Set();
            let unassignedCount = 0;

            // ✅ NEW: fallback par nom (tables recréées)
            const eligibleByName = new Map(
              eligibleTables.map((t) => [
                String(t.name || "")
                  .trim()
                  .toLowerCase(),
                String(t._id),
              ]),
            );

            dayReservations.forEach((r) => {
              if (!r?.table) return;
              if (!overlaps(r)) return;

              // ✅ CONFIGURED
              if (r.table.source === "configured") {
                const id = r.table.tableId ? String(r.table.tableId) : null;

                // 1) cas normal: tableId encore dans le pool
                if (id && eligibleIds.has(id)) {
                  reservedIds.add(id);
                  return;
                }

                // 2) fallback: match par nom (si la table a été supprimée/recréée)
                const n = String(r.table.name || "")
                  .trim()
                  .toLowerCase();
                const mappedId = n ? eligibleByName.get(n) : null;
                if (mappedId) {
                  reservedIds.add(mappedId);
                  return;
                }

                // 3) dernier fallback: ça consomme quand même 1 slot si seats ok
                const seatsOk =
                  Number(r.table.seats) === Number(requiredTableSize);
                if (seatsOk) {
                  unassignedCount += 1;
                  return;
                }

                return;
              }

              // ✅ MANUAL
              if (r.table.source === "manual") {
                const name = String(r.table.name || "").trim();
                const seatsOk =
                  Number(r.table.seats) === Number(requiredTableSize);
                if (name && seatsOk) unassignedCount += 1;
              }
            });

            // slot dispo si on n'a pas atteint capacity
            return reservedIds.size + unassignedCount < capacity;
          });
        }
      }

      setAvailableTimes(allAvailableTimes);
    } else {
      setAvailableTimes([]);
    }

    setIsLoading(false);
  }, [
    reservationData.reservationDate,
    reservationData.numberOfGuests,
    props.restaurantData.opening_hours,
    props.restaurantData?.reservations?.parameters?.reservation_hours,
    props.restaurantData?.reservations?.parameters?.interval,
    props.restaurantData.reservations.parameters.manage_disponibilities,
    props.restaurantData.reservations.parameters.same_hours_as_restaurant,
    props.restaurantData.reservations.parameters.tables,
    props.restaurantData?.reservations?.list,
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

    // -----------------------------
    // Helpers alignés backend
    // -----------------------------
    const isBlockingReservationFront = (r) => {
      if (!r) return false;
      if (!["Pending", "Confirmed", "Active", "Late"].includes(r.status))
        return false;

      if (r.status !== "Pending") return true;

      if (!r.pendingExpiresAt) return true;
      return new Date(r.pendingExpiresAt).getTime() > Date.now();
    };

    const requiredTableSizeFromGuestsFront = (n) => {
      const g = Number(n || 0);
      if (g <= 0) return 0;
      return g % 2 === 0 ? g : g + 1;
    };

    const guests = Number(reservationData.numberOfGuests || 0);
    const requiredTableSize = requiredTableSizeFromGuestsFront(guests);

    const eligibleTables = (parameters.tables || []).filter(
      (t) => Number(t.seats) === requiredTableSize,
    );

    // si aucune table configurée => aucune table dispo
    if (!eligibleTables.length) {
      setAvailableTables([]);
      return;
    }

    const eligibleIds = new Set(eligibleTables.map((t) => String(t._id)));

    const formattedSelectedDate = format(
      reservationData.reservationDate,
      "yyyy-MM-dd",
    );

    const candidateTime = String(reservationData.reservationTime || "").slice(
      0,
      5,
    );

    const candidateStart = minutesFromHHmm(candidateTime);
    const durCandidate = getOccupancyMinutesFront(parameters, candidateTime);
    const candidateEnd = candidateStart + durCandidate;

    const overlaps = (r) => {
      const rTime = String(r.reservationTime || "").slice(0, 5);
      const rStart = minutesFromHHmm(rTime);
      const rDur = getOccupancyMinutesFront(parameters, rTime);
      const rEnd = rStart + rDur;

      if (durCandidate > 0 && rDur > 0) {
        return candidateStart < rEnd && candidateEnd > rStart;
      }
      return rTime === candidateTime;
    };

    // réservations du jour + bloquantes (en excluant la réservation éditée)
    const dayBlocking = (props.restaurantData.reservations.list || []).filter(
      (r) => {
        const resDate = new Date(r.reservationDate);
        const formattedResDate = format(resDate, "yyyy-MM-dd");
        if (formattedResDate !== formattedSelectedDate) return false;
        if (!isBlockingReservationFront(r)) return false;
        if (isEditing && String(r._id) === String(props.reservation?._id))
          return false;
        return true;
      },
    );

    // ✅ capacité = nombre de tables éligibles (pool 2p, 4p, etc.)
    const capacity = eligibleTables.length;

    // ✅ tables configurées prises sur ce créneau (dans le pool éligible)
    const reservedIds = new Set();
    let unassignedCount = 0;

    // ✅ NEW: fallback par nom (tables recréées)
    const eligibleByName = new Map(
      eligibleTables.map((t) => [
        String(t.name || "")
          .trim()
          .toLowerCase(),
        String(t._id),
      ]),
    );

    dayBlocking.forEach((r) => {
      if (!r?.table) return;
      if (!overlaps(r)) return;

      // ✅ CONFIGURED
      if (r.table.source === "configured") {
        const id = r.table.tableId ? String(r.table.tableId) : null;

        // 1) cas normal: tableId encore dans le pool
        if (id && eligibleIds.has(id)) {
          reservedIds.add(id);
          return;
        }

        // 2) fallback: match par nom
        const n = String(r.table.name || "")
          .trim()
          .toLowerCase();
        const mappedId = n ? eligibleByName.get(n) : null;
        if (mappedId) {
          reservedIds.add(mappedId);
          return;
        }

        // 3) dernier fallback: consomme 1 slot si seats ok
        const seatsOk = Number(r.table.seats) === Number(requiredTableSize);
        if (seatsOk) {
          unassignedCount += 1;
          return;
        }

        return;
      }

      // ✅ MANUAL
      if (r.table.source === "manual") {
        const name = String(r.table.name || "").trim();
        const seatsOk = Number(r.table.seats) === Number(requiredTableSize);
        if (name && seatsOk) unassignedCount += 1;
      }
    });

    // ✅ si le créneau est “plein” à cause des manuelles, aucune table n'est sélectionnable
    if (reservedIds.size + unassignedCount >= capacity) {
      setAvailableTables([]);
      return;
    }

    const available = eligibleTables.filter(
      (t) => !reservedIds.has(String(t._id)),
    );

    setAvailableTables(available);
  }, [
    reservationData.reservationDate,
    reservationData.reservationTime,
    reservationData.numberOfGuests,
    isEditing,
    props.reservation,
    props.restaurantData.reservations.list,
    props.restaurantData?.reservations?.parameters,
  ]);

  useEffect(() => {
    const parameters = props.restaurantData?.reservations?.parameters;
    if (!parameters?.manage_disponibilities) return;

    const hasPickedSlot =
      Boolean(reservationData.numberOfGuests) &&
      Boolean(reservationData.reservationDate) &&
      Boolean(reservationData.reservationTime);

    // Si pas de slot => on vide la table
    if (!hasPickedSlot) {
      if (reservationData.table) {
        setReservationData((p) => ({ ...p, table: "" }));
      }
      return;
    }

    // ✅ EN ÉDITION : tant que l’utilisateur n’a rien modifié (date/heure/guests),
    // on NE TOUCHE PAS à la table (on affiche juste celle de la résa)
    if (isEditing && !hasUserChangedSlot) return;

    // Si aucune table dispo
    if (!availableTables || availableTables.length === 0) {
      if (!isEditing && reservationData.table) {
        setReservationData((p) => ({ ...p, table: "" }));
      }
      // en édition, on peut garder la table affichée même si plus dispo
      // (le backend tranchera au submit, ou tu peux afficher un message)
      return;
    }

    const current = String(reservationData.table || "");
    const stillValid = availableTables.some((t) => String(t._id) === current);

    // si encore valide, ne rien faire
    if (current && stillValid) return;

    // ✅ sinon auto-assign
    const nextId = String(availableTables[0]._id);
    if (current !== nextId) {
      setReservationData((p) => ({ ...p, table: nextId }));
    }
  }, [
    availableTables,
    isEditing,
    hasUserChangedSlot,
    reservationData.numberOfGuests,
    reservationData.reservationDate,
    reservationData.reservationTime,
    reservationData.table,
    props.restaurantData?.reservations?.parameters,
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
    setHasUserChangedSlot(true);
    setReservationData((prevData) => ({
      ...prevData,
      reservationDate: selectedDate,
      reservationTime: "",
      table: "",
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

    if (name === "numberOfGuests") setHasUserChangedSlot(true);
    if (name === "table") setHasUserChangedSlot(true);

    setReservationData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "numberOfGuests" ? { reservationTime: "", table: "" } : {}),
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

    // auto => prend la 1ère table dispo côté front (mais backend recheck)
    if (!isEditing && !updatedData.table) {
      updatedData.table = availableTables?.[0]?._id
        ? String(availableTables[0]._id)
        : null;
    }

    const formattedDate = format(updatedData.reservationDate, "yyyy-MM-dd");
    const formattedTime = updatedData.reservationTime;

    // ✅ EDIT: si slot NON modifié => on envoie seulement les champs "non-slot"
    let reservationPayload;

    if (isEditing && !hasUserChangedSlot) {
      reservationPayload = {
        customerName: updatedData.customerName,
        customerEmail: updatedData.customerEmail,
        customerPhone: updatedData.customerPhone,
        commentary: updatedData.commentary,
      };
    } else {
      // ✅ sinon (slot modifié) => payload complet + table
      reservationPayload = {
        reservationDate: formattedDate,
        reservationTime: formattedTime,
        numberOfGuests: updatedData.numberOfGuests,
        customerName: updatedData.customerName,
        customerEmail: updatedData.customerEmail,
        customerPhone: updatedData.customerPhone,
        commentary: updatedData.commentary,
        table: updatedData.table,
      };
    }

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
          `${process.env.NEXT_PUBLIC_API_URL}/dashboard/restaurants/${props.restaurantData._id}/reservations`,
          { ...reservationPayload, table: updatedData.table },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // ✅ backend peut renvoyer { restaurant, tableReassigned, tableChange: {oldTableName,newTableName} }
      const { restaurant, tableReassigned, tableChange } = response.data || {};

      if (restaurant) props.setRestaurantData(restaurant);

      // ✅ MODALE: table réassignée
      if (tableReassigned) {
        const oldName = tableChange?.oldTableName || "la table initiale";
        const newName = tableChange?.newTableName || "une autre table";
        setModalTitle("Table réassignée");
        setModalMsg(
          `La table "${oldName}" n’est plus disponible à ce créneau.\nLa réservation a été automatiquement basculée sur "${newName}".`,
        );
        setPostModalRedirect(true);
        setModalOpen(true);
        return; // on attend la fermeture de la modale pour redirect
      }

      router.push("/dashboard/reservations");
    } catch (err) {
      // ✅ Cas “aucune table dispo” => backend 409 avec code
      const code = err?.response?.data?.code;
      if (code === "NO_TABLE_AVAILABLE") {
        setModalTitle("Aucune table disponible");
        setModalMsg(
          "Aucune table n’est disponible pour ce créneau.\nVous devez contacter le client pour proposer un autre horaire ou une autre date.",
        );
        setPostModalRedirect(false);
        setModalOpen(true);
        return;
      }

      setError(
        err.response?.data?.message ||
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
    setHasUserChangedSlot(true);
    setReservationData((prevData) => ({
      ...prevData,
      reservationTime,
      table: "",
    }));
  }

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

  const hasPickedSlot =
    Boolean(reservationData.numberOfGuests) &&
    Boolean(reservationData.reservationDate) &&
    Boolean(reservationData.reservationTime);

  const currentTableOption = useMemo(() => {
    if (!isEditing || !manageDisponibilities || hasUserChangedSlot) return null;

    const id = String(reservationData.table || "");
    if (!id) return null;

    // si déjà présente, pas besoin
    const exists = (availableTables || []).some((t) => String(t._id) === id);
    if (exists) return null;

    return {
      _id: id,
      name: props.reservation?.table?.name || "Table actuelle",
      seats: props.reservation?.table?.seats || null,
    };
  }, [
    isEditing,
    manageDisponibilities,
    hasUserChangedSlot,
    props.reservation,
    availableTables,
    reservationData.table,
  ]);

  const tablesForSelect = currentTableOption
    ? [currentTableOption, ...(availableTables || [])]
    : availableTables || [];

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
    <>
      {/* ✅ MODALE */}
      <InfoModal
        open={modalOpen}
        title={modalTitle}
        message={modalMsg}
        confirmLabel="Compris"
        onClose={closeModal}
      />

      <section className="flex flex-col gap-4">
        <div className="midTablet:hidden  bg-lightGrey">
          <div className="flex items-center justify-between gap-3 h-[50px]">
            <button
              onClick={() => router.push("/dashboard/webapp/reservations")}
              className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-2"
              aria-label={t("calendar.back", "Retour au calendrier")}
              title={t("calendar.back", "Retour au calendrier")}
            >
              <ChevronLeft className="size-5 text-darkBlue/70" />
            </button>

            <div className="min-w-0 flex-1 flex items-center gap-2">
              <div className="min-w-0">
                <p className="text-xl font-semibold text-darkBlue truncate">
                  {subtitle}
                </p>
                <p className="text-sm text-darkBlue/50 truncate">
                  {reservationDateLabel ? `${reservationDateLabel}` : ""}
                </p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          {/* 1) Nombre de personnes */}
          <div className="w-full rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4">
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
                min={1}
                value={reservationData.numberOfGuests}
                onWheel={(e) => e.target.blur()}
                onChange={handleInputChange}
                required
                className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
              />
            </div>
          </div>

          {/* 2) Date */}
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4">
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
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4">
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
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4">
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
                    required={Boolean(hasPickedSlot && manageDisponibilities)}
                    className="h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                  >
                    {!hasPickedSlot ? (
                      <option value="" disabled>
                        Choisissez d’abord un créneau
                      </option>
                    ) : tablesForSelect.length === 0 ? (
                      <option value="" disabled>
                        Aucune table disponible
                      </option>
                    ) : (
                      tablesForSelect.map((table) => (
                        <option key={table._id} value={table._id}>
                          {table.name
                            ? table.name
                            : `Table de ${table.seats} places`}
                        </option>
                      ))
                    )}
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
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4">
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
    </>
  );
}
