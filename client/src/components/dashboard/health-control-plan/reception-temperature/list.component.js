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

export default function ReceptionTemperatureList({
  restaurantId,
  onEdit,
  editingId = null,
  onDeleted,
}) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 15, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const hasActiveFilters = useMemo(
    () => Boolean(q || dateFrom || dateTo),
    [q, dateFrom, dateTo]
  );

  const token = useMemo(() => localStorage.getItem("token"), []);

  const fetchData = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: meta.limit || 20 };
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
      if (dateTo) params.date_to = new Date(dateTo).toISOString();

      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/temperature-receptions`;
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
  }, [restaurantId]);

  useEffect(() => {
    const handler = () => fetchData(1);
    window.addEventListener("refresh-temp-reception", handler);
    return () => window.removeEventListener("refresh-temp-reception", handler);
  }, []);

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

  const askDelete = (item) => {
    setDeleteTarget(item);
    setIsDeleteModalOpen(true);
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;

    const url = `${
      process.env.NEXT_PUBLIC_API_URL
    }/restaurants/${restaurantId}/temperature-receptions/${deleteTarget._id}`;

    try {
      setDeleteLoading(true);
      await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const deleted = deleteTarget;
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      onDeleted?.(deleted);
      fetchData(meta.page);
    } catch (err) {
      console.error("Erreur lors de la suppression du relevé:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setIsDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  return (
    <div className="bg-white rounded-lg drop-shadow-sm p-4">
      {/* Filtres (fixes) */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col gap-3 midTablet:flex-row midTablet:flex-wrap midTablet:items-end">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher température, note, opérateur…"
            className="w-full border rounded p-2 midTablet:flex-1"
          />

          <div className="flex flex-col gap-1 w-full midTablet:flex-row midTablet:items-center midTablet:gap-2 midTablet:w-auto">
            <label className="text-sm font-medium">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border rounded p-2 midTablet:w-auto"
            />
          </div>

          <div className="flex flex-col gap-1 w-full midTablet:flex-row midTablet:items-center midTablet:gap-2 midTablet:w-auto">
            <label className="text-sm font-medium">Au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border rounded p-2 midTablet:w-auto"
            />
          </div>

          <div className="flex flex-col gap-2 w-full mobile:flex-row mobile:w-auto mobile:items-center">
            <button
              onClick={() => fetchData(1)}
              className="px-4 py-2 rounded bg-blue text-white w-full mobile:w-32"
            >
              Filtrer
            </button>

            <button
              onClick={() => {
                setQ("");
                setDateFrom("");
                setDateTo("");
                fetchData(1);
              }}
              disabled={!hasActiveFilters}
              className={`px-4 py-2 rounded bg-blue text-white ${
                hasActiveFilters ? "" : "opacity-30"
              }`}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* --- SEULEMENT LA TABLE SCROLL HORIZONTAL --- */}
      <div className="overflow-x-auto max-w-[calc(100vw-48px)] tablet:max-w-[calc(100vw-318px)]">
        <table className="w-full text-sm min-w-[960px]">
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
                <tr
                  key={it._id}
                  className={`border-b transition-colors ${
                    editingId === it._id ? "bg-lightGrey" : ""
                  }`}
                >
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {fmtDate(it.receivedAt)}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{it.value}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{it.unit}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{it.packagingCondition}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
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
                        className="px-3 py-1 rounded bg-green text-white"
                        aria-label="Éditer"
                      >
                        Éditer
                      </button>
                      <button
                        onClick={() => askDelete(it)}
                        className="px-3 py-1 rounded bg-red text-white"
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

      {/* Pagination (fixe) */}
      {meta?.pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-xs opacity-70">
            Page {meta.page}/{meta.pages} — {meta.total} relevés
          </div>
          <div className="flex gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => fetchData(meta.page - 1)}
              className="px-3 py-1 rounded border border-blue text-blue disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              disabled={meta.page >= meta.pages}
              onClick={() => fetchData(meta.page + 1)}
              className="px-3 py-1 rounded border border-blue text-blue disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* Modale (fixe, hors scroll) */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 flex items-center mx-6 justify-center z-[100]">
          <div
            onClick={closeDeleteModal}
            className="fixed inset-0 bg-black bg-opacity-20"
          />
          <div className="bg-white p-6 rounded-lg shadow-lg w-[450px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              Supprimer ce relevé ?
            </h2>
            <p className="text-sm text-center mb-6">
              Cette action est définitive. Le relevé sera retiré de votre plan
              de maîtrise sanitaire.
            </p>
            <div className="flex gap-4 mx-auto justify-center">
              <button
                onClick={onConfirmDelete}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-lg bg-blue text-white disabled:opacity-50"
              >
                {deleteLoading ? "Suppression…" : "Confirmer"}
              </button>
              <button
                type="button"
                onClick={closeDeleteModal}
                className="px-4 py-2 rounded-lg text-white bg-red"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
