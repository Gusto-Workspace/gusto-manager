// HoursRestaurantComponent.jsx

import { Fragment, useEffect, useState } from "react";

// I18N
import { useTranslation } from "next-i18next";

// DATA
import { daysOfWeeksData } from "@/_assets/data/days-of-week.data";

// AXIOS
import axios from "axios";

// COMPONENTS
import DoubleSkeletonComponent from "../../_shared/skeleton/double-skeleton.component";
import { Edit, Loader2, Save, XCircle } from "lucide-react";

export default function HoursRestaurantComponent(props) {
  const { t } = useTranslation("restaurant");

  const [editing, setEditing] = useState(false);
  const [localHours, setLocalHours] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initialHours = daysOfWeeksData.map((day) => {
      const existingHour = props.reservations
        ? props.reservationHours?.find((hour) => hour.day === day)
        : props.openingHours?.find((hour) => hour.day === day);

      return {
        day,
        hours:
          existingHour?.hours?.length > 0
            ? existingHour.hours
            : [{ open: "", close: "" }],
        isClosed: existingHour?.isClosed || false,
      };
    });
    setLocalHours(initialHours);
  }, [props.openingHours, props.reservationHours, props.reservations]);

  function handleToggleEdit() {
    setEditing((prev) => !prev);
  }

  useEffect(() => {
    if (props.closeEditing) {
      setEditing(false);
    }
  }, [props.closeEditing]);

  function handleChange(day, index, field, value) {
    setLocalHours((prev) =>
      prev.map((item) => {
        if (item.day === day) {
          const updatedHours = item.hours.map((hour, i) =>
            i === index ? { ...hour, [field]: value } : hour
          );
          return { ...item, hours: updatedHours, isClosed: false };
        }
        return item;
      })
    );
  }

  function handleClosedChange(day, isClosed) {
    setLocalHours((prev) =>
      prev.map((item) =>
        item.day === day
          ? {
              ...item,
              isClosed,
              hours: isClosed
                ? [
                    { open: "", close: "" },
                    { open: "", close: "" },
                  ]
                : [{ open: "", close: "" }],
            }
          : item
      )
    );
  }

  function handleAddTimeSlot(day) {
    setLocalHours((prev) =>
      prev.map((item) =>
        item.day === day
          ? { ...item, hours: [...item.hours, { open: "", close: "" }] }
          : item
      )
    );
  }

  function handleRemoveTimeSlot(day, index) {
    setLocalHours((prev) =>
      prev.map((item) => {
        if (item.day === day) {
          const updatedHours = item.hours.filter((_, i) => i !== index);
          return {
            ...item,
            hours: updatedHours.length > 0 ? updatedHours : [],
            isClosed: updatedHours.length === 0 ? true : item.isClosed,
          };
        }
        return item;
      })
    );
  }

  // Enregistrement
  async function handleSave() {
    // Nettoyage : on supprime les créneaux vides
    const cleanedHours = localHours.map((dayHour) => {
      const filteredHours = dayHour.hours.filter(
        (hour) => hour.open !== "" || hour.close !== ""
      );
      const isClosed = filteredHours.length === 0 ? true : dayHour.isClosed;
      return {
        ...dayHour,
        hours: filteredHours.length > 0 ? filteredHours : [],
        isClosed,
      };
    });

    if (props.reservations) {
      // Sauvegarde immédiate côté back via le parent
      try {
        setSaving(true);
        if (typeof props.onSaveReservationHours === "function") {
          await props.onSaveReservationHours(cleanedHours);
        } else if (typeof props.onChange === "function") {
          // fallback possible pour compatibilité
          props.onChange({ hours: cleanedHours });
        }
        setEditing(false);
      } catch (e) {
        // Erreur déjà loguée par le parent
      } finally {
        setSaving(false);
      }
      return;
    }

    // Mode horaires d'ouverture (non réservations)
    const token = localStorage.getItem("token");

    try {
      setSaving(true);
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantId}/opening_hours`,
        { openingHours: cleanedHours },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      props.handleUpdateData?.(res.data.restaurant);
      setEditing(false);
    } catch (error) {
      console.error("Erreur lors de la mise à jour des horaires :", error);
    } finally {
      setSaving(false);
    }
  }

  const sectionCls =
    "bg-white/60 p-2 midTablet:p-6 rounded-2xl border border-darkBlue/10 shadow-sm w-full text-darkBlue flex flex-col gap-4";
  const rowCls =
    "group rounded-xl bg-white/70 border border-darkBlue/10 px-4 py-3 flex flex-col midTablet:flex-row justify-between items-center gap-4";
  const dayLabelCls = "font-semibold text-sm text-darkBlue";
  const timeInputCls =
    "h-9 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-sm outline-none transition placeholder:text-darkBlue/40";
  const closedBadgeCls =
    "inline-flex items-center justify-center rounded-full bg-darkBlue/5 px-3 py-1 text-xs font-medium text-darkBlue/60";

  return (
    <section className={sectionCls}>
      <div className="flex justify-between items-start w-full gap-6">
        <div className="text-balance">
          <h1 className="font-semibold text-lg text-darkBlue">
            {props.reservations
              ? t("hours.reservationsTitle", "Horaires des réservations")
              : t("hours.openingTitle", "Horaires d'ouverture")}
          </h1>
          <p className="text-xs text-darkBlue/60 max-w-md">
            {props.reservations
              ? t(
                  "hours.reservationsSubtitle",
                  "Définissez les créneaux disponibles pour les réservations en ligne."
                )
              : t(
                  "hours.openingSubtitle",
                  "Configurez les horaires affichés sur votre site et vos modules."
                )}
          </p>
        </div>
        <div className="flex gap-2">
          {editing && (
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              type="button"
            >
              {/* Texte sur mobile+ */}
              <span className="hidden mobile:flex rounded-lg text-white disabled:cursor-none bg-red px-4 py-2 gap-2 items-center transition-opacity duration-150">
                {t("cancel")}
              </span>

              {/* Icône seule sur très petit écran */}
              <span className="mobile:hidden rounded-lg text-white disabled:cursor-none bg-red px-3 py-2 flex gap-2 items-center transition-opacity duration-150">
                <XCircle className="size-5" />
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={editing ? handleSave : handleToggleEdit}
            disabled={saving}
          >
            {editing ? (
              <span className="rounded-lg text-white bg-blue px-4 py-2 flex gap-2 items-center transition-opacity duration-150">
                {saving ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-5 mobile:size-4 animate-spin" />
                    <span className="hidden mobile:flex">
                      {t("saving", "En cours…")}
                    </span>
                  </div>
                ) : (
                  <>
                    <span className="hidden mobile:flex">{t("save")}</span>
                    <span className="mobile:hidden flex">
                      <Save className="size-5" />
                    </span>
                  </>
                )}
              </span>
            ) : (
              <div className="rounded-lg text-white bg-blue px-4 py-2 flex gap-2 items-center transition-opacity duration-150">
                <Edit className="size-5" />
                <span className="hidden mobile:flex">
                  {t("edit", "Éditer")}
                </span>
              </div>
            )}
          </button>
        </div>
      </div>

      <hr className="opacity-10" />

      <ul className="mt-1 flex flex-col gap-3">
        {localHours.map((dayHour, dayIndex) => (
          <Fragment key={dayHour.day}>
            <li className={rowCls}>
              {/* Jour */}
              <span className={dayLabelCls}>{t(dayHour.day)}</span>

              {/* Contenu horaire */}
              <div className="w-full">
                {props.dataLoading ? (
                  <DoubleSkeletonComponent
                    justify={
                      props.reservations
                        ? "justify-center midTablet:justify-end"
                        : "justify-center"
                    }
                  />
                ) : editing ? (
                  <div className="flex flex-col midTablet:flex-row items-center justify-end gap-3 desktop:gap-6">
                    {dayHour.isClosed ? (
                      <div className="flex flex-col midTablet:flex-row items-center gap-1 midTablet:gap-2">
                        <input
                          type="time"
                          value=""
                          disabled
                          className={`${timeInputCls} opacity-50`}
                        />
                        <span className="text-xs text-darkBlue/60">
                          {t("hours.to")}
                        </span>
                        <input
                          type="time"
                          value=""
                          disabled
                          className={`${timeInputCls} opacity-50`}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col midTablet:flex-row items-center gap-4">
                        <div className="flex flex-col gap-3 midTablet:gap-2">
                          {dayHour.hours.map((hour, index) => (
                            <div
                              key={index}
                              className="relative flex flex-col midTablet:flex-row items-center gap-1 midTablet:gap-2 w-full"
                            >
                              {dayHour.hours.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveTimeSlot(dayHour.day, index)
                                  }
                                  className="text-red bg-red/30 min-w-6 h-6 rounded-full flex items-center justify-center ml-2 absolute -right-8 top-1/2 -translate-y-1/2 midTablet:static midTablet:right-auto midTablet:top-auto midTablet:translate-y-0"
                                  aria-label={t("hours.removeTimeSlot")}
                                  disabled={saving}
                                >
                                  &times;
                                </button>
                              )}

                              <input
                                type="time"
                                value={hour.open}
                                onChange={(e) =>
                                  handleChange(
                                    dayHour.day,
                                    index,
                                    "open",
                                    e.target.value
                                  )
                                }
                                disabled={dayHour.isClosed || saving}
                                className={`${timeInputCls} ${
                                  dayHour.isClosed ? "opacity-50" : ""
                                }`}
                              />

                              <span className="text-xs text-darkBlue/70">
                                {t("hours.to")}
                              </span>

                              <input
                                type="time"
                                value={hour.close}
                                onChange={(e) =>
                                  handleChange(
                                    dayHour.day,
                                    index,
                                    "close",
                                    e.target.value
                                  )
                                }
                                disabled={dayHour.isClosed || saving}
                                className={`${timeInputCls} ${
                                  dayHour.isClosed ? "opacity-50" : ""
                                }`}
                              />
                            </div>
                          ))}
                        </div>

                        {/* Bouton pour ajouter une nouvelle plage horaire */}
                        <button
                          type="button"
                          onClick={() => handleAddTimeSlot(dayHour.day)}
                          className="text-violet bg-violet/30 min-w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold"
                          aria-label={t("hours.addTimeSlot")}
                          disabled={saving}
                        >
                          +
                        </button>
                      </div>
                    )}

                    {/* Checkbox pour fermer le jour entier */}
                    <label className="flex items-center gap-2 text-xs text-darkBlue/80">
                      <input
                        type="checkbox"
                        checked={dayHour.isClosed}
                        onChange={(e) =>
                          handleClosedChange(dayHour.day, e.target.checked)
                        }
                        disabled={saving}
                      />
                      {t("hours.close")}
                    </label>
                  </div>
                ) : (
                  <div className="flex flex-col items-center midTablet:items-end gap-1">
                    {dayHour.isClosed ? (
                      <span className={closedBadgeCls}>{t("hours.close")}</span>
                    ) : (
                      dayHour.hours.map((hour, i) => (
                        <div
                          key={i}
                          className="flex justify-end text-sm text-darkBlue"
                        >
                          {hour.open || "00:00"} — {hour.close || "00:00"}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </li>
          </Fragment>
        ))}
      </ul>
    </section>
  );
}
