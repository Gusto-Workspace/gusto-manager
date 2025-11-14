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
  Check,
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

// Détermine si la tâche est "faite" pour la période courante selon la fréquence
function isDoneForPeriod(item) {
  const last = item?.lastDoneAt ? new Date(item.lastDoneAt) : null;
  const freq = item?.frequency || "daily";
  if (!last) return false;
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfWeek = (() => {
    const day = (now.getDay() + 6) % 7; // lundi = 0
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d;
  })();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (freq === "daily") return last >= startOfToday;
  if (freq === "weekly") return last >= startOfWeek;
  if (freq === "monthly") return last >= startOfMonth;
  // on_demand : jamais "exigible" => on le considère "à faire" par défaut
  return false;
}

function statusBadge(item) {
  if (item?.frequency === "on_demand") return "À la demande";
  return isDoneForPeriod(item) ? "Fait" : "À faire";
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
  const [status, setStatus] = useState("all"); // all|done|todo (client-side désormais)
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
      const ak = a?.lastDoneAt
        ? new Date(a.lastDoneAt).getTime()
        : new Date(a.createdAt || 0).getTime();
      const bk = b?.lastDoneAt
        ? new Date(b.lastDoneAt).getTime()
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
        status: overrides.status ?? status, // volontairement ignoré par le back
        freq: overrides.freq ?? freq,
      };

      const params = { page, limit: meta.limit || 20 };
      if (cur.dateFrom) params.date_from = new Date(cur.dateFrom).toISOString();
      if (cur.dateTo) params.date_to = new Date(cur.dateTo).toISOString();
      if (cur.q) params.q = cur.q;
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

  // Auto-fetch quand Fréquence change (status=client-side now)
  useEffect(() => {
    if (!restaurantId) return;
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq]);

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

  // Recherche + statut côté client
  const filtered = useMemo(() => {
    let base = items;

    if (q) {
      const qq = q.toLowerCase();
      base = base.filter((it) =>
        [
          it?.zone,
          it?.description,
          it?.frequency,
          ...(Array.isArray(it?.products) ? it.products : []),
          ...(Array.isArray(it?.protocolSteps) ? it.protocolSteps : []),
          it?.riskLevel,
          it?.recordedBy?.firstName,
          it?.recordedBy?.lastName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(qq)
      );
    }

    if (status !== "all") {
      base = base.filter((it) => {
        const doneNow = isDoneForPeriod(it);
        return status === "done" ? doneNow : !doneNow;
      });
    }

    return base;
  }, [items, q, status]);

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
      console.error("Erreur lors de la suppression du plan:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  async function markDone(item) {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cleaning-tasks/${item._id}/mark-done`;
      const { data: saved } = await axios.post(
        url,
        {}, // tu pourras envoyer { proofUrls, note } ici plus tard si besoin
        { headers: { Authorization: `Bearer ${token}` } }
      );
      window.dispatchEvent(
        new CustomEvent("cleaning-task:upsert", { detail: { doc: saved } })
      );
    } catch (e) {
      console.error("mark-done error:", e);
      alert("Impossible d'enregistrer le 'Fait'.");
    }
  }

  // Styles
  const fieldWrap =
    "group relative rounded-xl bg-white/50   transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98]";

  return (
    <div className="rounded-2xl border border-darkBlue/10 bg-white p-4 midTablet:p-5 shadow">
      {/* Filtres */}
      <div className="flex flex-col midTablet:flex-row midTablet:flex-wrap gap-2 mb-2">
        <div className={`${fieldWrap} flex-1 midTablet:min-w-[220px]`}>
          <label className={labelCls}>
            <Search className="size-4" /> Recherche
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zone, produit, protocole…"
            className={inputCls}
          />
        </div>

        <div className={`${fieldWrap} w-full midTablet:w-[200px]`}>
          <label className={labelCls}>Statut (période)</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectCls}
          >
            <option value="all">Tous</option>
            <option value="todo">À faire</option>
            <option value="done">Fait</option>
          </select>
        </div>

        <div className={`${fieldWrap} w-full midTablet:w-[220px]`}>
          <label className={labelCls}>Fréquence</label>
          <select
            value={freq}
            onChange={(e) => setFreq(e.target.value)}
            className={selectCls}
          >
            <option value="">Toutes</option>
            <option value="daily">Quotidienne</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuelle</option>
            <option value="on_demand">À la demande</option>
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
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Statut
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Zone
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Fréquence
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Dernière fois
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Priorité
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Produits
              </th>
              <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                Dernier opérateur
              </th>
              <th className="py-2 pr-0 text-right font-medium text-darkBlue/70">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-darkBlue/10 [&>tr:last-child>td]:!pb-0">
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-darkBlue/50">
                  Aucun plan
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-darkBlue/50">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    <span>chargement…</span>
                  </div>
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((it) => {
                const badge = statusBadge(it);
                const doneNow = badge === "Fait";
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
                          it.frequency === "on_demand"
                            ? "bg-orange text-white"
                            : doneNow
                              ? "bg-green text-white"
                              : "bg-red text-white"
                        }`}
                      >
                        {badge}
                      </span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.zone || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.frequency || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDate(it.lastDoneAt)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.riskLevel || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {Array.isArray(it.products) && it.products.length
                        ? it.products.join(", ")
                        : "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it?.lastDoneBy
                        ? `${it.lastDoneBy.firstName || ""} ${it.lastDoneBy.lastName || ""}`.trim()
                        : "—"}
                    </td>
                    <td className="py-2 pr-0">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => markDone(it)}
                          className={`${btnBase} border border-green/60 bg-white text-green`}
                          type="button"
                          title="Marquer comme fait maintenant"
                        >
                          <Check className="size-4" /> Fait
                        </button>
                        <button
                          onClick={() => onEdit?.(it)}
                          className={`${btnBase} border text-nowrap border-blue/60 bg-white text-blue`}
                          aria-label="Voir/Éditer"
                          type="button"
                        >
                          <Edit3 className="size-4" /> Voir / Éditer
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
            Page {meta.page}/{meta.pages} — {meta.total} plan(s)
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
              onClick={() => !deleteLoading && setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto w-full max-w-[480px] rounded-2xl border border-darkBlue/10 bg-white p-5 shadow-2xl">
                <h2 className="mb-2 text-center text-lg font-semibold text-darkBlue">
                  Supprimer ce plan ?
                </h2>
                <p className="mb-5 text-center text-sm text-darkBlue/70">
                  Cette action est définitive. Le plan sera retiré ainsi que son
                  historique.
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
                    onClick={() =>
                      !deleteLoading && setIsDeleteModalOpen(false)
                    }
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
