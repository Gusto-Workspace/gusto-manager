import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Info,
  Save,
  Check,
  Loader2,
} from "lucide-react";
import SettingsInfoModal from "../../_shared/settings-info-modal.component";
import { getSmartAvailabilitySetupState } from "./smart-availability.guard";
import {
  generateReservationTimeOptions,
  sortReservationTimesByServiceOrder,
} from "@/_assets/utils/reservation-service-time";

const DAYS = [
  { value: 0, short: "Lun", label: "Lundi" },
  { value: 1, short: "Mar", label: "Mardi" },
  { value: 2, short: "Mer", label: "Mercredi" },
  { value: 3, short: "Jeu", label: "Jeudi" },
  { value: 4, short: "Ven", label: "Vendredi" },
  { value: 5, short: "Sam", label: "Samedi" },
  { value: 6, short: "Dim", label: "Dimanche" },
];

function hasDay(limit) {
  return Number.isInteger(limit?.day) && limit.day >= 0 && limit.day <= 6;
}

function buildLimitLocalId(day, time) {
  return `slot-cover-limit-${day}-${time}-${Date.now()}`;
}

function getDayHours({ restaurantData, reservationHours, sameHoursAsRestaurant, day }) {
  const source = sameHoursAsRestaurant
    ? restaurantData?.opening_hours
    : reservationHours;
  const dayHours = Array.isArray(source) ? source[day] : null;

  if (!dayHours || dayHours?.isClosed) return null;
  if (!Array.isArray(dayHours.hours) || dayHours.hours.length === 0) return null;

  return dayHours.hours;
}

function resolveSlotLimit(limits, day, time) {
  const sameTime = limits.filter(
    (limit) => String(limit?.time || "").slice(0, 5) === time,
  );
  const exact = sameTime.find((limit) => hasDay(limit) && limit.day === day);
  const fallback = sameTime.find((limit) => !hasDay(limit));

  return {
    exact,
    fallback,
    effective: exact || fallback || null,
    enabled: exact
      ? exact.active !== false
      : fallback
        ? fallback.active !== false
        : false,
  };
}

function formatCustomPendingDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const duration = [
    hours ? `${hours} h` : "",
    remainingMinutes ? `${remainingMinutes} min` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `${duration} (durée actuelle)`;
}

