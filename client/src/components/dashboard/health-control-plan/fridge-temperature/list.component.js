"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

function ymd(d) {
  // "YYYY-MM-DD"
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function fmtDay(d) {
  try {
    if (!d) return "";
    const dt = new Date(d);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(dt);
  } catch {
    return d || "";
  }
}
function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return [start, end];
}
function toDatetimeLocalValue(value) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime()))
    return new Date().toISOString().slice(0, 16);
  const offset = base.getTimezoneOffset() * 60000;
  return new Date(base.getTime() - offset).toISOString().slice(0, 16);
}

export default function FridgeTemperatureList({
  restaurantId,
  fridgesVersion = 0,
}) {
  const tokenRef = useRef(null);
  const [fridges, setFridges] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Plage par mois courant par défaut
  const [curMonth, setCurMonth] = useState(() => new Date());
  const [dateFrom, dateTo] = useMemo(() => monthBounds(curMonth), [curMonth]);

  // Ligne en édition (par date "YYYY-MM-DD")
  const [editingDay, setEditingDay] = useState(null);
  // valeurs temporaires par cellule: { [key=day|fridgeId]: { value, doorState, time, note, tempId? } }
  const [cellDrafts, setCellDrafts] = useState({});

  useEffect(() => {
    tokenRef.current = localStorage.getItem("token");
  }, []);

  // charger fridges
  const fetchFridges = async () => {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridges`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${tokenRef.current}` },
      params: { active: 1 },
    });
    setFridges(
      (data?.items || []).sort((a, b) =>
        String(a.name).localeCompare(b.name, "fr")
      )
    );
  };

  // charger relevés
  const fetchTemps = async () => {
    setLoading(true);
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridge-temperatures`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
        params: {
          date_from: dateFrom.toISOString(),
          date_to: dateTo.toISOString(),
          limit: 1000,
        },
      });
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restaurantId) {
      fetchFridges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, fridgesVersion]);

  useEffect(() => {
    if (restaurantId) fetchTemps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, curMonth]);

  // Écoute création via formulaire
  useEffect(() => {
    const handler = (e) => {
      const doc = e?.detail?.doc;
      if (!doc || !doc._id) return;
      if (String(doc.restaurantId) !== String(restaurantId)) return;
      // reload simple (plus robuste en matrix)
      fetchTemps();
    };
    window.addEventListener("fridge-temperature:upsert", handler);
    return () =>
      window.removeEventListener("fridge-temperature:upsert", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  /* --------- Construire la matrice: rows=days, cols=fridges --------- */
  const days = useMemo(() => {
    const arr = [];
    const cur = new Date(dateFrom);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(dateTo);
    end.setHours(0, 0, 0, 0);
    while (cur <= end) {
      arr.push(ymd(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return arr;
  }, [dateFrom, dateTo]);

  // map [day|fridgeId] => relevé le plus récent du jour
  const cellMap = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const day = ymd(it.createdAt);
      const fid = it.fridgeRef || it.fridge?._id; // selon retour
      if (!fid) continue;
      const key = `${day}|${fid}`;
      const prev = map.get(key);
      if (!prev || new Date(it.createdAt) > new Date(prev.createdAt)) {
        map.set(key, it);
      }
    }
    return map;
  }, [items]);

  const setDraftFor = (day, fid, patch) => {
    const key = `${day}|${fid}`;
    setCellDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...patch },
    }));
  };

  const startEditRow = (day) => {
    setEditingDay(day);
    // préremplir les drafts avec valeurs existantes
    const next = {};
    for (const f of fridges) {
      const key = `${day}|${f._id}`;
      const existing = cellMap.get(key);
      next[key] = {
        tempId: existing?._id,
        value: existing?.value ?? "",
        doorState: existing?.doorState ?? "closed",
        time: existing
          ? toDatetimeLocalValue(existing.createdAt).slice(11, 16)
          : "12:00",
        note: existing?.note ?? "",
      };
    }
    setCellDrafts(next);
  };

  const cancelEdit = () => {
    setEditingDay(null);
    setCellDrafts({});
  };

  const saveCell = async (day, f) => {
    const key = `${day}|${f._id}`;
    const d = cellDrafts[key] || {};
    const baseDate = new Date(`${day}T${d.time || "12:00"}:00`);
    const payload = {
      value: d.value !== "" ? Number(d.value) : null,
      doorState: d.doorState || "closed",
      note: d.note || undefined,
      createdAt: baseDate,
    };

    if (d.tempId) {
      // update
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridge-temperatures/${d.tempId}`;
      await axios.put(url, payload, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
    } else {
      // create
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridge-temperatures`;
      await axios.post(
        url,
        { ...payload, fridgeRef: f._id },
        { headers: { Authorization: `Bearer ${tokenRef.current}` } }
      );
    }
  };

  const deleteCell = async (day, f) => {
    const key = `${day}|${f._id}`;
    const d = cellDrafts[key] || {};
    if (!d.tempId) return;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridge-temperatures/${d.tempId}`;
    await axios.delete(url, {
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    });
    // remove draft + refresh
    setCellDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], tempId: null, value: "", note: "" },
    }));
  };

  const saveRow = async (day) => {
    // pour robustesse, on sauvegarde séquentiellement chaque cellule modifiée/créée
    for (const f of fridges) {
      const key = `${day}|${f._id}`;
      const d = cellDrafts[key];
      if (!d) continue;
      // si aucune valeur ET pas d'existant => on ignore
      if ((d.value === "" || d.value == null) && !d.tempId) continue;
      await saveCell(day, f);
    }
    await fetchTemps();
    cancelEdit();
  };

  /* --------- UI --------- */
  const prevMonth = () =>
    setCurMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () =>
    setCurMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <div className="bg-white rounded-lg drop-shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="px-3 py-1 border rounded">
            Mois précédent
          </button>
          <div className="font-semibold">
            {curMonth.toLocaleDateString("fr-FR", {
              month: "2-digit",
              year: "numeric",
            })}
          </div>
          <button onClick={nextMonth} className="px-3 py-1 border rounded">
            Mois suivant
          </button>
        </div>
        <div className="text-sm opacity-70">
          {fridges.length} équipements • {days.length} jours
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="whitespace-nowrap">
            <tr className="text-left border-b sticky top-0 bg-white">
              <th className="py-2 pr-3 min-w-[120px]">Date</th>
              {fridges.map((f) => (
                <th key={f._id} className="py-2 pr-3 min-w-[120px]">
                  {f.name}
                  {f.fridgeCode ? (
                    <span className="opacity-60"> • {f.fridgeCode}</span>
                  ) : null}
                </th>
              ))}
              <th className="py-2 pr-0 text-right min-w-[120px]">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={fridges.length + 2}
                  className="py-6 text-center opacity-60"
                >
                  Chargement…
                </td>
              </tr>
            ) : days.length === 0 ? (
              <tr>
                <td
                  colSpan={fridges.length + 2}
                  className="py-6 text-center opacity-60"
                >
                  Aucune donnée
                </td>
              </tr>
            ) : (
              days.map((day) => (
                <tr
                  key={day}
                  className={`border-b ${editingDay === day ? "bg-lightGrey/40" : ""}`}
                >
                  {/* Colonne Date */}
                  <td className="py-2 pr-3 whitespace-nowrap font-medium sticky left-0 bg-white">
                    {fmtDay(day)}
                  </td>

                  {/* Cellules par enceinte */}
                  {fridges.map((f) => {
                    const key = `${day}|${f._id}`;
                    const existing = cellMap.get(key);
                    const editing = editingDay === day;
                    const draft = cellDrafts[key] || {};

                    return (
                      <td key={key} className="py-2 pr-3 align-top">
                        {!editing ? (
                          existing ? (
                            <div className="flex flex-col">
                              <div>
                                {existing.value} {existing.unit}
                              </div>
                              <div className="text-xs opacity-60">
                                {existing.doorState === "open"
                                  ? "porte ouverte"
                                  : "porte fermée"}
                              </div>
                            </div>
                          ) : (
                            <span className="opacity-40">—</span>
                          )
                        ) : (
                          <div className="flex flex-col gap-1">
                            <div className="flex gap-2">
                              <input
                                type="number"
                                step="0.1"
                                placeholder="T°"
                                className="border rounded p-1 w-20"
                                value={draft.value ?? ""}
                                onChange={(e) =>
                                  setDraftFor(day, f._id, {
                                    value: e.target.value,
                                  })
                                }
                                onWheel={(e) => e.currentTarget.blur()}
                              />
                              <select
                                className="border rounded p-1 w-28"
                                value={draft.doorState || "closed"}
                                onChange={(e) =>
                                  setDraftFor(day, f._id, {
                                    doorState: e.target.value,
                                  })
                                }
                              >
                                <option value="closed">fermée</option>
                                <option value="open">ouverte</option>
                              </select>
                              <input
                                type="time"
                                className="border rounded p-1 w-24"
                                value={draft.time || "12:00"}
                                onChange={(e) =>
                                  setDraftFor(day, f._id, {
                                    time: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Note"
                              className="border rounded p-1"
                              value={draft.note || ""}
                              onChange={(e) =>
                                setDraftFor(day, f._id, {
                                  note: e.target.value,
                                })
                              }
                            />
                            <div className="flex gap-2">
                              <button
                                className="px-2 py-1 rounded bg-blue text-white"
                                onClick={() => saveCell(day, f)}
                                type="button"
                              >
                                Enregistrer cellule
                              </button>
                              {draft.tempId && (
                                <button
                                  className="px-2 py-1 rounded bg-red text-white"
                                  onClick={() => deleteCell(day, f)}
                                  type="button"
                                >
                                  Supprimer
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}

                  <td className="py-2 pr-0 text-right">
                    {editingDay === day ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          className="px-3 py-1 rounded bg-blue text-white"
                          onClick={() => saveRow(day)}
                          type="button"
                        >
                          Enregistrer la ligne
                        </button>
                        <button
                          className="px-3 py-1 rounded bg-red text-white"
                          onClick={cancelEdit}
                          type="button"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        className="px-3 py-1 rounded bg-green text-white"
                        onClick={() => startEditRow(day)}
                        type="button"
                      >
                        Modifier
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
