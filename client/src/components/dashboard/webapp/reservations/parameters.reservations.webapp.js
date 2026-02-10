import { useContext, useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// REACT HOOK FORM
import { useForm, useFieldArray } from "react-hook-form";

// SVG
import { ReservationSvg } from "../../../_shared/_svgs/reservation.svg";

// ICONS
import {
  Loader2,
  X,
  ChevronLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Settings2,
  Clock,
  CalendarDays,
  Wand2,
  Ban,
} from "lucide-react";

// COMPONENTS
import HoursRestaurantComponent from "../../restaurant/hours.restaurant.component";

// AXIOS
import axios from "axios";

// Helpers
const statusLabel = (status) => {
  const s = String(status || "").trim();
  if (!s) return "";

  const map = {
    Pending: "En attente",
    Confirmed: "Confirmée",
    Active: "En cours",
    Late: "En retard",
    Finished: "Terminée",
    Canceled: "Annulée",
    NoShow: "No-show",
  };

  return map[s] || s;
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalDatetimeInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate(),
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtShortFR(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRangeActive(range) {
  const now = new Date();
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return false;
  return now >= start && now < end;
}

export default function ParametersReservationWebApp(props) {
  const { t } = useTranslation(["reservations", "restaurant"]);
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setFocus,
    control,
    reset,
    formState: { errors },
  } = useForm({
    shouldUnregister: false,
    defaultValues: {
      same_hours_as_restaurant: true,

      // Créneaux
      auto_accept: true,
      interval: "30",
      pending_duration_minutes: 120,

      // Automatisations
      auto_finish_reservations: false,

      deletion_duration: false,
      deletion_duration_minutes: 1440,

      // Gestion intelligente
      manage_disponibilities: false,

      // ✅ Durée d’occupation (sert aussi à l’auto-finish)
      table_occupancy_lunch_minutes: "",
      table_occupancy_dinner_minutes: "",

      tables: [
        { name: "", seats: "" },
        { name: "", seats: "" },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tables",
  });

  const [reservationHours, setReservationHours] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [manualTablesNeedingAssignment, setManualTablesNeedingAssignment] =
    useState(0);
  const [manualToFix, setManualToFix] = useState([]);
  const [manualToFixLoading, setManualToFixLoading] = useState(false);
  const [manualToFixError, setManualToFixError] = useState("");

  // UX errors (pas RHF)
  const [submitted, setSubmitted] = useState(false);
  const [tableErrors, setTableErrors] = useState({});
  const [durationError, setDurationError] = useState({
    lunch: false,
    dinner: false,
  });

  // ✅ tooltips on disabled toggles (click)
  const [disabledHint, setDisabledHint] = useState({
    autoAccept: false,
    reservationDuration: false,
  });

  const hintTimerRef = useRef(null);

  const closeHints = () => {
    setDisabledHint({ autoAccept: false, reservationDuration: false });
  };

  const openHint = (key) => {
    setDisabledHint(() => ({
      autoAccept: false,
      reservationDuration: false,
      [key]: true,
    }));

    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      closeHints();
    }, 2200);
  };

  useEffect(() => {
    const onDocClick = () => {
      if (disabledHint.autoAccept || disabledHint.reservationDuration) {
        closeHints();
      }
    };
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("click", onDocClick);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabledHint.autoAccept, disabledHint.reservationDuration]);

  // -----------------------------
  // ✅ BLOCKED RANGES (pause)
  // -----------------------------
  const [blockedStart, setBlockedStart] = useState("");
  const [blockedEnd, setBlockedEnd] = useState("");
  const [blockedNote, setBlockedNote] = useState("");
  const [blockedError, setBlockedError] = useState("");
  const [blockedLoading, setBlockedLoading] = useState(false);

  const blockedRanges = useMemo(() => {
    const r =
      props.restaurantData?.reservations?.parameters?.blocked_ranges || [];
    return Array.isArray(r) ? r : [];
  }, [props.restaurantData?.reservations?.parameters?.blocked_ranges]);

  const hasActivePause = useMemo(() => {
    return blockedRanges.some(isRangeActive);
  }, [blockedRanges]);

  useEffect(() => {
    const now = new Date();
    const plus2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setBlockedStart((v) => v || toLocalDatetimeInputValue(now));
    setBlockedEnd((v) => v || toLocalDatetimeInputValue(plus2h));
  }, []);

  async function fetchManualTablesToFix() {
    try {
      setManualToFixLoading(true);
      setManualToFixError("");

      const token = localStorage.getItem("token");
      const restaurantId = props.restaurantData?._id;
      if (!restaurantId) return;

      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/manual-tables`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setManualToFix(
        Array.isArray(res.data?.reservations) ? res.data.reservations : [],
      );
    } catch (e) {
      console.error("Error fetching manual tables to fix:", e);
      setManualToFixError(
        e?.response?.data?.message ||
          "Impossible de récupérer la liste des réservations à corriger.",
      );
    } finally {
      setManualToFixLoading(false);
    }
  }

  function validateBlockedForm(startStr, endStr) {
    setBlockedError("");
    if (!startStr || !endStr) return "Veuillez renseigner un début et une fin.";
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
      return "Dates invalides.";
    if (end <= start) return "La fin doit être après le début.";
    return "";
  }

  async function addBlockedRange() {
    const msg = validateBlockedForm(blockedStart, blockedEnd);
    if (msg) {
      setBlockedError(msg);
      return;
    }

    try {
      setBlockedLoading(true);
      setBlockedError("");

      const token = localStorage.getItem("token");
      const restaurantId = props.restaurantData?._id;
      if (!restaurantId) return;

      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/blocked-ranges`,
        {
          startAt: new Date(blockedStart).toISOString(),
          endAt: new Date(blockedEnd).toISOString(),
          note: (blockedNote || "").trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      props.setRestaurantData(res.data.restaurant);
      setBlockedNote("");
    } catch (e) {
      console.error("Error adding blocked range:", e);
      setBlockedError(
        e?.response?.data?.message ||
          "Erreur lors de l’ajout de la pause. Réessayez.",
      );
    } finally {
      setBlockedLoading(false);
    }
  }

  async function deleteBlockedRange(rangeId) {
    if (!rangeId) return;

    try {
      setBlockedLoading(true);
      setBlockedError("");

      const token = localStorage.getItem("token");
      const restaurantId = props.restaurantData?._id;
      if (!restaurantId) return;

      const res = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/blocked-ranges/${rangeId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      props.setRestaurantData(res.data.restaurant);
    } catch (e) {
      console.error("Error deleting blocked range:", e);
      setBlockedError(
        e?.response?.data?.message ||
          "Erreur lors de la suppression. Réessayez.",
      );
    } finally {
      setBlockedLoading(false);
    }
  }

  // Init depuis le contexte
  useEffect(() => {
    if (restaurantContext?.restaurantData?.reservations) {
      const { parameters } = restaurantContext.restaurantData.reservations;

      const nextLunch =
        parameters?.table_occupancy_lunch_minutes === 0 ||
        parameters?.table_occupancy_lunch_minutes
          ? String(parameters.table_occupancy_lunch_minutes)
          : "";

      const nextDinner =
        parameters?.table_occupancy_dinner_minutes === 0 ||
        parameters?.table_occupancy_dinner_minutes
          ? String(parameters.table_occupancy_dinner_minutes)
          : "";

      const nextAutoFinishEnabled = Boolean(
        parameters?.auto_finish_reservations,
      );

      reset({
        same_hours_as_restaurant: parameters.same_hours_as_restaurant ?? true,

        auto_accept: parameters.auto_accept ?? true,
        interval: String(parameters.interval ?? "30"),
        pending_duration_minutes: parameters.pending_duration_minutes ?? 120,

        auto_finish_reservations: nextAutoFinishEnabled,

        deletion_duration: parameters.deletion_duration ?? false,
        deletion_duration_minutes: parameters.deletion_duration_minutes ?? 1440,

        manage_disponibilities: parameters.manage_disponibilities ?? false,

        table_occupancy_lunch_minutes: nextLunch,
        table_occupancy_dinner_minutes: nextDinner,

        tables: parameters.tables?.length
          ? parameters.tables.map((tt) => ({
              name: tt?.name ?? "",
              seats:
                tt?.seats === 0 || tt?.seats === null || tt?.seats === undefined
                  ? ""
                  : String(tt.seats),
            }))
          : [
              { name: "", seats: "" },
              { name: "", seats: "" },
            ],
      });

      setReservationHours(parameters.reservation_hours || []);
      setIsLoading(false);
      setSubmitted(false);
      setTableErrors({});
      setDurationError({ lunch: false, dinner: false });
    }
  }, [restaurantContext.restaurantData?._id, reset]);

  const same_hours_as_restaurant = watch("same_hours_as_restaurant");
  const manage_disponibilities = watch("manage_disponibilities");
  const deletion_duration = watch("deletion_duration");
  const auto_finish_reservations = watch("auto_finish_reservations");
  const tablesWatch = watch("tables");
  const auto_accept = watch("auto_accept");

  const subtitle = t("reservations:buttons.parameters", "Paramètres");

  const tablesCount = useMemo(() => {
    const raw = Array.isArray(tablesWatch) ? tablesWatch : [];
    return raw.filter((r) => {
      const name = (r?.name || "").trim();
      const seatsEmpty =
        r?.seats === "" || r?.seats === null || r?.seats === undefined;
      return !(name === "" && seatsEmpty);
    }).length;
  }, [tablesWatch]);

  // Pré-remplissage métier si vide (dès qu’on active soit auto-finish, soit gestion intelligente)
  useEffect(() => {
    const lunch = (watch("table_occupancy_lunch_minutes") ?? "").toString();
    const dinner = (watch("table_occupancy_dinner_minutes") ?? "").toString();

    if (
      (auto_finish_reservations || manage_disponibilities) &&
      !lunch &&
      !dinner
    ) {
      setValue("table_occupancy_lunch_minutes", "90");
      setValue("table_occupancy_dinner_minutes", "120");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto_finish_reservations, manage_disponibilities]);

  // Quand on active la gestion intelligente: s'assurer d'avoir 2 lignes
  useEffect(() => {
    if (manage_disponibilities) {
      const hasAnyRow = Array.isArray(tablesWatch) && tablesWatch.length > 0;
      if (!hasAnyRow) {
        append({ name: "", seats: "" });
        append({ name: "", seats: "" });
      }
    } else {
      setSubmitted(false);
      setTableErrors({});
      setDurationError({ lunch: false, dinner: false });
      setManualTablesNeedingAssignment(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manage_disponibilities]);

  // Recalcule les erreurs visuelles des lignes si on a déjà tenté de soumettre
  useEffect(() => {
    if (!submitted) return;

    const nextErrors = {};
    (tablesWatch || []).forEach((row, i) => {
      const name = (row?.name || "").trim();
      const seatsRaw = row?.seats;
      const seatsEmpty =
        seatsRaw === "" || seatsRaw === null || seatsRaw === undefined;

      const nameEmpty = name === "";
      const bothEmpty = nameEmpty && seatsEmpty;
      if (bothEmpty) return;

      if (nameEmpty || seatsEmpty) {
        nextErrors[i] = { name: nameEmpty, seats: seatsEmpty };
      }
    });

    setTableErrors(nextErrors);
  }, [tablesWatch, submitted]);

  function handleBack() {
    router.push("/dashboard/webapp/reservations");
  }

  function onReservationHoursChange(data) {
    setReservationHours(data.hours);
  }

  // Sauvegarde immédiate des heures de réservation (appelée par l'enfant)
  async function saveReservationHoursImmediate(newHours) {
    const token = localStorage.getItem("token");

    const currentParams =
      restaurantContext?.restaurantData?.reservations?.parameters || {};

    const payload = {
      ...currentParams,
      same_hours_as_restaurant: false,
      reservation_hours: newHours,
    };

    const response = await axios.put(
      `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations/parameters`,
      { parameters: payload },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    props.setRestaurantData(response.data.restaurant);
    setReservationHours(newHours);
  }

  function handleAddTable() {
    append({ name: "", seats: "" });
  }

  function handleRemoveTable(i) {
    remove(i);
  }

  async function onSubmit(data) {
    setSubmitted(true);

    // --------------------
    // ✅ Tables validation (seulement si gestion intelligente)
    // --------------------
    const rawTables = Array.isArray(data.tables) ? data.tables : [];

    const sanitizedTables = rawTables
      .map((row) => ({
        name: (row?.name || "").trim(),
        seatsRaw: row?.seats,
      }))
      .filter(
        (r) => !(r.name === "" && (r.seatsRaw === "" || r.seatsRaw == null)),
      )
      .map((r) => ({
        name: r.name,
        seats:
          r.seatsRaw === "" || r.seatsRaw == null
            ? null
            : Number.parseInt(r.seatsRaw, 10),
      }));

    if (manage_disponibilities) {
      const partialErrors = {};
      rawTables.forEach((row, i) => {
        const name = (row?.name || "").trim();
        const seatsEmpty =
          row?.seats === "" || row?.seats === null || row?.seats === undefined;
        const nameEmpty = name === "";
        const bothEmpty = nameEmpty && seatsEmpty;

        if (!bothEmpty && (nameEmpty || seatsEmpty)) {
          partialErrors[i] = { name: nameEmpty, seats: seatsEmpty };
        }
      });

      if (Object.keys(partialErrors).length > 0) {
        setTableErrors(partialErrors);
        return;
      }
    }

    // --------------------
    // ✅ Durées (midi/soir)
    // --------------------
    let lunch = (data.table_occupancy_lunch_minutes ?? "").toString().trim();
    let dinner = (data.table_occupancy_dinner_minutes ?? "").toString().trim();

    const lunchHas = lunch !== "" && Number(lunch) >= 1;
    const dinnerHas = dinner !== "" && Number(dinner) >= 1;

    const mustHaveDurations = Boolean(
      auto_finish_reservations || manage_disponibilities,
    );

    const shouldStoreDurations = mustHaveDurations || (lunchHas && dinnerHas);

    if (mustHaveDurations) {
      const lunchMissing = !lunchHas;
      const dinnerMissing = !dinnerHas;

      if (lunchMissing || dinnerMissing) {
        setDurationError({ lunch: lunchMissing, dinner: dinnerMissing });
        setFocus(
          lunchMissing
            ? "table_occupancy_lunch_minutes"
            : "table_occupancy_dinner_minutes",
        );
        return;
      }

      setDurationError({ lunch: false, dinner: false });
    } else {
      const bothEmpty = lunch === "" && dinner === "";
      const bothFilled = lunchHas && dinnerHas;

      if (!bothEmpty && !bothFilled) {
        setDurationError({ lunch: !lunchHas, dinner: !dinnerHas });
        setFocus(
          !lunchHas
            ? "table_occupancy_lunch_minutes"
            : "table_occupancy_dinner_minutes",
        );
        return;
      }

      setDurationError({ lunch: false, dinner: false });
    }

    const currentParams =
      restaurantContext?.restaurantData?.reservations?.parameters || {};

    const manageNext = Boolean(data.manage_disponibilities);

    const tablesToSave = manageNext
      ? sanitizedTables.map((tt) => ({ name: tt.name, seats: tt.seats }))
      : currentParams.tables || [];

    const formData = {
      same_hours_as_restaurant: Boolean(data.same_hours_as_restaurant),

      // Créneaux
      auto_accept: Boolean(data.auto_accept),
      interval: Number(data.interval),

      pending_duration_minutes: data.auto_accept
        ? currentParams.pending_duration_minutes || 120
        : Number(data.pending_duration_minutes),

      // Automatisations
      auto_finish_reservations: Boolean(data.auto_finish_reservations),

      deletion_duration: Boolean(data.deletion_duration),
      deletion_duration_minutes: data.deletion_duration
        ? Number(data.deletion_duration_minutes)
        : 1440,

      reservation_hours: data.same_hours_as_restaurant
        ? restaurantContext.restaurantData?.opening_hours
        : reservationHours,

      manage_disponibilities: manageNext,
      tables: tablesToSave,

      // ✅ Durées (stockées dès qu'on en a besoin)
      table_occupancy_lunch_minutes: shouldStoreDurations
        ? Number(lunch)
        : null,
      table_occupancy_dinner_minutes: shouldStoreDurations
        ? Number(dinner)
        : null,
    };

    try {
      const token = localStorage.getItem("token");

      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations/parameters`,
        { parameters: formData },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      props.setRestaurantData(response.data.restaurant);

      const count = Number(response?.data?.manualTablesNeedingAssignment || 0);
      setManualTablesNeedingAssignment(count);

      if (count > 0) {
        // ✅ on reste sur la page pour que le restaurateur voie le message
        // (sinon il ne le verra jamais)
        return;
      }

      router.push("/dashboard/webapp/reservations");
    } catch (error) {
      console.error("Erreur mise à jour paramètres réservation :", error);
    }
  }

  // ---------- UI helpers ----------
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

  if (isLoading) {
    return (
      <section className="flex items-center justify-center flex-1">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue/70">
          <Loader2 className="size-4 shrink-0 animate-spin" />
          <span className="italic">
            {t("reservations:messages.loading", "Chargement…")}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="midTablet:hidden bg-lightGrey">
        <div className="flex items-center justify-between gap-3 h-[50px]">
          <button
            onClick={handleBack}
            className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-2"
            aria-label={t("reservations:calendar.back", "Retour")}
            title={t("reservations:calendar.back", "Retour")}
          >
            <ChevronLeft className="size-5 text-darkBlue/70" />
          </button>

          <div className="min-w-0 flex-1 flex items-center gap-2">
            <p className="text-xl font-semibold text-darkBlue truncate">
              {subtitle}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* -----------------------------------------
            ✅ Pause des réservations (blocked ranges)
           ----------------------------------------- */}
        <div className={card}>
          <div className={cardInner}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={sectionTitle}>
                  <Ban className="size-4 shrink-0 opacity-60" />
                  {t("reservations:titles.pause", "Mise en pause")}
                </p>
                <p className={hint}>
                  {t(
                    "reservations:messages.pauseHelp",
                    "Ajoute des plages où le site ne peut plus prendre temporairement de réservations.",
                  )}
                </p>
              </div>

              <span
                className={[
                  "shrink-0 inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs",
                  hasActivePause
                    ? "border-green/20 bg-green/10 text-green"
                    : "border-darkBlue/10 bg-white/60 text-darkBlue/60",
                ].join(" ")}
              >
                <span
                  className={[
                    "size-2 rounded-full",
                    hasActivePause ? "bg-green" : "bg-darkBlue/25",
                  ].join(" ")}
                />
                {hasActivePause
                  ? t("reservations:labels.pauseActive", "Pause active")
                  : t("reservations:labels.pauseInactive", "Aucune pause")}
              </span>
            </div>

            <div className={divider} />

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
                <p className="text-sm font-semibold text-darkBlue">
                  {t("reservations:labels.pauseStart", "Début")}
                </p>
                <input
                  type="datetime-local"
                  value={blockedStart}
                  onChange={(e) => setBlockedStart(e.target.value)}
                  className={inputBase}
                />
              </div>

              <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
                <p className="text-sm font-semibold text-darkBlue">
                  {t("reservations:labels.pauseEnd", "Fin")}
                </p>
                <input
                  type="datetime-local"
                  value={blockedEnd}
                  onChange={(e) => setBlockedEnd(e.target.value)}
                  className={inputBase}
                />
              </div>

              <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
                <p className="text-sm font-semibold text-darkBlue">
                  {t("reservations:labels.pauseNote", "Note (optionnel)")}
                </p>
                <input
                  type="text"
                  value={blockedNote}
                  onChange={(e) => setBlockedNote(e.target.value)}
                  placeholder={t(
                    "reservations:placeholders.pauseNote",
                    "Ex: service complet, privatisation…",
                  )}
                  className={inputBase}
                />
              </div>

              {blockedError && (
                <p className="text-xs text-red -mt-1">{blockedError}</p>
              )}

              <button
                type="button"
                onClick={addBlockedRange}
                disabled={blockedLoading}
                className={[
                  "inline-flex items-center justify-center gap-2 rounded-2xl px-5 h-11",
                  "text-sm font-semibold text-white",
                  "bg-blue hover:bg-blue/90 active:scale-[0.98] transition",
                  blockedLoading ? "opacity-50 cursor-not-allowed" : "",
                ].join(" ")}
              >
                {blockedLoading ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                    {t("reservations:buttons.loading", "En cours…")}
                  </>
                ) : (
                  <>
                    <Plus className="size-4 shrink-0" />
                    {t("reservations:buttons.addPause", "Ajouter une pause")}
                  </>
                )}
              </button>
            </div>

            <div className={divider} />

            <div className="flex flex-col gap-3">
              {blockedRanges.length === 0 ? (
                <p className="text-sm text-darkBlue/55">
                  {t(
                    "reservations:messages.noPause",
                    "Aucune pause configurée.",
                  )}
                </p>
              ) : (
                blockedRanges
                  .slice()
                  .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
                  .map((r) => {
                    const active = isRangeActive(r);
                    return (
                      <div
                        key={String(r._id)}
                        className={[
                          "rounded-2xl border p-3 flex items-center justify-between gap-3",
                          active
                            ? "border-red/20 bg-red/10"
                            : "border-darkBlue/10 bg-white/60",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <p
                            className={[
                              "text-sm font-semibold",
                              active ? "text-red" : "text-darkBlue",
                            ].join(" ")}
                          >
                            {fmtShortFR(r.startAt)} → {fmtShortFR(r.endAt)}
                          </p>

                          {r.note ? (
                            <p className="mt-1 text-xs text-darkBlue/60 break-words">
                              {r.note}
                            </p>
                          ) : null}

                          {active ? (
                            <p className="mt-1 text-xs text-red/80">
                              {t(
                                "reservations:labels.pauseNow",
                                "En cours (le site ne peut pas accepter de réservations sur ce créneau).",
                              )}
                            </p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => deleteBlockedRange(r._id)}
                          disabled={blockedLoading}
                          className="min-w-[44px] flex items-center justify-center size-11 rounded-2xl bg-red text-white shadow-sm hover:opacity-75 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label={t(
                            "reservations:buttons.delete",
                            "Supprimer",
                          )}
                          title={t("reservations:buttons.delete", "Supprimer")}
                        >
                          <Trash2 className="size-4 shrink-0" />
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>

        {/* --- Bloc: Heures --- */}
        <div className={card}>
          <div className={cardInner}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={sectionTitle}>
                  <CalendarDays className="size-4 shrink-0 opacity-60" />
                  {t(
                    "reservations:labels.sameHoursAsRestaurant",
                    "Heures de réservation",
                  )}
                </p>
                <p className={hint}>
                  {same_hours_as_restaurant
                    ? t(
                        "reservations:messages.sameHoursHelpShort",
                        "Utilise les horaires du restaurant.",
                      )
                    : t(
                        "reservations:messages.customHoursHelpShort",
                        "Définis des horaires spécifiques aux réservations.",
                      )}
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
                  restaurantId={props.restaurantData?._id}
                  dataLoading={restaurantContext.dataLoading}
                  closeEditing={restaurantContext.closeEditing}
                  reservations
                  reservationHours={reservationHours}
                  onChange={onReservationHoursChange}
                  onSaveReservationHours={saveReservationHoursImmediate}
                />
              </>
            )}
          </div>
        </div>

        {/* --- Bloc: Créneaux --- */}
        <div className={card}>
          <div className={cardInner}>
            <p className={sectionTitle}>
              <Clock className="size-4 shrink-0 opacity-60" />
              {t("reservations:titles.slots", "Créneaux")}
            </p>

            <div className={divider} />

            <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-3">
              {/* Interval */}
              <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-darkBlue">
                      {t(
                        "reservations:labels.intervalTitle",
                        "Intervalle entre les créneaux",
                      )}
                    </p>
                    <p className="text-xs text-darkBlue/50">
                      {t(
                        "reservations:messages.intervalHelp",
                        "Temps minimum entre deux créneaux.",
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <select
                    id="interval"
                    {...register("interval", { required: true })}
                    className={selectBase}
                  >
                    <option value="15">
                      15 {t("reservations:labels.minutes", "min")}
                    </option>
                    <option value="30">
                      30 {t("reservations:labels.minutes", "min")}
                    </option>
                    <option value="45">
                      45 {t("reservations:labels.minutes", "min")}
                    </option>
                    <option value="60">
                      1 {t("reservations:labels.hour", "h")}
                    </option>
                  </select>
                  {errors.interval && (
                    <p className="mt-2 text-xs text-red">
                      {t(
                        "reservations:errors.interval",
                        "Veuillez choisir un intervalle.",
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Auto accept */}
              <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-darkBlue">
                      {t(
                        "reservations:labels.autoAccept",
                        "Acceptation automatique",
                      )}
                    </p>
                    <p className="text-xs text-darkBlue/50">
                      {t(
                        "reservations:messages.autoAcceptHelp",
                        "Les réservations du site passent directement en “Confirmée”.",
                      )}
                    </p>
                  </div>

                  <span
                    className="relative inline-flex"
                    onClick={(e) => {
                      if (!manage_disponibilities) return;
                      e.stopPropagation();
                      openHint("autoAccept");
                    }}
                  >
                    <label className={toggleWrap}>
                      <span
                        className={[
                          toggleBase,
                          watch("auto_accept") ? toggleOn : toggleOff,
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          id="auto_accept"
                          {...register("auto_accept")}
                        />
                        <span
                          className={[
                            toggleDot,
                            watch("auto_accept") ? toggleDotOn : toggleDotOff,
                          ].join(" ")}
                        />
                      </span>
                    </label>
                  </span>
                </div>
              </div>

              {!auto_accept && (
                <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
                  <div className="mt-4">
                    <p className="font-semibold text-darkBlue mb-3">
                      Durée de maintien d’une réservation en attente (minutes)
                    </p>

                    <input
                      type="number"
                      min="1"
                      onWheel={(e) => e.currentTarget.blur()}
                      className={inputBase}
                      {...register("pending_duration_minutes", {
                        required: !auto_accept,
                        min: 1,
                        valueAsNumber: true,
                      })}
                    />

                    <p className="text-xs text-darkBlue/50 mt-2">
                      Lorsqu’une réservation est en attente de validation, elle
                      bloque la table pendant cette durée. Si la fermeture
                      survient avant la fin du délai, le temps restant est
                      reporté au prochain créneau d’ouverture.
                    </p>

                    {errors.pending_duration_minutes && (
                      <p className="text-red text-sm mt-1">
                        Veuillez saisir une durée valide supérieure à 0.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- Bloc: Automatisations --- */}
        <div className={card}>
          <div className={cardInner}>
            <p className={sectionTitle}>
              <Settings2 className="size-4 shrink-0 opacity-60" />
              {t("reservations:titles.automation", "Automatisations")}
            </p>

            <div className={divider} />

            <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-3">
              {/* Auto finish (sans minutes) */}
              <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-darkBlue">
                      {t(
                        "reservations:labels.reservationDurationTitle",
                        "Passer automatiquement en “Terminée”",
                      )}
                    </p>
                    <p className="text-xs text-darkBlue/50">
                      {t(
                        "reservations:messages.autoFinishUsesOccupancy",
                        "Utilise la durée d’occupation (midi/soir) pour libérer la table.",
                      )}
                    </p>
                  </div>

                  <label className={toggleWrap}>
                    <span
                      className={[
                        toggleBase,
                        auto_finish_reservations ? toggleOn : toggleOff,
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        id="auto_finish_reservations"
                        {...register("auto_finish_reservations")}
                      />
                      <span
                        className={[
                          toggleDot,
                          auto_finish_reservations ? toggleDotOn : toggleDotOff,
                        ].join(" ")}
                      />
                    </span>
                  </label>
                </div>

                <div className="mt-3 text-xs text-darkBlue/55">
                  {auto_finish_reservations
                    ? t(
                        "reservations:messages.autoFinishEnabledHint",
                        "Active : une réservation “En cours” passera en “Terminée” après la durée définie ci-dessous (midi/soir).",
                      )
                    : t(
                        "reservations:messages.autoFinishDisabledHint",
                        "Désactivé : vous devez terminer la réservation manuellement.",
                      )}
                </div>
              </div>

              {/* Deletion duration */}
              <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-darkBlue">
                      {t(
                        "reservations:labels.deletionDurationTitle",
                        "Supprimer automatiquement",
                      )}
                    </p>
                    <p className="text-xs text-darkBlue/50">
                      {t(
                        "reservations:messages.deletionHelp",
                        "Supprime une réservation “Terminée” après…",
                      )}
                    </p>
                  </div>

                  <label className={toggleWrap}>
                    <span
                      className={[
                        toggleBase,
                        deletion_duration ? toggleOn : toggleOff,
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        id="deletion_duration"
                        {...register("deletion_duration", {
                          onChange: (e) => {
                            if (!e.target.checked) {
                              setValue("deletion_duration_minutes", 1440);
                            }
                          },
                        })}
                      />
                      <span
                        className={[
                          toggleDot,
                          deletion_duration ? toggleDotOn : toggleDotOff,
                        ].join(" ")}
                      />
                    </span>
                  </label>
                </div>

                <div className="mt-3">
                  <select
                    id="deletion_duration_minutes"
                    {...register("deletion_duration_minutes", {
                      required: true,
                    })}
                    disabled={!deletion_duration}
                    className={selectBase}
                  >
                    <option value="1">
                      1 {t("reservations:labels.minute", "min")}
                    </option>
                    <option value="15">
                      15 {t("reservations:labels.minutes", "min")}
                    </option>
                    <option value="30">
                      30 {t("reservations:labels.minutes", "min")}
                    </option>
                    <option value="60">
                      1 {t("reservations:labels.hour", "h")}
                    </option>
                    <option value="120">
                      2 {t("reservations:labels.hours", "h")}
                    </option>
                    <option value="360">
                      6 {t("reservations:labels.hours", "h")}
                    </option>
                    <option value="720">
                      12 {t("reservations:labels.hours", "h")}
                    </option>
                    <option value="1440">
                      24 {t("reservations:labels.hours", "h")} (défaut)
                    </option>
                    <option value={String(7 * 24 * 60)}>
                      1 {t("reservations:labels.week", "semaine")}
                    </option>
                    <option value={String(30 * 24 * 60)}>
                      1 {t("reservations:labels.month", "mois")}
                    </option>
                    <option value={String(6 * 30 * 24 * 60)}>
                      6 {t("reservations:labels.months", "mois")}
                    </option>
                    <option value={String(365 * 24 * 60)}>
                      1 {t("reservations:labels.year", "an")}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            {/* ✅ Durées d'occupation : visibles même si manage OFF (utile pour auto-finish) */}
            <div className={divider} />

            <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
              <p className="font-semibold text-darkBlue">
                {t(
                  "reservations:labels.tableOccupancy",
                  "Durée d’occupation d’une table",
                )}
              </p>
              <p className="text-xs text-darkBlue/50">
                Utilisée pour clôturer automatiquement une réservation et (si
                activé) calculer les disponibilités. Ex : 90 min le midi, 120
                min le soir.
              </p>

              <div className="mt-3 grid grid-cols-1 midTablet:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-3">
                  <p className="text-sm font-semibold text-darkBlue">
                    {t("reservations:labels.lunch", "Midi")}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      id="table_occupancy_lunch_minutes"
                      inputMode="numeric"
                      {...register("table_occupancy_lunch_minutes", { min: 1 })}
                      placeholder="-"
                      className={[
                        inputBase,
                        "text-center",
                        durationError?.lunch ? "border-red" : "",
                      ].join(" ")}
                    />
                    <span className="text-sm text-darkBlue/60 whitespace-nowrap">
                      {t("reservations:labels.minute(s)", "min")}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-3">
                  <p className="text-sm font-semibold text-darkBlue">
                    {t("reservations:labels.dinner", "Soir")}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      id="table_occupancy_dinner_minutes"
                      inputMode="numeric"
                      {...register("table_occupancy_dinner_minutes", {
                        min: 1,
                      })}
                      placeholder="-"
                      className={[
                        inputBase,
                        "text-center",
                        durationError?.dinner ? "border-red" : "",
                      ].join(" ")}
                    />
                    <span className="text-sm text-darkBlue/60 whitespace-nowrap">
                      {t("reservations:labels.minute(s)", "min")}
                    </span>
                  </div>
                </div>
              </div>

              {(durationError?.lunch || durationError?.dinner) && (
                <p className="mt-2 text-xs text-red">
                  {t(
                    "reservations:errors.durationRequired2",
                    "Veuillez renseigner les deux durées (midi et soir).",
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* --- Bloc: Gestion intelligente + tables --- */}
        <div className={card}>
          <div className={cardInner}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={sectionTitle}>
                  <Wand2 className="size-4 shrink-0 opacity-60" />
                  {t(
                    "reservations:labels.manageDisponibilities",
                    "Gestion intelligente",
                  )}
                </p>
                <p className={hint}>
                  {t(
                    "reservations:messages.manageHelp",
                    "Calcule les disponibilités selon les tables et le nombre de personnes.",
                  )}
                </p>
              </div>

              <label className={toggleWrap}>
                <span
                  className={[
                    toggleBase,
                    manage_disponibilities ? toggleOn : toggleOff,
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    id="manage_disponibilities"
                    {...register("manage_disponibilities")}
                  />
                  <span
                    className={[
                      toggleDot,
                      manage_disponibilities ? toggleDotOn : toggleDotOff,
                    ].join(" ")}
                  />
                </span>
              </label>
            </div>

            {manualTablesNeedingAssignment > 0 && (
              <div className="mt-4 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm text-darkBlue/80">
                <p className="font-semibold text-darkBlue">
                  Attention : tables saisies manuellement
                </p>
                <p className="mt-1 whitespace-pre-line text-darkBlue/70">
                  Des tables avaient été saisies manuellement quand la gestion
                  intelligente n’était pas activée.
                  {"\n"}Pour éviter les conflits, veuillez assigner une table
                  dans les réservations concernées.
                </p>
                <p className="mt-2 text-xs text-darkBlue/60">
                  {manualTablesNeedingAssignment} réservation(s) concernée(s).
                </p>

                <button
                  type="button"
                  onClick={fetchManualTablesToFix}
                  className="mt-3 inline-flex items-center justify-center rounded-xl bg-darkBlue text-white px-4 h-10 text-sm font-semibold hover:opacity-90 transition"
                >
                  {manualToFixLoading
                    ? "Chargement…"
                    : "Voir les réservations à corriger"}
                </button>

                {manualToFixError && (
                  <p className="mt-2 text-xs text-red">{manualToFixError}</p>
                )}

                {manualToFix.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {manualToFix.map((r) => (
                      <div
                        key={String(r._id)}
                        className="rounded-xl border border-darkBlue/10 bg-white/70 px-3 py-2"
                      >
                        <p className="text-sm font-semibold text-darkBlue">
                          {fmtShortFR(r.reservationDate)} •{" "}
                          {String(r.reservationTime || "").slice(0, 5)}
                          {" — "}
                          {r.customerName || "Client"}
                        </p>
                        <p className="text-xs text-darkBlue/60">
                          {r.numberOfGuests ? `${r.numberOfGuests} pers.` : ""}
                          {r.tableName ? ` • Table: ${r.tableName}` : ""}
                          {r.status ? ` • ${statusLabel(r.status)}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {manage_disponibilities && (
              <>
                <div className={divider} />

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className={chip}>
                    <CheckCircle2 className="size-4 shrink-0 opacity-60" />
                    <span>
                      {tablesCount}{" "}
                      {t(
                        "reservations:labels.tablesCount",
                        "table(s) configurée(s)",
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddTable}
                    className="inline-flex items-center justify-center size-11 rounded-2xl bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                    aria-label={t(
                      "reservations:buttons.addTable",
                      "Ajouter une table",
                    )}
                    title={t(
                      "reservations:buttons.addTable",
                      "Ajouter une table",
                    )}
                  >
                    <Plus className="size-4 shrink-0" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 midTablet:grid-cols-2 gap-3">
                  {fields.map((field, index) => {
                    const nameError = !!tableErrors[index]?.name;
                    const seatsError = !!tableErrors[index]?.seats;

                    return (
                      <div
                        key={field.id}
                        className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3"
                      >
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder={t(
                              "reservations:placeholders.tableName",
                              "Nom / n° table",
                            )}
                            {...register(`tables.${index}.name`)}
                            className={[
                              inputBase,
                              nameError ? "border-red" : "",
                            ].join(" ")}
                          />

                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder={t(
                              "reservations:placeholders.seats",
                              "Places",
                            )}
                            {...register(`tables.${index}.seats`, { min: 1 })}
                            className={[
                              inputBase,
                              "text-center",
                              seatsError ? "border-red" : "",
                            ].join(" ")}
                          />

                          <button
                            type="button"
                            onClick={() => handleRemoveTable(index)}
                            className="min-w-[44px] flex items-center justify-center size-11 rounded-2xl bg-red text-white shadow-sm hover:opacity-75 active:scale-[0.98] transition"
                            aria-label={t(
                              "reservations:buttons.delete",
                              "Supprimer",
                            )}
                            title={t(
                              "reservations:buttons.delete",
                              "Supprimer",
                            )}
                          >
                            <Trash2 className="size-4 shrink-0" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* --- Actions --- */}
        <div className="flex flex-col midTablet:flex-row items-stretch midTablet:items-center justify-end gap-3 pt-3 pb-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-5 h-11 text-sm font-semibold text-darkBlue"
          >
            <X className="size-4 shrink-0 text-darkBlue/60" />
            {t("reservations:buttons.back", "Retour")}
          </button>

          <button
            type="submit"
            disabled={isLoading}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-2xl px-5 h-11",
              "text-sm font-semibold text-white",
              "bg-blue hover:bg-blue/90 active:scale-[0.98] transition",
              isLoading ? "opacity-50 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" />
                {t("reservations:buttons.loading", "En cours…")}
              </>
            ) : (
              t("reservations:buttons.validate", "Valider")
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
