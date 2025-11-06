// components/dashboard/health-control-plan/postheat-temperature-list.component.jsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
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

/* --------------------------- Labels FR --------------------------- */
const PROBE_LABELS = {
  core: "Cœur (noyau)",
  surface: "Surface",
  ambient: "Air (enceinte)",
  oil: "Huile",
  other: "Autre",
};

const PHASE_LABELS = {
  postheat: "Fin de cuisson",
  reheat: "Remise en T°",
  "hot-holding": "Maintien chaud",
};

/* --------------------------- Component --------------------------- */
export default function PostheatTemperatureList({
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
  const invalidRange = useMemo(
    () => Boolean(dateFrom && dateTo && dateTo < dateFrom),
    [dateFrom, dateTo]
  );

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
      (a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0)
    );

  const fetchData = async (page = 1, overrides = {}) => {
    setLoading(true);
    try {
      const curFrom =
        overrides.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
      const curTo = overrides.dateTo !== undefined ? overrides.dateTo : dateTo;

      const params = { page, limit: meta.limit || 20 };
      // ❗️Pas de 'q' côté serveur → recherche locale uniquement
      if (curFrom) params.date_from = new Date(curFrom).toISOString();
      if (curTo) params.date_to = new Date(curTo).toISOString();

      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/postheat-temperatures`;
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
      console.error("fetch postheat list error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Initial
  useEffect(() => {
    if (restaurantId) fetchData(1, { dateFrom: "", dateTo: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

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

    window.addEventListener("postheat-temperature:upsert", handleUpsert);
    return () =>
      window.removeEventListener("postheat-temperature:upsert", handleUpsert);
  }, [restaurantId]);

  // Recherche locale (q)
  const filtered = useMemo(() => {
    if (!q) return items;
    const qq = q.toLowerCase();
    return items.filter((it) =>
      [
        it?.equipmentName,
        it?.equipmentId,
        it?.location,
        it?.locationId,
        it?.probeType,
        it?.phase,
        it?.unit,
        String(it?.value ?? ""),
        it?.recordedBy?.firstName,
        it?.recordedBy?.lastName,
        it?.note,
      ]
        .filter(Boolean)
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

    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/postheat-temperatures/${deleteTarget._id}`;

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

  /* ------------------------------ Styles ------------------------------ */
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98]";

  /* ------------------------------ Render ------------------------------ */
  return (
    <div className="rounded-2xl border border-darkBlue/10 bg-white p-4 midTablet:p-5 shadow">
      {/* Filtres */}
      <div className="mb-4 grid gap-2 grid-cols-1 midTablet:grid-cols-[1fr_auto_auto]">
        {/* Recherche → prend toute la place */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Search className="size-4" /> Recherche
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Équipement, emplacement, sonde, phase, consigne, note, opérateur…"
            className={inputCls}
          />
        </div>

        {/* Du */}
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
            onClick={() => fetchData(1)}
            disabled={invalidRange || !hasFullDateRange}
            title={
              invalidRange
                ? "Intervalle invalide : 'Du' doit être ≤ 'Au'."
                : !hasFullDateRange
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
              fetchData(1, { dateFrom: "", dateTo: "" });
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
      <div className="overflow-x-auto max-w-[calc(100vw-83px)] midTablet:max-w-[calc(100vw-92px)] tablet:max-w-[calc(100vw-340px)] rounded-xl border border-darkBlue/10 p-2">
        <table className="w-full text-[13px]">
          <thead className="whitespace-nowrap">
            <tr className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/95 backdrop-blur">
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Date
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Équipement
              </th>
              {/* Type retiré */}
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Emplacement
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Phase
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Sonde
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                T°
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Opérateur
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Note
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
                  Aucun relevé
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-darkBlue/50">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Chargement…
                  </span>
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((it) => (
                <tr
                  key={it._id}
                  className={`transition-colors hover:bg-darkBlue/[0.03] ${
                    editingId === it._id ? "bg-blue/5 ring-1 ring-blue/20" : ""
                  }`}
                >
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {fmtDate(it.createdAt)}
                  </td>

                  <td className="py-2 pr-3 whitespace-nowrap">
                    {it.equipmentName || "—"}
                    {it.equipmentId ? (
                      <span className="opacity-60"> • {it.equipmentId}</span>
                    ) : null}
                  </td>

                  {/* Type retiré */}

                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span>{it.location || "—"}</span>
                    {it.locationId ? (
                      <span className="opacity-60"> • {it.locationId}</span>
                    ) : null}
                  </td>

                  <td className="py-2 pr-3 whitespace-nowrap">
                    {PHASE_LABELS[it.phase] ?? it.phase ?? "—"}
                  </td>

                  <td className="py-2 pr-3 whitespace-nowrap">
                    {PROBE_LABELS[it.probeType] ?? it.probeType ?? "—"}
                  </td>

                  <td className="py-2 pr-3 whitespace-nowrap">
                    {typeof it.value === "number"
                      ? it.value
                      : (it.value ?? "—")}{" "}
                    {it.unit || ""}
                  </td>

                  <td className="py-2 pr-3 whitespace-nowrap">
                    {it?.recordedBy
                      ? `${it.recordedBy.firstName || ""} ${it.recordedBy.lastName || ""}`.trim() ||
                        "—"
                      : "—"}
                  </td>

                  <td className="py-2 pr-3 max-w-[360px]">
                    <span className="line-clamp-2">{it.note || "—"}</span>
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
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta?.pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-darkBlue/60">
            Page {meta.page}/{meta.pages} — {meta.total} relevés
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
                  Supprimer ce relevé ?
                </h2>
                <p className="mb-5 text-center text-sm text-darkBlue/70">
                  Cette action est définitive. Le relevé sera retiré de votre
                  plan de maîtrise sanitaire.
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
