"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";

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
const statusBadge = (closedAt) => {
  const isClosed = Boolean(closedAt);
  const cls = isClosed ? "bg-green text-white" : "bg-red text-white";
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>
      {isClosed ? "Fermé" : "Ouvert"}
    </span>
  );
};

export default function RecallList({
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
      const ak = a?.initiatedAt
        ? new Date(a.initiatedAt).getTime()
        : new Date(a.createdAt || 0).getTime();
      const bk = b?.initiatedAt
        ? new Date(b.initiatedAt).getTime()
        : new Date(b.createdAt || 0).getTime();
      return bk - ak;
    });

  const hasActiveFilters = useMemo(
    () => Boolean(q || status !== "all" || dateFrom || dateTo),
    [q, status, dateFrom, dateTo]
  );
  const hasFullDateRange = Boolean(dateFrom && dateTo);

  const fetchData = async (page = 1, overrides = {}) => {
    setLoading(true);
    try {
      const cur = {
        q: overrides.q ?? q,
        status: overrides.status ?? status,
        dateFrom: overrides.dateFrom ?? dateFrom,
        dateTo: overrides.dateTo ?? dateTo,
      };
      const params = { page, limit: meta.limit || 20 };
      if (cur.q) params.q = cur.q;
      // backend attend 'closed' = 'open' | 'closed'
      if (cur.status && cur.status !== "all") params.closed = cur.status;
      if (cur.dateFrom) params.date_from = new Date(cur.dateFrom).toISOString();
      if (cur.dateTo) params.date_to = new Date(cur.dateTo).toISOString();

      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-recalls`;
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
      console.error("fetch recalls list error:", e);
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
        dateFrom: "",
        dateTo: "",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

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

    window.addEventListener("recall:upsert", handleUpsert);
    return () => window.removeEventListener("recall:upsert", handleUpsert);
  }, [restaurantId]);

  // Modale suppression
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recalls/${deleteTarget._id}`;
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
    if (!deleteLoading) {
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="bg-white rounded-lg drop-shadow-sm p-4">
      {/* Filtres */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col gap-3 midTablet:flex-row midTablet:flex-wrap midTablet:items-end">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher produit, lot, fournisseur, action…"
            className="w-full border rounded p-2 midTablet:flex-1 min-w-[220px]"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border rounded p-2 h-[44px] w-full midTablet:w-48"
          >
            <option value="all">Tous statuts</option>
            <option value="open">Ouverts</option>
            <option value="closed">Fermés</option>
          </select>

          <div className="flex flex-col gap-1 w-full midTablet:flex-row midTablet:items-center midTablet:gap-2 midTablet:w-auto">
            <label className="text-sm font-medium">Déclarés du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border rounded p-2 midTablet:w-auto"
              max={dateTo || undefined}
            />
          </div>
          <div className="flex flex-col gap-1 w-full midTablet:flex-row midTablet:items-center midTablet:gap-2 midTablet:w-auto">
            <label className="text-sm font-medium">Au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border rounded p-2 midTablet:w-auto"
              min={dateFrom || undefined}
            />
          </div>

          <div className="flex flex-col gap-2 w-full mobile:flex-row mobile:w-auto mobile:items-center">
            <button
              onClick={() => {
                if (hasFullDateRange || q || status !== "all") {
                  fetchData(1);
                }
              }}
              className={`px-4 py-2 rounded bg-blue text-white w-full mobile:w-32`}
            >
              Filtrer
            </button>
            <button
              onClick={() => {
                setQ("");
                setStatus("all");
                setDateFrom("");
                setDateTo("");
                fetchData(1, {
                  q: "",
                  status: "all",
                  dateFrom: "",
                  dateTo: "",
                });
              }}
              disabled={!hasActiveFilters}
              className={`px-4 py-2 rounded bg-blue text-white ${hasActiveFilters ? "" : "opacity-30 cursor-not-allowed"}`}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-w-[calc(100vw-80px)] tablet:max-w-[calc(100vw-350px)]">
        <table className="w-full text-sm">
          <thead className="whitespace-nowrap">
            <tr className="text-left border-b">
              <th className="py-2 pr-3">Déclaré le</th>
              <th className="py-2 pr-3">Produit</th>
              <th className="py-2 pr-3">Fournisseur</th>
              <th className="py-2 pr-3">N° lot</th>
              <th className="py-2 pr-3">Qté</th>
              <th className="py-2 pr-3">DLC/DDM</th>
              <th className="py-2 pr-3">Statut</th>
              <th className="py-2 pr-3">Clôturé le</th>
              <th className="py-2 pr-3">Pièces</th>
              <th className="py-2 pr-3">Opérateur</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={12} className="py-6 text-center opacity-60">
                  Aucun retour NC
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={12} className="py-6 text-center opacity-60">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading &&
              items.map((it) => {
                const item = it?.item || {};
                return (
                  <tr
                    key={it._id}
                    className={`border-b ${editingId === it._id ? "bg-lightGrey" : ""}`}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
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
                      {item.unit || "—"}
                    </td>

                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDate(item.bestBefore, false)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {statusBadge(it.closedAt)}
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
                    <td className="py-2 pr-0">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => onEdit?.(it)}
                          className="px-3 py-1 rounded bg-green text-white"
                        >
                          Éditer
                        </button>
                        <button
                          onClick={() => (
                            setIsDeleteModalOpen(true), setDeleteTarget(it)
                          )}
                          className="px-3 py-1 rounded bg-red text-white"
                        >
                          Supprimer
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
        <div className="flex items-center justify-between mt-4">
          <div className="text-xs opacity-70">
            Page {meta.page}/{meta.pages} — {meta.total} retours
          </div>
          <div className="flex gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => fetchData(meta.page - 1)}
              className="px-3 py-1 rounded border border-blue text-blue disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              disabled={meta.page >= meta.pages}
              onClick={() => fetchData(meta.page + 1)}
              className="px-3 py-1 rounded border border-blue text-blue disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* Modale suppression */}
      {isDeleteModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000]"
            aria-modal="true"
            role="dialog"
          >
            <div
              onClick={closeDeleteModal}
              className="absolute inset-0 bg-black/20"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-[450px] pointer-events-auto">
                <h2 className="text-xl font-semibold mb-6 text-center">
                  Supprimer ce retour ?
                </h2>
                <p className="text-sm text-center mb-6">
                  Cette action est définitive.
                </p>
                <div className="flex gap-4 mx-auto justify-center">
                  <button
                    onClick={onConfirmDelete}
                    disabled={deleteLoading}
                    className="px-4 py-2 rounded-lg bg-blue text-white disabled:opacity-50"
                  >
                    {deleteLoading ? "Suppression…" : "Confirmer"}
                  </button>
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    className="px-4 py-2 rounded-lg text-white bg-red"
                  >
                    Annuler
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
