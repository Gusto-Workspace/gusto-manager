"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// AXIOS
import axios from "axios";

// ICONS
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
      minute: "numeric",
    }).format(date);
  } catch {
    return d || "—";
  }
}

function contractBadge(it) {
  if (!it?.contractEnd) return "Actif (sans fin)";
  const end = new Date(it.contractEnd);
  return end > new Date() ? "Actif" : "Expiré";
}

// Labels FR
const FREQ_LABELS = {
  monthly: "Mensuelle",
  bimonthly: "Bimestrielle",
  quarterly: "Trimestrielle",
  semester: "Semestrielle",
  yearly: "Annuelle",
  on_demand: "À la demande",
};

const ACTIVITY_LABELS = {
  none: "Aucune",
  low: "Faible",
  medium: "Moyenne",
  high: "Forte",
};

const COMPLIANCE_LABELS = {
  compliant: "Conforme",
  non_compliant: "Non conforme",
  pending: "En attente",
};

export default function PestControlList({
  restaurantId,
  onEdit,
  editingId = null,
  onDeleted,
}) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [showSlowLoader, setShowSlowLoader] = useState(false);

  // Filtres "affichés"
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); // all|active_contract|expired_contract
  const [freq, setFreq] = useState(""); // '', monthly|bimonthly|quarterly|semester|yearly|on_demand
  const [activity, setActivity] = useState(""); // '', none|low|medium|high
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filtres date réellement appliqués côté backend
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

  // Corrige si 'Au' < 'Du'
  useEffect(() => {
    if (dateFrom && dateTo && dateTo < dateFrom) setDateTo(dateFrom);
  }, [dateFrom, dateTo]);

  const sortLogic = (list) =>
    [...list].sort((a, b) => {
      const ak = a?.lastVisitAt
        ? new Date(a.lastVisitAt).getTime()
        : new Date(a.createdAt || 0).getTime();
      const bk = b?.lastVisitAt
        ? new Date(b.lastVisitAt).getTime()
        : new Date(b.createdAt || 0).getTime();
      return bk - ak;
    });

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        q ||
          status !== "all" ||
          freq ||
          activity ||
          dateFrom ||
          dateTo ||
          appliedDateFrom ||
          appliedDateTo
      ),
    [
      q,
      status,
      freq,
      activity,
      dateFrom,
      dateTo,
      appliedDateFrom,
      appliedDateTo,
    ]
  );
  const hasFullDateRange = Boolean(dateFrom && dateTo);

  /* ---------- Styles alignés sur les autres listes ---------- */
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
    if (!restaurantId) return;

    setLoading(true);
    try {
      const cur = {
        q: overrides.q ?? q,
        status: overrides.status ?? status,
        freq: overrides.freq ?? freq,
        activity: overrides.activity ?? activity,
        dateFrom:
          overrides.dateFrom !== undefined
            ? overrides.dateFrom
            : appliedDateFrom,
        dateTo:
          overrides.dateTo !== undefined ? overrides.dateTo : appliedDateTo,
      };

      const params = { page, limit: meta.limit || 20 };
      if (cur.q) params.q = cur.q;
      if (cur.status && cur.status !== "all") params.status = cur.status;
      if (cur.freq) params.freq = cur.freq;
      if (cur.activity) params.activity = cur.activity;
      if (cur.dateFrom) params.date_from = new Date(cur.dateFrom).toISOString();
      if (cur.dateTo) params.date_to = new Date(cur.dateTo).toISOString();

      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-pest-controls`;
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
      console.error("fetch pest control list error:", e);
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
        status: "all",
        freq: "",
        activity: "",
        dateFrom: "",
        dateTo: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

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

  // Auto-fetch quand Contrat / Fréq. / Activité changent
  useEffect(() => {
    if (!restaurantId) return;
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, freq, activity]);

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

    window.addEventListener("pest-control:upsert", handleUpsert);
    return () =>
      window.removeEventListener("pest-control:upsert", handleUpsert);
  }, [restaurantId]);

  const askDelete = (it) => {
    setDeleteTarget(it);
    setIsDeleteModalOpen(true);
  };
  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/pest-controls/${deleteTarget._id}`;
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

  /* ------------------------------ Render ------------------------------ */
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
            placeholder="Prestataire, contact, activité, notes…"
            className={inputCls}
          />
        </div>

        {/* Contrat */}
        <div className={fieldWrap}>
          <label className={labelCls}>Contrat</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectCls}
          >
            <option value="all">Tous contrats</option>
            <option value="active_contract">Contrat actif</option>
            <option value="expired_contract">Contrat expiré</option>
          </select>
        </div>

        {/* Fréquence visites */}
        <div className={fieldWrap}>
          <label className={labelCls}>Fréq. visites</label>
          <select
            value={freq}
            onChange={(e) => setFreq(e.target.value)}
            className={selectCls}
          >
            <option value="">Toutes</option>
            <option value="monthly">Mensuelle</option>
            <option value="bimonthly">Bimestrielle</option>
            <option value="quarterly">Trimestrielle</option>
            <option value="semester">Semestrielle</option>
            <option value="yearly">Annuelle</option>
            <option value="on_demand">À la demande</option>
          </select>
        </div>

        {/* Activité */}
        <div className={fieldWrap}>
          <label className={labelCls}>Activité nuisibles</label>
          <select
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            className={selectCls}
          >
            <option value="">Toutes</option>
            <option value="none">Aucune</option>
            <option value="low">Faible</option>
            <option value="medium">Moyenne</option>
            <option value="high">Forte</option>
          </select>
        </div>

        {/* Dates */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Visites du
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
              setStatus("all");
              setFreq("");
              setActivity("");
              setDateFrom("");
              setDateTo("");
              setAppliedDateFrom("");
              setAppliedDateTo("");
              fetchData(1, {
                q: "",
                status: "all",
                freq: "",
                activity: "",
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
        <div className="overflow-x-auto max-w-[calc(100vw-50px)] mobile:max-w-[calc(100vw-83px)] midTablet:max-w-[calc(100vw-92px)] tablet:max-w-[calc(100vw-360px)] rounded-xl border border-darkBlue/10">
          <table className="w-full text-[13px]">
            <thead className="whitespace-nowrap">
              <tr className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/95 backdrop-blur">
                <th className="py-2 pr-3 pl-2 text-left font-medium text-darkBlue/70">
                  Prestataire
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Contrat
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Fréq.
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Dernière visite
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Prochaine
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Activité
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Conformité
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Parc
                </th>
                <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                  Rapports
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
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="py-8 text-center text-darkBlue/50"
                  >
                    Aucun suivi nuisibles
                  </td>
                </tr>
              )}

              {items.map((it) => {
                const cBadge = contractBadge(it);
                const isExpired = cBadge.startsWith("Expiré");
                return (
                  <tr
                    key={it._id}
                    className={`border-b border-darkBlue/10 last:border-b-0 transition-colors hover:bg-darkBlue/[0.03] ${
                      editingId === it._id
                        ? "bg-blue/5 ring-1 ring-blue/20"
                        : ""
                    }`}
                  >
                    <td className="py-2 pl-2 pr-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {it.provider || "—"}
                        </span>
                        <span className="text-xs text-darkBlue/60">
                          {it.providerContactName || "—"}{" "}
                          {it.providerPhone ? `• ${it.providerPhone}` : ""}{" "}
                          {it.providerEmail ? `• ${it.providerEmail}` : ""}
                        </span>
                      </div>
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`w-fit px-2 py-0.5 rounded text-xs ${
                            isExpired
                              ? "bg-red text-white"
                              : "bg-green text-white"
                          }`}
                        >
                          {cBadge}
                        </span>
                        <div className="text-xs opacity-70">
                          {it.contractStart
                            ? new Date(it.contractStart).toLocaleDateString(
                                "fr-FR"
                              )
                            : "—"}{" "}
                          →{" "}
                          {it.contractEnd
                            ? new Date(it.contractEnd).toLocaleDateString(
                                "fr-FR"
                              )
                            : "—"}
                        </div>
                      </div>
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {FREQ_LABELS[it.visitFrequency] ?? "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDate(it.lastVisitAt)}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDate(it.nextPlannedVisit)}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {ACTIVITY_LABELS[it.activityLevel] ?? "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          it.complianceStatus === "compliant"
                            ? "bg-green text-white"
                            : it.complianceStatus === "non_compliant"
                              ? "bg-red text-white"
                              : "bg-orange text-white"
                        }`}
                      >
                        {COMPLIANCE_LABELS[it.complianceStatus] ?? "En attente"}
                      </span>
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.baitStationsCount ?? 0} appâts / {it.trapsCount ?? 0}{" "}
                      pièges
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {Array.isArray(it.reportUrls) && it.reportUrls.length
                        ? `${it.reportUrls.length} doc(s)`
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
                );
              })}
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
            Page {meta.page}/{meta.pages} — {meta.total} suivis
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
                  Supprimer ce suivi nuisibles ?
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
