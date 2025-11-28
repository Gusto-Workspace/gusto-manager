"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// AXIOS
import axios from "axios";

// ICONS
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Loader2,
  Thermometer,
  Snowflake,
} from "lucide-react";

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
  end.setHours(23, 59, 59, 999);
  return [start, end];
}
function isInRange(d, from, to) {
  const t = new Date(d).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export default function FridgeTemperatureList({
  restaurantId,
  fridges = [], // ← injecté par la page
}) {
  const tokenRef = useRef(null);

  // Données mensuelles (grande table)
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Données du jour (mini-table) -> indépendantes du mois affiché
  const [todayItems, setTodayItems] = useState([]);

  // Mois courant pour la grande table
  const [curMonth, setCurMonth] = useState(() => new Date());
  const [dateFrom, dateTo] = useMemo(() => monthBounds(curMonth), [curMonth]);

  const today = new Date();
  const todayYMD = ymd(today);

  useEffect(() => {
    tokenRef.current = localStorage.getItem("token");
  }, []);

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

  // Fetch relevés du jour (indépendant du mois)
  const fetchTodayTemps = async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridge-temperatures`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${tokenRef.current}` },
      params: {
        date_from: start.toISOString(),
        date_to: end.toISOString(),
        limit: 500,
      },
    });
    setTodayItems(data.items || []);
  };

  useEffect(() => {
    if (restaurantId) fetchTodayTemps(); // au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    if (restaurantId) fetchTemps(); // à chaque changement de mois
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, dateFrom.getTime(), dateTo.getTime()]);

  // Upsert local (sans refetch)
  const upsertLocal = (arr, doc) => {
    const next = Array.isArray(arr) ? [...arr] : [];
    const i = next.findIndex((x) => x?._id === doc._id);
    if (i >= 0) next[i] = doc;
    else next.push(doc);
    return next;
  };
  const removeLocal = (arr, id) =>
    (Array.isArray(arr) ? arr : []).filter((x) => x?._id !== id);

  // Écoute création/mise à jour/suppression via formulaire (sans refetch)
  useEffect(() => {
    const onUpsert = (e) => {
      const doc = e?.detail?.doc;
      if (!doc || !doc._id) return;
      if (String(doc.restaurantId) !== String(restaurantId)) return;

      // grande table : uniquement si dans le mois affiché
      if (isInRange(doc.createdAt, dateFrom, dateTo)) {
        setItems((prev) => upsertLocal(prev, doc));
      }

      // mini-table du jour
      if (ymd(doc.createdAt) === todayYMD) {
        setTodayItems((prev) => upsertLocal(prev, doc));
      }
    };

    const onDeleted = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      setItems((prev) => removeLocal(prev, id));
      setTodayItems((prev) => removeLocal(prev, id));
    };

    window.addEventListener("fridge-temperature:upsert", onUpsert);
    window.addEventListener("fridge-temperature:deleted", onDeleted);
    return () => {
      window.removeEventListener("fridge-temperature:upsert", onUpsert);
      window.removeEventListener("fridge-temperature:deleted", onDeleted);
    };
  }, [restaurantId, dateFrom, dateTo, todayYMD]);

  // Jours du mois
  const days = useMemo(() => {
    const arr = [];
    const cur = new Date(dateFrom);
    cur.setHours(0, 0, 0, 0);
    while (cur <= dateTo) {
      arr.push(ymd(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return arr;
  }, [dateFrom, dateTo]);

  // Map (day|fridgeId) => array de relevés triés
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

  // Map du jour (indépendant du mois)
  const todayMap = useMemo(() => {
    const m = new Map();
    for (const it of todayItems) {
      const fid = it.fridgeRef || it.fridge?._id;
      if (!fid) continue;
      const key = `${todayYMD}|${fid}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(it);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
    return m;
  }, [todayItems, todayYMD]);

  const prevMonth = () =>
    setCurMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () =>
    setCurMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const editDoc = (doc) => {
    window.dispatchEvent(
      new CustomEvent("fridge-temperature:edit", { detail: { doc } })
    );
  };

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

  const pill =
    "inline-flex items-center gap-1 rounded-md border border-darkBlue/20 bg-darkBlue/5 px-2 py-1 text-[13px] text-darkBlue/80 hover:bg-darkBlue/10 transition";

  return (
    <div className="space-y-4">
      {/* Mini-table du jour */}
      <section className="rounded-2xl border border-darkBlue/10 bg-white p-4 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-xl bg-blue/10 text-blue">
              <CalendarDays className="size-5" />
            </div>
            <h3 className="text-sm font-semibold text-darkBlue">
              Saisies du jour
            </h3>
          </div>
          <div className="text-xs text-darkBlue/50">{fmtDay(today)}</div>
        </header>

        <div className="overflow-x-auto max-w-[calc(100vw-50px)] mobile:max-w-[calc(100vw-82px)] tablet:max-w-[calc(100vw-355px)] pb-2">
          <table className="w-full text-[13px]">
            <thead className="whitespace-nowrap">
              <tr className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/95 backdrop-blur">
                <th className="py-2 pr-3 min-w-[120px] text-left font-medium text-darkBlue/70">
                  Date
                </th>
                {fridges.map((f) => (
                  <th
                    key={f._id}
                    className="py-2 pr-3 min-w-[140px] text-center font-medium text-darkBlue/70"
                  >
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 pr-3 whitespace-nowrap font-medium text-darkBlue">
                  {fmtDay(today)}
                </td>
                {fridges.map((f) => {
                  const key = `${todayYMD}|${f._id}`;
                  const arr = todayMap.get(key) || [];
                  return (
                    <td key={key} className="py-2 pr-3 text-center">
                      {arr.length > 0 ? (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {arr.map((it) => (
                            <button
                              key={it._id}
                              type="button"
                              className={pill}
                              title="Modifier ce relevé"
                              onClick={() => editDoc(it)}
                            >
                              <Thermometer className="size-3.5" /> {it.value}{" "}
                              {it.unit}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-blue bg-white px-2 py-1 text-[13px] text-blue hover:bg-blue/5 transition"
                          title="Ajouter un relevé pour aujourd’hui"
                          onClick={() => presetCreate(f._id)}
                        >
                          <PlusCircle className="size-3.5" /> Ajouter
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Grande table (mois) */}
      <section className="rounded-2xl border border-darkBlue/10 bg-white p-4 shadow-sm">
        {/* Navigation mois */}
        <header className="mb-3 flex flex-col gap-4 mobile:gap-0 mobile:flex-row items-center justify-between">
          <button
            onClick={prevMonth}
            className="inline-flex w-full justify-center mobile:justify-normal mobile:w-auto items-center gap-2 rounded-md border border-blue bg-white px-3 py-1.5 text-sm font-medium text-blue transition hover:bg-blue/5"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="size-4" /> Précédent
          </button>

          <div className="flex items-center gap-2 text-sm font-semibold text-darkBlue">
            <Snowflake className="size-4" />
            {curMonth.toLocaleDateString("fr-FR", {
              month: "2-digit",
              year: "numeric",
            })}
          </div>

          <button
            onClick={nextMonth}
            className="inline-flex w-full justify-center mobile:justify-normal mobile:w-auto items-center gap-2 rounded-md border border-blue bg-white px-3 py-1.5 text-sm font-medium text-blue transition hover:bg-blue/5"
            aria-label="Mois suivant"
          >
            Suivant <ChevronRight className="size-4" />
          </button>
        </header>

        {/* Scroll X + Y */}
        <div className="overflow-x-auto overflow-y-auto max-h-[350px] max-w-[calc(100vw-50px)] mobile:max-w-[calc(100vw-82px)] tablet:max-w-[calc(100vw-355px)]">
          {loading ? (
            <div className="flex h-[300px] w-full items-center justify-center text-darkBlue/60">
              <Loader2 className="mr-2 size-4 animate-spin" /> Chargement…
            </div>
          ) : days.length === 0 ? (
            <div className="flex h-[300px] w-full items-center justify-center text-darkBlue/60">
              Aucune donnée
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="whitespace-nowrap">
                <tr className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/95 backdrop-blur">
                  <th className="py-2 pr-3 min-w-[120px] text-left font-medium text-darkBlue/70">
                    Date
                  </th>
                  {fridges.map((f) => (
                    <th
                      key={f._id}
                      className="py-2 pr-3 min-w-[140px] text-center font-medium text-darkBlue/70"
                    >
                      {f.name}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {days.map((day) => (
                  <tr key={day} className="border-b border-darkBlue/10">
                    <td className="sticky left-0 bg-white py-2 pr-3 whitespace-nowrap font-medium text-darkBlue">
                      {fmtDay(day)}
                    </td>
                    {fridges.map((f) => {
                      const key = `${day}|${f._id}`;
                      const arr = cellMap.get(key) || [];
                      return (
                        <td key={key} className="py-2 pr-3 text-center">
                          {arr.length > 0 ? (
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              {arr.map((it) => (
                                <button
                                  key={it._id}
                                  type="button"
                                  className={pill}
                                  title="Modifier ce relevé"
                                  onClick={() => editDoc(it)}
                                >
                                  <Thermometer className="size-3.5" />{" "}
                                  {it.value} {it.unit}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-darkBlue/30">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
