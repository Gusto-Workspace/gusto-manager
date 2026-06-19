import { useEffect, useState } from "react";

// AXIOS
import axios from "axios";

// ICONS
import { CalendarDays, Check, Loader2, Plus, Save, Trash2 } from "lucide-react";

// COMPONENTS
import HoursRestaurantComponent from "../../restaurant/hours.restaurant.component";

export default function HoursParametersComponent({
  // RHF
  register,
  same_hours_as_restaurant,

  // Data
  restaurantId,
  reservationHours,
  setReservationHours,
  exceptionalOpenings,
  setExceptionalOpenings,
  setRestaurantData,

  // Context flags
  dataLoading,
  closeEditing,
  savePresentation = "full",
}) {
  const [localExceptionalOpenings, setLocalExceptionalOpenings] = useState([]);
  const [exceptionalSaving, setExceptionalSaving] = useState(false);
  const [exceptionalSaved, setExceptionalSaved] = useState(false);

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
  const inputCls =
    "h-10 rounded-xl border border-darkBlue/15 bg-white px-3 text-sm text-darkBlue outline-none transition focus:border-blue/60";
  const iconBtn =
    "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-darkBlue/10 bg-white text-darkBlue/70 transition hover:bg-darkBlue/5 disabled:cursor-not-allowed disabled:opacity-50";
  const saveBtnBase =
    "inline-flex items-center gap-2 rounded-xl px-3 h-10 text-sm font-semibold transition";
  const saveBtnPrimary =
    "bg-darkBlue text-white hover:opacity-90 active:scale-[0.98]";
  const saveBtnDone =
    "bg-white text-darkBlue border border-darkBlue opacity-60";

  useEffect(() => {
    setLocalExceptionalOpenings(
      Array.isArray(exceptionalOpenings) ? exceptionalOpenings : [],
    );
  }, [exceptionalOpenings]);

  function cleanExceptionalOpenings(openings) {
    const byDate = new Map();

    (Array.isArray(openings) ? openings : []).forEach((opening) => {
      const date = String(opening?.date || "")
        .trim()
        .slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

      const hours = (Array.isArray(opening?.hours) ? opening.hours : [])
        .map((range) => ({
          open: String(range?.open || "")
            .trim()
            .slice(0, 5),
          close: String(range?.close || "")
            .trim()
            .slice(0, 5),
        }))
        .filter(
          (range) => range.open && range.close && range.open < range.close,
        );

      if (!hours.length) return;
      byDate.set(date, { date, hours });
    });

    return Array.from(byDate.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }

  function serializeExceptionalOpenings(openings) {
    return JSON.stringify(cleanExceptionalOpenings(openings));
  }

  const exceptionalDirty =
    serializeExceptionalOpenings(localExceptionalOpenings) !==
    serializeExceptionalOpenings(exceptionalOpenings);
  const showExceptionalSaveButton =
    exceptionalDirty || exceptionalSaving || exceptionalSaved;

  function onReservationHoursChange(data) {
    setReservationHours?.(data.hours);
  }

  async function saveReservationHoursImmediate(newHours) {
    try {
      const token = localStorage.getItem("token");
      if (!restaurantId) return;

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

  function addExceptionalOpening() {
    setExceptionalSaved(false);
    setLocalExceptionalOpenings((prev) => [
      ...prev,
      { date: "", hours: [{ open: "", close: "" }] },
    ]);
  }

  function removeExceptionalOpening(index) {
    setExceptionalSaved(false);
    setLocalExceptionalOpenings((prev) => prev.filter((_, i) => i !== index));
  }

  function updateExceptionalOpening(index, patch) {
    setExceptionalSaved(false);
    setLocalExceptionalOpenings((prev) =>
      prev.map((opening, i) =>
        i === index ? { ...opening, ...patch } : opening,
      ),
    );
  }

  function addExceptionalRange(index) {
    setExceptionalSaved(false);
    setLocalExceptionalOpenings((prev) =>
      prev.map((opening, i) =>
        i === index
          ? {
              ...opening,
              hours: [
                ...(Array.isArray(opening.hours) ? opening.hours : []),
                { open: "", close: "" },
              ],
            }
          : opening,
      ),
    );
  }

  function updateExceptionalRange(index, rangeIndex, field, value) {
    setExceptionalSaved(false);
    setLocalExceptionalOpenings((prev) =>
      prev.map((opening, i) => {
        if (i !== index) return opening;

        const hours = (Array.isArray(opening.hours) ? opening.hours : []).map(
          (range, j) =>
            j === rangeIndex ? { ...range, [field]: value } : range,
        );

        return { ...opening, hours };
      }),
    );
  }

  function removeExceptionalRange(index, rangeIndex) {
    setExceptionalSaved(false);
    setLocalExceptionalOpenings((prev) =>
      prev.map((opening, i) => {
        if (i !== index) return opening;

        const hours = (
          Array.isArray(opening.hours) ? opening.hours : []
        ).filter((_, j) => j !== rangeIndex);

        return {
          ...opening,
          hours: hours.length ? hours : [{ open: "", close: "" }],
        };
      }),
    );
  }

  async function saveExceptionalOpenings() {
    try {
      const token = localStorage.getItem("token");
      if (!restaurantId) return;

      const cleanedOpenings = cleanExceptionalOpenings(
        localExceptionalOpenings,
      );

      setExceptionalSaving(true);
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/parameters`,
        {
          parameters: {
            exceptional_openings: cleanedOpenings,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setRestaurantData?.(response.data.restaurant);
      setExceptionalOpenings?.(
        response?.data?.restaurant?.reservationsSettings
          ?.exceptional_openings || cleanedOpenings,
      );
      setLocalExceptionalOpenings(cleanedOpenings);
      setExceptionalSaved(true);
    } catch (e) {
      console.error("Erreur sauvegarde ouvertures exceptionnelles :", e);
    } finally {
      setExceptionalSaving(false);
    }
  }

  return (
    <div className={card}>
      <div className={cardInner}>
        <div className="flex items-center justify-between gap-4">
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

          <div className="flex items-center gap-3">
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

        <div className={divider} />
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-darkBlue">
                Ouvertures exceptionnelles
              </p>
              <p className={hint}>
                Ajoute une date réservable même si elle est fermée dans les
                horaires habituels.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addExceptionalOpening}
                disabled={exceptionalSaving}
                className={iconBtn}
                aria-label="Ajouter une ouverture exceptionnelle"
                title="Ajouter"
              >
                <Plus className="size-4" />
              </button>
              {showExceptionalSaveButton ? (
                <button
                  type="button"
                  onClick={saveExceptionalOpenings}
                  disabled={exceptionalSaving || exceptionalSaved}
                  className={[
                    savePresentation === "icon"
                      ? "inline-flex h-10 min-w-10 items-center justify-center rounded-xl transition"
                      : saveBtnBase,
                    exceptionalSaved ? saveBtnDone : saveBtnPrimary,
                    exceptionalSaving ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                  aria-label="Enregistrer les ouvertures exceptionnelles"
                  title="Enregistrer"
                >
                  {savePresentation === "icon" ? (
                    exceptionalSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : exceptionalSaved ? (
                      <Check className="size-4" />
                    ) : (
                      <Save className="size-4" />
                    )
                  ) : exceptionalSaving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Enregistrement…
                    </>
                  ) : exceptionalSaved ? (
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
              ) : null}
            </div>
          </div>

          {localExceptionalOpenings.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-darkBlue/15 bg-white/50 px-4 py-3 text-sm text-darkBlue/50">
              Aucune ouverture exceptionnelle.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {localExceptionalOpenings.map((opening, index) => (
                <div
                  key={`${opening?.date || "new"}-${index}`}
                  className="rounded-2xl border border-darkBlue/10 bg-white/70 p-3"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={String(opening?.date || "").slice(0, 10)}
                        onChange={(e) =>
                          updateExceptionalOpening(index, {
                            date: e.target.value,
                          })
                        }
                        disabled={exceptionalSaving}
                        className={`${inputCls} min-w-0 flex-1`}
                      />

                      <button
                        type="button"
                        onClick={() => removeExceptionalOpening(index)}
                        disabled={exceptionalSaving}
                        className={iconBtn}
                        aria-label="Supprimer cette ouverture"
                        title="Supprimer"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      {(Array.isArray(opening?.hours)
                        ? opening.hours
                        : [{ open: "", close: "" }]
                      ).map((range, rangeIndex) => (
                        <div
                          key={rangeIndex}
                          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_40px] items-center gap-2"
                        >
                          <input
                            type="time"
                            value={range?.open || ""}
                            onChange={(e) =>
                              updateExceptionalRange(
                                index,
                                rangeIndex,
                                "open",
                                e.target.value,
                              )
                            }
                            disabled={exceptionalSaving}
                            className={`${inputCls} min-w-[120px] flex-1`}
                          />
                          <span className="text-xs text-darkBlue/60">à</span>
                          <input
                            type="time"
                            value={range?.close || ""}
                            onChange={(e) =>
                              updateExceptionalRange(
                                index,
                                rangeIndex,
                                "close",
                                e.target.value,
                              )
                            }
                            disabled={exceptionalSaving}
                            className={`${inputCls} min-w-[120px] flex-1`}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              removeExceptionalRange(index, rangeIndex)
                            }
                            disabled={exceptionalSaving}
                            className={iconBtn}
                            aria-label="Retirer ce créneau"
                            title="Retirer ce créneau"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => addExceptionalRange(index)}
                        disabled={exceptionalSaving}
                        className="inline-flex h-9 w-fit items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 text-xs font-semibold text-darkBlue/70 transition hover:bg-darkBlue/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="size-3.5" />
                        Ajouter un créneau
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
