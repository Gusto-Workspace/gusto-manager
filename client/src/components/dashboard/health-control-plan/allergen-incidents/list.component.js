// components/dashboard/health-control-plan/allergen-incidents/list.component.jsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { Search, CalendarClock, Edit3, Trash2, Loader2, X } from "lucide-react";

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
  return it?.closed ? "Clôturé" : "Ouvert";
}

export default function AllergenIncidentList({
  restaurantId,
  onEdit,
  editingId = null,
  onDeleted,
}) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);

  // Filtres
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); // all|open|closed
  const [severity, setSeverity] = useState(""); // '', low|medium|high
  const [source, setSource] = useState(""); // '', internal|supplier|customer|lab|other
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const token = useMemo(() => localStorage.getItem("token"), []);
  const metaRef = useRef(meta);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  useEffect(() => {
    if (dateFrom && dateTo && dateTo < dateFrom) setDateTo(dateFrom);
  }, [dateFrom, dateTo]);

  const sortLogic = (list) =>
    [...list].sort((a, b) => {
      const ak = new Date(a?.detectedAt || 0).getTime();
      const bk = new Date(b?.detectedAt || 0).getTime();
      return bk - ak;
    });

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        q || status !== "all" || severity || source || dateFrom || dateTo
      ),
    [q, status, severity, source, dateFrom, dateTo]
  );
  const hasFullDateRange = Boolean(dateFrom && dateTo);

  /* ---------- Styles (alignés sur MicrobiologyList) ---------- */
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

  const fetchData = async (page = 1, overrides = {}) => {
    setLoading(true);
    try {
      const cur = {
        q: overrides.q ?? q,
        status: overrides.status ?? status,
        severity: overrides.severity ?? severity,
        source: overrides.source ?? source,
        dateFrom: overrides.dateFrom ?? dateFrom,
        dateTo: overrides.dateTo ?? dateTo,
      };
      const params = { page, limit: meta.limit || 20 };
      if (cur.q) params.q = cur.q;
      if (cur.status && cur.status !== "all") params.status = cur.status;
      if (cur.severity) params.severity = cur.severity;
      if (cur.source) params.source = cur.source;
      if (cur.dateFrom) params.date_from = new Date(cur.dateFrom).toISOString();
      if (cur.dateTo) params.date_to = new Date(cur.dateTo).toISOString();

      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-allergen-incidents`;
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
      console.error("fetch allergen incident list error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    if (restaurantId)
      fetchData(1, {
        q: "",
        status: "all",
        severity: "",
        source: "",
        dateFrom: "",
        dateTo: "",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Auto-fetch quand Statut / Gravité / Source changent
  useEffect(() => {
    if (!restaurantId) return;
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, severity, source]);

  // Écoute des upserts
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

    window.addEventListener("allergen-incident:upsert", handleUpsert);
    return () =>
      window.removeEventListener("allergen-incident:upsert", handleUpsert);
  }, [restaurantId]);

  // Filtrage client (q)
  const filtered = useMemo(() => {
    if (!q) return items;
    const qq = q.toLowerCase();
    return items.filter((it) =>
      [
        it?.itemName,
        it?.source,
        it?.severity,
        ...(Array.isArray(it?.allergens) ? it.allergens : []),
        it?.description,
        it?.immediateAction,
        it?.recordedBy?.firstName,
        it?.recordedBy?.lastName,
        it?.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(qq)
    );
  }, [items, q]);

  const askDelete = (it) => {
    setDeleteTarget(it);
    setIsDeleteModalOpen(true);
  };
  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/allergen-incidents/${deleteTarget._id}`;
      await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setItems((prev) =>
        prev.filter((x) => String(x._id) !== String(deleteTarget._id))
      );
      onDeleted?.(deleteTarget);
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);

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

  return (
    <div className="rounded-2xl border border-darkBlue/10 bg-white p-4 midTablet:p-5 shadow">
      {/* Filtres (style MicrobiologyList) */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,_1fr))] gap-2">
        {/* Recherche */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Search className="size-4" /> Recherche
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Produit, allergène, source, note…"
            className={inputCls}
          />
        </div>

        {/* Statut */}
        <div className={fieldWrap}>
          <label className={labelCls}>Statut</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectCls}
          >
            <option value="all">Tous</option>
            <option value="open">Ouverts</option>
            <option value="closed">Clôturés</option>
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

        {/* Source */}
        <div className={fieldWrap}>
          <label className={labelCls}>Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={selectCls}
          >
            <option value="">Toutes</option>
            <option value="internal">Interne</option>
            <option value="supplier">Fournisseur</option>
            <option value="customer">Client</option>
            <option value="lab">Laboratoire</option>
            <option value="other">Autre</option>
          </select>
        </div>

        {/* Dates */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Détectés du
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

        {/* Actions filtres */}
        <div className="col-span-full flex flex-col gap-2 mobile:flex-row">
          <button
            onClick={() => hasFullDateRange && fetchData(1)}
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
              setStatus("all");
              setSeverity("");
              setSource("");
              setDateFrom("");
              setDateTo("");
              fetchData(1, {
                q: "",
                status: "all",
                severity: "",
                source: "",
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

      {/* Table */}
      <div className="overflow-x-auto max-w-[calc(100vw-83px)] midTablet:max-w-[calc(100vw-92px)] tablet:max-w-[calc(100vw-360px)] rounded-xl border border-darkBlue/10 p-2">
        <table className="w-full text-[13px]">
          <thead className="whitespace-nowrap">
            <tr className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/95 backdrop-blur">
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Statut
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Détecté le
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Produit / Plat
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Allergènes
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Gravité
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Source
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Actions corr.
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Opérateur
              </th>
              <th className="py-2 pr-3 text-right font-medium text-darkBlue/70">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-darkBlue/10 [&>tr:last-child>td]:!pb-0">
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-darkBlue/50">
                  Aucun incident
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-darkBlue/50">
                  <span className="inline-flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      <span>Chargement…</span>
                    </div>
                  </span>
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((it) => {
                const badge = statusBadge(it);
                const sev =
                  it.severity === "high"
                    ? "bg-red text-white"
                    : it.severity === "medium"
                      ? "bg-orange text-white"
                      : "bg-green text-white";
                return (
                  <tr
                    key={it._id}
                    className={`transition-colors hover:bg-darkBlue/[0.03] ${
                      editingId === it._id
                        ? "bg-blue/5 ring-1 ring-blue/20"
                        : ""
                    }`}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          it.closed
                            ? "bg-green text-white"
                            : "bg-orange text-white"
                        }`}
                      >
                        {badge}
                      </span>
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDate(it.detectedAt)}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.itemName || "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {Array.isArray(it.allergens) && it.allergens.length
                        ? it.allergens.join(", ")
                        : "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs ${sev}`}>
                        {it.severity || "—"}
                      </span>
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.source || "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {Array.isArray(it.correctiveActions)
                        ? it.correctiveActions.length
                        : 0}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.recordedBy
                        ? `${it.recordedBy.firstName || ""} ${it.recordedBy.lastName || ""}`.trim() ||
                          "—"
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
            Page {meta.page}/{meta.pages} — {meta.total} incidents
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
                  Supprimer cet incident ?
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
