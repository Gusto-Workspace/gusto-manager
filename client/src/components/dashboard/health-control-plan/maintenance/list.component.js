"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// AXIOS
import axios from "axios";

// ICONS
import {
  Search,
  CalendarClock,
  Edit3,
  Trash2,
  Loader2,
  X,
  Check,
} from "lucide-react";

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

const DUE_SOON_DEFAULT = 14;

function dueStatus(nextDue, soonDays = DUE_SOON_DEFAULT) {
  if (!nextDue) return { label: "OK", key: "ok", cls: "bg-green text-white" };
  const now = new Date();
  const due = new Date(nextDue);
  if (due < now)
    return { label: "En retard", key: "overdue", cls: "bg-red text-white" };
  const soon = new Date(now);
  soon.setDate(soon.getDate() + soonDays);
  if (due <= soon)
    return {
      label: "Bientôt dû",
      key: "due_soon",
      cls: "bg-orange text-white",
    };
  return { label: "OK", key: "ok", cls: "bg-green text-white" };
}

// Prochaine échéance "logique" depuis fréquence + lastDoneAt/createdAt
function computeNextDueForDisplay(item) {
  if (!item) return null;

  // Priorité : valeur en base
  if (item.nextDue) return item.nextDue;

  const freq = item.frequency || "monthly";
  const freqToDays = {
    daily: 1,
    weekly: 7,
    monthly: 30,
    on_demand: null,
  };
  const days = freqToDays[freq];
  if (!days) return null;

  const ref = item.lastDoneAt || item.createdAt;
  if (!ref) return null;

  const base = new Date(ref);
  if (Number.isNaN(base.getTime())) return null;

  base.setDate(base.getDate() + days);
  return base;
}

function isDoneForPeriod(item) {
  if (item?.frequency === "on_demand") return false;

  const next = computeNextDueForDisplay(item);
  if (!next) return false;

  const now = new Date();
  return new Date(next) > now;
}

function statusBadge(item) {
  if (item?.frequency === "on_demand") return "À la demande";
  return isDoneForPeriod(item) ? "Fait" : "À faire";
}

const TYPE_LABELS = {
  filter_change: "Changement filtre",
  inspection: "Inspection",
  repair: "Réparation",
  other: "Autre",
};

const FREQUENCY_LABELS = {
  daily: "Quotidienne",
  weekly: "Hebdomadaire",
  monthly: "Mensuelle",
  on_demand: "À la demande",
};

