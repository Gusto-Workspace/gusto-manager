"use client";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";

function fmtDate(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d || "";
  }
}

export default function ReceptionTemperatureList({ restaurantId, onEdit }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");

  const token = useMemo(() => localStorage.getItem("token"), []);

  const fetchData = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: meta.limit || 20 };
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
      if (dateTo) params.date_to = new Date(dateTo).toISOString();

      const url = `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}/temperature-receptions`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setItems(data.items || []);
      setMeta(data.meta || { page: 1, limit: 20, pages: 1, total: 0 });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restaurantId) fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const qq = q.toLowerCase();
    return items.filter((it) =>
      [
        it?.packagingCondition,
        it?.note,
        it?.unit,
        String(it?.value ?? ""),
        it?.recordedBy?.firstName,
        it?.recordedBy?.lastName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(qq)
    );
  }, [items, q]);

  const onDelete = async (id) => {
    if (!confirm("Supprimer ce relevé ?")) return;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}/temperature-receptions/${id}`;
    await axios.delete(url, { headers: { Authorization: `Bearer ${token}` } });
    fetchData(meta.page);
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4">
        <div className="flex-1">
          <label className="text-sm font-medium">Recherche</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Température, note, opérateur…"
            className="w-full border rounded p-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Du</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Au</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
        <button
          onClick={() => fetchData(1)}
          className="px-4 py-2 rounded bg-[#131E36] text-white"
        >
          Filtrer
        </button>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">T°</th>
              <th className="py-2 pr-3">Unité</th>
              <th className="py-2 pr-3">Emballage</th>
              <th className="py-2 pr-3">Opérateur</th>
              <th className="py-2 pr-3">Note</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center opacity-60">
                  Aucun relevé
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="py-6 text-center opacity-60">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((it) => (
                <tr key={it._id} className="border-b">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {fmtDate(it.receivedAt)}
                  </td>
                  <td className="py-2 pr-3">{it.value}</td>
                  <td className="py-2 pr-3">{it.unit}</td>
                  <td className="py-2 pr-3">{it.packagingCondition}</td>
                  <td className="py-2 pr-3">
                    {it?.recordedBy
                      ? `${it.recordedBy.firstName || ""} ${it.recordedBy.lastName || ""}`.trim()
                      : "—"}
                  </td>
                  <td className="py-2 pr-3 max-w-[320px]">
                    <span className="line-clamp-2">{it.note || "—"}</span>
                  </td>
                  <td className="py-2 pr-0">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => onEdit?.(it)}
                        className="px-3 py-1 rounded border"
                        aria-label="Éditer"
                      >
                        Éditer
                      </button>
                      <button
                        onClick={() => onDelete(it._id)}
                        className="px-3 py-1 rounded border border-red-500 text-red-600"
                        aria-label="Supprimer"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {meta?.pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-xs opacity-70">
            Page {meta.page}/{meta.pages} — {meta.total} relevés
          </div>
          <div className="flex gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => fetchData(meta.page - 1)}
              className="px-3 py-1 rounded border disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              disabled={meta.page >= meta.pages}
              onClick={() => fetchData(meta.page + 1)}
              className="px-3 py-1 rounded border disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
