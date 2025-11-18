"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { Search, CalendarClock, Edit3, Trash2, Loader2, X } from "lucide-react";

/* ---------- Utils ---------- */
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

/* ---------- Labels FR ---------- */
const TYPE_LABELS = {
  temperature: "Température",
  hygiene: "Hygiène",
  reception: "Réception",
  microbiology: "Microbiologie",
  other: "Autre",
};

const SEVERITY_LABELS = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
};

const STATUS_LABELS = {
  open: "Ouverte",
  in_progress: "En cours",
  closed: "Fermée",
};

function statusPill(s) {
  const map = {
    open: "bg-red text-white",
    in_progress: "bg-orange text-white",
    closed: "bg-green text-white",
  };
  const cls = map[s] || "bg-darkBlue/15 text-darkBlue";
  const label = STATUS_LABELS[s] || s || "—";
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{label}</span>;
}

export default function NonConformityList({
  restaurantId,
  onEdit,
  editingId = null,
  onDeleted,
}) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, pages: 1, total: 0 });

  const [loading, setLoading] = useState(false);
  const [showSlowLoader, setShowSlowLoader] = useState(false);

  // Filtres affichés
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Dates réellement appliquées au backend
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
    () => (typeof window !== "undefined" ? localStorage.getItem("token") : null),
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
      const ak = a?.reportedAt
        ? new Date(a.reportedAt).getTime()
        : new Date(a.createdAt || 0).getTime();
      const bk = b?.reportedAt
        ? new Date(b.reportedAt).getTime()
        : new Date(b.createdAt || 0).getTime();
      return bk - ak;
    });

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        q ||
          type ||
          severity ||
          status ||
          dateFrom ||
          dateTo ||
          appliedDateFrom ||
          appliedDateTo
      ),
    [q, type, severity, status, dateFrom, dateTo, appliedDateFrom, appliedDateTo]
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
        severity: overrides.severity ?? severity,
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
      if (cur.type) params.type = cur.type;
      if (cur.severity) params.severity = cur.severity;
      if (cur.status) params.status = cur.status;
      if (cur.dateFrom) params.date_from = new Date(cur.dateFrom).toISOString();
      if (cur.dateTo) params.date_to = new Date(cur.dateTo).toISOString();

      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-non-conformities`;
      const { data } = await axios.get(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        params,
      });

      const list = sortLogic(data.items || []);
      const nextMeta = data.meta || { page: 1, limit: 20, pages: 1, total: 0 };
      setItems(list);
      setMeta(nextMeta);
      metaRef.current = nextMeta;
    } catch (e) {
      console.error("fetch NC list error:", e);
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

  // Initial fetch
  useEffect(() => {
    if (restaurantId) {
      setAppliedDateFrom("");
      setAppliedDateTo("");
      fetchData(1, {
        q: "",
        type: "",
        severity: "",
        status: "",
        dateFrom: "",
        dateTo: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Auto-fetch quand Type / Gravité / Statut changent
  useEffect(() => {
    if (!restaurantId) return;
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, severity, status]);

  // 🔍 Debounce 500ms sur q → backend
  const isFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!restaurantId) return;

    // éviter un second fetch au tout 1er rendu
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

  // Live update via event
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
          const limitValue = prevMeta.limit || limit;
          const total = (prevMeta.total || 0) + 1;
          const pages = Math.max(1, Math.ceil(total / limitValue));
          const nextMeta = { ...prevMeta, total, pages };
          metaRef.current = nextMeta;
          return nextMeta;
        });
      }
    };

    window.addEventListener("non-conformity:upsert", handleUpsert);
    return () =>
      window.removeEventListener("non-conformity:upsert", handleUpsert);
  }, [restaurantId]);

  const askDelete = (it) => {
    setDeleteTarget(it);
    setIsDeleteModalOpen(true);
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/non-conformities/${deleteTarget._id}`;
      await axios.delete(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      setItems((prev) =>
        (prev || []).filter((x) => String(x?._id) !== String(deleteTarget._id))
      );
      onDeleted?.(deleteTarget);
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);

      setMeta((prevMeta) => {
        const limitValue = prevMeta.limit || 20;
        const total = Math.max(0, (prevMeta.total || 0) - 1);
        const pages = total > 0 ? Math.ceil(total / Number(limitValue)) : 1;
        const page = Math.min(prevMeta.page || 1, pages);
        const nextMeta = { ...prevMeta, total, pages, page };
        metaRef.current = nextMeta;
        return nextMeta;
      });
    } catch (err) {
      console.error("Erreur suppression :", err);
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
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,_1fr))] gap-2">
        {/* Recherche */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Search className="size-4" /> Recherche
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Description, référence, action, note…"
            className={inputCls}
          />
        </div>

        {/* Type */}
        <div className={fieldWrap}>
          <label className={labelCls}>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={selectCls}
          >
            <option value="">Tous types</option>
            <option value="temperature">Température</option>
            <option value="hygiene">Hygiène</option>
            <option value="reception">Réception</option>
            <option value="microbiology">Microbiologie</option>
            <option value="other">Autre</option>
          </select>
        </div>

        {/* Gravité */}
        <div className={fieldWrap}>
          <label className={labelCls}>Gravité</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className={selectCls}
          >
            <option value="">Toutes</option>
            <option value="low">Faible</option>
            <option value="medium">Moyenne</option>
            <option value="high">Élevée</option>
          </select>
        </div>

        {/* Statut */}
        <div className={fieldWrap}>
          <label className={labelCls}>Statut</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectCls}
          >
            <option value="">Tous</option>
            <option value="open">Ouverte</option>
            <option value="in_progress">En cours</option>
            <option value="closed">Fermée</option>
          </select>
        </div>

        {/* Du */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Déclarées du
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
                ? "Sélectionnez 'Du' ET 'Au' pour filtrer"
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
              setType("");
              setSeverity("");
              setStatus("");
              setDateFrom("");
              setDateTo("");
              setAppliedDateFrom("");
              setAppliedDateTo("");
              fetchData(1, {
                q: "",
                type: "",
                severity: "",
                status: "",
                dateFrom: "",
                dateTo: "",
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

      {/* Table + overlay loader */}
      <div className="relative">
        <div className="overflow-x-auto max-w-[calc(100vw-83px)] midTablet:max-w-[calc(100vw-92px)] tablet:max-w-[calc(100vw-360px)] rounded-xl border border-darkBlue/10">
          <table className="w-full text-[13px]">
            <thead className="whitespace-nowrap">
              <tr className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/95 backdrop-blur">
                <th className="py-2 pr-3 pl-2 text-left font-medium text-darkBlue/70">
                  Déclarée le
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Type
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Gravité
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Statut
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Référence
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Description
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Actions corr.
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
                  <td colSpan={10} className="py-8 text-center text-darkBlue/50">
                    Aucune non-conformité
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr
                    key={it._id}
                    className={`border-b border-darkBlue/10 last:border-b-0 transition-colors hover:bg-darkBlue/[0.03] ${
                      editingId === it._id ? "bg-blue/5 ring-1 ring-blue/20" : ""
                    }`}
                  >
                    <td className="py-2 pl-2 pr-3 whitespace-nowrap">
                      {fmtDate(it.reportedAt)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {TYPE_LABELS[it.type] ?? "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {SEVERITY_LABELS[it.severity] ?? "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {statusPill(it.status)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.referenceId || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {it.description || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {Array.isArray(it.correctiveActions)
                        ? it.correctiveActions.length
                        : 0}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {Array.isArray(it.attachments) && it.attachments.length
                        ? `${it.attachments.length} doc(s)`
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.recordedBy
                        ? `${it.recordedBy.firstName || ""} ${
                            it.recordedBy.lastName || ""
                          }`.trim() || "—"
                        : "—"}
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

        {/* Overlay loader (seulement si loading > 1s) */}
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
            Page {meta.page}/{meta.pages} — {meta.total} non-conformités
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
                  Supprimer cette non-conformité ?
                </h2>
                <p className="mb-5 text-center text-sm text-darkBlue/70">
                  Cette action est définitive.
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
