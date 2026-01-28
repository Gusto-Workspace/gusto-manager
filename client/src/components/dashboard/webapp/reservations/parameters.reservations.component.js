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
} from "lucide-react";

// COMPONENTS
import HoursRestaurantComponent from "../../restaurant/hours.restaurant.component";

// AXIOS
import axios from "axios";

/* -----------------------------------------
   Tooltip (click only) for disabled toggles
----------------------------------------- */
function DisabledToggleTooltip({ open, text }) {
  if (!open) return null;
  return (
    <span className="absolute z-20 right-0 top-11 w-[285px] rounded-2xl border border-darkBlue/10 bg-white shadow-lg px-4 py-3 text-xs text-darkBlue/70">
      {text}
    </span>
  );
}

export default function WebAppParametersReservationComponent(props) {
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
    defaultValues: {
      same_hours_as_restaurant: true,
      reservation_duration: false,
      deletion_duration: false,
      auto_accept: true,
      interval: "30",
      manage_disponibilities: false,
      tables: [
        { name: "", seats: "" },
        { name: "", seats: "" },
      ],
      reservation_duration_minutes: null,
      deletion_duration_minutes: 1440,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tables",
  });

  const [reservationHours, setReservationHours] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // UX errors (pas RHF)
  const [submitted, setSubmitted] = useState(false);
  const [tableErrors, setTableErrors] = useState({});
  const [durationError, setDurationError] = useState(false);

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
    // ferme tout puis ouvre celui demandé
    setDisabledHint((prev) => ({
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
    const onDocClick = (e) => {
      // si un tooltip est ouvert -> un clic ailleurs le ferme
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

  // Init depuis le contexte
  useEffect(() => {
    if (restaurantContext?.restaurantData?.reservations) {
      const { parameters } = restaurantContext.restaurantData.reservations;

      reset({
        same_hours_as_restaurant: parameters.same_hours_as_restaurant,
        reservation_duration: parameters.reservation_duration,
        deletion_duration: parameters.deletion_duration,
        auto_accept: parameters.auto_accept,
        interval: parameters.interval,
        manage_disponibilities: parameters.manage_disponibilities,
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
        reservation_duration_minutes:
          parameters.reservation_duration_minutes ?? "",
        deletion_duration_minutes: parameters.deletion_duration_minutes ?? 1440,
      });

      setReservationHours(parameters.reservation_hours);
      setIsLoading(false);
      setSubmitted(false);
      setTableErrors({});
      setDurationError(false);
      closeHints();
    }
  }, [restaurantContext.restaurantData?._id, reset]);

  const same_hours_as_restaurant = watch("same_hours_as_restaurant");
  const manage_disponibilities = watch("manage_disponibilities");
  const reservation_duration = watch("reservation_duration");
  const deletion_duration = watch("deletion_duration");
  const tablesWatch = watch("tables");

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

  // Quand la gestion intelligente est activée :
  // - forcer reservation_duration & auto_accept à true
  // - s'il n'y a pas de tables, injecter 2 lignes vides
  useEffect(() => {
    if (manage_disponibilities) {
      setValue("reservation_duration", true);
      setValue("auto_accept", true);

      const hasAnyRow = Array.isArray(tablesWatch) && tablesWatch.length > 0;
      if (!hasAnyRow) {
        append({ name: "", seats: "" });
        append({ name: "", seats: "" });
      }
    } else {
      setSubmitted(false);
      setTableErrors({});
      setDurationError(false);
      closeHints();
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
    try {
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
    } catch (err) {
      console.error(
        "Erreur lors de l’enregistrement immédiat des heures :",
        err,
      );
      throw err;
    }
  }

  function handleAddTable() {
    append({ name: "", seats: "" });
  }

  function handleRemoveTable(i) {
    remove(i);
  }

  async function onSubmit(data) {
    setSubmitted(true);

    // Validation tables
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

    // Validation durée si gestion intelligente active
    const duration = data.reservation_duration_minutes;
    if (manage_disponibilities && (!duration || Number(duration) < 1)) {
      setDurationError(true);
      setFocus("reservation_duration_minutes");
      return;
    } else {
      setDurationError(false);
    }

    const formData = {
      same_hours_as_restaurant: data.same_hours_as_restaurant,
      auto_accept: data.auto_accept,
      interval: data.interval,
      reservation_duration: data.reservation_duration,
      deletion_duration: data.deletion_duration,
      reservation_hours: data.same_hours_as_restaurant
        ? restaurantContext.restaurantData?.opening_hours
        : reservationHours,
      manage_disponibilities: data.manage_disponibilities,
      tables: sanitizedTables.map((tt) => ({
        name: tt.name,
        seats: tt.seats,
      })),
      reservation_duration_minutes: data.reservation_duration
        ? Number(data.reservation_duration_minutes)
        : null,
      deletion_duration_minutes: data.deletion_duration
        ? Number(data.deletion_duration_minutes)
        : 1440,
    };

    try {
      const token = localStorage.getItem("token");

      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations/parameters`,
        { parameters: formData },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      props.setRestaurantData(response.data.restaurant);
      router.push("/dashboard/webapp/reservations");
    } catch (error) {
      console.error(
        "Erreur lors de la mise à jour des paramètres de réservation :",
        error,
      );
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
    <section className="flex flex-col gap-6">
      {/* =========================
          ✅ HEADER (ne pas toucher)
          ========================= */}
      <div className="midTablet:hidden safe-top bg-lightGrey">
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
            <ReservationSvg
              width={26}
              height={26}
              className="min-h-[26px] min-w-[26px]"
              fillColor="#131E3690"
            />
            <div className="min-w-0">
              <p className="text-xl font-semibold text-darkBlue truncate">
                {t("reservations:titles.main", "Réservations")}
              </p>
              <p className="text-sm text-darkBlue/50 truncate">{subtitle}</p>
            </div>
          </div>

          <div className="shrink-0 w-[40px]" />
        </div>
      </div>

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
              onClick={handleBack}
            >
              {t("reservations:titles.main", "Réservations")}
            </span>
            <span className="text-darkBlue/30 select-none">/</span>
            <span className="font-semibold">{subtitle}</span>
          </h1>
        </div>

        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 rounded-lg border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-4 py-2 text-sm font-semibold text-darkBlue"
        >
          <ChevronLeft className="size-4 shrink-0 text-darkBlue/60" />
          {t("reservations:buttons.back", "Retour")}
        </button>
      </div>

      {/* =========================
          ✅ FORM (refonte UX mobile-first)
          ========================= */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
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

              {/* Toggle */}
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
                      same_hours_as_restaurant ? toggleDotOff : toggleDotOn,
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
            <p className={hint}>
              {t(
                "reservations:messages.slotsHelp",
                "Configure l’intervalle et les règles d’acceptation.",
              )}
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

                  {/* ✅ click on disabled toggle => show tooltip */}
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
                          manage_disponibilities
                            ? "opacity-50 cursor-pointer"
                            : "",
                        ].join(" ")}
                        title={
                          manage_disponibilities
                            ? "Activé automatiquement (gestion intelligente)"
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          id="auto_accept"
                          {...register("auto_accept")}
                          disabled={manage_disponibilities}
                        />
                        <span
                          className={[
                            toggleDot,
                            watch("auto_accept") ? toggleDotOn : toggleDotOff,
                          ].join(" ")}
                        />
                      </span>
                    </label>

                    <DisabledToggleTooltip
                      open={disabledHint.autoAccept}
                      text={t(
                        "reservations:messages.autoAcceptForced",
                        "Activé automatiquement (gestion intelligente)",
                      )}
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- Bloc: Statuts auto (Durée & suppression) --- */}
        <div className={card}>
          <div className={cardInner}>
            <p className={sectionTitle}>
              <Settings2 className="size-4 shrink-0 opacity-60" />
              {t("reservations:titles.automation", "Automatisations")}
            </p>
            <p className={hint}>
              {t(
                "reservations:messages.automationHelp",
                "Automatise la fin et/ou la suppression des réservations.",
              )}
            </p>

            <div className={divider} />

            <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-3">
              {/* Reservation duration */}
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
                        "reservations:labels.reservationDuration",
                        "Au bout de (minutes)",
                      )}
                    </p>
                  </div>

                  {/* ✅ click on disabled toggle => show tooltip */}
                  <span
                    className="relative inline-flex"
                    onClick={(e) => {
                      if (!manage_disponibilities) return;
                      e.stopPropagation();
                      openHint("reservationDuration");
                    }}
                  >
                    <label className={toggleWrap}>
                      <span
                        className={[
                          toggleBase,
                          reservation_duration ? toggleOn : toggleOff,
                          manage_disponibilities
                            ? "opacity-50 cursor-pointer"
                            : "",
                        ].join(" ")}
                        title={
                          manage_disponibilities
                            ? "Activé automatiquement (gestion intelligente)"
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          id="reservation_duration"
                          {...register("reservation_duration")}
                          disabled={manage_disponibilities}
                        />
                        <span
                          className={[
                            toggleDot,
                            reservation_duration ? toggleDotOn : toggleDotOff,
                          ].join(" ")}
                        />
                      </span>
                    </label>

                    <DisabledToggleTooltip
                      open={disabledHint.reservationDuration}
                      text="Activé automatiquement (gestion intelligente)"
                    />
                  </span>
                </div>

                {/* ✅ line: input + unit */}
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    id="reservation_duration_minutes"
                    inputMode="numeric"
                    {...register("reservation_duration_minutes", { min: 1 })}
                    disabled={!reservation_duration}
                    placeholder="-"
                    value={
                      reservation_duration
                        ? (watch("reservation_duration_minutes") ?? "")
                        : ""
                    }
                    className={[
                      inputBase,
                      "text-center",
                      durationError ? "border-red" : "",
                      !reservation_duration ? "placeholder:opacity-100" : "",
                    ].join(" ")}
                  />

                  <span className="text-sm text-darkBlue/60 whitespace-nowrap">
                    {t("reservations:labels.minute(s)", "min")}
                  </span>
                </div>

                {durationError && (
                  <p className="mt-2 text-xs text-red">
                    {t(
                      "reservations:errors.durationRequired",
                      "La durée est obligatoire en mode gestion intelligente.",
                    )}
                  </p>
                )}
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
        <div className="flex flex-col midTablet:flex-row items-stretch midTablet:items-center justify-end gap-3 pt-2">
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
