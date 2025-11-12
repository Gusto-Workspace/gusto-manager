// HoursRestaurantComponent.jsx

import { Fragment, useEffect, useState } from "react";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { EditSvg } from "../../_shared/_svgs/_index";

// DATA
import { daysOfWeeksData } from "@/_assets/data/days-of-week.data";

// AXIOS
import axios from "axios";

// COMPONENTS
import DoubleSkeletonComonent from "../../_shared/skeleton/double-skeleton.component";
import { Loader2 } from "lucide-react";

export default function HoursRestaurantComponent(props) {
  const { t } = useTranslation("restaurant");

  const [editing, setEditing] = useState(false);
  const [localHours, setLocalHours] = useState([]);
  const [saving, setSaving] = useState(false);

  // Initialisation des heures locales (ouvre la voie aux multiples créneaux)
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
    setEditing(!editing);
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

    // Mode horaires d'ouverture (non réservations) — comportement existant
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

  return (
    <div
      className={`bg-white p-4 rounded-lg drop-shadow-sm w-full text-darkBlue `}
    >
      <div className="flex items-center flex-col mobile:flex-row justify-between flex-wrap gap-2">
        <h1 className="font-bold text-lg">
          {props.reservations
            ? "Horaires des réservations"
            : "Horaires d'ouverture"}
        </h1>

        <div className="flex gap-2">
          {editing && (
            <button onClick={() => setEditing(false)} disabled={saving}>
              <span className="hover:opacity-80 opacity-100 rounded-lg text-white disabled:cursor-none bg-red px-4 py-2 flex gap-2 items-center transition-opacity duration-150">
                {t("cancel")}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={editing ? handleSave : handleToggleEdit}
            disabled={saving}
          >
            {editing ? (
              <span className="hover:opacity-80 opacity-100 rounded-lg text-white bg-blue px-4 py-2 flex gap-2 items-center transition-opacity duration-150">
                {saving ? (
                  <>
                    <Loader2 className="size-6 animate-spin" />
                    <span>En cours…</span>
                  </>
                ) : (
                  <span>{t("save")}</span>
                )}
              </span>
            ) : (
              <div className="hover:opacity-80 opacity-100 rounded-lg text-white bg-blue px-4 py-2 flex gap-2 items-center transition-opacity duration-150">
                <EditSvg
                  width={18}
                  height={18}
                  strokeColor="#FFFFFF"
                  fillColor="#FFFFFF"
                />{" "}
                Éditer
              </div>
            )}
          </button>
        </div>
      </div>

      <hr className="opacity-20 my-4" />

      <ul className="mt-0 flex flex-col gap-3">
        {localHours.map((dayHour, dayIndex) => (
          <Fragment key={dayHour.day}>
            <li className="flex flex-col gap-4 midTablet:flex-row justify-between items-center py-6 midTablet:py-2 midTablet:h-auto">
              <span>{t(dayHour.day)}</span>

              <div className="w-full">
                {props.dataLoading ? (
                  <DoubleSkeletonComonent
                    justify={
                      props.reservations
                        ? "justify-center midTablet:justify-end"
                        : "justify-center"
                    }
                  />
                ) : editing ? (
                  <div className="flex flex-col midTablet:flex-row items-center justify-end gap-2 desktop:gap-6 ">
                    {dayHour.isClosed ? (
                      <div className="flex flex-col midTablet:flex-row items-center gap-2">
                        <input
                          type="time"
                          value=""
                          disabled
                          className="border p-1 rounded-lg opacity-50"
                        />
                        <span>{t("hours.to")}</span>

                        <input
                          type="time"
                          value=""
                          disabled
                          className="border p-1 rounded-lg  opacity-50"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col midTablet:flex-row items-center gap-4">
                        <div className="flex flex-col gap-12 midTablet:gap-2">
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
                                  className="
              text-red bg-red bg-opacity-40 min-w-6 h-6 rounded-full
              flex items-center justify-center ml-2
              absolute -right-8 top-1/2 -translate-y-1/2
              midTablet:static midTablet:right-auto midTablet:top-auto midTablet:translate-y-0
            "
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
                                className={`border p-1 rounded-lg w-full ${
                                  dayHour.isClosed ? "opacity-50" : ""
                                }`}
                              />

                              <span>{t("hours.to")}</span>

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
                                className={`border p-1 rounded-lg w-full ${
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
                          className="text-violet mt-2  bg-violet bg-opacity-40 min-w-6 h-6 rounded flex items-center justify-center"
                          aria-label={t("hours.addTimeSlot")}
                          disabled={saving}
                        >
                          +
                        </button>
                      </div>
                    )}

                    {/* Checkbox pour fermer le jour entier */}
                    <label className="flex items-center gap-2 mt-2 ">
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
                  <div className="flex flex-col items-center mobile:items-end gap-1">
                    {dayHour.isClosed ? (
                      <span className="flex justify-end opacity-60 italic">
                        {t("hours.close")}
                      </span>
                    ) : (
                      dayHour.hours.map((hour, i) => (
                        <div key={i} className="flex justify-end">
                          {hour.open || "00:00"} - {hour.close || "00:00"}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </li>

            {dayIndex < daysOfWeeksData.length - 1 && (
              <hr className="opacity-20" />
            )}
          </Fragment>
        ))}
      </ul>
    </div>
  );
}
