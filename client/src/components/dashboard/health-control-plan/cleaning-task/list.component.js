"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  Search,
  CalendarClock,
  Edit3,
  Trash2,
  Loader2,
  X,
} from "lucide-react";

function fmtDate(d) {
  try {
    if (!d) return "—";
    const date = new Date(d);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return d || "—";
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

  // Filtres
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

  const sortLogic = (list) =>
    [...list].sort((a, b) => {
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
      console.error("fetch cleaning-tasks error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
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

  // Auto-fetch quand Statut / Fréquence changent
  useEffect(() => {
    if (!restaurantId) return;
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, freq]);

  // Upserts live
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

  // Recherche locale
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
      await axios.delete(url, { headers: { Authorization: `Bearer ${token}` } });

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

  // Styles (alignés sur InventoryLotList / RecipeBatchesList / OilChangeList)
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98]";

  return (
    <div className="rounded-2xl border border-darkBlue/10 bg-white p-4  midTablet:p-5 shadow">
      {/* Filtres */}
      <div className="flex flex-col midTablet:flex-row midTablet:flex-wrap gap-2 mb-2">
        {/* Recherche */}
        <div className={`${fieldWrap} flex-1 midTablet:min-w-[220px]`}>
          <label className={labelCls}>
            <Search className="size-4" /> Recherche
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zone, produit, protocole, note…"
            className={inputCls}
          />
        </div>

        {/* Statut */}
        <div className={`${fieldWrap} w-full midTablet:w-[200px]`}>
          <label className={labelCls}>Statut</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectCls}
            title="Statut"
          >
            <option value="all">Tous</option>
            <option value="todo">À faire</option>
            <option value="done">Fait</option>
          </select>
        </div>

        {/* Fréquence */}
        <div className={`${fieldWrap} w-full midTablet:w-[220px]`}>
          <label className={labelCls}>Fréquence</label>
          <select
            value={freq}
            onChange={(e) => setFreq(e.target.value)}
            className={selectCls}
            title="Fréquence"
          >
            <option value="">Toutes</option>
            <option value="daily">Quotidienne</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuelle</option>
            <option value="on_demand">À la demande</option>
          </select>
        </div>

        {/* Du */}
        <div className={`${fieldWrap}`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Du
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={selectCls}
            max={dateTo || undefined}
          />
        </div>

        {/* Au */}
        <div className={`${fieldWrap}`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Au
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={selectCls}
            min={dateFrom || undefined}
          />
        </div>
      </div>

      {/* Actions filtres */}
      <div className="mb-4">
        <div className="col-span-full flex flex-col gap-2 midTablet:flex-row">
          <button
            onClick={() => hasFullDateRange && fetchData(1)}
            disabled={!hasFullDateRange}
            title={!hasFullDateRange ? "Sélectionnez 'Du' ET 'Au'" : undefined}
            className={`${btnBase} bg-blue text-white disabled:opacity-40`}
            type="button"
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
            className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue hover:border-darkBlue/30 disabled:opacity-40`}
            type="button"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-w-[calc(100vw-83px)] midTablet:max-w-[calc(100vw-92px)] tablet:max-w-[calc(100vw-360px)] rounded-xl border border-darkBlue/10 p-2">
        <table className="w-full text-[13px]">
          <thead className="whitespace-nowrap">
            <tr className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/95 backdrop-blur">
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">Statut</th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">Zone</th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">Fréquence</th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">Prévue</th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">Fait le</th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">Priorité</th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">Produit</th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">Preuves</th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">Opérateur</th>
              <th className="py-2 pr-0 text-right font-medium text-darkBlue/70">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-darkBlue/10 [&>tr:last-child>td]:!pb-0">
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-darkBlue/50">
                  Aucune tâche
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-darkBlue/50">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Chargement…
                  </span>
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
                    className={`transition-colors hover:bg-darkBlue/[0.03] ${
                      editingId === it._id ? "bg-blue/5 ring-1 ring-blue/20" : ""
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
                        <span className="ml-1 px-2 py-0.5 rounded text-xs bg-blue text-white">
                          Vérifié
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{it.zone || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{it.frequency || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(it.dueAt)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(it.doneAt)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{it.riskLevel || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{it.productUsed || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {Array.isArray(it.proofUrls) && it.proofUrls.length
                        ? `${it.proofUrls.length} preuve(s)`
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.recordedBy
                        ? `${it.recordedBy.firstName || ""} ${it.recordedBy.lastName || ""}`.trim()
                        : "—"}
                    </td>
                    <td className="py-2 pr-0">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onEdit?.(it)}
                          className={`${btnBase} border border-green/50 bg-white text-green`}
                          aria-label="Éditer"
                          type="button"
                        >
                          <Edit3 className="size-4" /> Éditer
                        </button>
                        <button
                          onClick={() => askDelete(it)}
                          className={`${btnBase} border border-red bg-white text-red hover:border-red/80`}
                          aria-label="Supprimer"
                          type="button"
                        >
                          <Trash2 className="size-4" /> Supprimer
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
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-darkBlue/60">
            Page {meta.page}/{meta.pages} — {meta.total} tâches
          </div>
          <div className="flex gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => fetchData(meta.page - 1)}
              className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue hover:border-darkBlue/30 disabled:opacity-40`}
              type="button"
            >
              Précédent
            </button>
            <button
              disabled={meta.page >= meta.pages}
              onClick={() => fetchData(meta.page + 1)}
              className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue hover:border-darkBlue/30 disabled:opacity-40`}
              type="button"
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
          <div className="fixed inset-0 z-[1000]" aria-modal="true" role="dialog">
            <div
              onClick={closeDeleteModal}
              className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto w-full max-w-[480px] rounded-2xl border border-darkBlue/10 bg-white p-5 shadow-2xl">
                <h2 className="mb-2 text-center text-lg font-semibold text-darkBlue">
                  Supprimer cette tâche ?
                </h2>
                <p className="mb-5 text-center text-sm text-darkBlue/70">
                  Cette action est définitive. La tâche sera retirée de l’historique.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={onConfirmDelete}
                    disabled={deleteLoading}
                    className={`${btnBase} bg-blue text-white disabled:opacity-50`}
                    type="button"
                  >
                    {deleteLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Suppression…
                      </>
                    ) : (
                      "Confirmer"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    className={`${btnBase} border border-red bg-red text-white`}
                  >
                    <X className="size-4" /> Annuler
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
