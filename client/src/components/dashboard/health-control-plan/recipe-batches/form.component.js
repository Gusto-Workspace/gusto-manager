"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";

function toDatetimeLocalValue(value) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    const offset = fallback.getTimezoneOffset() * 60000;
    return new Date(fallback.getTime() - offset).toISOString().slice(0, 16);
  }
  const offset = base.getTimezoneOffset() * 60000;
  return new Date(base.getTime() - offset).toISOString().slice(0, 16);
}
function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function buildFormDefaults(record) {
  return {
    recipeId: record?.recipeId ?? "",
    batchId: record?.batchId ?? "",
    preparedAt: toDatetimeLocalValue(record?.preparedAt),
    usedByServiceDate: toDateValue(record?.usedByServiceDate),
    notes: record?.notes ?? "",
    ingredients:
      Array.isArray(record?.ingredients) && record.ingredients.length
        ? record.ingredients.map((l) => ({
            name: l?.name ?? "",
            lotNumber: l?.lotNumber ?? "",
            qty: l?.qty !== undefined && l?.qty !== null ? String(l.qty) : "",
            unit: l?.unit ?? "",
            inventoryLotId: l?.inventoryLotId ? String(l.inventoryLotId) : "",
          }))
        : [{ name: "", lotNumber: "", qty: "", unit: "", inventoryLotId: "" }],
  };
}

function fmtShortDate(d) {
  if (!d) return null;
  try {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date);
  } catch {
    return null;
  }
}
function formatLotLabel(l) {
  const qty =
    l?.qtyRemaining != null ? ` • ${l.qtyRemaining}${l.unit || ""}` : "";
  const dlc = fmtShortDate(l?.dlc);
  const ddm = fmtShortDate(l?.ddm);
  const mhd = dlc || ddm ? ` • ${dlc ? "DLC " + dlc : "DDM " + ddm}` : "";
  return `${l.productName || "Produit"} — Lot ${l.lotNumber || "?"}${qty}${mhd}`;
}

