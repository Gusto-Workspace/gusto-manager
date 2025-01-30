import { Fragment, useEffect, useState } from "react";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { EditSvg } from "../_shared/_svgs/_index";

// DATA
import { daysOfWeeksData } from "@/_assets/data/days-of-week.data";

// AXIOS
import axios from "axios";

// COMPONENTS
import DoubleSkeletonComonent from "../_shared/skeleton/double-skeleton.component";

export default function HoursRestaurantComponent(props) {
  const { t } = useTranslation("restaurant");

  const [editing, setEditing] = useState(false);
  const [localHours, setLocalHours] = useState([]);

  // Initialisation des heures locales avec plusieurs plages horaires possibles
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

  // Basculer en mode édition
  function handleToggleEdit() {
    setEditing(!editing);
  }

  // Fermer le mode édition si `closeEditing` est activé via les props
  useEffect(() => {
    if (props.closeEditing) {
      setEditing(false);
    }
  }, [props.closeEditing]);

  // Gérer les changements dans les champs de temps
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

  // Gérer la fermeture d'un jour entier
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

  // Ajouter une nouvelle plage horaire à un jour spécifique
  function handleAddTimeSlot(day) {
    setLocalHours((prev) =>
      prev.map((item) =>
        item.day === day
          ? { ...item, hours: [...item.hours, { open: "", close: "" }] }
          : item
      )
    );
  }

  // Supprimer une plage horaire spécifique d'un jour
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

  // Gérer la sauvegarde des données
  function handleSave() {
    // Nettoyage : on retire les plages horaires vides (open ET close vides)
    const cleanedHours = localHours.map((dayHour) => {
      const filteredHours = dayHour.hours.filter(
        (hour) => hour.open !== "" || hour.close !== ""
      );

      // Si après filtrage, il ne reste plus rien, on considère le jour fermé
      const isClosed = filteredHours.length === 0 ? true : dayHour.isClosed;

      return {
        ...dayHour,
        hours: filteredHours.length > 0 ? filteredHours : [],
        isClosed,
      };
    });

    if (props.reservations) {
      // Si c'est pour des réservations, on transmet au parent
      if (props.onChange) {
        props.onChange({ hours: cleanedHours });
      }
      setEditing(false);
    } else {
      // Sinon on sauvegarde via l'API
      const token = localStorage.getItem("token");

      axios
        .put(
          `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${props.restaurantId}/hours`,
          { openingHours: cleanedHours },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
        .then((response) => {
          props.handleUpdateData(response.data.restaurant);
        })
        .catch((error) => {
          console.error("Erreur lors de la mise à jour des horaires :", error);
        })
        .finally(() => {
          setEditing(false);
        });
    }
  }

  return (
    <div
      className={`bg-white p-6 pb-2 rounded-lg drop-shadow-sm w-full text-darkBlue h-fit`}
    >
      <div className="flex gap-6 flex-wrap justify-between">
        <h1 className="font-bold text-lg">
          {props.reservations ? t("hours.reservationTitle") : t("hours.title")}
        </h1>

        <div className="flex gap-2">
          {editing && (
            <button onClick={() => setEditing(false)}>
              <span className="text-white bg-red px-4 py-2 rounded-lg">
                {t("cancel")}
              </span>
            </button>
          )}

          <button onClick={editing ? handleSave : handleToggleEdit}>
            {editing ? (
              <span className="text-white bg-blue px-4 py-2 rounded-lg">
                {t("save")}
              </span>
            ) : (
              <div className="hover:opacity-100 opacity-20 rounded-full transition-opacity duration-300">
                <EditSvg
                  width={24}
                  height={24}
                  strokeColor="#131E36"
                  fillColor="#131E36"
                />
              </div>
            )}
          </button>
        </div>
      </div>

      <hr className="opacity-20 mt-6 mobile:mb-4" />

      <ul className="mt-0 flex flex-col gap-4">
        {localHours.map((dayHour, dayIndex) => (
          <Fragment key={dayHour.day}>
            <li className="flex flex-col gap-2 mobile:flex-row justify-between items-center py-6 mobile:py-2 mobile:h-auto">
              <span>{t(dayHour.day)}</span>

              <div className="w-full">
                {props.dataLoading ? (
                  <DoubleSkeletonComonent
                    justify={
                      props.reservations
                        ? "justify-center mobile:justify-end"
                        : "justify-center"
                    }
                  />
                ) : editing ? (
                  <div className="flex items-center justify-end gap-2 desktop:gap-6 ">
                    {dayHour.isClosed ? (
                      <div className="flex items-center gap-2">
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
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-2">
                          {dayHour.hours.map((hour, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 w-full"
                            >
                              {dayHour.hours.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveTimeSlot(dayHour.day, index)
                                  }
                                  className="text-red ml-2 bg-red bg-opacity-40 min-w-6 h-6 rounded-full flex items-center justify-center"
                                  aria-label={t("hours.removeTimeSlot")}
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
                                disabled={dayHour.isClosed}
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
                                disabled={dayHour.isClosed}
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
                          className="text-violet mt-2 mobile:mt-0 bg-violet bg-opacity-40 min-w-6 h-6 rounded flex items-center justify-center"
                          aria-label={t("hours.addTimeSlot")}
                        >
                          +
                        </button>
                      </div>
                    )}

                    {/* Checkbox pour fermer le jour entier */}
                    <label className="flex items-center gap-2 mt-2 mobile:mt-0">
                      <input
                        type="checkbox"
                        checked={dayHour.isClosed}
                        onChange={(e) =>
                          handleClosedChange(dayHour.day, e.target.checked)
                        }
                      />
                      {t("hours.close")}
                    </label>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {dayHour.isClosed ? (
                      <span className="flex justify-end">
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
