// components/dashboard/health-control-plan/cleaning-tasks/list.component.jsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";

function fmtDate(d) {
  try {
    if (!d) return "";
    const date = new Date(d);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return d || "";
  }
}
function statusBadge(it) {
  if (it?.done) return "Fait";
  if (it?.dueAt && new Date(it.dueAt) < new Date()) return "En retard";
  return "À faire";
}

export default function CleaningTaskList({
  restaurantId,
  onEdit,
  editingId = null,
  onDeleted,
}) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);

  // filtres
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); // all|done|todo
  const [freq, setFreq] = useState(""); // ''

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    if (dateFrom && dateTo && dateTo < dateFrom) setDateTo(dateFrom);
  }, [dateFrom, dateTo]);

  const token = useMemo(() => localStorage.getItem("token"), []);
  const metaRef = useRef(meta);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  const sortLogic = (list) => {
    // doneAt desc, sinon dueAt desc, sinon createdAt desc
    return [...list].sort((a, b) => {
      const ak = a?.done
        ? new Date(a.doneAt || 0).getTime()
        : a?.dueAt
          ? new Date(a.dueAt).getTime()
          : new Date(a.createdAt || 0).getTime();
      const bk = b?.done
        ? new Date(b.doneAt || 0).getTime()
        : b?.dueAt
          ? new Date(b.dueAt).getTime()
          : new Date(b.createdAt || 0).getTime();
      return bk - ak;
    });
  };

  const hasActiveFilters = useMemo(
    () => Boolean(q || dateFrom || dateTo || status !== "all" || freq),
    [q, dateFrom, dateTo, status, freq]
  );
  const hasFullDateRange = Boolean(dateFrom && dateTo);

  const fetchData = async (page = 1, overrides = {}) => {
    setLoading(true);
    try {
      const cur = {
        q: overrides.q ?? q,
        dateFrom: overrides.dateFrom ?? dateFrom,
        dateTo: overrides.dateTo ?? dateTo,
        status: overrides.status ?? status,
        freq: overrides.freq ?? freq,
      };

      const params = { page, limit: meta.limit || 20 };
      if (cur.dateFrom) params.date_from = new Date(cur.dateFrom).toISOString();
      if (cur.dateTo) params.date_to = new Date(cur.dateTo).toISOString();
      if (cur.q) params.q = cur.q;
      if (cur.status && cur.status !== "all") params.status = cur.status;
      if (cur.freq) params.freq = cur.freq;

      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-cleaning-tasks`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      const list = sortLogic(data.items || []);
      const nextMeta = data.meta || { page: 1, limit: 20, pages: 1, total: 0 };
      setItems(list);
      setMeta(nextMeta);
      metaRef.current = nextMeta;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restaurantId)
      fetchData(1, {
        q: "",
        dateFrom: "",
        dateTo: "",
        status: "all",
        freq: "",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    const handleUpsert = (event) => {
      const doc = event?.detail?.doc;
      if (!doc || !doc._id) return;
      if (restaurantId && String(doc.restaurantId) !== String(restaurantId))
        return;

      const currentMeta = metaRef.current || {};
      const limit = currentMeta.limit || 20;
      const page = currentMeta.page || 1;

      let isNew = false;

      setItems((prev) => {
        const prevList = Array.isArray(prev) ? prev : [];
        const index = prevList.findIndex((item) => item?._id === doc._id);
        let nextList;

        if (index !== -1) {
          nextList = [...prevList];
          nextList[index] = { ...prevList[index], ...doc };
        } else {
          isNew = true;
          if (page === 1) {
            nextList = [doc, ...prevList];
            if (nextList.length > limit) nextList = nextList.slice(0, limit);
          } else {
            nextList = prevList;
          }
        }
        return sortLogic(nextList || prevList);
      });

      if (isNew) {
        setMeta((prevMeta) => {
          const limitValue = prevMeta.limit || limit;
          const total = (prevMeta.total || 0) + 1;
          const pages = Math.max(1, Math.ceil(total / limitValue));
          const nextMeta = { ...prevMeta, total, pages };
          metaRef.current = nextMeta;
          return nextMeta;
        });
      }
    };

    window.addEventListener("cleaning-task:upsert", handleUpsert);
    return () =>
      window.removeEventListener("cleaning-task:upsert", handleUpsert);
  }, [restaurantId]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const qq = q.toLowerCase();
    return items.filter((it) =>
      [
        it?.zone,
        it?.description,
        it?.frequency,
        it?.productUsed,
        it?.riskLevel,
        ...(Array.isArray(it?.protocolSteps) ? it.protocolSteps : []),
        ...(Array.isArray(it?.proofUrls) ? it.proofUrls : []),
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

    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cleaning-tasks/${deleteTarget._id}`;

    try {
      setDeleteLoading(true);
      await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const deleted = deleteTarget;
      const updatedItems = (items || []).filter(
        (item) => String(item?._id) !== String(deleted._id)
      );
      setItems(updatedItems);
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      onDeleted?.(deleted);

      setMeta((prevMeta) => {
        const limitValue = prevMeta.limit || 20;
        const total = Math.max(0, (prevMeta.total || 0) - 1);
        const pages = total > 0 ? Math.ceil(total / limitValue) : 1;
        const page = Math.min(prevMeta.page || 1, pages);
        const nextMeta = { ...prevMeta, total, pages, page };
        metaRef.current = nextMeta;
        return nextMeta;
      });
    } catch (err) {
      console.error("Erreur lors de la suppression de la tâche:", err);
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
      {/* Filtres */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col gap-3 midTablet:flex-row midTablet:flex-wrap midTablet:items-end">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher zone, produit, protocole, note…"
            className="w-full border rounded p-2 midTablet:flex-1 min-w-[200px]"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border rounded p-2 h-[44px] w-full midTablet:w-40"
            title="Statut"
          >
            <option value="all">Tous</option>
            <option value="todo">À faire</option>
            <option value="done">Fait</option>
          </select>

          <select
            value={freq}
            onChange={(e) => setFreq(e.target.value)}
            className="border rounded p-2 h-[44px] w-full midTablet:w-44"
            title="Fréquence"
          >
            <option value="">Fréquence</option>
            <option value="daily">Quotidienne</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuelle</option>
            <option value="on_demand">À la demande</option>
          </select>

          <div className="flex flex-col gap-1 w-full midTablet:flex-row midTablet:items-center midTablet:gap-2 midTablet:w-auto">
            <label className="text-sm font-medium">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border rounded p-2 midTablet:w-auto"
              max={dateTo || undefined}
            />
          </div>

          <div className="flex flex-col gap-1 w-full midTablet:flex-row midTablet:items-center midTablet:gap-2 midTablet:w-auto">
            <label className="text-sm font-medium">Au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border rounded p-2 midTablet:w-auto"
              min={dateFrom || undefined}
            />
          </div>

          <div className="flex flex-col gap-2 w-full mobile:flex-row mobile:w-auto mobile:items-center">
            <button
              onClick={() => hasFullDateRange && fetchData(1)}
              disabled={!hasFullDateRange}
              title={
                !hasFullDateRange ? "Sélectionnez 'Du' ET 'Au'" : undefined
              }
              className={`px-4 py-2 rounded bg-blue text-white w-full mobile:w-32 ${
                hasFullDateRange ? "" : "opacity-30 cursor-not-allowed"
              }`}
            >
              Filtrer
            </button>

            <button
              onClick={() => {
                setQ("");
                setStatus("all");
                setFreq("");
                setDateFrom("");
                setDateTo("");
                fetchData(1, {
                  q: "",
                  dateFrom: "",
                  dateTo: "",
                  status: "all",
                  freq: "",
                });
              }}
              disabled={!hasActiveFilters}
              className={`px-4 py-2 rounded bg-blue text-white ${
                hasActiveFilters ? "" : "opacity-30 cursor-not-allowed"
              }`}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-w-[calc(100vw-80px)] tablet:max-w-[calc(100vw-350px)]">
        <table className="w-full text-sm">
          <thead className="whitespace-nowrap">
            <tr className="text-left border-b">
              <th className="py-2 pr-3">Statut</th>
              <th className="py-2 pr-3">Zone</th>
              <th className="py-2 pr-3">Fréquence</th>
              <th className="py-2 pr-3">Prévue</th>
              <th className="py-2 pr-3">Fait le</th>
              <th className="py-2 pr-3">Priorité</th>
              <th className="py-2 pr-3">Produit</th>
              <th className="py-2 pr-3">Preuves</th>
              <th className="py-2 pr-3">Opérateur</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center opacity-60">
                  Aucune tâche
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={10} className="py-6 text-center opacity-60">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((it) => {
                const badge = statusBadge(it);
                const overdue = badge === "En retard";
                return (
                  <tr
                    key={it._id}
                    className={`border-b transition-colors ${
                      editingId === it._id ? "bg-lightGrey" : ""
                    }`}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          it.done
                            ? "bg-green text-white"
                            : overdue
                              ? "bg-red text-white"
                              : "bg-orange text-white"
                        }`}
                      >
                        {badge}
                      </span>
                      {it.verified && (
                        <span className="px-2 py-0.5 rounded text-xs bg-blue text-white ml-1">
                          Vérifié
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.zone || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.frequency || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDate(it.dueAt)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDate(it.doneAt)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.riskLevel || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.productUsed || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {Array.isArray(it.proofUrls) && it.proofUrls.length
                        ? `${it.proofUrls.length} preuve(s)`
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.recordedBy
                        ? `${it.recordedBy.firstName || ""} ${
                            it.recordedBy.lastName || ""
                          }`.trim()
                        : "—"}
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
                          onClick={() =>
                            setIsDeleteModalOpen(true) || setDeleteTarget(it)
                          }
                          className="px-3 py-1 rounded bg-red text-white"
                          aria-label="Supprimer"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta?.pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-xs opacity-70">
            Page {meta.page}/{meta.pages} — {meta.total} tâches
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

      {/* Modale suppression */}
      {isDeleteModalOpen &&
        isClient &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000]"
            aria-modal="true"
            role="dialog"
          >
            <div
              onClick={closeDeleteModal}
              className="absolute inset-0 bg-black/20"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-[450px] pointer-events-auto">
                <h2 className="text-xl font-semibold mb-6 text-center">
                  Supprimer cette tâche ?
                </h2>
                <p className="text-sm text-center mb-6">
                  Cette action est définitive. La tâche sera retirée de
                  l’historique.
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
          </div>,
          document.body
        )}
    </div>
  );
}
