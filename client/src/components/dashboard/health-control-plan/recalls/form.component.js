"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";

function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
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

function buildDefaults(rec) {
  return {
    source: rec?.source ?? "supplier",
    supplierName: rec?.supplierName ?? "",
    supplierId: rec?.supplierId ? String(rec.supplierId) : "",
    initiatedAt: toDatetimeLocal(rec?.initiatedAt ?? new Date()),
    actionsTaken: rec?.actionsTaken ?? "",
    attachmentsText: Array.isArray(rec?.attachments)
      ? rec.attachments.join("\n")
      : "",
    closed: !!rec?.closedAt,
    closedAt: toDatetimeLocal(rec?.closedAt),

    items:
      Array.isArray(rec?.items) && rec.items.length
        ? rec.items.map((it) => ({
            inventoryLotId: it?.inventoryLotId ? String(it.inventoryLotId) : "",
            inventoryLotDisplay: "", // affichage (produit)
            lotMaxRemaining:
              it?.lotMaxRemaining !== undefined && it?.lotMaxRemaining !== null
                ? String(it.lotMaxRemaining)
                : "", // stock restant au moment de la sélection (dans l’unité du lot)
            lotBaseUnit: it?.lotBaseUnit ?? "", // unité du lot pour les conversions
            productName: it?.productName ?? "",
            lotNumber: it?.lotNumber ?? "",
            quantity:
              it?.quantity !== undefined && it?.quantity !== null
                ? String(it.quantity)
                : "",
            unit: it?.unit ?? "",
            bestBefore: toDateValue(it?.bestBefore),
            note: it?.note ?? "",
          }))
        : [
            {
              inventoryLotId: "",
              inventoryLotDisplay: "",
              lotMaxRemaining: "",
              lotBaseUnit: "",
              productName: "",
              lotNumber: "",
              quantity: "",
              unit: "",
              bestBefore: "",
              note: "",
            },
          ],
  };
}

