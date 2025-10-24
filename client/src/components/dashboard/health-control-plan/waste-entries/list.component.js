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

const TYPE_LABELS = {
  organic: "Biodéchets",
  packaging: "Emballages",
  cooking_oil: "Huiles de cuisson",
  glass: "Verre",
  paper: "Papier",
  hazardous: "Dangereux",
  other: "Autre",
};

const METHOD_LABELS = {
  contractor_pickup: "Collecteur (prestataire)",
  compost: "Compost",
  recycle: "Recyclage",
  landfill: "Enfouissement",
  incineration: "Incinération",
  other: "Autre",
};

export default function WasteEntriesList({
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
  const [wasteType, setWasteType] = useState("all");
  const [method, setMethod] = useState("all");
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
      const ak = a?.date
        ? new Date(a.date).getTime()
        : new Date(a.createdAt || 0).getTime();
      const bk = b?.date
        ? new Date(b.date).getTime()
        : new Date(b.createdAt || 0).getTime();
      return bk - ak;
    });

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        q || wasteType !== "all" || method !== "all" || dateFrom || dateTo
      ),
    [q, wasteType, method, dateFrom, dateTo]
  );
  const hasFullDateRange = Boolean(dateFrom && dateTo);

  const fetchData = async (page = 1, overrides = {}) => {
    setLoading(true);
    try {
      const cur = {
        wasteType: overrides.wasteType ?? wasteType,
        method: overrides.method ?? method,
        dateFrom: overrides.dateFrom ?? dateFrom,
        dateTo: overrides.dateTo ?? dateTo,
      };

      const params = { page, limit: meta.limit || 20 };
      // q reste local (recherche client)
      if (cur.wasteType && cur.wasteType !== "all")
        params.waste_type = cur.wasteType;
      if (cur.method && cur.method !== "all") params.method = cur.method;
      if (cur.dateFrom) params.date_from = new Date(cur.dateFrom).toISOString();
      if (cur.dateTo) params.date_to = new Date(cur.dateTo).toISOString();

      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-waste-entries`;
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
      console.error("fetch waste list error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Initial
  useEffect(() => {
    if (restaurantId)
      fetchData(1, {
        wasteType: "all",
        method: "all",
        dateFrom: "",
        dateTo: "",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Auto-refresh sur selects
  useEffect(() => {
    if (!restaurantId) return;
    fetchData(1, { wasteType, method });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasteType, method]);

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

    window.addEventListener("waste:upsert", handleUpsert);
    return () => window.removeEventListener("waste:upsert", handleUpsert);
  }, [restaurantId]);

  // Recherche locale (q)
  const filtered = useMemo(() => {
    if (!q) return items;
    const qq = q.toLowerCase();
    return items.filter((it) =>
      [
        it?.contractor,
        it?.manifestNumber,
        it?.notes,
        TYPE_LABELS[it?.wasteType] || it?.wasteType || "",
        METHOD_LABELS[it?.disposalMethod] || it?.disposalMethod || "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(qq)
    );
  }, [items, q]);

  // Suppression
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/waste-entries/${deleteTarget._id}`;
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
            placeholder="Recherche (type, méthode, prestataire, notes)…"
            className="w-full border rounded p-2 midTablet:flex-1 min-w-[220px]"
          />

          <select
            value={wasteType}
            onChange={(e) => setWasteType(e.target.value)}
            className="border rounded p-2 h-[44px] w-full midTablet:w-48"
          >
            <option value="all">Tous types</option>
            <option value="organic">Biodéchets</option>
            <option value="packaging">Emballages</option>
            <option value="cooking_oil">Huiles de cuisson</option>
            <option value="glass">Verre</option>
            <option value="paper">Papier</option>
            <option value="hazardous">Dangereux</option>
            <option value="other">Autre</option>
          </select>

          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="border rounded p-2 h-[44px] w-full midTablet:w-56"
          >
            <option value="all">Toutes méthodes</option>
            <option value="contractor_pickup">Collecteur (prestataire)</option>
            <option value="compost">Compost</option>
            <option value="recycle">Recyclage</option>
            <option value="landfill">Enfouissement</option>
            <option value="incineration">Incinération</option>
            <option value="other">Autre</option>
          </select>

          <div className="flex flex-col gap-1 w-full midTablet:flex-row midTablet:items-center midTablet:gap-2 midTablet:w-auto">
            <label className="text-sm font-medium">Du</label>
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
              onClick={() => hasFullDateRange && fetchData(1)}
              disabled={!hasFullDateRange}
              title={
                !hasFullDateRange
                  ? "Sélectionnez 'Du' ET 'Au' pour filtrer par dates"
                  : undefined
              }
              className={`px-4 py-2 rounded bg-blue text-white w-full mobile:w-32 ${hasFullDateRange ? "" : "opacity-30 cursor-not-allowed"}`}
            >
              Filtrer
            </button>
            <button
              onClick={() => {
                setQ("");
                setWasteType("all");
                setMethod("all");
                setDateFrom("");
                setDateTo("");
                fetchData(1, {
                  wasteType: "all",
                  method: "all",
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
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Poids (kg)</th>
              <th className="py-2 pr-3">Méthode</th>
              <th className="py-2 pr-3">Prestataire</th>
              <th className="py-2 pr-3">Bordereau</th>
              <th className="py-2 pr-3">Pièces</th>
              <th className="py-2 pr-3">Opérateur</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center opacity-60">
                  Aucune entrée déchets
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={9} className="py-6 text-center opacity-60">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((it) => {
                return (
                  <tr
                    key={it._id}
                    className={`border-b ${editingId === it._id ? "bg-lightGrey" : ""}`}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDate(it.date)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {TYPE_LABELS[it.wasteType] || it.wasteType || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {typeof it.weightKg === "number" ? it.weightKg : "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {METHOD_LABELS[it.disposalMethod] ||
                        it.disposalMethod ||
                        "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.contractor || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {it.manifestNumber || "—"}
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
            Page {meta.page}/{meta.pages} — {meta.total} entrée(s)
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
                  Supprimer cette entrée ?
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
