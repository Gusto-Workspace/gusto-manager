// app/(components)/recipes/RecipeBatchesForm.jsx
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

/* ---------- conversions & unités autorisées ---------- */
const ALL_UNITS = ["kg", "g", "L", "mL", "unit"];
const UNIT_GROUP = {
  MASS: new Set(["kg", "g"]),
  VOL: new Set(["L", "mL"]),
  COUNT: new Set(["unit"]),
};
function sameGroup(a, b) {
  if (!a || !b) return null;
  if (UNIT_GROUP.MASS.has(a) && UNIT_GROUP.MASS.has(b)) return "MASS";
  if (UNIT_GROUP.VOL.has(a) && UNIT_GROUP.VOL.has(b)) return "VOL";
  if (UNIT_GROUP.COUNT.has(a) && UNIT_GROUP.COUNT.has(b)) return "COUNT";
  return null;
}
function convertQty(qty, from, to) {
  if (qty == null || !Number.isFinite(Number(qty))) return null;
  if (from === to) return Number(qty);
  const g = sameGroup(from, to);
  if (!g) return null;
  const n = Number(qty);
  if (g === "MASS") {
    if (from === "kg" && to === "g") return n * 1000;
    if (from === "g" && to === "kg") return n / 1000;
  }
  if (g === "VOL") {
    if (from === "L" && to === "mL") return n * 1000;
    if (from === "mL" && to === "L") return n / 1000;
  }
  if (g === "COUNT") return n;
  return null;
}
function allowedUnitsForLotUnit(lotUnit) {
  if (!lotUnit) return ALL_UNITS;
  if (lotUnit === "kg") return ["kg", "g"];
  if (lotUnit === "L") return ["L", "mL"];
  return [lotUnit]; // g, mL, unit -> figé
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
    getValues,
    setError,
    clearErrors,
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  const initialSnapshot = useMemo(
    () => (Array.isArray(initial?.ingredients) ? initial.ingredients : []),
    [initial]
  );

  const { fields, append, remove } = useFieldArray({
    control,
    name: "ingredients",
  });

  // ---- Lots (select)
  const [lots, setLots] = useState([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [lotsError, setLotsError] = useState(false);

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

  function findLotByIdOrNumber({ lotId, lotNumber }) {
    if (lotId) {
      const byId = sortedLots.find((l) => String(l._id) === String(lotId));
      if (byId) return byId;
    }
    if (lotNumber) {
      return (
        sortedLots.find((l) => String(l.lotNumber) === String(lotNumber)) ||
        null
      );
    }
    return null;
  }

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

    setValue(`ingredients.${idx}.name`, lot.productName || "", {
      shouldDirty: true,
      shouldValidate: true,
    });

    // ⚠️ unité = unité du lot
    setValue(`ingredients.${idx}.unit`, lot.unit || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  /* ---------- Stock virtuel & Max autorisé par ligne ---------- */
  // Somme des quantités de l'ANCIEN batch par lot (unité du lot)
  function prevTotalForLotInLotUnit(lot) {
    if (!lot) return 0;
    let sum = 0;
    (initialSnapshot || []).forEach((ing) => {
      const same =
        (ing?.inventoryLotId &&
          String(ing.inventoryLotId) === String(lot._id)) ||
        (!ing?.inventoryLotId &&
          ing?.lotNumber &&
          String(ing.lotNumber) === String(lot.lotNumber));
      if (!same) return;
      const q = Number(ing?.qty);
      if (!Number.isFinite(q) || q <= 0) return;
      const fromUnit = ing?.unit || lot.unit;
      const conv = convertQty(q, fromUnit, lot.unit);
      if (conv != null) sum += conv;
    });
    return sum;
  }

  // retourne le max autorisé pour la ligne idx dans l’unité de la ligne
  function allowedMaxForRow(idx) {
    const row = ingredientsWatch[idx] || {};
    const lotId = row?.inventoryLotId ? String(row.inventoryLotId) : "";
    const lotNumber = row?.lotNumber ? String(row.lotNumber) : "";
    const lot = findLotByIdOrNumber({ lotId, lotNumber });
    if (!lot) return null;

    const rowUnit = row?.unit || lot.unit;
    if (!rowUnit) return null;

    // *** Stock virtuel pour l’édition ***
    // qtyRemaining(BDD) + somme des quantités de l'ancien batch pour CE lot
    const virtualRemainLotUnit =
      Number(lot.qtyRemaining || 0) + prevTotalForLotInLotUnit(lot);

    // capacité en unité de la ligne
    const virtualRemainInRowUnit = convertQty(
      virtualRemainLotUnit,
      lot.unit,
      rowUnit
    );
    if (virtualRemainInRowUnit == null) return null;

    // somme des autres lignes du même lot (form en cours)
    let usedByOthers = 0;
    (ingredientsWatch || []).forEach((r, j) => {
      if (j === idx) return;
      const same =
        (r?.inventoryLotId && String(r.inventoryLotId) === String(lot._id)) ||
        (!r?.inventoryLotId &&
          r?.lotNumber &&
          String(r.lotNumber) === String(lot.lotNumber));
      if (!same) return;
      const q = Number(r?.qty);
      if (!Number.isFinite(q) || q <= 0) return;
      const fromUnit = r?.unit || lot.unit;
      const qInRowUnit = convertQty(q, fromUnit, rowUnit);
      if (qInRowUnit != null) usedByOthers += qInRowUnit;
    });

    return Math.max(0, virtualRemainInRowUnit - usedByOthers);
  }

  // Sur changement d’une ligne (lot/quantité/unité), on recape automatiquement si besoin
  useEffect(() => {
    (ingredientsWatch || []).forEach((row, idx) => {
      const allowed = allowedMaxForRow(idx);
      const n = Number(row?.qty);
      if (allowed != null && Number.isFinite(n) && n > allowed) {
        setValue(`ingredients.${idx}.qty`, String(allowed), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(
      (ingredientsWatch || []).map((r) => [
        r.inventoryLotId,
        r.lotNumber,
        r.qty,
        r.unit,
      ])
    ),
    JSON.stringify(sortedLots.map((l) => [l._id, l.qtyRemaining, l.unit])),
    JSON.stringify(
      (initialSnapshot || []).map((r) => [
        r.inventoryLotId,
        r.lotNumber,
        r.qty,
        r.unit,
      ])
    ),
  ]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Sécurité: respecte le max par lot (après conversions)
    for (let idx = 0; idx < (data.ingredients || []).length; idx++) {
      const max = allowedMaxForRow(idx);
      const n = Number(data.ingredients[idx]?.qty);
      if (max != null && Number.isFinite(n) && n > max) {
        setError(`ingredients.${idx}.qty`, {
          type: "manual",
          message: `Max autorisé : ${max}`,
        });
        return;
      }
    }

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
          const row = ingredientsWatch[idx] || {};
          const lot =
            findLotByIdOrNumber({
              lotId: row?.inventoryLotId ? String(row.inventoryLotId) : "",
              lotNumber: row?.lotNumber ? String(row.lotNumber) : "",
            }) || null;
          const allowedUnits = lot
            ? allowedUnitsForLotUnit(lot.unit)
            : ALL_UNITS;

          // corrige l’unité si non autorisée
          const curUnit = row?.unit || (lot ? lot.unit : "");
          const safeUnit = allowedUnits.includes(curUnit)
            ? curUnit
            : lot?.unit || allowedUnits[0] || "";
          if (safeUnit !== curUnit) {
            setTimeout(() => {
              setValue(`ingredients.${idx}.unit`, safeUnit, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }, 0);
          }

          const allowed = allowedMaxForRow(idx);

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
                    max={allowed != null ? allowed : undefined}
                    {...register(`ingredients.${idx}.qty`, {
                      validate: (val) => {
                        if (val === "" || val == null) return true;
                        const n = Number(val);
                        if (!Number.isFinite(n) || n < 0)
                          return "Valeur invalide";
                        const a = allowedMaxForRow(idx);
                        if (a != null && n > a) return `Max autorisé: ${a}`;
                        return true;
                      },
                    })}
                    onBlur={(e) => {
                      const a = allowedMaxForRow(idx);
                      const n = Number(e.target.value);
                      if (a != null && Number.isFinite(n) && n > a) {
                        setValue(`ingredients.${idx}.qty`, String(a), {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }
                    }}
                    className="border rounded p-2 h-[44px] w-full"
                  />
                  {allowed != null && (
                    <div className="text-xs opacity-60 mt-1">
                      Max restant : {allowed} {safeUnit || ""}
                    </div>
                  )}
                  {errors.ingredients?.[idx]?.qty && (
                    <p className="text-xs text-red mt-1">
                      {errors.ingredients[idx].qty.message}
                    </p>
                  )}
                </div>
                <div className="w-36">
                  <label className="text-sm font-medium">Unité</label>
                  <select
                    value={safeUnit}
                    onChange={(e) =>
                      setValue(`ingredients.${idx}.unit`, e.target.value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    className="border rounded p-2 h-[44px] w-full"
                    disabled={lot ? allowedUnits.length === 1 : false}
                  >
                    {allowedUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
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
