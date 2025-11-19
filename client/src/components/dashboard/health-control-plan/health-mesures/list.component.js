"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { Search, CalendarClock, Edit3, Trash2, Loader2, X } from "lucide-react";

/* ---------- Utils ---------- */
function fmtDate(d, withTime = true) {
  try {
    if (!d) return "—";
    const date = new Date(d);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(date);
  } catch {
    return d || "—";
  }
}

const TYPE_LABELS = {
  covid_check: "Contrôle COVID",
  hygiene_check: "Contrôle hygiène",
  other: "Autre",
};

/* ---------- Component ---------- */
export default function HealthMeasuresList({
  restaurantId,
  onEdit,
  editingId = null,
  onDeleted,
}) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, pages: 1, total: 0 });

  const [loading, setLoading] = useState(false);
  const [showSlowLoader, setShowSlowLoader] = useState(false);

  // Filtres UI
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filtres appliqués (dates)
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");

  // Suppression
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // SSR-safe portal
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  const metaRef = useRef(meta);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  // Corrige si 'Au' < 'Du'
  useEffect(() => {
    if (dateFrom && dateTo && dateTo < dateFrom) setDateTo(dateFrom);
  }, [dateFrom, dateTo]);

  const sortLogic = (list) =>
    [...list].sort((a, b) => {
      const ak = a?.performedAt
        ? new Date(a.performedAt).getTime()
        : new Date(a.createdAt || 0).getTime();
      const bk = b?.performedAt
        ? new Date(b.performedAt).getTime()
        : new Date(b.createdAt || 0).getTime();
      return bk - ak;
    });

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        q ||
          type !== "all" ||
          dateFrom ||
          dateTo ||
          appliedDateFrom ||
          appliedDateTo
      ),
    [q, type, dateFrom, dateTo, appliedDateFrom, appliedDateTo]
  );

  const hasFullDateRange = Boolean(dateFrom && dateTo);

  /* ---------- Styles ---------- */
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

  /* ---------- Fetch ---------- */
  const fetchData = async (page = 1, overrides = {}) => {
    if (!restaurantId) return;

    setLoading(true);
    try {
      const cur = {
        q: overrides.q ?? q,
        type: overrides.type ?? type,
        dateFrom:
          overrides.dateFrom !== undefined
            ? overrides.dateFrom
            : appliedDateFrom,
        dateTo:
          overrides.dateTo !== undefined ? overrides.dateTo : appliedDateTo,
      };

      const params = { page, limit: meta.limit || 20 };
      if (cur.q) params.q = cur.q;
      if (cur.type && cur.type !== "all") params.type = cur.type;
      if (cur.dateFrom) params.date_from = new Date(cur.dateFrom).toISOString();
      if (cur.dateTo) params.date_to = new Date(cur.dateTo).toISOString();

      const { data } = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-health-measures`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          params,
        }
      );

      const list = sortLogic(data.items || []);
      const nextMeta = data.meta || { page: 1, limit: 20, pages: 1, total: 0 };
      setItems(list);
      setMeta(nextMeta);
      metaRef.current = nextMeta;
    } catch (e) {
      console.error("fetch health measures error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Loader lent après 1s
  useEffect(() => {
    if (!loading) {
      setShowSlowLoader(false);
      return;
    }
    const id = setTimeout(() => setShowSlowLoader(true), 1000);
    return () => clearTimeout(id);
  }, [loading]);

  // Initial fetch
  useEffect(() => {
    if (restaurantId) {
      setAppliedDateFrom("");
      setAppliedDateTo("");
      fetchData(1, {
        q: "",
        type: "all",
        dateFrom: "",
        dateTo: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Refresh immédiat sur type
  useEffect(() => {
    if (!restaurantId) return;
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Debounce recherche texte → backend
  const isFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!restaurantId) return;
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

  // Live update
  useEffect(() => {
    const handleUpsert = (event) => {
      const doc = event?.detail?.doc;
      if (!doc || !doc._id || String(doc.restaurantId) !== String(restaurantId))
        return;

      const limit = metaRef.current.limit || 20;
      const page = metaRef.current.page || 1;
      let isNew = false;

      setItems((prev) => {
        const prevList = Array.isArray(prev) ? prev : [];
        const index = prevList.findIndex((it) => it?._id === doc._id);
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
          const total = (prevMeta.total || 0) + 1;
          const pages = Math.max(1, Math.ceil(total / limit));
          const nextMeta = { ...prevMeta, total, pages };
          metaRef.current = nextMeta;
          return nextMeta;
        });
      }
    };

    window.addEventListener("health-mesures:upsert", handleUpsert);
    return () =>
      window.removeEventListener("health-mesures:upsert", handleUpsert);
  }, [restaurantId]);

  const askDelete = (it) => {
    setDeleteTarget(it);
    setIsDeleteModalOpen(true);
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/health-measures/${deleteTarget._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setItems((prev) => prev.filter((x) => x._id !== deleteTarget._id));
      onDeleted?.(deleteTarget);
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);

      setMeta((prevMeta) => {
        const total = Math.max(0, (prevMeta.total || 0) - 1);
        const pages = total > 0 ? Math.ceil(total / (prevMeta.limit || 20)) : 1;
        const page = Math.min(prevMeta.page || 1, pages);
        const nextMeta = { ...prevMeta, total, pages, page };
        metaRef.current = nextMeta;
        return nextMeta;
      });
    } catch (err) {
      console.error("Erreur suppression mesure santé:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setIsDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  /* ---------- Render ---------- */
  return (
    <div className="rounded-2xl border border-darkBlue/10 bg-white p-4 midTablet:p-5 shadow">
      {/* Filtres */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Search className="size-4" /> Recherche
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type, notes, pièces, opérateur…"
            className={inputCls}
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={selectCls}
          >
            <option value="all">Tous types</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className={fieldWrap}>
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

        <div className="col-span-full flex flex-col gap-2 mobile:flex-row">
          <button
            onClick={() => {
              if (!hasFullDateRange) return;
              setAppliedDateFrom(dateFrom);
              setAppliedDateTo(dateTo);
              fetchData(1, { dateFrom, dateTo });
            }}
            disabled={!hasFullDateRange}
            className={`${btnBase} bg-blue text-white disabled:opacity-40`}
          >
            Filtrer
          </button>

          <button
            onClick={() => {
              setQ("");
              setType("all");
              setDateFrom("");
              setDateTo("");
              setAppliedDateFrom("");
              setAppliedDateTo("");
              fetchData(1, { q: "", type: "all", dateFrom: "", dateTo: "" });
            }}
            disabled={!hasActiveFilters}
            className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue hover:border-darkBlue/30 disabled:opacity-40`}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Table + overlay loader */}
      <div className="relative">
        <div className="overflow-x-auto max-w-[calc(100vw-50px)] mobile:max-w-[calc(100vw-83px)] midTablet:max-w-[calc(100vw-92px)] tablet:max-w-[calc(100vw-360px)] rounded-xl border border-darkBlue/10">
          <table className="w-full text-[13px]">
            <thead className="text-nowrap sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-darkBlue/10">
              <tr>
                <th className="py-2 pl-2 pr-3 text-left font-medium text-darkBlue/70">
                  Effectué le
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Type
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Notes
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Pièces
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Opérateur
                </th>
                <th className="py-2 pr-2 text-right font-medium text-darkBlue/70">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBlue/10">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-darkBlue/50">
                    Aucune mesure sanitaire
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr
                    key={it._id}
                    className={`hover:bg-darkBlue/[0.03] ${editingId === it._id ? "bg-blue/5 ring-1 ring-blue/20" : ""}`}
                  >
                    <td className="py-2 pl-2 pr-3 whitespace-nowrap">
                      {fmtDate(it.performedAt)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {TYPE_LABELS[it.type] || it.type || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="line-clamp-2 max-w-[460px]">
                        {it.notes || "—"}
                      </div>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {Array.isArray(it.attachments) && it.attachments.length
                        ? `${it.attachments.length} doc(s)`
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.createdBy
                        ? `${it.createdBy.firstName || ""} ${it.createdBy.lastName || ""}`.trim() ||
                          "—"
                        : "—"}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => onEdit?.(it)}
                          className={`${btnBase} border border-green/50 bg-white text-green`}
                        >
                          <Edit3 className="size-4" /> Éditer
                        </button>
                        <button
                          onClick={() => askDelete(it)}
                          className={`${btnBase} border border-red bg-white text-red hover:border-red/80`}
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
      {meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-darkBlue/60">
          <div>
            Page {meta.page}/{meta.pages} — {meta.total} mesure(s)
          </div>
          <div className="flex gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => fetchData(meta.page - 1)}
              className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue disabled:opacity-40`}
            >
              Précédent
            </button>
            <button
              disabled={meta.page >= meta.pages}
              onClick={() => fetchData(meta.page + 1)}
              className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue disabled:opacity-40`}
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
                  Supprimer cette mesure ?
                </h2>
                <p className="mb-5 text-center text-sm text-darkBlue/70">
                  Cette action est définitive.
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={onConfirmDelete}
                    disabled={deleteLoading}
                    className={`${btnBase} bg-blue text-white disabled:opacity-50`}
                  >
                    {deleteLoading ? (
                      <>
                        {" "}
                        <Loader2 className="size-4 animate-spin" /> Suppression…{" "}
                      </>
                    ) : (
                      "Confirmer"
                    )}
                  </button>
                  <button
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
