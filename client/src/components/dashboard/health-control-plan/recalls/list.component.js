"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { Search, CalendarClock, Edit3, Trash2, Loader2, X } from "lucide-react";

/* ----------------------------- Utils ----------------------------- */
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

const StatusPill = ({ closedAt }) => {
  const isClosed = Boolean(closedAt);
  const cls = isClosed ? "bg-green text-white" : "bg-red text-white";
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>
      {isClosed ? "Fermé" : "Ouvert"}
    </span>
  );
};

/* --------------------------- Component --------------------------- */
export default function RecallList({
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
  const [status, setStatus] = useState("all"); // all | open | closed
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filtres réellement appliqués au backend
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");

  // Suppression
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  // Corrige intervalle invalide
  useEffect(() => {
    if (dateFrom && dateTo && dateTo < dateFrom) setDateTo(dateFrom);
  }, [dateFrom, dateTo]);

  // Tri : plus récent d'abord
  const sortLogic = (list) =>
    [...list].sort((a, b) => {
      const ak = a?.initiatedAt
        ? new Date(a.initiatedAt).getTime()
        : new Date(a.createdAt || 0).getTime();
      const bk = b?.initiatedAt
        ? new Date(b.initiatedAt).getTime()
        : new Date(b.createdAt || 0).getTime();
      return bk - ak;
    });

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        q ||
          status !== "all" ||
          dateFrom ||
          dateTo ||
          appliedDateFrom ||
          appliedDateTo
      ),
    [q, status, dateFrom, dateTo, appliedDateFrom, appliedDateTo]
  );

  const hasFullDateRange = Boolean(dateFrom && dateTo);

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

  /* ------------------------------ Fetch ------------------------------ */
  const fetchData = async (page = 1, overrides = {}) => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const cur = {
        q: overrides.q ?? q,
        status: overrides.status ?? status,
        dateFrom:
          overrides.dateFrom !== undefined
            ? overrides.dateFrom
            : appliedDateFrom,
        dateTo:
          overrides.dateTo !== undefined ? overrides.dateTo : appliedDateTo,
      };

      const params = { page, limit: meta.limit || 20 };
      if (cur.q) params.q = cur.q;
      if (cur.status && cur.status !== "all") params.closed = cur.status; // backend attend "open" ou "closed"
      if (cur.dateFrom) params.date_from = new Date(cur.dateFrom).toISOString();
      if (cur.dateTo) params.date_to = new Date(cur.dateTo).toISOString();

      const { data } = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-recalls`,
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
      console.error("fetch recalls error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Loader lent (>1s)
  useEffect(() => {
    if (!loading) {
      setShowSlowLoader(false);
      return;
    }
    const id = setTimeout(() => setShowSlowLoader(true), 1000);
    return () => clearTimeout(id);
  }, [loading]);

  // Initial
  useEffect(() => {
    if (restaurantId) {
      setAppliedDateFrom("");
      setAppliedDateTo("");
      fetchData(1, { q: "", status: "all", dateFrom: "", dateTo: "" });
    }
  }, [restaurantId]);

  // Auto-refresh sur changement de statut
  useEffect(() => {
    if (!restaurantId) return;
    fetchData(1, { status });
  }, [status]);

  // Debounce 500ms sur recherche texte (backend)
  const isFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!restaurantId) return;
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      return;
    }
    const timeout = setTimeout(() => fetchData(1, { q }), 500);
    return () => clearTimeout(timeout);
  }, [q, restaurantId]);

  // Upsert temps réel
  useEffect(() => {
    const handler = (e) => {
      const doc = e?.detail?.doc;
      if (!doc || !doc._id || String(doc.restaurantId) !== String(restaurantId))
        return;

      const limit = metaRef.current.limit || 20;
      const page = metaRef.current.page || 1;
      let isNew = false;

      setItems((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const idx = list.findIndex((x) => x._id === doc._id);
        let next;
        if (idx > -1) {
          next = [...list];
          next[idx] = { ...next[idx], ...doc };
        } else {
          isNew = true;
          if (page === 1) {
            next = [doc, ...list];
            if (next.length > limit) next = next.slice(0, limit);
          } else {
            next = list;
          }
        }
        return sortLogic(next || list);
      });

      if (isNew) {
        setMeta((m) => {
          const total = (m.total || 0) + 1;
          const pages = Math.max(1, Math.ceil(total / limit));
          const nextMeta = { ...m, total, pages };
          metaRef.current = nextMeta;
          return nextMeta;
        });
      }
    };
    window.addEventListener("recall:upsert", handler);
    return () => window.removeEventListener("recall:upsert", handler);
  }, [restaurantId]);

  /* ----------------------------- Delete ----------------------------- */
  const askDelete = (it) => {
    setDeleteTarget(it);
    setIsDeleteModalOpen(true);
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recalls/${deleteTarget._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setItems((prev) => prev.filter((x) => x._id !== deleteTarget._id));
      onDeleted?.(deleteTarget);
      setMeta((m) => ({
        ...m,
        total: Math.max(0, (m.total || 0) - 1),
        pages: Math.max(
          1,
          Math.ceil(Math.max(0, (m.total || 0) - 1) / (m.limit || 20))
        ),
      }));
    } catch (err) {
      console.error("Suppression recall:", err);
    } finally {
      setDeleteLoading(false);
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  };

  /* ------------------------------ Render ------------------------------ */
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
            placeholder="Produit, lot, fournisseur…"
            className={inputCls}
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Statut</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectCls}
          >
            <option value="all">Tous statuts</option>
            <option value="open">Ouverts</option>
            <option value="closed">Fermés</option>
          </select>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Déclarés du
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
              setStatus("all");
              setDateFrom("");
              setDateTo("");
              setAppliedDateFrom("");
              setAppliedDateTo("");
              fetchData(1, { q: "", status: "all", dateFrom: "", dateTo: "" });
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
            <thead className="whitespace-nowrap">
              <tr className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/95 backdrop-blur">
                <th className="py-2 pl-2 pr-3 text-left font-medium text-darkBlue/70">
                  Déclaré le
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Produit
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Fournisseur
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  N° lot
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Qté
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  DLC/DDM
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Statut
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Clôturé le
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
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="py-8 text-center text-darkBlue/50"
                  >
                    Aucun retour NC
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const item = it?.item || {};
                  return (
                    <tr
                      key={it._id}
                      className={`border-b border-darkBlue/10 last:border-b-0 hover:bg-darkBlue/[0.03] ${editingId === it._id ? "bg-blue/5 ring-1 ring-blue/20" : ""}`}
                    >
                      <td className="py-2 pl-2 pr-3 whitespace-nowrap">
                        {fmtDate(it.initiatedAt)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {item.productName || "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {item.supplierName || "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {item.lotNumber || "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {item.quantity ?? "—"}
                        {item.unit ? ` ${item.unit}` : ""}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {fmtDate(item.bestBefore, false)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <StatusPill closedAt={it.closedAt} />
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {fmtDate(it.closedAt)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {Array.isArray(it.attachments) && it.attachments.length
                          ? `${it.attachments.length} doc(s)`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {it?.recordedBy
                          ? `${it.recordedBy.firstName || ""} ${it.recordedBy.lastName || ""}`.trim() ||
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
                  );
                })
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
      {meta?.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-darkBlue/60">
          <div>
            Page {meta.page}/{meta.pages} — {meta.total} retours
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
              onClick={() => !deleteLoading && closeDeleteModal()}
              className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto w-full max-w-[480px] rounded-2xl border border-darkBlue/10 bg-white p-5 shadow-2xl">
                <h2 className="mb-2 text-center text-lg font-semibold text-darkBlue">
                  Supprimer ce retour ?
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
                    onClick={() => !deleteLoading && closeDeleteModal()}
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
