import { useCallback, useEffect, useState } from "react";

// AXIOS
import axios from "axios";

// ICONS
import { Check, Loader2, Plus, Save, Trash2 } from "lucide-react";

function getLocalDateKey(date) {
  const today = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(today.getTime())) return "";

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutesFromHHmm(value) {
  const [hours = "0", minutes = "0"] = String(value || "00:00").split(":");
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function getMinutesFromDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getHours() * 60 + d.getMinutes();
}

function cleanExceptionalOpenings(openings, referenceDate = new Date()) {
  const byDate = new Map();
  const todayKey = getLocalDateKey(referenceDate);
  const nowMinutes = getMinutesFromDate(referenceDate);

  (Array.isArray(openings) ? openings : []).forEach((opening) => {
    const date = String(opening?.date || "")
      .trim()
      .slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (date < todayKey) return;

    const hours = (Array.isArray(opening?.hours) ? opening.hours : [])
      .map((range) => ({
        open: String(range?.open || "")
          .trim()
          .slice(0, 5),
        close: String(range?.close || "")
          .trim()
          .slice(0, 5),
      }))
      .filter((range) => {
        if (!range.open || !range.close || range.open >= range.close) {
          return false;
        }

        if (date === todayKey) {
          return minutesFromHHmm(range.close) > nowMinutes;
        }

        return true;
      });

    if (!hours.length) return;
    byDate.set(date, { date, hours });
  });

  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

function serializeExceptionalOpenings(openings, referenceDate = new Date()) {
  return JSON.stringify(cleanExceptionalOpenings(openings, referenceDate));
}

export default function ExceptionalOpeningsRestaurantComponent({
  restaurantId,
  exceptionalOpenings,
  setExceptionalOpenings,
  setRestaurantData,
  savePresentation = "full",
  embedded = false,
}) {
  const [localExceptionalOpenings, setLocalExceptionalOpenings] = useState([]);
  const [exceptionalSaving, setExceptionalSaving] = useState(false);
  const [exceptionalSaved, setExceptionalSaved] = useState(false);

  const hint = "text-sm text-darkBlue/60";
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

  const saveExceptionalOpeningsImmediate = useCallback(
    async (cleanedOpenings) => {
      try {
        const token = localStorage.getItem("token");
        if (!restaurantId) return;

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
      } catch (e) {
        console.error("Erreur nettoyage ouvertures exceptionnelles :", e);
      }
    },
    [restaurantId, setRestaurantData],
  );

  useEffect(() => {
    const referenceDate = new Date();
    const rawOpenings = Array.isArray(exceptionalOpenings)
      ? exceptionalOpenings
      : [];
    const cleanedOpenings = cleanExceptionalOpenings(rawOpenings, referenceDate);

    setLocalExceptionalOpenings(cleanedOpenings);

    if (
      serializeExceptionalOpenings(rawOpenings, referenceDate) !==
      serializeExceptionalOpenings(cleanedOpenings, referenceDate)
    ) {
      setExceptionalOpenings?.(cleanedOpenings);
      saveExceptionalOpeningsImmediate(cleanedOpenings);
    }
  }, [
    exceptionalOpenings,
    saveExceptionalOpeningsImmediate,
    setExceptionalOpenings,
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const referenceDate = new Date();

      setLocalExceptionalOpenings((prev) => {
        const cleanedOpenings = cleanExceptionalOpenings(prev, referenceDate);

        if (
          serializeExceptionalOpenings(prev, referenceDate) ===
          serializeExceptionalOpenings(cleanedOpenings, referenceDate)
        ) {
          return prev;
        }

        setExceptionalSaved(false);
        setExceptionalOpenings?.(cleanedOpenings);
        saveExceptionalOpeningsImmediate(cleanedOpenings);
        return cleanedOpenings;
      });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [saveExceptionalOpeningsImmediate, setExceptionalOpenings]);

  const exceptionalDirty =
    serializeExceptionalOpenings(localExceptionalOpenings) !==
    serializeExceptionalOpenings(exceptionalOpenings);
  const showExceptionalSaveButton =
    exceptionalDirty || exceptionalSaving || exceptionalSaved;

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
      setLocalExceptionalOpenings(
        response?.data?.restaurant?.reservationsSettings
          ?.exceptional_openings || cleanedOpenings,
      );
      setExceptionalSaved(true);
    } catch (e) {
      console.error("Erreur sauvegarde ouvertures exceptionnelles :", e);
    } finally {
      setExceptionalSaving(false);
    }
  }

  return (
    <div
      className={
        embedded
          ? ""
          : "rounded-xl border border-darkBlue/10 bg-white/70 px-4 py-4"
      }
    >
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
  );
}
