// app/(components)/haccp/recall/RecallForm.jsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
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
// ✨ alignement arrondi côté front avec le serveur
function decimalsForUnit(u) {
  return String(u || "").trim() === "unit" ? 0 : 3;
}
function roundByUnit(val, unit) {
  const n = Number(val);
  if (!Number.isFinite(n)) return n;
  const f = Math.pow(10, decimalsForUnit(unit));
  return Math.round(n * f) / f;
}

function buildDefaults(rec) {
  const it = rec?.item || {};
  return {
    initiatedAt: toDatetimeLocal(rec?.initiatedAt ?? new Date()),
    actionsTaken: rec?.actionsTaken ?? "",
    attachmentsText: Array.isArray(rec?.attachments)
      ? rec.attachments.join("\n")
      : "",
    closed: !!rec?.closedAt,
    closedAt: toDatetimeLocal(rec?.closedAt),

    // champs produit (un seul)
    inventoryLotId: it?.inventoryLotId ? String(it.inventoryLotId) : "",
    productSearch: it?.productName ?? "", // préremplir à l’édition
    lotMaxRemaining: "", // hydraté après fetch du lot
    lotBaseUnit: it?.unit ?? "",

    productName: it?.productName ?? "",
    supplierName: it?.supplierName ?? "",
    lotNumber: it?.lotNumber ?? "",
    quantity:
      it?.quantity !== undefined && it?.quantity !== null
        ? String(it.quantity)
        : "",
    unit: it?.unit ?? "",
    bestBefore: toDateValue(it?.bestBefore),
    note: it?.note ?? "",
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
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults(initial) });

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

  /* ---------- Autocomplete via input Produit ---------- */
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const searchTimer = useRef(null);

  async function fetchLots(query) {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recalls/select/inventory-lots`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { q: query || "", limit: 12, status: "in_stock" },
      });
      setOptions(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      console.error("fetch lot options:", e);
      setOptions([]);
    }
  }

  function onProductInputChange(val) {
    setValue("productSearch", val, { shouldDirty: true });
    setValue("inventoryLotId", "", { shouldDirty: true, shouldValidate: true });
    setValue("lotMaxRemaining", "", { shouldDirty: true });
    setValue("lotBaseUnit", "", { shouldDirty: true });
    setDropdownOpen(true);

    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchLots(val), 250);
  }

  function onProductFocus() {
    setDropdownOpen(true);
    fetchLots((getValues("productSearch") || "").trim());
  }

  function onProductBlur() {
    setTimeout(() => setDropdownOpen(false), 120);
    clearErrors(["productSearch", "inventoryLotId"]);
  }

  // Cap autorisé = stock restant du lot (converti dans l’unité choisie)
  function allowedMax() {
    const baseRemain = Number(getValues("lotMaxRemaining"));
    const lotBaseUnit = getValues("lotBaseUnit") || "";
    const rowUnit = getValues("unit") || lotBaseUnit;
    if (!Number.isFinite(baseRemain) || !lotBaseUnit || !rowUnit) return null;
    const baseInRowUnit = convertQty(baseRemain, lotBaseUnit, rowUnit);
    return baseInRowUnit == null
      ? null
      : roundByUnit(Math.max(0, baseInRowUnit), rowUnit);
  }

  function pickLot(lot) {
    // id + libellé
    setValue("inventoryLotId", lot?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("productSearch", lot?.productName || "", { shouldDirty: true });

    // champs liés
    setValue("productName", lot?.productName || "", { shouldDirty: true });
    setValue("supplierName", lot?.supplier || "", { shouldDirty: true });
    setValue("lotNumber", lot?.lotNumber || "", { shouldDirty: true });
    setValue("unit", lot?.unit || "", { shouldDirty: true });
    setValue("lotBaseUnit", lot?.unit ? String(lot.unit) : "", {
      shouldDirty: true,
    });

    const bb = lot?.dlc || lot?.ddm || "";
    setValue("bestBefore", toDateValue(bb), { shouldDirty: true });

    const lotMax = Number(lot?.qtyRemaining);
    setValue("lotMaxRemaining", Number.isFinite(lotMax) ? String(lotMax) : "", {
      shouldDirty: true,
    });

    // Si quantité vide → propose le restant (dans l’unité du lot)
    const curQ = (getValues("quantity") || "").trim();
    if (!curQ && Number.isFinite(lotMax)) {
      setValue("quantity", String(lotMax), {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      // sinon, laisse la quantité existante, juste clip si > max
      const a = allowedMax();
      const n = Number(curQ);
      if (a != null && Number.isFinite(n) && n > a) {
        setValue("quantity", String(a), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    }

    clearErrors(["productSearch", "inventoryLotId"]);
    setDropdownOpen(false);
  }

  function clearPickedLot() {
    // meta lot
    setValue("inventoryLotId", "", { shouldDirty: true, shouldValidate: true });
    setValue("lotMaxRemaining", "", { shouldDirty: true });
    setValue("lotBaseUnit", "", { shouldDirty: true });

    // champs “métier” liés au produit/lot
    setValue("productSearch", "", { shouldDirty: true, shouldValidate: true });
    setValue("productName", "", { shouldDirty: true, shouldValidate: true });
    setValue("supplierName", "", { shouldDirty: true });
    setValue("lotNumber", "", { shouldDirty: true });
    setValue("unit", "", { shouldDirty: true, shouldValidate: true });
    setValue("bestBefore", "", { shouldDirty: true });
    setValue("quantity", "", { shouldDirty: true, shouldValidate: true });

    setValue("note", "", { shouldDirty: true, shouldValidate: true });
    setValue("actionsTaken", "", { shouldDirty: true, shouldValidate: true });
    setValue("attachmentsText", "", {
      shouldDirty: true,
      shouldValidate: true,
    });

    // UI
    setDropdownOpen(false);
    clearErrors(["productSearch", "productName", "inventoryLotId", "quantity"]);
  }

  // Sécurité : si l’unité choisie n’est pas compatible avec le lot, on corrige
  const lotBaseUnit = watch("lotBaseUnit") || "";
  const unitOpts = allowedUnitsForLotUnit(lotBaseUnit);
  const curUnit = watch("unit") || lotBaseUnit || "";
  const safeUnit = lotBaseUnit
    ? unitOpts.includes(curUnit)
      ? curUnit
      : lotBaseUnit
    : curUnit || "";
  useEffect(() => {
    if (safeUnit !== curUnit) {
      setValue("unit", safeUnit, { shouldDirty: true, shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotBaseUnit, JSON.stringify(unitOpts), curUnit]);

  /* --- HYDRATATION : reconstituer le “max restant” réel uniquement si un lot est sélectionné actuellement --- */
  useEffect(() => {
    const curLotId = getValues("inventoryLotId"); // <- seulement la valeur du form
    if (!restaurantId || !token || !curLotId) return;

    let cancelled = false;
    (async () => {
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/inventory-lots/${curLotId}`;
        const { data: lot } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || !lot) return;

        // si on est en édition avec une qté déjà saisie, on reconstruit le “remain”
        const myQty = Number(initial?.item?.quantity);
        const myUnit = initial?.item?.unit || lot.unit;
        const addBack =
          Number.isFinite(myQty) && myUnit
            ? convertQty(myQty, myUnit, lot.unit)
            : 0;

        const effectiveRemain = roundByUnit(
          (Number(lot?.qtyRemaining) || 0) + (Number(addBack) || 0),
          lot.unit
        );

        setValue("lotMaxRemaining", String(effectiveRemain), {
          shouldDirty: false,
        });
        setValue("lotBaseUnit", lot?.unit ? String(lot.unit) : "", {
          shouldDirty: false,
        });

        // ne pré-remplir que si vide
        if (!(getValues("bestBefore") || "").trim()) {
          const bb = lot?.dlc || lot?.ddm || "";
          setValue("bestBefore", toDateValue(bb), { shouldDirty: false });
        }
        if (!(getValues("supplierName") || "").trim() && lot?.supplier) {
          setValue("supplierName", lot.supplier, { shouldDirty: false });
        }
      } catch (e) {
        console.error("hydrate lot on edit:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // dépendre de la valeur COURANTE (et non de initial.item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, token, watch("inventoryLotId")]);

  /* ---------- Submit ---------- */
  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // productName requis (champ caché + mirroring de productSearch)
    const pname =
      (data.productName || "").trim() || (data.productSearch || "").trim();
    if (!pname) {
      setError("productName", { type: "manual", message: "Requis" });
      return;
    }
    clearErrors("productName");

    // Si lot sélectionné : clip final
    const a = allowedMax();
    const n = Number(data.quantity);
    if (data.inventoryLotId && a != null && Number.isFinite(n) && n > a) {
      setError("quantity", {
        type: "manual",
        message: `Quantité > stock restant (${a} ${safeUnit || ""})`,
      });
      return;
    }

    const attachments =
      typeof data.attachmentsText === "string" &&
      data.attachmentsText.trim().length
        ? data.attachmentsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const payload = {
      initiatedAt: data.initiatedAt ? new Date(data.initiatedAt) : new Date(),
      item: {
        inventoryLotId: data.inventoryLotId || undefined,
        productName: pname,
        supplierName: data.supplierName || undefined,
        lotNumber: data.lotNumber || undefined,
        quantity:
          data.quantity !== "" && data.quantity != null
            ? Number(data.quantity)
            : undefined,
        unit: data.unit || undefined,
        bestBefore: data.bestBefore ? new Date(data.bestBefore) : undefined,
        note: data.note || undefined,
      },
      actionsTaken: data.actionsTaken || undefined,
      attachments,
      closedAt: data.closed
        ? data.closedAt
          ? new Date(data.closedAt)
          : new Date()
        : null,
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
      {/* 1) Déclaré le */}
      <div className="w-full mobile:w-72">
        <label className="text-sm font-medium">Déclaré le *</label>
        <input
          type="datetime-local"
          {...register("initiatedAt", { required: "Requis" })}
          className="border rounded p-2 h-[44px] w-full"
        />
        {errors.initiatedAt && (
          <p className="text-xs text-red mt-1">{errors.initiatedAt.message}</p>
        )}
      </div>

      {/* 2) Produit (autocomplete sur lots) */}
      <div className="w-full mobile:w-[520px]">
        <label className="text-sm font-medium">Produit *</label>
        <div className="relative">
          <input
            type="text"
            {...register("productSearch")}
            onFocus={onProductFocus}
            onBlur={onProductBlur}
            onChange={(e) => {
              onProductInputChange(e.target.value);
              // miroir -> productName pour la validation
              setValue("productName", e.target.value, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            className={`w-full border rounded p-2 h-[44px] pr-8 ${
              errors?.productName ? "border-red ring-1 ring-red" : ""
            }`}
            placeholder="Rechercher un produit/lot…"
          />
          {(watch("productSearch") || "") && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearPickedLot}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/30 text-white rounded-full flex items-center justify-center"
              title="Effacer"
            >
              &times;
            </button>
          )}
          {dropdownOpen && (watch("productSearch") || "").trim() !== "" && (
            <ul
              className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow max-h-56 overflow-auto"
              onMouseDown={(e) => e.preventDefault()}
            >
              {options.length === 0 && (
                <li className="px-3 py-2 text-sm opacity-70 italic">
                  Aucun résultat
                </li>
              )}
              {options.map((lot) => (
                <li
                  key={lot._id}
                  onClick={() => pickLot(lot)}
                  className="px-3 py-[8px] cursor-pointer hover:bg-lightGrey"
                >
                  <div className="font-medium">{lot.productName}</div>
                  <div className="text-xs opacity-70">
                    Lot: {lot.lotNumber || "—"} • {lot.qtyRemaining ?? "?"}{" "}
                    {lot.unit || ""} • {lot.supplier || "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          type="hidden"
          {...register("productName", { required: "Requis" })}
        />
        <input type="hidden" {...register("inventoryLotId")} />
        <input type="hidden" {...register("lotMaxRemaining")} />
        <input type="hidden" {...register("lotBaseUnit")} />
        {errors.productName && (
          <p className="text-xs text-red mt-1">{errors.productName.message}</p>
        )}
      </div>

      {/* 3) Fournisseur */}
      <div className="w-full mobile:w-[420px]">
        <label className="text-sm font-medium">Fournisseur</label>
        <input
          type="text"
          {...register("supplierName")}
          className="border rounded p-2 h-[44px] w-full"
          placeholder="Préf rempli s’il provient d’un lot"
        />
      </div>

      {/* 4) Lot / quantité / unité / DLC-DDM */}
      <div className="flex gap-3 midTablet:flex-row flex-col">
        <div className="w-full mobile:w-56">
          <label className="text-sm font-medium">N° lot</label>
          <input
            type="text"
            {...register("lotNumber")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="w-full mobile:w-40">
          <label className="text-sm font-medium">Quantité</label>
          <input
            type="number"
            step="any"
            max={allowedMax() != null ? allowedMax() : undefined}
            {...register("quantity", {
              validate: (val) => {
                if (val === "" || val == null) return true;
                const n = Number(val);
                if (!Number.isFinite(n) || n < 0) return "Valeur invalide";
                const a = allowedMax();
                if (a != null && n > a) return `Max autorisé: ${a}`;
                return true;
              },
            })}
            onBlur={(e) => {
              const a = allowedMax();
              const n = Number(e.target.value);
              if (a != null && Number.isFinite(n) && n > a) {
                setValue("quantity", String(a), {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }
            }}
            className="border rounded p-2 h-[44px] w-full"
          />
          {allowedMax() != null && (
            <div className="text-xs opacity-60 mt-1">
              Max restant : {allowedMax()} {safeUnit || ""}
            </div>
          )}
          {errors.quantity && (
            <p className="text-xs text-red mt-1">{errors.quantity.message}</p>
          )}
        </div>
        <div className="w-full mobile:w-40">
          <label className="text-sm font-medium">Unité</label>
          <select
            value={safeUnit}
            onChange={(e) =>
              setValue("unit", e.target.value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            className="border rounded p-2 h-[44px] w-full"
            disabled={lotBaseUnit ? unitOpts.length === 1 : false}
          >
            {(lotBaseUnit ? unitOpts : ALL_UNITS).map((u) => (
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
            {...register("bestBefore")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* 5) Note */}
      <div>
        <label className="text-sm font-medium">Note</label>
        <input
          type="text"
          {...register("note")}
          className="border rounded p-2 h-[44px] w-full"
        />
      </div>

      {/* 6) Actions / pièces */}
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

      {/* 7) Clôture */}
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