/* ---------- Component ---------- */
export default function MaintenanceList({
  restaurantId,
  onEdit,
  editingId = null,
  onDeleted,
}) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, pages: 1, total: 0 });

  const [loading, setLoading] = useState(false);
  const [showSlowLoader, setShowSlowLoader] = useState(false);

  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [deadlineStatus, setDeadlineStatus] = useState("all");
  const [periodStatus, setPeriodStatus] = useState("all");
  const [freq, setFreq] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [soonDays, setSoonDays] = useState(DUE_SOON_DEFAULT);

  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");
  const [appliedDeadlineStatus, setAppliedDeadlineStatus] = useState("all");

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

  useEffect(() => {
    if (dateFrom && dateTo && dateTo < dateFrom) setDateTo(dateFrom);
  }, [dateFrom, dateTo]);

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
    () =>
      Boolean(
        q ||
          type !== "all" ||
          deadlineStatus !== "all" ||
          periodStatus !== "all" ||
          freq !== "all" ||
          dateFrom ||
          dateTo ||
          appliedDateFrom ||
          appliedDateTo ||
          soonDays !== DUE_SOON_DEFAULT
      ),
    [
      q,
      type,
      deadlineStatus,
      periodStatus,
      freq,
      dateFrom,
      dateTo,
      appliedDateFrom,
      appliedDateTo,
      soonDays,
    ]
  );

  const hasFullDateRange = Boolean(dateFrom && dateTo);

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
        deadlineStatus: overrides.deadlineStatus ?? appliedDeadlineStatus,
        dateFrom:
          overrides.dateFrom !== undefined
            ? overrides.dateFrom
            : appliedDateFrom,
        dateTo:
          overrides.dateTo !== undefined ? overrides.dateTo : appliedDateTo,
        soonDays: overrides.soonDays ?? soonDays,
        freq: overrides.freq ?? (freq === "all" ? "" : freq),
      };

      const params = { page, limit: meta.limit || 20 };
      if (cur.q) params.q = cur.q;
      if (cur.type && cur.type !== "all") params.type = cur.type;
      if (cur.deadlineStatus && cur.deadlineStatus !== "all") {
        params.status = cur.deadlineStatus;
        if (cur.deadlineStatus === "due_soon")
          params.due_within_days = cur.soonDays;
      }
      if (cur.dateFrom) params.date_from = new Date(cur.dateFrom).toISOString();
      if (cur.dateTo) params.date_to = new Date(cur.dateTo).toISOString();
      if (cur.freq) params.freq = cur.freq;

      const { data } = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-maintenance`,
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
      console.error("fetch maintenance error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) {
      setShowSlowLoader(false);
      return;
    }
    const id = setTimeout(() => setShowSlowLoader(true), 1000);
    return () => clearTimeout(id);
  }, [loading]);

  useEffect(() => {
    if (restaurantId) {
      setAppliedDateFrom("");
      setAppliedDateTo("");
      setAppliedDeadlineStatus("all");
      fetchData(1, {
        q: "",
        type: "all",
        deadlineStatus: "all",
        dateFrom: "",
        dateTo: "",
        soonDays: DUE_SOON_DEFAULT,
        freq: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    fetchData(1, { deadlineStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, deadlineStatus, soonDays, freq]);

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

    window.addEventListener("maintenance:upsert", handleUpsert);
    return () => window.removeEventListener("maintenance:upsert", handleUpsert);
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
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance/${deleteTarget._id}`,
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
      console.error("Erreur suppression maintenance:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setIsDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  async function markDone(item) {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance/${item._id}/mark-done`;
      const { data: saved } = await axios.post(
        url,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      window.dispatchEvent(
        new CustomEvent("maintenance:upsert", { detail: { doc: saved } })
      );
    } catch (e) {
      console.error("mark-done error:", e);
      alert("Impossible d'enregistrer le 'Fait'.");
    }
  }

  const filtered = useMemo(() => {
    let base = items;

    if (freq !== "all") {
      base = base.filter((it) => it.frequency === freq);
    }

    if (periodStatus !== "all") {
      base = base.filter((it) => {
        const doneNow = isDoneForPeriod(it);
        return periodStatus === "done" ? doneNow : !doneNow;
      });
    }

    return base;
  }, [items, freq, periodStatus]);

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
            placeholder="Équipement, type, prestataire, notes…"
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
            <option value="filter_change">Changement filtre</option>
            <option value="inspection">Inspection</option>
            <option value="repair">Réparation</option>
            <option value="other">Autre</option>
          </select>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Statut (période)</label>
          <select
            value={periodStatus}
            onChange={(e) => setPeriodStatus(e.target.value)}
            className={selectCls}
          >
            <option value="all">Tous</option>
            <option value="todo">À faire</option>
            <option value="done">Fait</option>
          </select>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Effectué du
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
              setAppliedDeadlineStatus(deadlineStatus);
              fetchData(1, {
                dateFrom,
                dateTo,
                deadlineStatus,
              });
            }}
            disabled={!hasFullDateRange}
            className={`${btnBase} bg-blue text-white disabled:opacity-40`}
            type="button"
          >
            Filtrer
          </button>

          <button
            onClick={() => {
              setQ("");
              setType("all");
              setDeadlineStatus("all");
              setPeriodStatus("all");
              setFreq("all");
              setDateFrom("");
              setDateTo("");
              setSoonDays(DUE_SOON_DEFAULT);
              setAppliedDateFrom("");
              setAppliedDateTo("");
              setAppliedDeadlineStatus("all");
              fetchData(1, {
                q: "",
                type: "all",
                deadlineStatus: "all",
                dateFrom: "",
                dateTo: "",
                soonDays: DUE_SOON_DEFAULT,
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
      <div className="relative">
        <div className="overflow-x-auto max-w-[calc(100vw-50px)] mobile:max-w-[calc(100vw-83px)] midTablet:max-w-[calc(100vw-92px)] tablet:max-w-[calc(100vw-360px)] rounded-xl border border-darkBlue/10">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-darkBlue/10">
              <tr>
                <th className="py-2 pl-2 pr-3 text-left font-medium text-darkBlue/70">
                  Statut
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Équipement
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Fréquence
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Type
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Prestataire
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Dernière exécution
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Échéance
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Preuves (plan)
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Créé par
                </th>
                <th className="py-2 pr-2 text-right font-medium text-darkBlue/70">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBlue/10">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-8 text-center text-darkBlue/50"
                  >
                    Aucune maintenance
                  </td>
                </tr>
              ) : (
                filtered.map((it) => {
                  const badge = statusBadge(it);
                  const doneNow =
                    badge === "Fait" || it.frequency === "on_demand";

                  // Prochaine échéance calculée (fallback si nextDue absent)
                  const nextDue = computeNextDueForDisplay(it);
                  const st = dueStatus(nextDue, soonDays);

                  return (
                    <tr
                      key={it._id}
                      className={`hover:bg-darkBlue/[0.03] ${editingId === it._id ? "bg-blue/5 ring-1 ring-blue/20" : ""}`}
                    >
                      <td className="py-2 pl-2 pr-3 whitespace-nowrap">
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
                        {it.equipment || "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {FREQUENCY_LABELS[it.frequency] || "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {TYPE_LABELS[it.type] || it.type || "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {it.provider || "—"}
                      </td>

                      <td className="py-2 pr-3 whitespace-nowrap">
                        {fmtDate(it.lastDoneAt || it.createdAt)}
                      </td>

                      <td className="py-2 pr-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{fmtDate(nextDue, false)}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${st.cls}`}
                          >
                            {st.label}
                          </span>
                        </div>
                      </td>

                      <td className="py-2 pr-3 whitespace-nowrap">
                        {Array.isArray(it.proofUrls) && it.proofUrls.length
                          ? `${it.proofUrls.length} doc(s)`
                          : "—"}
                      </td>

                      <td className="py-2 pr-3 whitespace-nowrap">
                        {it.recordedBy
                          ? `${it.recordedBy.firstName || ""} ${it.recordedBy.lastName || ""}`.trim() ||
                            "—"
                          : "—"}
                      </td>

                      <td className="py-2 pr-2 text-right">
                        <div className="flex justify-end gap-2">
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
                            className={`${btnBase} border border-blue/60 bg-white text-blue`}
                            type="button"
                          >
                            <Edit3 className="size-4" /> Voir / Éditer
                          </button>
                          <button
                            onClick={() => askDelete(it)}
                            className={`${btnBase} border border-red bg-white text-red hover:border-red/80`}
                            type="button"
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

      {meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-darkBlue/60">
          <div>
            Page {meta.page}/{meta.pages} — {meta.total} maintenance(s)
          </div>
          <div className="flex gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => fetchData(meta.page - 1)}
              className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue disabled:opacity-40`}
              type="button"
            >
              Précédent
            </button>
            <button
              disabled={meta.page >= meta.pages}
              onClick={() => fetchData(meta.page + 1)}
              className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue disabled:opacity-40`}
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
                  Supprimer cette maintenance ?
                </h2>
                <p className="mb-5 text-center text-sm text-darkBlue/70">
                  Cette action est définitive.
                </p>
                <div className="flex justify-center gap-2">
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
                    onClick={closeDeleteModal}
                    className={`${btnBase} border border-red bg-red text-white`}
                    type="button"
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
