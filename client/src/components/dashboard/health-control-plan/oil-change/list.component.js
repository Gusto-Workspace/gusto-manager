"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// AXIOS
import axios from "axios";

// ICONS
import { Search, CalendarClock, Edit3, Trash2, Loader2, X } from "lucide-react";

/* ----------------------------- Utils ----------------------------- */
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

/* --------------------------- Component --------------------------- */
export default function OilChangeList({
  restaurantId,
  onEdit,
  editingId = null,
  onDeleted,
}) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [showSlowLoader, setShowSlowLoader] = useState(false);

  // Filtres date affichés
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Filtres date appliqués côté backend
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");

  // Recherche texte
  const [q, setQ] = useState("");

  // Suppression
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // SSR-safe portal
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const hasActiveFilters = useMemo(
    () => Boolean(q || dateFrom || dateTo),
    [q, dateFrom, dateTo]
  );
  const hasFullDateRange = Boolean(dateFrom && dateTo);

  // Corriger intervalle invalide à la volée
  useEffect(() => {
    if (dateFrom && dateTo && dateTo < dateFrom) setDateTo(dateFrom);
  }, [dateFrom, dateTo]);

  const token = useMemo(() => localStorage.getItem("token"), []);
  const metaRef = useRef(meta);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  const sortByDate = (list) =>
    [...list].sort(
      (a, b) => new Date(b?.performedAt || 0) - new Date(a?.performedAt || 0)
    );

  const fetchData = async (page = 1, overrides = {}) => {
    if (!restaurantId) return;

    setLoading(true);
    try {
      const curQ = overrides.q !== undefined ? overrides.q : q;
      const curFrom =
        overrides.dateFrom !== undefined ? overrides.dateFrom : appliedDateFrom;
      const curTo =
        overrides.dateTo !== undefined ? overrides.dateTo : appliedDateTo;

      const params = { page, limit: meta.limit || 20 };
      if (curFrom) params.date_from = new Date(curFrom).toISOString();
      if (curTo) params.date_to = new Date(curTo).toISOString();
      if (curQ) params.q = curQ;

      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-oil-changes`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      const list = sortByDate(data.items || []);
      const nextMeta = data.meta || { page: 1, limit: 20, pages: 1, total: 0 };
      setItems(list);
      setMeta(nextMeta);
      metaRef.current = nextMeta;
    } catch (e) {
      console.error("fetch oil-changes error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Loader "lent" : visible seulement si loading > 1s
  useEffect(() => {
    if (!loading) {
      setShowSlowLoader(false);
      return;
    }

    const id = setTimeout(() => {
      setShowSlowLoader(true);
    }, 1000);

    return () => clearTimeout(id);
  }, [loading]);

  // Initial
  useEffect(() => {
    if (restaurantId) {
      setAppliedDateFrom("");
      setAppliedDateTo("");
      fetchData(1, { q: "", dateFrom: "", dateTo: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Debounce sur la recherche (500ms) → fetch backend
  const isFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!restaurantId) return;

    // Pas de fetch supplémentaire au premier rendu
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      fetchData(1, { q });
    }, 500);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, restaurantId]);

  // 🔁 Upsert temps réel
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
        return sortByDate(nextList || prevList);
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

    window.addEventListener("oil-change:upsert", handleUpsert);
    return () => window.removeEventListener("oil-change:upsert", handleUpsert);
  }, [restaurantId]);

  const askDelete = (item) => {
    setDeleteTarget(item);
    setIsDeleteModalOpen(true);
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;

    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/oil-changes/${deleteTarget._id}`;

    try {
      setDeleteLoading(true);
      await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const deleted = deleteTarget;
      setItems((prev) =>
        prev.filter((it) => String(it?._id) !== String(deleted._id))
      );
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
      console.error("Erreur lors de la suppression de l'opération:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setIsDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  /* ------------------------------ Styles ------------------------------ */
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

  /* ------------------------------ Render ------------------------------ */
  return (
    <div className="rounded-2xl border border-darkBlue/10 bg-white p-4 midTablet:p-5 shadow">
      {/* Filtres */}
      <div className="flex flex-col midTablet:flex-row gap-2 mb-2">
        {/* Recherche → prend toute la place */}
        <div className={`${fieldWrap} w-full`}>
          <label className={labelCls}>
            <Search className="size-4" /> Recherche
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Friteuse, marque, lot, couleur/odeur, notes, opérateur…"
            className={inputCls}
          />
        </div>

        {/* Du */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Réalisées du
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
        <div className={fieldWrap}>
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

      <div className="mb-4">
        {/* Actions filtres */}
        <div className="col-span-full flex flex-col gap-2 mobile:flex-row">
          <button
            onClick={() => {
              if (!hasFullDateRange) return;
              setAppliedDateFrom(dateFrom);
              setAppliedDateTo(dateTo);
              fetchData(1, { dateFrom, dateTo });
            }}
            disabled={!hasFullDateRange}
            title={
              !hasFullDateRange
                ? "Sélectionnez 'Du' ET 'Au' pour filtrer par dates"
                : undefined
            }
            className={`${btnBase} bg-blue text-white disabled:opacity-40`}
            type="button"
          >
            Filtrer
          </button>

          <button
            onClick={() => {
              setQ("");
              setDateFrom("");
              setDateTo("");
              setAppliedDateFrom("");
              setAppliedDateTo("");
              fetchData(1, { q: "", dateFrom: "", dateTo: "" });
            }}
            disabled={!hasActiveFilters}
            className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue hover:border-darkBlue/30 disabled:opacity-40`}
            type="button"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Table + overlay loader */}
      <div className="relative">
        <div className="overflow-x-auto max-w-[calc(100vw-83px)] midTablet:max-w-[calc(100vw-92px)] tablet:max-w-[calc(100vw-360px)] rounded-xl border border-darkBlue/10">
          <table className="w-full text-[13px]">
            <thead className="whitespace-nowrap">
              <tr className="sticky top-0 z-10 bg-white/95 backdrop-blur">
                <th className="py-2 pr-3 pl-2 text-left font-medium text-darkBlue/70 border-b border-darkBlue/10">
                  Date
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70 border-b border-darkBlue/10">
                  Friteuse
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70 border-b border-darkBlue/10">
                  Litres retirés
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70 border-b border-darkBlue/10">
                  TPM %
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70 border-b border-darkBlue/10">
                  Filtrée
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70 border-b border-darkBlue/10">
                  Marque
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70 border-b border-darkBlue/10">
                  Lot huile neuve
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70 border-b border-darkBlue/10">
                  Opérateur
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70 border-b border-darkBlue/10">
                  Notes
                </th>
                <th className="py-2 pr-2 text-right font-medium text-darkBlue/70 border-b border-darkBlue/10">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 ? (
                <tr className="border-b border-darkBlue/10 last:border-b-0">
                  <td colSpan={10} className="py-8 text-center text-darkBlue/50">
                    Aucune opération
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr
                    key={it._id}
                    className={`border-b border-darkBlue/10 last:border-b-0 transition-colors hover:bg-darkBlue/[0.03] ${
                      editingId === it._id
                        ? "bg-blue/5 ring-1 ring-blue/20"
                        : ""
                    }`}
                  >
                    <td className="py-2 pl-2 pr-3 whitespace-nowrap">
                      {fmtDate(it.performedAt)}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.fryerId || "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.litersRemoved != null
                        ? `${it.litersRemoved} L`
                        : "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.tpmPercent != null ? `${it.tpmPercent}` : "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.filteredBeforeChange ? "Oui" : "Non"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.oilBrand || "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.newOilBatch?.batchNumber || "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.recordedBy
                        ? `${it.recordedBy.firstName || ""} ${
                            it.recordedBy.lastName || ""
                          }`.trim() || "—"
                        : "—"}
                    </td>

                    <td className="py-2 pr-3 max-w-[320px]">
                      <div className="flex items-center gap-2">
                        <span className="line-clamp-2">
                          {it.qualityNotes || "—"}
                          {it?.colorIndex ? ` • ${it.colorIndex}` : ""}
                          {it?.odorCheck ? ` • ${it.odorCheck}` : ""}
                        </span>
                        {it.disposalDocumentUrl && (
                          <a
                            href={it.disposalDocumentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue underline whitespace-nowrap"
                          >
                            Voir doc
                          </a>
                        )}
                      </div>
                    </td>

                    <td className="py-2 pr-2">
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
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Overlay loader par-dessus la table, seulement si loading > 1s */}
        {showSlowLoader && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60">
            <div className="flex items-center gap-2 text-darkBlue/70 text-sm">
              <Loader2 className="size-4 animate-spin" />
              <span>Chargement…</span>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta?.pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-darkBlue/60">
            Page {meta.page}/{meta.pages} — {meta.total} opérations
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
          <div
            className="fixed inset-0 z-[1000]"
            aria-modal="true"
            role="dialog"
          >
            <div
              onClick={closeDeleteModal}
              className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto w-full max-w-[480px] rounded-2xl border border-darkBlue/10 bg-white p-5 shadow-2xl">
                <h2 className="mb-2 text-center text-lg font-semibold text-darkBlue">
                  Supprimer cette opération ?
                </h2>
                <p className="mb-5 text-center text-sm text-darkBlue/70">
                  Cette action est définitive. L’opération sera retirée de
                  l’historique.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={onConfirmDelete}
                    disabled={deleteLoading}
                    className={`${btnBase} bg-blue text-white disabled:opacity-50`}
                    type="button"
                  >
                    {deleteLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        <span>Suppression…</span>
                      </div>
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
