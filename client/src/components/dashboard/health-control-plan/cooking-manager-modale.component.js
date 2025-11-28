"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  X,
  Search,
  Edit3,
  Trash2,
  Save,
  Loader2,
  Check,
  HardDrive,
} from "lucide-react";

export default function CookingEquipmentManagerModal({
  restaurantId,
  onClose,
  onChanged,
  initialEquipments = [],
}) {
  const token = useMemo(() => localStorage.getItem("token"), []);
  const [allItems, setAllItems] = useState(() => initialEquipments);
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [nameError, setNameError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const localChangeRef = useRef(false);

  useEffect(() => {
    setAllItems(initialEquipments || []);
  }, [initialEquipments]);

  const byName = (a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), "fr");

  const items = useMemo(() => {
    const qx = (q || "").trim().toLowerCase();
    return (allItems || [])
      .filter((it) => (onlyActive ? it.isActive : true))
      .filter((it) => {
        if (!qx) return true;
        const hay = [
          it.name,
          it.equipmentCode,
          it.location,
          it.locationCode,
          it.unit,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(qx);
      })
      .sort(byName);
  }, [allItems, q, onlyActive]);

  const [draft, setDraft] = useState({
    name: "",
    equipmentCode: "",
    location: "",
    locationCode: "",
    unit: "°C",
    isActive: true,
  });
  const [editingId, setEditingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const resetDraft = () => {
    setEditingId(null);
    setDraft({
      name: "",
      equipmentCode: "",
      location: "",
      locationCode: "",
      unit: "°C",
      isActive: true,
    });
    setNameError("");
  };

  const upsertLocal = (doc) => {
    setAllItems((prev) => {
      const idx = prev.findIndex((x) => String(x._id) === String(doc._id));
      const next =
        idx >= 0
          ? prev.map((x, i) => (i === idx ? { ...x, ...doc } : x))
          : [...prev, doc];
      next.sort(byName);
      return next;
    });
    localChangeRef.current = true;
  };

  const removeLocal = (id) => {
    setAllItems((prev) => prev.filter((x) => String(x._id) !== String(id)));
    localChangeRef.current = true;
  };

  useEffect(() => {
    if (localChangeRef.current) {
      onChanged?.(allItems);
      localChangeRef.current = false;
    }
  }, [allItems, onChanged]);

  const saveItem = async () => {
    const trimmedName = (draft.name || "").trim();
    if (!trimmedName) {
      setNameError("Le nom de l’appareil est obligatoire");
      return;
    }

    setIsSaving(true);
    setNameError("");
    try {
      const url = editingId
        ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cooking-equipments/${editingId}`
        : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cooking-equipments`;
      const method = editingId ? "put" : "post";
      const payload = { ...draft, name: trimmedName };

      const { data: saved } = await axios[method](url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      upsertLocal(saved);
      resetDraft();
      setPendingDeleteId(null);
    } catch (err) {
      if (err?.response?.status === 409) {
        setNameError("Appareil déjà existant");
        return;
      }
      setNameError("Erreur lors de l’enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  const requestDelete = (id) => setPendingDeleteId(id);
  const cancelDelete = () => {
    setPendingDeleteId(null);
    setDeleteLoading(false);
  };
  const confirmDelete = async (id) => {
    try {
      setDeleteLoading(true);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cooking-equipments/${id}`;
      await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      removeLocal(id);
      if (editingId === id) resetDraft();
    } finally {
      setDeleteLoading(false);
      setPendingDeleteId(null);
    }
  };

  // Styles
  const fieldWrap =
    "group relative rounded-xl bg-white/50   transition-shadow";
  const labelCls = "text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40 focus:border-blue focus:ring-2 focus:ring-blue/20";
  const selectCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition focus:border-blue focus:ring-2 focus:ring-blue/20";
  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98]";

  return createPortal(
    <div className="fixed inset-0 z-[1000]" aria-modal="true" role="dialog">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Sheet container */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[980px] rounded-2xl border border-darkBlue/10 bg-white p-4 midTablet:p-5 shadow max-h-[90vh] midTablet:max-h-none flex flex-col">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-xl bg-blue/10 text-blue">
                <HardDrive className="size-5" />
              </div>
              <h2 className="text-base midTablet:text-lg font-semibold text-darkBlue">
                Appareils — gestion
              </h2>
            </div>
            <button
              className={`${btnBase} border border-red bg-white text-red hover:border-red/30`}
              onClick={onClose}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pr-1">
            {/* Search + Toggle */}
            <div className="flex items-end gap-4">
              <div className={`${fieldWrap} w-full`}>
                <label className={labelCls}>Recherche</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Rechercher…"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>

              <div className="shrink-0 pb-[9px]">
                <label className="inline-flex items-center gap-3 rounded-xl">
                  <span className="text-xs text-darkBlue/70 text-nowrap">
                    Actifs seulement
                  </span>
                  <input
                    type="checkbox"
                    checked={onlyActive}
                    onChange={(e) => setOnlyActive(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex h-6 w-11 items-center rounded-full bg-darkBlue/20 transition-colors px-1 peer-checked:bg-blue peer-checked:justify-end justify-start">
                    <span className="h-4 w-4 rounded-full bg-white shadow" />
                  </span>
                </label>
              </div>
            </div>

            {/* Formulaire add/edit */}
            <div className="rounded-2xl border border-darkBlue/10 bg-white p-3">
              <div className="grid grid-cols-1 gap-3 midTablet:grid-cols-3">
                {/* Ligne 1 : Nom (span 2) | Identifiant */}
                <div className={`${fieldWrap} midTablet:col-span-2`}>
                  <label className={labelCls}>Nom *</label>
                  <input
                    className={`${inputCls} ${nameError ? "border-red focus:ring-red/20" : ""}`}
                    placeholder="Ex: Four convoyeur"
                    value={draft.name}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, name: e.target.value }));
                      if (nameError) setNameError("");
                    }}
                  />
                </div>

                <div className={fieldWrap}>
                  <label className={labelCls}>Identifiant (optionnel)</label>
                  <input
                    className={inputCls}
                    placeholder="Code interne"
                    value={draft.equipmentCode}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, equipmentCode: e.target.value }))
                    }
                  />
                </div>

                {/* Ligne 2 : Unité | Emplacement | ID emplacement */}
                <div className={fieldWrap}>
                  <label className={labelCls}>Unité</label>
                  <select
                    className={selectCls}
                    value={draft.unit}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, unit: e.target.value }))
                    }
                  >
                    <option value="°C">°C</option>
                    <option value="°F">°F</option>
                  </select>
                </div>

                <div className={fieldWrap}>
                  <label className={labelCls}>Emplacement</label>
                  <input
                    className={inputCls}
                    placeholder="Cuisine / Poste chaud"
                    value={draft.location}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, location: e.target.value }))
                    }
                  />
                </div>

                <div className={fieldWrap}>
                  <label className={labelCls}>ID emplacement</label>
                  <input
                    className={inputCls}
                    placeholder="Ex: CUI-01"
                    value={draft.locationCode}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, locationCode: e.target.value }))
                    }
                  />
                </div>

                {/* Ligne 3 : Switch (col 1) | Actions (col-span-2) */}
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-3 rounded-xl border border-darkBlue/20 bg-white px-3 py-2">
                    <span className="text-sm text-darkBlue/70">Actif</span>
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, isActive: e.target.checked }))
                      }
                      className="peer sr-only"
                    />
                    <span className="inline-flex h-6 w-11 items-center rounded-full bg-darkBlue/20 transition-colors px-1 peer-checked:bg-blue peer-checked:justify-end justify-start">
                      <span className="h-4 w-4 rounded-full bg-white shadow" />
                    </span>
                  </label>
                </div>

                <div className="midTablet:col-span-2 flex items-center justify-between">
                  <div className="min-h-[20px] text-xs text-red">
                    {nameError || null}
                  </div>
                  <div className="flex gap-2">
                    {editingId && (
                      <button
                        className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue hover:border-darkBlue/30`}
                        onClick={resetDraft}
                        type="button"
                        disabled={isSaving}
                      >
                        <X className="size-4" /> Annuler
                      </button>
                    )}
                    <button
                      className={`${btnBase} bg-blue text-white border border-blue disabled:opacity-60`}
                      onClick={saveItem}
                      type="button"
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" />
                          <span>En cours…</span>
                        </div>
                      ) : (
                        <>
                          {editingId ? (
                            <Save className="size-4" />
                          ) : (
                            <Check className="size-4" />
                          )}
                          {editingId ? "Mettre à jour" : "Ajouter"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Liste */}
            <div className="text-nowrap rounded-2xl border border-darkBlue/10 bg-white p-3">
              <div className="overflow-x-auto overflow-y-auto h-[250px]">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/95 backdrop-blur">
                      <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                        Nom
                      </th>
                      <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                        Identifiant
                      </th>
                      <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                        Emplacement
                      </th>
                      <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                        Unité
                      </th>
                      <th className="py-2 pr-3 text-left font-medium text-darkBlue/70">
                        Actif
                      </th>
                      <th className="py-2 pr-3 text-right font-medium text-darkBlue/70">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-8 text-center text-darkBlue/50"
                        >
                          Aucun appareil
                        </td>
                      </tr>
                    )}

                    {items.map((f) => {
                      const isPending = pendingDeleteId === f._id;
                      return (
                        <tr
                          key={f._id}
                          className="border-b border-darkBlue/10 text-nowrap"
                        >
                          <td className="py-2 pr-3 font-medium text-darkBlue">
                            {f.name}
                          </td>
                          <td className="py-2 pr-3 text-darkBlue/80">
                            {f.equipmentCode || "—"}
                          </td>
                          <td className="py-2 pr-3 text-darkBlue/80">
                            {f.location || "—"}
                            {f.locationCode ? (
                              <span className="text-darkBlue/50">
                                {" "}
                                • {f.locationCode}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-darkBlue/80">
                            {f.unit}
                          </td>
                          <td className="py-2 pr-3 text-darkBlue/80">
                            {f.isActive ? "Oui" : "Non"}
                          </td>
                          <td className="py-2 pr-0">
                            <div className="flex items-center justify-end gap-2">
                              {isPending ? (
                                <>
                                  <button
                                    className={`${btnBase} border border-red bg-white text-red hover:border-red/80`}
                                    onClick={() => confirmDelete(f._id)}
                                    disabled={deleteLoading}
                                  >
                                    {deleteLoading ? (
                                      <div className="flex items-center gap-2">
                                        <Loader2 className="size-4 animate-spin" />
                                        <span>Suppression…</span>
                                      </div>
                                    ) : (
                                      <>
                                        <Trash2 className="size-4" /> Confirmer
                                      </>
                                    )}
                                  </button>
                                  <button
                                    className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue hover:border-darkBlue/30`}
                                    onClick={cancelDelete}
                                    disabled={deleteLoading}
                                  >
                                    <X className="size-4" /> Annuler
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className={`${btnBase} border border-darkBlue/20 bg-white text-darkBlue hover:border-darkBlue/30`}
                                    onClick={() => {
                                      setEditingId(f._id);
                                      setDraft({
                                        name: f.name || "",
                                        equipmentCode: f.equipmentCode || "",
                                        location: f.location || "",
                                        locationCode: f.locationCode || "",
                                        unit: f.unit || "°C",
                                        isActive: !!f.isActive,
                                      });
                                      window.scrollTo({
                                        top: 0,
                                        behavior: "smooth",
                                      });
                                    }}
                                    title="Éditer"
                                  >
                                    <Edit3 className="size-4" /> Éditer
                                  </button>
                                  <button
                                    className={`${btnBase} border border-red bg-white text-red hover:border-red/80`}
                                    onClick={() => requestDelete(f._id)}
                                    title="Supprimer"
                                  >
                                    <Trash2 className="size-4" /> Supprimer
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