export default function SlotsParametersComponent({
  register,
  watch,
  setValue,
  errors,
  auto_accept,
  restaurantData,
  sameHoursAsRestaurant = true,
  reservationHours = [],
  interval,
  saveUI,
  onSave,
  savePresentation = "full",
  slotCoverLimits = [],
  onSlotCoverLimitsChange,
}) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [showPendingDurationInfo, setShowPendingDurationInfo] = useState(false);

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

  const saveBtnBase =
    "inline-flex items-center gap-2 rounded-xl px-3 h-10 text-sm font-semibold transition";
  const saveBtnPrimary =
    "bg-darkBlue text-white hover:opacity-90 active:scale-[0.98]";
  const saveBtnDone =
    "bg-white text-darkBlue border border-darkBlue opacity-60";
  const showSaveButton = saveUI?.dirty || saveUI?.saving || saveUI?.saved;
  const safeSlotCoverLimits = Array.isArray(slotCoverLimits)
    ? slotCoverLimits
    : [];

  const selectedDayHours = useMemo(
    () =>
      getDayHours({
        restaurantData,
        reservationHours,
        sameHoursAsRestaurant,
        day: selectedDay,
      }),
    [restaurantData, reservationHours, sameHoursAsRestaurant, selectedDay],
  );

  const generatedSlots = useMemo(() => {
    if (!selectedDayHours) return [];

    return sortReservationTimesByServiceOrder(
      selectedDayHours.flatMap(({ open, close }) =>
        generateReservationTimeOptions(open, close, interval || 30),
      ),
    );
  }, [interval, selectedDayHours]);

  function updateLimits(nextLimits) {
    onSlotCoverLimitsChange?.(nextLimits);
  }

  function upsertExactDayLimit({ day, time, patch }) {
    const existingIndex = safeSlotCoverLimits.findIndex(
      (limit) =>
        hasDay(limit) &&
        limit.day === day &&
        String(limit?.time || "").slice(0, 5) === time,
    );

    if (existingIndex >= 0) {
      updateLimits(
        safeSlotCoverLimits.map((limit, index) =>
          index === existingIndex ? { ...limit, ...patch } : limit,
        ),
      );
      return;
    }

    updateLimits([
      ...safeSlotCoverLimits,
      {
        localId: buildLimitLocalId(day, time),
        day,
        time,
        maxCovers: "",
        active: true,
        ...patch,
      },
    ]);
  }

  function removeExactDayLimit(day, time) {
    updateLimits(
      safeSlotCoverLimits.filter(
        (limit) =>
          !(
            hasDay(limit) &&
            limit.day === day &&
            String(limit?.time || "").slice(0, 5) === time
          ),
      ),
    );
  }

  function handleToggleSlotLimit(day, time, checked) {
    const { exact, fallback, effective } = resolveSlotLimit(
      safeSlotCoverLimits,
      day,
      time,
    );
    const currentMax = effective?.maxCovers || fallback?.maxCovers || "";

    if (checked) {
      upsertExactDayLimit({
        day,
        time,
        patch: {
          active: true,
          maxCovers: currentMax,
        },
      });
      return;
    }

    if (fallback) {
      upsertExactDayLimit({
        day,
        time,
        patch: {
          active: false,
          maxCovers: currentMax || fallback.maxCovers || 1,
        },
      });
      return;
    }

    if (exact) {
      removeExactDayLimit(day, time);
    }
  }

  function handleMaxCoversChange(day, time, value) {
    const { effective } = resolveSlotLimit(safeSlotCoverLimits, day, time);

    upsertExactDayLimit({
      day,
      time,
      patch: {
        active: true,
        maxCovers: value,
        ...(effective?._id && hasDay(effective) ? { _id: effective._id } : {}),
      },
    });
  }

  const selectedDayLabel =
    DAYS.find((day) => day.value === selectedDay)?.label || "ce jour";
  const pendingDurationOptions = [60, 120, 300, 720, 1440];
  const pendingDurationMinutes = Number(watch("pending_duration_minutes") ?? 120);
  const pendingDurationUntilReservation =
    watch("pending_duration_unlimited") === true;
  const hasCustomPendingDuration =
    Number.isFinite(pendingDurationMinutes) &&
    pendingDurationMinutes > 0 &&
    !pendingDurationOptions.includes(pendingDurationMinutes);
  const floorplan = restaurantData?.reservationsSettings?.floorplan;
  const floorplanCanBeUsed =
    floorplan?.enabled === true &&
    getSmartAvailabilitySetupState({
      tablesCatalog: restaurantData?.reservationsSettings?.tables,
      floorplanRooms: floorplan?.rooms,
    }).canEnable;
  const showLongPendingDurationWarning =
    !auto_accept &&
    floorplanCanBeUsed &&
    (pendingDurationUntilReservation ||
      pendingDurationMinutes === 720 ||
      pendingDurationMinutes === 1440);

  return (
    <div className={card}>
      <div className={cardInner}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={sectionTitle}>
              <Clock className="size-4 shrink-0 opacity-60" />
              Créneaux
            </p>
            <p className={hint}>Paramètres des créneaux et de la validation.</p>
          </div>

          {showSaveButton && (
            <button
              type="button"
              onClick={onSave}
              disabled={saveUI?.saving || saveUI?.saved}
              className={[
                savePresentation === "icon"
                  ? "inline-flex h-10 min-w-10 items-center justify-center rounded-xl transition"
                  : saveBtnBase,
                saveUI?.saved ? saveBtnDone : saveBtnPrimary,
                saveUI?.saving ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
              aria-label="Enregistrer"
              title="Enregistrer"
            >
              {savePresentation === "icon" ? (
                saveUI?.saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : saveUI?.saved ? (
                  <Check className="size-4" />
                ) : (
                  <Save className="size-4" />
                )
              ) : saveUI?.saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Enregistrement…
                </>
              ) : saveUI?.saved ? (
                <>
                  <Check className="size-4" />
                  Enregistré
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Enregistrer
                </>
              )}
            </button>
          )}
        </div>

        <div className={divider} />

        <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3 h-fit">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-darkBlue">
                  Refuser les réservations pendant le service
                </p>
                <p className="text-xs text-darkBlue/50 mt-1">
                  Ferme automatiquement les réservations en ligne pour les
                  créneaux du service en cours. Les services futurs restent
                  disponibles.
                </p>
              </div>

              <label className={toggleWrap}>
                <span
                  className={[
                    toggleBase,
                    watch("refuse_public_reservations_during_service")
                      ? toggleOn
                      : toggleOff,
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    id="refuse_public_reservations_during_service"
                    {...register("refuse_public_reservations_during_service")}
                  />
                  <span
                    className={[
                      toggleDot,
                      watch("refuse_public_reservations_during_service")
                        ? toggleDotOn
                        : toggleDotOff,
                    ].join(" ")}
                  />
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3 h-fit">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-darkBlue">
                  Accepter automatiquement les demandes de réservations de votre
                  site internet
                </p>
                <p className="text-xs text-darkBlue/50 mt-1">
                  Les réservations du site passent directement en “Confirmée”.
                </p>
              </div>

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
            </div>
          </div>

          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <p className="font-semibold text-darkBlue">
              Intervalle entre les créneaux
            </p>
            <p className="text-xs text-darkBlue/50">
              Temps minimum entre deux créneaux.
            </p>

            <div className="mt-3">
              <select
                id="interval"
                {...register("interval", { required: true })}
                className={selectBase}
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">1 h</option>
              </select>

              {errors?.interval && (
                <p className="mt-2 text-xs text-red">
                  Veuillez choisir un intervalle.
                </p>
              )}
            </div>
          </div>

          {!auto_accept && (
            <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
              <div className="mb-3 flex items-center gap-2">
                <label
                  htmlFor="pending_duration_minutes"
                  className="font-semibold text-darkBlue"
                >
                  Durée de validation d’une réservation en attente
                </label>
                <button
                  type="button"
                  onClick={() => setShowPendingDurationInfo(true)}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-darkBlue/15 text-darkBlue/60 transition hover:bg-darkBlue/5"
                  aria-label="Informations sur la durée de validation"
                >
                  <Info className="size-3" />
                </button>
              </div>

              <select
                id="pending_duration_minutes"
                value={
                  pendingDurationUntilReservation
                    ? "until-reservation"
                    : String(pendingDurationMinutes || 120)
                }
                className={selectBase}
                {...register("pending_duration_minutes", {
                  min: 1,
                  valueAsNumber: true,
                })}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "until-reservation") {
                    setValue("pending_duration_unlimited", true, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    return;
                  }

                  setValue("pending_duration_minutes", Number(value), {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  setValue("pending_duration_unlimited", false, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
              >
                {hasCustomPendingDuration && !pendingDurationUntilReservation && (
                  <option value={String(pendingDurationMinutes)}>
                    {formatCustomPendingDuration(pendingDurationMinutes)}
                  </option>
                )}
                <option value="60">1 heure</option>
                <option value="120">2 heures</option>
                <option value="300">5 heures</option>
                <option value="720">12 heures</option>
                <option value="1440">24 heures</option>
                <option value="until-reservation">
                  Jusqu’à l’heure de la réservation
                </option>
              </select>

              <input
                type="hidden"
                {...register("pending_duration_unlimited")}
              />

              {errors?.pending_duration_minutes && (
                <p className="mt-1 text-sm text-red">
                  Veuillez choisir une durée valide.
                </p>
              )}

              {showLongPendingDurationWarning && (
                <p className="mt-2 flex items-start gap-2 rounded-xl border border-orange/20 bg-orange/10 p-2 text-xs text-darkBlue/70">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-orange" />
                  <span>
                    Une réservation en attente peut bloquer une table pendant
                    une longue période, jusqu’à l’heure prévue de la réservation.
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className={divider} />

        <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
          <p className="font-semibold text-darkBlue">
            Capacité maximale par service
          </p>
          <p className="mt-1 text-xs text-darkBlue/50">
            Limite le total des couverts acceptés sur le service. Laisse un
            champ vide pour ne pas appliquer de limite.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 midTablet:grid-cols-2">
            {[
              { name: "max_covers_lunch", label: "Service du midi" },
              { name: "max_covers_dinner", label: "Service du soir" },
            ].map((field) => (
              <label key={field.name} className="block">
                <span className="mb-2 block text-sm font-semibold text-darkBlue/75">
                  {field.label}
                </span>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    placeholder="Sans limite"
                    onWheel={(event) => event.currentTarget.blur()}
                    className={`${inputBase} pr-20`}
                    {...register(field.name, {
                      min: 1,
                      validate: (value) =>
                        value === "" || Number.isInteger(Number(value)),
                    })}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-darkBlue/45">
                    couverts
                  </span>
                </div>
                {errors?.[field.name] ? (
                  <span className="mt-2 block text-xs text-red">
                    Saisis un nombre entier supérieur à 0.
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </div>

        <div className={divider} />

        <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
          <div className="flex flex-col gap-3 midTablet:flex-row midTablet:items-start midTablet:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-darkBlue">
                Capacité max par jour et créneau
              </p>
              <p className="text-xs text-darkBlue/50 mt-1">
                Sélectionne un jour, puis active une limite directement sur le
                créneau concerné.
              </p>
            </div>

            <p className="rounded-full bg-blue/10 px-3 py-1 text-xs font-semibold text-blue">
              {selectedDayLabel}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => setSelectedDay(day.value)}
                className={[
                  "h-10 rounded-2xl border px-4 text-sm font-semibold transition",
                  selectedDay === day.value
                    ? "border-blue bg-blue text-white shadow-sm"
                    : "border-darkBlue/10 bg-white text-darkBlue/70 hover:border-blue/30 hover:text-blue",
                ].join(" ")}
                title={day.label}
              >
                {day.short}
              </button>
            ))}
          </div>

          <div className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border border-darkBlue/10 bg-white/70">
            {!generatedSlots.length ? (
              <div className="p-4 text-sm text-darkBlue/55">
                Aucun créneau disponible pour {selectedDayLabel.toLowerCase()}.
              </div>
            ) : (
              <div className="divide-y divide-darkBlue/10">
                {generatedSlots.map((time) => {
                  const { effective, enabled, fallback, exact } =
                    resolveSlotLimit(safeSlotCoverLimits, selectedDay, time);
                  const maxCovers = effective?.maxCovers || "";
                  const usesGlobalFallback = Boolean(fallback && !exact);

                  return (
                    <div
                      key={`${selectedDay}-${time}`}
                      className="grid grid-cols-1 gap-3 p-3 midTablet:grid-cols-[90px_1fr_170px] midTablet:items-center"
                    >
                      <div>
                        <p className="text-base font-semibold text-darkBlue">
                          {time}
                        </p>
                        {usesGlobalFallback && (
                          <p className="mt-1 text-[11px] text-darkBlue/45">
                            Règle globale
                          </p>
                        )}
                      </div>

                      <label className="inline-flex items-center gap-3 text-sm font-semibold text-darkBlue/70">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) =>
                            handleToggleSlotLimit(
                              selectedDay,
                              time,
                              event.target.checked,
                            )
                          }
                          className="size-4 rounded border-darkBlue/20 text-blue focus:ring-blue/20"
                        />
                        Activer une capacité max
                      </label>

                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          inputMode="numeric"
                          disabled={!enabled}
                          value={enabled ? maxCovers : ""}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(event) =>
                            handleMaxCoversChange(
                              selectedDay,
                              time,
                              event.target.value,
                            )
                          }
                          placeholder="Ex : 30"
                          className={[
                            inputBase,
                            "pr-20",
                            !enabled ? "opacity-50 cursor-not-allowed" : "",
                          ].join(" ")}
                        />
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-darkBlue/45">
                          couverts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {showPendingDurationInfo && (
        <SettingsInfoModal
          title="Durée de validation d’une réservation en attente"
          onClose={() => setShowPendingDurationInfo(false)}
        >
          {floorplanCanBeUsed
            ? "La réservation reste en attente jusqu’à sa validation ou son expiration et bloque la table pendant ce temps."
            : "La réservation reste en attente jusqu’à sa validation ou son expiration et compte dans les disponibilités pendant ce temps."}{" "}
          Le délai suit les horaires d’ouverture : s’il est interrompu par une
          fermeture, il reprend à la prochaine ouverture. Il ne dépasse jamais
          l’heure prévue de la réservation. À l’échéance, elle passe au statut
          « Expirée » et libère les disponibilités. L’option « Jusqu’à l’heure
          de la réservation » supprime le délai avant cette échéance. Si les
          horaires d’ouverture ne sont pas configurés, un délai de secours de
          12 heures est appliqué. La réservation expirée reste consultable
          selon la durée de conservation configurée dans les automatisations.
        </SettingsInfoModal>
      )}
    </div>
  );
}
