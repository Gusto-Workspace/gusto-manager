// app/(components)/recipes/RecipeBatchesForm.jsx
"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";
import {
  Tag,
  Hash,
  Package,
  PlusCircle,
  Trash2,
  Loader2,
  X,
  ChevronDown,
  FileText,
} from "lucide-react";

/* ---------------- Utils dates & defaults ---------------- */
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

/* ---------------- Unités & conversions ---------------- */
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

/* ---------------- Format labels lots ---------------- */
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

/* ---------------- Helpers lignes ---------------- */
const isRowEmpty = (row) =>
  !row?.name &&
  !row?.qty &&
  !row?.unit &&
  !row?.lotNumber &&
  !row?.inventoryLotId;

// Désormais, une ligne est "valable" UNIQUEMENT si le nom est saisi
const isRowValidByName = (row) => !!row?.name?.trim();

// Pour l’UI : y a-t-il des données SAUF le nom ?
const hasOtherDataWithoutName = (row) =>
  !isRowValidByName(row) &&
  (row?.qty || row?.unit || row?.lotNumber || row?.inventoryLotId);

/* ---------------- Composant ---------------- */
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
    watch,
    setValue,
    setError,
    clearErrors,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "ingredients",
  });
  const ingredients = watch("ingredients");

  // --- Snapshot initial pour calcul de stock virtuel (édition)
  const initialSnapshot = useMemo(
    () => (Array.isArray(initial?.ingredients) ? initial.ingredients : []),
    [initial]
  );

  // --- Styles (identiques au composant réception)
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98]";
  const chip =
    "rounded-md bg-darkBlue/10 px-2 py-0.5 text-[11px] text-darkBlue/70";

  // --- Lots (select)
  const [lots, setLots] = useState([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [lotsError, setLotsError] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    []
  );

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
      if (isMountedRef.current)
        setLots(Array.isArray(data?.items) ? data.items : []);
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

  // --- Helpers lots
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
    const row = ingredients?.[idx] || {};
    const curLotId = row.inventoryLotId ? String(row.inventoryLotId) : "";
    if (curLotId) return curLotId;
    const curLotNumber = row.lotNumber ? String(row.lotNumber) : "";
    if (!curLotNumber) return "";
    const found = sortedLots.find((l) => String(l.lotNumber) === curLotNumber);
    return found?._id ? String(found._id) : "";
  }
  function handlePickLot(idx, lotId) {
    const lot = sortedLots.find((x) => String(x._id) === String(lotId));
    if (!lot) {
      setValue(`ingredients.${idx}.inventoryLotId`, "", { shouldDirty: true });
      return;
    }
    setValue(`ingredients.${idx}.inventoryLotId`, String(lot._id), {
      shouldDirty: true,
      shouldValidate: false,
    });
    setValue(`ingredients.${idx}.lotNumber`, lot.lotNumber || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`ingredients.${idx}.name`, lot.productName || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`ingredients.${idx}.unit`, lot.unit || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  // --- Stock virtuel & max autorisé
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
  function allowedMaxForRow(idx) {
    const row = ingredients?.[idx] || {};
    const lotId = row?.inventoryLotId ? String(row.inventoryLotId) : "";
    const lotNumber = row?.lotNumber ? String(row.lotNumber) : "";
    const lot = findLotByIdOrNumber({ lotId, lotNumber });
    if (!lot) return null;

    const rowUnit = row?.unit || lot.unit;
    if (!rowUnit) return null;

    const virtualRemainLotUnit =
      Number(lot.qtyRemaining || 0) + prevTotalForLotInLotUnit(lot);

    const virtualRemainInRowUnit = convertQty(
      virtualRemainLotUnit,
      lot.unit,
      rowUnit
    );
    if (virtualRemainInRowUnit == null) return null;

    let usedByOthers = 0;
    (ingredients || []).forEach((r, j) => {
      if (j === idx) return;

      // ⚠️ Ne compter les AUTRES lignes que si le NOM est saisi
      if (!isRowValidByName(r)) return;

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

  /* ---------------- Lignes pliables & validation style réception ---------------- */
  const [openById, setOpenById] = useState({});
  const contentRefs = useRef({});
  const openNewLineRef = useRef(false);

  // Aligne l'état d'ouverture sur le contenu des lignes
  useEffect(() => {
    setOpenById((prev) => {
      const next = { ...prev };
      fields.forEach((f, idx) => {
        if (next[f.id] == null) {
          const l = (ingredients && ingredients[idx]) || {};
          next[f.id] = isRowEmpty(l); // lignes vides => ouvertes
        }
      });
      Object.keys(next).forEach((k) => {
        if (!fields.find((f) => f.id === k)) delete next[k];
      });
      return next;
    });
  }, [fields, ingredients]);

  // 1ère ligne ouverte si tout est vide au premier rendu
  useEffect(() => {
    if (!fields.length) return;
    const allEmpty =
      fields.length > 0 &&
      fields.every((f, i) => isRowEmpty((ingredients && ingredients[i]) || {}));
    if (allEmpty) {
      setOpenById((s) => ({ ...s, [fields[0].id]: true }));
    }
  }, [fields, ingredients]);

  // Ouvre la nouvelle ligne juste après append
  useEffect(() => {
    if (!openNewLineRef.current) return;
    const last = fields[fields.length - 1];
    if (last) {
      setOpenById((s) => ({ ...s, [last.id]: true }));
      setTimeout(() => setFocus(`ingredients.${fields.length - 1}.name`), 0);
    }
    openNewLineRef.current = false;
  }, [fields, setFocus]);

  const toggleOpen = (id) => setOpenById((s) => ({ ...s, [id]: !s[id] }));

  // ✅ Valide la ligne : exige "Nom" non vide
  const validateLine = (id, idx) => {
    const value = (ingredients?.[idx]?.name || "").trim();
    if (!value) {
      setOpenById((s) => ({ ...s, [id]: true }));
      setError(`ingredients.${idx}.name`, {
        type: "manual",
        message: "Requis",
      });
      setFocus(`ingredients.${idx}.name`);
      return;
    }
    setOpenById((s) => ({ ...s, [id]: false }));
  };

  // --- Soumission
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

    // Garder UNIQUEMENT les lignes qui ont un nom saisi
    const mapped = (
      Array.isArray(data.ingredients) ? data.ingredients : []
    ).map((l) => ({
      name: l.name || undefined,
      lotNumber: l.lotNumber || undefined,
      qty: l.qty !== "" && l.qty != null ? Number(l.qty) : undefined,
      unit: l.unit || undefined,
      inventoryLotId: l.inventoryLotId || undefined,
    }));
    const ingredientsFiltered = mapped.filter((x) => isRowValidByName(x));

    const payload = {
      recipeId: data.recipeId || undefined,
      batchId: data.batchId || undefined,
      preparedAt: data.preparedAt ? new Date(data.preparedAt) : undefined,
      usedByServiceDate: data.usedByServiceDate
        ? new Date(data.usedByServiceDate)
        : undefined,
      notes: data.notes || undefined,
      ingredients: ingredientsFiltered,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recipe-batches/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recipe-batches`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Répercuter immédiatement les restants
    await fetchLots();

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  // --- Petits helpers UI
  const fmtMax = (v) => (v == null ? null : Number.isFinite(v) ? v : null);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-5"
    >
      {/* En-tête batch */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <FileText className="size-4" /> ID Recette *
          </label>
          <input
            type="text"
            placeholder="ex: recette-123"
            autoComplete="off"
            spellCheck={false}
            {...register("recipeId", { required: "Requis" })}
            className={inputCls}
          />
          {errors.recipeId && (
            <p className="mt-1 text-xs text-red">{errors.recipeId.message}</p>
          )}
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <FileText className="size-4" /> ID Batch *
          </label>
          <input
            type="text"
            placeholder="ex: BOLO-2025-10-02-A"
            autoComplete="off"
            spellCheck={false}
            {...register("batchId", { required: "Requis" })}
            className={inputCls}
          />
          {errors.batchId && (
            <p className="mt-1 text-xs text-red">{errors.batchId.message}</p>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Préparé le *
          </label>
          <input
            type="datetime-local"
            {...register("preparedAt")}
            className={selectCls}
          />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <FileText className="size-4" /> À utiliser pour le service
          </label>
          <input
            type="date"
            {...register("usedByServiceDate")}
            className={selectCls}
          />
        </div>
      </div>

      {/* Ingrédients */}
      <div className="rounded-2xl bg-white/50 p-3 pb-0">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-darkBlue flex items-center gap-2">
            <FileText className="size-4" /> Ingrédients
          </h3>

          <button
            type="button"
            onClick={() => {
              openNewLineRef.current = true;
              append({
                name: "",
                lotNumber: "",
                qty: "",
                unit: "",
                inventoryLotId: "",
              });
            }}
            className={`${btnBase} border border-violet/20 bg-white text-violet hover:bg-violet/5`}
          >
            <PlusCircle className="size-4" /> Ajouter un ingrédient
          </button>
        </div>

        <div className="space-y-3 mb-3">
          {fields.map((field, idx) => {
            const id = field.id;
            const isOpen = !!openById[id];
            const row = (ingredients && ingredients[idx]) || {};
            const selectedLotId = getSelectedLotIdForIndex(idx);

            const lot =
              findLotByIdOrNumber({
                lotId: row?.inventoryLotId ? String(row.inventoryLotId) : "",
                lotNumber: row?.lotNumber ? String(row.lotNumber) : "",
              }) || null;

            const allowedUnits = lot
              ? allowedUnitsForLotUnit(lot.unit)
              : ALL_UNITS;
            const curUnit = row?.unit || (lot ? lot.unit : "");
            const safeUnit = allowedUnits.includes(curUnit)
              ? curUnit
              : lot
                ? lot.unit || allowedUnits[0] || ""
                : "";

            if (safeUnit !== curUnit) {
              setTimeout(() => {
                setValue(`ingredients.${idx}.unit`, safeUnit, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }, 0);
            }

            const allowed = fmtMax(allowedMaxForRow(idx));
            const nameReg = register(`ingredients.${idx}.name`);

            // 👉 surlignage rouge si données sans nom
            const needsNameNow = hasOtherDataWithoutName(row);
            const hasNameErr =
              needsNameNow ||
              !!(errors?.ingredients && errors.ingredients[idx]?.name);

            return (
              <div
                key={id}
                className="rounded-xl border border-darkBlue/10 bg-white"
              >
                {/* Header ligne */}
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleOpen(id)}
                    className="flex items-center gap-2 text-left"
                    title={isOpen ? "Replier" : "Déplier"}
                  >
                    <ChevronDown
                      className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-darkBlue">
                        {row?.name?.trim() || "Nouvel ingrédient"}
                      </span>
                      {!isOpen && (
                        <span className="text-[11px] text-darkBlue/60">
                          Cliquez pour voir/modifier le détail
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Résumé compact quand replié */}
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {!!row?.qty && (
                      <span className={chip}>
                        {row.qty} {row.unit || ""}
                      </span>
                    )}
                    {!!row?.lotNumber && (
                      <span className={chip}>Lot {row.lotNumber}</span>
                    )}
                    {!!lot?.productName && (
                      <span className={chip}>{lot.productName}</span>
                    )}
                    {allowed != null && (
                      <span className={chip}>
                        Max {allowed}
                        {row.unit || ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Contenu collapsible */}
                <div
                  ref={(el) => (contentRefs.current[id] = el)}
                  style={{
                    maxHeight: isOpen
                      ? contentRefs.current[id]?.scrollHeight || 9999
                      : 0,
                  }}
                  className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
                >
                  <div className="p-3 border-t border-darkBlue/10">
                    {/* Ligne 1 : lot existant + nom */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <Package className="size-4" /> Choisir un lot existant
                        </label>
                        <select
                          value={selectedLotId}
                          onChange={(e) => handlePickLot(idx, e.target.value)}
                          className={selectCls}
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
                          <p className="mt-1 text-xs text-red">
                            Erreur lors du chargement des lots.
                          </p>
                        )}
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <Tag className="size-4" /> Nom *
                        </label>
                        <input
                          type="text"
                          placeholder="ex: Sauce bolognaise"
                          autoComplete="off"
                          spellCheck={false}
                          {...nameReg}
                          onChange={(e) => {
                            nameReg.onChange(e);
                            if (e.target.value.trim()) {
                              clearErrors(`ingredients.${idx}.name`);
                            }
                          }}
                          className={`${inputCls} ${hasNameErr ? "border-red focus:ring-red/20" : ""}`}
                          aria-invalid={hasNameErr ? "true" : "false"}
                        />
                      </div>
                    </div>

                    {/* Ligne 2 : lotNumber + qty + unit */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <Hash className="size-4" /> N° lot (ingrédient)
                        </label>
                        <input
                          type="text"
                          placeholder="ex: LOT-ABC123"
                          autoComplete="off"
                          spellCheck={false}
                          {...register(`ingredients.${idx}.lotNumber`)}
                          className={inputCls}
                        />
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <Package className="size-4" /> Qté
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="ex: 2.5"
                          onWheel={(e) => e.currentTarget.blur()}
                          max={allowed != null ? allowed : undefined}
                          {...register(`ingredients.${idx}.qty`, {
                            validate: (val) => {
                              if (val === "" || val == null) return true;
                              const n = Number(val);
                              if (!Number.isFinite(n) || n < 0)
                                return "Valeur invalide";
                              const a = allowedMaxForRow(idx);
                              if (a != null && n > a)
                                return `Max autorisé: ${a}`;
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
                          className={`${inputCls} pr-2 text-left`}
                        />
                        {allowed != null && (
                          <div className="text-[11px] text-darkBlue/60 mt-1">
                            Max restant : {allowed} {row.unit || ""}
                          </div>
                        )}
                        {errors.ingredients?.[idx]?.qty && (
                          <p className="text-xs text-red mt-1">
                            {errors.ingredients[idx].qty.message}
                          </p>
                        )}
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>Unité</label>
                        <select
                          value={row.unit || ""}
                          onChange={(e) =>
                            setValue(
                              `ingredients.${idx}.unit`,
                              e.target.value,
                              {
                                shouldDirty: true,
                                shouldValidate: true,
                              }
                            )
                          }
                          className={selectCls}
                          disabled={lot ? allowedUnits.length === 1 : false}
                        >
                          {(lot ? allowedUnits : ["", ...ALL_UNITS]).map(
                            (u, i) => (
                              <option key={`${u}-${i}`} value={u}>
                                {u || "—"}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Actions ligne */}
                    <div className="flex justify-between mt-2 gap-2">
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className={`${btnBase} border border-red bg-white text-red hover:border-red/80`}
                      >
                        <Trash2 className="size-4" /> Supprimer la ligne
                      </button>

                      {isOpen && (
                        <button
                          type="button"
                          onClick={() => validateLine(id, idx)}
                          className={`${btnBase} border border-blue bg-white text-blue hover:border-darkBlue/30`}
                          title="Valider la ligne"
                        >
                          Valider la ligne
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-1">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Notes
          </label>
          <textarea
            rows={1}
            {...register("notes")}
            className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40"
            placeholder="Observations, numéro de fournée, etc."
          />
        </div>
      </div>

      {/* Actions form */}
      <div className="flex flex-col gap-2 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className="text-nowrap inline-flex items-center justify-center gap-2 rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Enregistrement…
            </>
          ) : initial?._id ? (
            <>
              <FileText className="size-4" />
              Mettre à jour
            </>
          ) : (
            <>
              <FileText className="size-4" />
              Enregistrer
            </>
          )}
        </button>

        {initial?._id && (
          <button
            type="button"
            onClick={() => {
              reset(buildFormDefaults(null));
              onCancel?.();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red bg-white px-4 py-2 text-sm font-medium text-red"
          >
            <X className="size-4" /> Annuler
          </button>
        )}
      </div>
    </form>
  );
}