export default function RecipeBatchesForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "ingredients",
  });

  // ---- Lots (select)
  const [lots, setLots] = useState([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [lotsError, setLotsError] = useState(false);

  // pour éviter setState après unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchLots = useCallback(async () => {
    if (!restaurantId) {
      if (isMountedRef.current) setLots([]);
      return;
    }
    setLotsLoading(true);
    setLotsError(false);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        if (isMountedRef.current) {
          setLots([]);
          setLotsLoading(false);
        }
        return;
      }
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/inventory-lots-select`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 300 },
      });
      if (isMountedRef.current) {
        setLots(Array.isArray(data?.items) ? data.items : []);
      }
    } catch (e) {
      if (isMountedRef.current) {
        console.error(e);
        setLots([]);
        setLotsError(true);
      }
    } finally {
      if (isMountedRef.current) setLotsLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    reset(buildFormDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    fetchLots();
  }, [fetchLots]);

  useEffect(() => {
    const handler = () => fetchLots();
    window.addEventListener("inventory-lots:refresh", handler);
    return () => window.removeEventListener("inventory-lots:refresh", handler);
  }, [fetchLots]);

  const sortedLots = useMemo(() => {
    const list = Array.isArray(lots) ? [...lots] : [];
    return list.sort((a, b) => {
      const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return (
        tb - ta || String(b?._id || "").localeCompare(String(a?._id || ""))
      );
    });
  }, [lots]);

  // observe les ingrédients pour déduire la sélection en édition
  const ingredientsWatch = watch("ingredients") || [];

  function getSelectedLotIdForIndex(idx) {
    const row = ingredientsWatch[idx] || {};
    const curLotId = row.inventoryLotId ? String(row.inventoryLotId) : "";
    if (curLotId) return curLotId;

    // déduire via lotNumber (édition)
    const curLotNumber = row.lotNumber ? String(row.lotNumber) : "";
    if (!curLotNumber) return "";
    const found = sortedLots.find((l) => String(l.lotNumber) === curLotNumber);
    return found?._id ? String(found._id) : "";
  }

  function handlePickLot(idx, lotId) {
    const lot = sortedLots.find((x) => String(x._id) === String(lotId));
    if (!lot) {
      // retour à “—”
      setValue(`ingredients.${idx}.inventoryLotId`, "", { shouldDirty: true });
      return;
    }

    // 1) stocke l'id pour piloter le select
    setValue(`ingredients.${idx}.inventoryLotId`, String(lot._id), {
      shouldDirty: true,
      shouldValidate: false,
    });

    // 2) met à jour les champs liés au lot
    setValue(`ingredients.${idx}.lotNumber`, lot.lotNumber || "", {
      shouldDirty: true,
      shouldValidate: true,
    });

    // mise à jour systématique du nom et de l’unité pour rester cohérent
    setValue(`ingredients.${idx}.name`, lot.productName || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`ingredients.${idx}.unit`, lot.unit || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      recipeId: data.recipeId || undefined,
      batchId: data.batchId || undefined,
      preparedAt: data.preparedAt ? new Date(data.preparedAt) : undefined,
      usedByServiceDate: data.usedByServiceDate
        ? new Date(data.usedByServiceDate)
        : undefined,
      notes: data.notes || undefined,
      ingredients: (Array.isArray(data.ingredients) ? data.ingredients : [])
        .map((l) => ({
          name: l.name || undefined,
          lotNumber: l.lotNumber || undefined,
          qty: l.qty !== "" && l.qty != null ? Number(l.qty) : undefined,
          unit: l.unit || undefined,
          inventoryLotId: l.inventoryLotId || undefined,
        }))
        .filter((x) =>
          Object.values(x).some((v) => v !== undefined && v !== "")
        ),
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recipe-batches/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recipe-batches`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // ➜ re-fetch des lots pour refléter immédiatement les nouvelles quantités restantes
    await fetchLots();

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      {/* En-tête batch */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">ID Recette *</label>
          <input
            type="text"
            placeholder="ex: recette-123"
            {...register("recipeId", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.recipeId && (
            <p className="text-xs text-red mt-1">{errors.recipeId.message}</p>
          )}
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">ID Batch *</label>
          <input
            type="text"
            placeholder="ex: BOLO-2025-10-02-A"
            {...register("batchId", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.batchId && (
            <p className="text-xs text-red mt-1">{errors.batchId.message}</p>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Préparé le *</label>
          <input
            type="datetime-local"
            {...register("preparedAt")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">
            À utiliser pour le service
          </label>
          <input
            type="date"
            {...register("usedByServiceDate")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* Ingrédients */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Ingrédients</h3>
          <button
            type="button"
            onClick={() =>
              append({
                name: "",
                lotNumber: "",
                qty: "",
                unit: "",
                inventoryLotId: "",
              })
            }
            className="px-3 py-1 rounded bg-blue text-white"
          >
            Ajouter un ingrédient
          </button>
        </div>

        {fields.map((field, idx) => {
          const selectedLotId = getSelectedLotIdForIndex(idx);

          return (
            <div
              key={field.id}
              className="border rounded p-3 flex flex-col gap-3"
            >
              {/* ligne 1 : sélection d’un lot + nom */}
              <div className="flex gap-3 midTablet:flex-row flex-col">
                <div className="flex-1">
                  <label className="text-sm font-medium">
                    Choisir un lot existant
                  </label>
                  <select
                    value={selectedLotId}
                    onChange={(e) => handlePickLot(idx, e.target.value)}
                    className="border rounded p-2 h-[44px] w-full"
                    disabled={lotsLoading}
                  >
                    <option value="">—</option>
                    {sortedLots.map((l) => (
                      <option key={l._id} value={String(l._id)}>
                        {formatLotLabel(l)}
                      </option>
                    ))}
                  </select>
                  {lotsError && (
                    <p className="text-xs text-red mt-1">
                      Erreur lors du chargement des lots.
                    </p>
                  )}
                </div>

                <div className="flex-1">
                  <label className="text-sm font-medium">Nom *</label>
                  <input
                    type="text"
                    placeholder="ex: Sauce bolognaise"
                    {...register(`ingredients.${idx}.name`)}
                    className="border rounded p-2 h-[44px] w-full"
                  />
                </div>
              </div>

              {/* ligne 2 : lotNumber + qty + unit */}
              <div className="flex gap-3 midTablet:flex-row flex-col">
                <div className="flex-1">
                  <label className="text-sm font-medium">
                    N° lot (ingrédient)
                  </label>
                  <input
                    type="text"
                    placeholder="ex: LOT-ABC123"
                    {...register(`ingredients.${idx}.lotNumber`)}
                    className="border rounded p-2 h-[44px] w-full"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium">Qté</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="ex: 2.5"
                    {...register(`ingredients.${idx}.qty`)}
                    className="border rounded p-2 h-[44px] w-full"
                  />
                </div>
                <div className="w-36">
                  <label className="text-sm font-medium">Unité</label>
                  <select
                    {...register(`ingredients.${idx}.unit`)}
                    className="border rounded p-2 h-[44px] w-full"
                  >
                    <option value="">—</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="mL">mL</option>
                    <option value="unit">unité</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="px-3 py-1 rounded bg-red text-white"
                >
                  Supprimer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div>
        <label className="text-sm font-medium">Notes</label>
        <textarea
          rows={4}
          {...register("notes")}
          className="border rounded p-2 resize-none w-full min-h-[96px]"
          placeholder="Observations, numéro de fournée, etc."
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 rounded bg-blue text-white disabled:opacity-50"
        >
          {initial?._id ? "Mettre à jour" : "Enregistrer"}
        </button>
        {initial?._id && (
          <button
            type="button"
            onClick={() => {
              reset(buildFormDefaults(null));
              onCancel?.();
            }}
            className="px-4 py-2 rounded text-white bg-red"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