export default function RecallForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults(initial) });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  useEffect(() => {
    reset(buildDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // Auto date closedAt
  const closedWatch = watch("closed");
  useEffect(() => {
    if (closedWatch && !watch("closedAt")) {
      const now = new Date();
      const off = now.getTimezoneOffset() * 60000;
      const v = new Date(now.getTime() - off).toISOString().slice(0, 16);
      setValue("closedAt", v, { shouldDirty: true });
    }
    if (!closedWatch) setValue("closedAt", "", { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedWatch]);

  /* ---------- Autocomplete InventoryLot par ligne ---------- */
  const [lotDropdownOpen, setLotDropdownOpen] = useState({});
  const [lotOptions, setLotOptions] = useState({}); // { [idx]: [...] }
  const searchTimers = useRef({}); // debounce

  function setLotOpen(idx, open) {
    setLotDropdownOpen((m) => ({ ...m, [idx]: open }));
  }

  async function fetchLots(idx, query) {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recalls/select/inventory-lots`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { q: query || "", limit: 12, status: "in_stock" },
      });
      setLotOptions((m) => ({ ...m, [idx]: data.items || [] }));
    } catch (e) {
      console.error("fetch lot options:", e);
      setLotOptions((m) => ({ ...m, [idx]: [] }));
    }
  }

  function onLotInputChange(idx, val) {
    setValue(`items.${idx}.inventoryLotDisplay`, val, { shouldDirty: true });
    setValue(`items.${idx}.inventoryLotId`, "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`items.${idx}.lotMaxRemaining`, "", { shouldDirty: true });
    setValue(`items.${idx}.lotBaseUnit`, "", { shouldDirty: true });
    setLotOpen(idx, true);

    clearTimeout(searchTimers.current[idx]);
    searchTimers.current[idx] = setTimeout(() => fetchLots(idx, val), 250);
  }

  function onLotFocus(idx) {
    setLotOpen(idx, true);
    fetchLots(
      idx,
      (getValues(`items.${idx}.inventoryLotDisplay`) || "").trim()
    );
  }

  function onLotBlur(idx) {
    setTimeout(() => setLotOpen(idx, false), 120);
    const txt = (getValues(`items.${idx}.inventoryLotDisplay`) || "").trim();
    const id = getValues(`items.${idx}.inventoryLotId`) || "";
    if (!txt) {
      clearErrors([
        `items.${idx}.inventoryLotDisplay`,
        `items.${idx}.inventoryLotId`,
      ]);
      return;
    }
    if (!id) {
      setError(`items.${idx}.inventoryLotDisplay`, {
        type: "manual",
        message: "Veuillez sélectionner un lot dans la liste",
      });
    } else {
      clearErrors([
        `items.${idx}.inventoryLotDisplay`,
        `items.${idx}.inventoryLotId`,
      ]);
    }
  }

  // Calcule le max autorisé pour la ligne idx en tenant compte des autres lignes du même lot (avec conversions)
  function allowedMaxForRow(idx) {
    const lotId = getValues(`items.${idx}.inventoryLotId`) || "";
    const baseRemain = Number(getValues(`items.${idx}.lotMaxRemaining`));
    const lotBaseUnit = getValues(`items.${idx}.lotBaseUnit`) || "";
    const rowUnit = getValues(`items.${idx}.unit`) || lotBaseUnit;

    if (!lotId || !Number.isFinite(baseRemain) || !lotBaseUnit || !rowUnit)
      return null;

    // Capacité du lot exprimée dans l’unité de la ligne
    const baseInRowUnit = convertQty(baseRemain, lotBaseUnit, rowUnit);
    if (baseInRowUnit == null) return null;

    // somme des autres lignes de ce lot, converties vers l’unité de la ligne
    const rows = getValues("items") || [];
    let usedByOthers = 0;
    rows.forEach((r, j) => {
      if (j === idx) return;
      if (String(r?.inventoryLotId || "") === String(lotId)) {
        const q = Number(r?.quantity);
        if (!Number.isFinite(q) || q <= 0) return;
        const fromUnit = r?.unit || lotBaseUnit;
        const qInRowUnit = convertQty(q, fromUnit, rowUnit);
        if (qInRowUnit != null) usedByOthers += qInRowUnit;
      }
    });

    return Math.max(0, baseInRowUnit - usedByOthers);
  }

  function pickLot(idx, lot) {
    setValue(`items.${idx}.inventoryLotId`, lot?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });

    // Libellé = produit uniquement
    setValue(`items.${idx}.inventoryLotDisplay`, lot?.productName || "", {
      shouldDirty: true,
    });

    // Écrase systématiquement les champs liés au lot
    setValue(`items.${idx}.productName`, lot?.productName || "", {
      shouldDirty: true,
    });
    setValue(`items.${idx}.lotNumber`, lot?.lotNumber || "", {
      shouldDirty: true,
    });

    // ⚠️ unité = unité du lot (avec choix restreint)
    setValue(`items.${idx}.unit`, lot?.unit || "", { shouldDirty: true });
    setValue(`items.${idx}.lotBaseUnit`, lot?.unit ? String(lot.unit) : "", {
      shouldDirty: true,
    });

    // DLC/DDM → bestBefore
    const bb = lot?.dlc || lot?.ddm || "";
    setValue(`items.${idx}.bestBefore`, toDateValue(bb), { shouldDirty: true });

    // Stock maximum (lot.unit)
    const lotMax = Number(lot?.qtyRemaining);
    setValue(
      `items.${idx}.lotMaxRemaining`,
      Number.isFinite(lotMax) ? String(lotMax) : "",
      { shouldDirty: true }
    );

    // Si quantité vide → propose le restant (dans l’unité du lot)
    const curQ = (getValues(`items.${idx}.quantity`) || "").trim();
    if (!curQ && Number.isFinite(lotMax)) {
      setValue(`items.${idx}.quantity`, String(lotMax), {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      // Sinon, s'il y a une valeur > max autorisé (après conversion), on la rabat
      const allowed = allowedMaxForRow(idx);
      const n = Number(curQ);
      if (allowed != null && Number.isFinite(n) && n > allowed) {
        setValue(`items.${idx}.quantity`, String(allowed), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    }

    clearErrors([
      `items.${idx}.inventoryLotDisplay`,
      `items.${idx}.inventoryLotId`,
    ]);
    setLotOpen(idx, false);
  }

  function clearPickedLot(idx) {
    setValue(`items.${idx}.inventoryLotId`, "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`items.${idx}.inventoryLotDisplay`, "", { shouldDirty: true });
    setValue(`items.${idx}.lotMaxRemaining`, "", { shouldDirty: true });
    setValue(`items.${idx}.lotBaseUnit`, "", { shouldDirty: true });
    setLotOpen(idx, false);
    clearErrors([
      `items.${idx}.inventoryLotDisplay`,
      `items.${idx}.inventoryLotId`,
    ]);
  }

  const lotInvalid = (idx) => {
    const txt = (watch(`items.${idx}.inventoryLotDisplay`) || "").trim();
    const id = watch(`items.${idx}.inventoryLotId`) || "";
    return txt !== "" && !id;
  };

  // Sur changement d’une ligne (lot/quantité/unité), on recape automatiquement si besoin
  const itemsWatch = watch("items");
  useEffect(() => {
    const rows = itemsWatch || [];
    rows.forEach((row, idx) => {
      const allowed = allowedMaxForRow(idx);
      const n = Number(row?.quantity);
      if (allowed != null && Number.isFinite(n) && n > allowed) {
        setValue(`items.${idx}.quantity`, String(allowed), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }

      // sécurité : corriger l’unité si elle n’est pas autorisée par le lot
      const baseUnit = row?.lotBaseUnit || "";
      const opts = allowedUnitsForLotUnit(baseUnit);
      const cur = row?.unit || baseUnit || "";
      if (baseUnit && !opts.includes(cur)) {
        setValue(`items.${idx}.unit`, baseUnit, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(
      (itemsWatch || []).map((r) => [
        r.inventoryLotId,
        r.quantity,
        r.unit,
        r.lotMaxRemaining,
        r.lotBaseUnit,
      ])
    ),
  ]);

  /* ---------- Submit ---------- */
  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const attachments =
      typeof data.attachmentsText === "string" &&
      data.attachmentsText.trim().length
        ? data.attachmentsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    // texte sans sélection => refuse
    const itemsFront = Array.isArray(data.items) ? data.items : [];
    for (let idx = 0; idx < itemsFront.length; idx++) {
      const txt = (getValues(`items.${idx}.inventoryLotDisplay`) || "").trim();
      const id = getValues(`items.${idx}.inventoryLotId`) || "";
      if (txt && !id) {
        setError(`items.${idx}.inventoryLotDisplay`, {
          type: "manual",
          message: "Veuillez sélectionner un lot dans la liste",
        });
        return;
      }
    }

    // Sécurité finale : somme par lot ≤ stock restant (avec conversions)
    const rows = itemsFront;
    const sumByLotInBase = {};
    const baseUnitByLot = {};
    const maxByLotBase = {};
    rows.forEach((it, idx) => {
      const lotId = getValues(`items.${idx}.inventoryLotId`) || "";
      if (!lotId) return;
      const q = Number(it.quantity);
      const baseUnit = getValues(`items.${idx}.lotBaseUnit`) || "";
      const baseMax = Number(getValues(`items.${idx}.lotMaxRemaining`));
      if (baseUnit) baseUnitByLot[lotId] = baseUnit;
      if (Number.isFinite(baseMax)) maxByLotBase[lotId] = baseMax;

      if (Number.isFinite(q) && q > 0) {
        const fromUnit = it.unit || baseUnit;
        const inBase = convertQty(q, fromUnit, baseUnit);
        if (inBase != null) {
          sumByLotInBase[lotId] = (sumByLotInBase[lotId] || 0) + inBase;
        }
      }
    });
    for (const id of Object.keys(sumByLotInBase)) {
      const baseMax = maxByLotBase[id];
      if (baseMax != null && sumByLotInBase[id] > baseMax) {
        const errIdx = itemsFront.findIndex(
          (_, j) => (getValues(`items.${j}.inventoryLotId`) || "") === id
        );
        setError(`items.${errIdx}.quantity`, {
          type: "manual",
          message: `Quantité totale > stock restant (${baseMax} ${baseUnitByLot[id] || ""})`,
        });
        return;
      }
    }

    const items = rows
      .map((it) => ({
        inventoryLotId: it.inventoryLotId || undefined,
        productName: it.productName || undefined,
        lotNumber: it.lotNumber || undefined,
        quantity:
          it.quantity !== "" && it.quantity != null
            ? Number(it.quantity)
            : undefined,
        unit: it.unit || undefined,
        bestBefore: it.bestBefore ? new Date(it.bestBefore) : undefined,
        note: it.note || undefined,
      }))
      .filter((x) => x.productName);

    if (!items.length) return;

    const payload = {
      source: data.source || "supplier",
      supplierName: data.supplierName || undefined,
      supplierId: data.supplierId || undefined,
      initiatedAt: data.initiatedAt ? new Date(data.initiatedAt) : new Date(),
      items,
      actionsTaken: data.actionsTaken || undefined,
      attachments,
      closedAt: data.closed
        ? data.closedAt
          ? new Date(data.closedAt)
          : new Date()
        : undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recalls/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recalls`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("recall:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      {/* Ligne 1 : Source / Fournisseur / Date */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="w-full mobile:w-56">
          <label className="text-sm font-medium">Source</label>
          <select
            {...register("source")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="supplier">Fournisseur</option>
            <option value="authority">Autorité</option>
            <option value="internal">Interne</option>
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="text-sm font-medium">Fournisseur</label>
          <input
            type="text"
            {...register("supplierName")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="w-full mobile:w-72">
          <label className="text-sm font-medium">Déclaré le *</label>
          <input
            type="datetime-local"
            {...register("initiatedAt", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.initiatedAt && (
            <p className="text-xs text-red mt-1">
              {errors.initiatedAt.message}
            </p>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Produits retournés</h3>
          <button
            type="button"
            onClick={() =>
              append({
                inventoryLotId: "",
                inventoryLotDisplay: "",
                lotMaxRemaining: "",
                lotBaseUnit: "",
                productName: "",
                lotNumber: "",
                quantity: "",
                unit: "",
                bestBefore: "",
                note: "",
              })
            }
            className="px-3 py-1 rounded bg-blue text-white"
          >
            Ajouter un produit
          </button>
        </div>

        {fields.map((f, idx) => {
          const baseUnit = watch(`items.${idx}.lotBaseUnit`) || "";
          const unitOpts = allowedUnitsForLotUnit(baseUnit);
          const curUnit = watch(`items.${idx}.unit`) || baseUnit || "";
          const safeUnit = baseUnit
            ? unitOpts.includes(curUnit)
              ? curUnit
              : baseUnit
            : curUnit || "";

          if (safeUnit !== curUnit) {
            setTimeout(() => {
              setValue(`items.${idx}.unit`, safeUnit, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }, 0);
          }

          const allowed = allowedMaxForRow(idx);

          return (
            <div key={f.id} className="border rounded p-3 flex flex-col gap-3">
              {/* Sélection du lot (autocomplete) */}
              <div className="w-full mobile:w-[420px]">
                <label className="text-sm font-medium">Lot d’inventaire</label>
                <div className="relative">
                  <input
                    type="text"
                    {...register(`items.${idx}.inventoryLotDisplay`)}
                    onFocus={() => onLotFocus(idx)}
                    onBlur={() => onLotBlur(idx)}
                    onChange={(e) => onLotInputChange(idx, e.target.value)}
                    className={`w-full border rounded p-2 h-[44px] pr-8 ${
                      lotInvalid(idx) ||
                      errors?.items?.[idx]?.inventoryLotDisplay
                        ? "border-red ring-1 ring-red"
                        : ""
                    }`}
                    placeholder="Rechercher produit…"
                  />
                  {(watch(`items.${idx}.inventoryLotDisplay`) || "") && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => clearPickedLot(idx)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/30 text-white rounded-full flex items-center justify-center"
                      title="Effacer"
                    >
                      &times;
                    </button>
                  )}
                  {lotDropdownOpen[idx] &&
                    (watch(`items.${idx}.inventoryLotDisplay`) || "").trim() !==
                      "" && (
                      <ul
                        className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow max-h-56 overflow-auto"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {(lotOptions[idx] || []).length === 0 && (
                          <li className="px-3 py-2 text-sm opacity-70 italic">
                            Aucun résultat
                          </li>
                        )}
                        {(lotOptions[idx] || []).map((lot) => (
                          <li
                            key={lot._id}
                            onClick={() => pickLot(idx, lot)}
                            className="px-3 py-[8px] cursor-pointer hover:bg-lightGrey"
                          >
                            <div className="font-medium">{lot.productName}</div>
                            <div className="text-xs opacity-70">
                              Lot: {lot.lotNumber || "—"} •{" "}
                              {lot.qtyRemaining ?? "?"} {lot.unit || ""} •{" "}
                              {lot.supplier || "—"}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
                <input
                  type="hidden"
                  {...register(`items.${idx}.inventoryLotId`)}
                />
                <input
                  type="hidden"
                  {...register(`items.${idx}.lotMaxRemaining`)}
                />
                <input
                  type="hidden"
                  {...register(`items.${idx}.lotBaseUnit`)}
                />
                {(lotInvalid(idx) ||
                  errors?.items?.[idx]?.inventoryLotDisplay) && (
                  <p className="text-xs text-red mt-1">
                    {errors?.items?.[idx]?.inventoryLotDisplay?.message ||
                      "Veuillez sélectionner un lot dans la liste"}
                  </p>
                )}
              </div>

              <div className="flex gap-3 midTablet:flex-row flex-col">
                <div className="flex-1">
                  <label className="text-sm font-medium">Produit *</label>
                  <input
                    type="text"
                    {...register(`items.${idx}.productName`, {
                      required: "Requis",
                    })}
                    className="border rounded p-2 h-[44px] w-full"
                    placeholder="Ex: Poulet émincé"
                  />
                  {errors.items?.[idx]?.productName && (
                    <p className="text-xs text-red mt-1">
                      {errors.items[idx].productName.message}
                    </p>
                  )}
                </div>
                <div className="w-full mobile:w-56">
                  <label className="text-sm font-medium">Lot</label>
                  <input
                    type="text"
                    {...register(`items.${idx}.lotNumber`)}
                    className="border rounded p-2 h-[44px] w-full"
                  />
                </div>
                <div className="w-full mobile:w-40">
                  <label className="text-sm font-medium">Quantité</label>
                  <input
                    type="number"
                    step="any"
                    max={allowed != null ? allowed : undefined}
                    {...register(`items.${idx}.quantity`, {
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
                        setValue(`items.${idx}.quantity`, String(a), {
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
                  {errors.items?.[idx]?.quantity && (
                    <p className="text-xs text-red mt-1">
                      {errors.items[idx].quantity.message}
                    </p>
                  )}
                </div>
                <div className="w-full mobile:w-40">
                  <label className="text-sm font-medium">Unité</label>
                  <select
                    value={safeUnit}
                    onChange={(e) =>
                      setValue(`items.${idx}.unit`, e.target.value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    className="border rounded p-2 h-[44px] w-full"
                    disabled={baseUnit ? unitOpts.length === 1 : false}
                  >
                    {(baseUnit ? unitOpts : ALL_UNITS).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-full mobile:w-48">
                  <label className="text-sm font-medium">DLC/DDM</label>
                  <input
                    type="date"
                    {...register(`items.${idx}.bestBefore`)}
                    className="border rounded p-2 h-[44px] w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Note</label>
                <input
                  type="text"
                  {...register(`items.${idx}.note`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
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

      {/* Actions / pièces */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1">
          <label className="text-sm font-medium">Actions menées</label>
          <textarea
            rows={4}
            {...register("actionsTaken")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">
            Pièces (URLs, 1 par ligne)
          </label>
          <textarea
            rows={4}
            {...register("attachmentsText")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
            placeholder={"https://…/bon-retour.pdf\nhttps://…/photos.jpg"}
          />
        </div>
      </div>

      {/* Clôture */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <input id="closed" type="checkbox" {...register("closed")} />
          <label htmlFor="closed" className="text-sm font-medium">
            Clôturé
          </label>
        </div>
        <div className="w-72">
          <label className="text-sm font-medium">Clôturé le</label>
          <input
            type="datetime-local"
            {...register("closedAt")}
            className="border rounded p-2 h-[44px] w-full"
            disabled={!watch("closed")}
          />
        </div>
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
              reset(buildDefaults(null));
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
