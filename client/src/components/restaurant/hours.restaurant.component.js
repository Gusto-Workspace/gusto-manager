import { Fragment, useEffect, useState } from "react";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { EditSvg } from "../_shared/_svgs/_index";

// DATA
import { daysOfWeeksData } from "@/_assets/data/days-of-week.data";

// AXIOS
import axios from "axios";

export default function HoursRestaurantComponent(props) {
  const { t } = useTranslation("restaurant");

  const [editing, setEditing] = useState(false);
  const [localHours, setLocalHours] = useState([]);

  useEffect(() => {
    setLocalHours(
      daysOfWeeksData.map((day) => {
        const existingHour = props.openingHours?.find(
          (hour) => hour.day === day
        );
        return {
          day,
          open: existingHour?.hours[0]?.open || "",
          close: existingHour?.hours[0]?.close || "",
          isClosed: existingHour?.isClosed || false,
        };
      })
    );
  }, [props.openingHours]);

  function handleToggleEdit() {
    setEditing(!editing);
  }

  function handleChange(day, field, value) {
    setLocalHours((prev) =>
      prev.map((item) =>
        item.day === day ? { ...item, [field]: value, isClosed: false } : item
      )
    );
  }

  function handleClosedChange(day, isClosed) {
    setLocalHours((prev) =>
      prev.map((item) =>
        item.day === day ? { ...item, isClosed, open: "", close: "" } : item
      )
    );
  }

  async function handleSave() {
    try {
      const token = localStorage.getItem("token");

      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${props.restaurantId}/hours`,
        { openingHours: localHours },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
    } catch (error) {
      console.error("Erreur lors de la mise à jour des horaires :", error);
    } finally {
      setEditing(false);
    }
  }

  return (
    <section className="bg-white p-6 pb-2 rounded-lg drop-shadow-sm w-full text-darkBlue">
      <div className="flex justify-between">
        <h1 className="font-bold text-lg">{t("hours.title")}</h1>

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
              <EditSvg />
            )}
          </button>
        </div>
      </div>

      <hr className="opacity-20 mt-6 mb-4" />

      <ul className="mt-0">
        {localHours.map((hour, i) => (
          <Fragment key={hour.day}>
            <li className="flex justify-between items-center py-2 h-16">
              <span>{t(hour.day)}</span>

              {props.hoursLoading ? (
                <div className="flex justify-end gap-2 w-full animate-pulse">
                  <div className="bg-black bg-opacity-15 h-6 w-16 rounded-lg "></div>

                  <div className="bg-black bg-opacity-15 h-6 w-16 rounded-lg "></div>
                </div>
              ) : editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={hour.open}
                    onChange={(e) =>
                      handleChange(hour.day, "open", e.target.value)
                    }
                    disabled={hour.isClosed}
                    className={`border p-1 rounded-lg ${
                      hour.isClosed ? "opacity-50" : ""
                    }`}
                  />
                  <span>{t("hours.to")}</span>

                  <input
                    type="time"
                    value={hour.close}
                    onChange={(e) =>
                      handleChange(hour.day, "close", e.target.value)
                    }
                    disabled={hour.isClosed}
                    className={`border p-1 rounded-lg ${
                      hour.isClosed ? "opacity-50" : ""
                    }`}
                  />

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hour.isClosed}
                      onChange={(e) =>
                        handleClosedChange(hour.day, e.target.checked)
                      }
                    />
                    {t("hours.close")}
                  </label>
                </div>
              ) : (
                <span>
                  {hour.isClosed
                    ? t("hours.close")
                    : `${hour.open || "00:00"} - ${hour.close || "00:00"}`}
                </span>
              )}
            </li>

            {i < daysOfWeeksData.length - 1 && <hr className="opacity-20" />}
          </Fragment>
        ))}
      </ul>
    </section>
  );
}