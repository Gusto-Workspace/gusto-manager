"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

function ymd(d) {
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

export default function FridgeTemperatureList({
  restaurantId,
  fridgesVersion = 0,
}) {
  const tokenRef = useRef(null);
  const [fridges, setFridges] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Mois courant pour la grande table
  const [curMonth, setCurMonth] = useState(() => new Date());
  const [dateFrom, dateTo] = useMemo(() => monthBounds(curMonth), [curMonth]);

  const today = new Date();
  const todayYMD = ymd(today);

  useEffect(() => {
    tokenRef.current = localStorage.getItem("token");
  }, []);

  // Fetch fridges (actives)
  const fetchFridges = async () => {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridges`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${tokenRef.current}` },
      params: { active: 1 },
    });
    setFridges(
      (data?.items || []).sort((a, b) =>
        String(a.name).localeCompare(String(b.name), "fr")
      )
    );
  };

  // Fetch relevés (période du mois affiché)
  const fetchTemps = async () => {
    setLoading(true);
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridge-temperatures`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
        params: {
          date_from: dateFrom.toISOString(),
          date_to: dateTo.toISOString(),
          limit: 2000,
        },
      });
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restaurantId) fetchFridges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, fridgesVersion]);

  useEffect(() => {
    if (restaurantId) fetchTemps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, curMonth]);

  // Refresh automatique après sauvegarde via form
  useEffect(() => {
    const handler = (e) => {
      const doc = e?.detail?.doc;
      if (!doc || !doc._id) return;
      if (String(doc.restaurantId) !== String(restaurantId)) return;
      fetchTemps();
    };
    window.addEventListener("fridge-temperature:upsert", handler);
    return () =>
      window.removeEventListener("fridge-temperature:upsert", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Jours du mois
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

  // Map (day|fridgeId) => array de relevés triés par heure croissante
  const cellMap = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      const day = ymd(it.createdAt);
      const fid = it.fridgeRef || it.fridge?._id;
      if (!fid) continue;
      const key = `${day}|${fid}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(it);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
    return m;
  }, [items]);

  const prevMonth = () =>
    setCurMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () =>
    setCurMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  // Clic d’une puce = éditer dans le form
  const editDoc = (doc) => {
    window.dispatchEvent(
      new CustomEvent("fridge-temperature:edit", { detail: { doc } })
    );
  };

  // Clic “Ajouter” (mini-table du jour) = préremplir le form
  const presetCreate = (fridgeRef) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const createdAt = new Date(`${todayYMD}T${hh}:${mm}:00`);
    window.dispatchEvent(
      new CustomEvent("fridge-temperature:preset", {
        detail: { fridgeRef, createdAt },
      })
    );
  };

  return (
    <div className="">
      {/* Mini-table du jour */}
      <div className="mb-4 bg-white rounded-lg drop-shadow-sm p-4">
        <div className="w-full mx-auto text-sm font-semibold mb-2">Saisies du jour</div>
       
        <div className="overflow-x-auto max-w-[calc(100vw-80px)] tablet:max-w-[calc(100vw-350px)]">
          <table className="w-full text-sm">
            <thead className="whitespace-nowrap">
              <tr className="text-left border-b sticky top-0 bg-white">
                <th className="py-2 pr-3 min-w-[120px]">Date</th>
                {fridges.map((f) => (
                  <th key={f._id} className="py-2 pr-3 min-w-[140px]">
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-3 whitespace-nowrap font-medium sticky left-0 bg-white z-10">
                  {fmtDay(today)}
                </td>
                {fridges.map((f) => {
                  const key = `${todayYMD}|${f._id}`;
                  const arr = cellMap.get(key) || [];
                  return (
                    <td key={key} className="py-2 pr-3 align-top">
                      {arr.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {arr.map((it) => (
                            <button
                              key={it._id}
                              type="button"
                              className="px-2 py-1 rounded bg-lightGrey hover:bg-gray-200 transition"
                              title="Modifier ce relevé"
                              onClick={() => editDoc(it)}
                            >
                              {it.value} {it.unit}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="px-2 py-1 rounded border hover:bg-gray-50"
                          title="Ajouter un relevé pour aujourd’hui"
                          onClick={() => presetCreate(f._id)}
                        >
                          Ajouter
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg drop-shadow-sm p-4">
        {/* Navigation mois */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="px-3 py-1 border rounded">
              Mois précédent
            </button>
          </div>
          <div className="font-semibold">
            {curMonth.toLocaleDateString("fr-FR", {
              month: "2-digit",
              year: "numeric",
            })}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={nextMonth} className="px-3 py-1 border rounded">
              Mois suivant
            </button>
          </div>
        </div>

        {/* Grande table (scroll X + Y avec max height) */}
        <div className="overflow-x-auto overflow-y-auto max-h-[350px] max-w-[calc(100vw-80px)] tablet:max-w-[calc(100vw-350px)]">
          <table className="w-full text-sm">
            <thead className="whitespace-nowrap">
              <tr className="text-left border-b sticky top-0 bg-white z-10">
                <th className="py-2 pr-3 min-w-[120px]">Date</th>
                {fridges.map((f) => (
                  <th key={f._id} className="py-2 pr-3 min-w-[140px]">
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={fridges.length + 1}
                    className="py-6 text-center opacity-60"
                  >
                    Chargement…
                  </td>
                </tr>
              ) : days.length === 0 ? (
                <tr>
                  <td
                    colSpan={fridges.length + 1}
                    className="py-6 text-center opacity-60"
                  >
                    Aucune donnée
                  </td>
                </tr>
              ) : (
                days.map((day) => (
                  <tr key={day} className="border-b">
                    {/* Date sticky à gauche */}
                    <td className="py-2 pr-3 whitespace-nowrap font-medium sticky left-0 bg-white z-10">
                      {fmtDay(day)}
                    </td>

                    {/* Cellules */}
                    {fridges.map((f) => {
                      const key = `${day}|${f._id}`;
                      const arr = cellMap.get(key) || [];
                      return (
                        <td key={key} className="py-2 pr-3 align-top">
                          {arr.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {arr.map((it) => (
                                <button
                                  key={it._id}
                                  type="button"
                                  className="px-2 py-1 rounded bg-lightGrey hover:bg-gray-200 transition"
                                  title="Modifier ce relevé"
                                  onClick={() => editDoc(it)}
                                >
                                  {it.value} {it.unit}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="opacity-40">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
