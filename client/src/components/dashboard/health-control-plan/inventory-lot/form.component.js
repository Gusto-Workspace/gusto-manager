// app/(components)/inventory/InventoryLotForm.jsx
"use client";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  CalendarDays,
  Hash,
  Package as PackageIcon,
  Thermometer,
  ChevronDown,
  Loader2,
  FileText,
} from "lucide-react";

/* ------- Utils ------- */
const cToF = (c) => (c * 9) / 5 + 32;
const fToC = (f) => ((f - 32) * 5) / 9;
const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : n);

function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function buildFormDefaults(record) {
  return {
    receptionId: (() => {
      const raw = record?.receptionId;
      if (!raw) return "";
      if (typeof raw === "string") return raw;
      if (typeof raw === "object" && raw !== null) return raw._id || "";
      return "";
    })(),

    // lot
    productName: record?.productName ?? "",
    supplier: record?.supplier ?? "",
    lotNumber: record?.lotNumber ?? "",
    dlc: toDateValue(record?.dlc),
    ddm: toDateValue(record?.ddm),
    allergens: Array.isArray(record?.allergens)
      ? record.allergens.join(", ")
      : "",

    qtyReceived:
      record?.qtyReceived !== undefined && record?.qtyReceived !== null
        ? String(record.qtyReceived)
        : "",
    qtyRemaining:
      record?.qtyRemaining !== undefined && record?.qtyRemaining !== null
        ? String(record.qtyRemaining)
        : "",
    unit: record?.unit ?? "",

    tempOnArrival:
      record?.tempOnArrival !== undefined && record?.tempOnArrival !== null
        ? String(record.tempOnArrival)
        : "",
    tempOnArrivalUnit: record?.tempOnArrivalUnit === "F" ? "F" : "C",

    packagingCondition: record?.packagingCondition ?? "compliant",

    storageArea: record?.storageArea ?? "",
    openedAt: toDateValue(record?.openedAt),
    internalUseBy: toDateValue(record?.internalUseBy),

    status: record?.status ?? "in_stock",
    disposalReason: record?.disposalReason ?? "",

    labelCode: record?.labelCode ?? "",
    notes: record?.notes ?? "",
  };
}

function formatReceptionLabel(r) {
  if (!r) return "Réception enregistrée";
  let dateLabel = "Date inconnue";
  if (r.receivedAt) {
    const date = new Date(r.receivedAt);
    if (!Number.isNaN(date.getTime())) dateLabel = date.toLocaleString();
  }
  const supplierInfo = r.supplier ? ` • ${r.supplier}` : "";
  return `${dateLabel}${supplierInfo}`;
}

function formatLineOptionLabel(line) {
  const name = line?.productName || "Produit";
  const lot = line?.lotNumber ? ` • lot ${line.lotNumber}` : "";
  const qty =
    line?.qty != null && line?.unit
      ? ` • ${line.qty} ${line.unit}`
      : line?.qty != null
      ? ` • ${line.qty}`
      : "";
  return `${name}${lot}${qty}`;
}

function lineKey(line, idx) {
  const n = String(line?.productName || "");
  const l = String(line?.lotNumber || "");
  const u = String(line?.unit || "");
  const q = String(line?.qty ?? "");
  return `${n}::${l}::${u}::${q}::${idx}`;
}

export default function InventoryLotForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  // ---- Styles
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm px-3 py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectBase =
    "h-11 w-full appearance-none rounded-lg border bg-white px-3 text-[15px] outline-none transition";
  const selectChevron =
    "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40";
  const btnPrimary =
    "text-nowrap inline-flex items-center justify-center gap-2 h-[38px] rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60";
  const btnSecondary =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-red bg-white px-4 py-2 text-sm font-medium text-red";
  const errCls = "border-red ring-1 ring-red/30";
  const okBorder = "border-darkBlue/20";

  // ---- Réceptions
  const [receptions, setReceptions] = useState([]);
  const [receptionsLoading, setReceptionsLoading] = useState(false);
  const [receptionsError, setReceptionsError] = useState(false);

  const [selectedReception, setSelectedReception] = useState(null);
  const [productOptions, setProductOptions] = useState([]); // [{key, line}]
  const [selectedProductKey, setSelectedProductKey] = useState("");

  const notesVal = watch("notes");
  const packCond = watch("packagingCondition"); // "compliant" | "non-compliant"
  const statusWatch = watch("status");
  const qtyReceivedWatch = watch("qtyReceived");
  const unitWatch = watch("unit");
  const receptionIdWatch = watch("receptionId");
  const tempUnitWatch = watch("tempOnArrivalUnit") === "F" ? "F" : "C";

  const isEditing = !!initial?._id;
  const hasSelectedProduct = !!(selectedReception && selectedProductKey);
  const showCombinedQty = isEditing || hasSelectedProduct;

  // Quand un produit est sélectionné -> on lock les champs préremplis
  const isPrefilledLock = hasSelectedProduct;

  const isMounted = useRef(true);
  useEffect(
    () => () => {
      isMounted.current = false;
    },
    []
  );

  // Reset si "initial" change
  useEffect(() => {
    reset(buildFormDefaults(initial));
    setSelectedReception(null);
    setProductOptions([]);
    setSelectedProductKey("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // Charger la liste des réceptions
  useEffect(() => {
    if (!restaurantId) {
      setReceptions([]);
      return;
    }
    let cancelled = false;
    const loadReceptions = async () => {
      setReceptionsLoading(true);
      setReceptionsError(false);
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          if (!cancelled) {
            setReceptions([]);
            setReceptionsLoading(false);
          }
          return;
        }
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-reception-deliveries`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: 100 },
        });
        if (!cancelled) {
          const items = Array.isArray(data?.items) ? data.items : [];
          setReceptions(items);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setReceptions([]);
          setReceptionsError(true);
        }
      } finally {
        if (!cancelled) setReceptionsLoading(false);
      }
    };
    loadReceptions();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  // Options de réception triées
  const receptionOptions = useMemo(() => {
    const list = Array.isArray(receptions) ? [...receptions] : [];
    const initialReception =
      initial && typeof initial.receptionId === "object" && initial.receptionId
        ? initial.receptionId
        : null;
    if (initialReception && initialReception._id) {
      const hasInitial = list.some(
        (it) => String(it?._id) === String(initialReception._id)
      );
      if (!hasInitial) list.push(initialReception);
    }
    const seen = new Set();
    const uniq = [];
    for (const r of list) {
      if (!r || !r._id) continue;
      const k = String(r._id);
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(r);
    }
    return uniq.sort((a, b) => {
      const ta = a?.receivedAt ? new Date(a.receivedAt).getTime() : 0;
      const tb = b?.receivedAt ? new Date(b.receivedAt).getTime() : 0;
      return tb - ta;
    });
  }, [receptions, initial]);

  // Charger le détail d'une réception + options produit
  const fetchReception = useCallback(
    async (receptionId) => {
      if (!receptionId) {
        setSelectedReception(null);
        setProductOptions([]);
        setSelectedProductKey("");
        return;
      }
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setSelectedReception(null);
          setProductOptions([]);
          setSelectedProductKey("");
          return;
        }
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reception-deliveries/${receptionId}`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const lines = Array.isArray(data?.lines) ? data.lines : [];
        const sorted = [...lines].sort((a, b) => {
          const A = String(a?.productName || "");
          const B = String(b?.productName || "");
          return A.localeCompare(B, "fr", { sensitivity: "base" });
        });
        const opts = sorted.map((ln, i) => ({ key: lineKey(ln, i), line: ln }));
        setSelectedReception(data);
        setProductOptions(opts);
        setSelectedProductKey("");
      } catch (e) {
        console.error("fetch reception:", e);
        setSelectedReception(null);
        setProductOptions([]);
        setSelectedProductKey("");
      }
    },
    [restaurantId]
  );

  useEffect(() => {
    fetchReception(receptionIdWatch);
  }, [receptionIdWatch, fetchReception]);

  // Pré-remplir depuis une ligne de réception (inclut l'unité de T°)
  function prefillFromReceptionLine(line, reception) {
    if (!line) return;
    const r = reception || selectedReception || {};
    setValue("productName", line.productName || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("supplier", r.supplier || "", { shouldDirty: true });
    setValue("lotNumber", line.lotNumber || "", { shouldDirty: true });
    setValue("dlc", toDateValue(line.dlc), { shouldDirty: true });
    setValue("ddm", toDateValue(line.ddm), { shouldDirty: true });

    if (line.qty != null) {
      setValue("qtyReceived", String(line.qty), {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      setValue("qtyReceived", "", { shouldDirty: true });
    }
    setValue("unit", line.unit || "", {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (line.tempOnArrival != null) {
      setValue("tempOnArrival", String(line.tempOnArrival), {
        shouldDirty: true,
      });
    } else {
      setValue("tempOnArrival", "", { shouldDirty: true });
    }
    setValue("tempOnArrivalUnit", line?.tempOnArrivalUnit === "F" ? "F" : "C", {
      shouldDirty: true,
    });

    if (Array.isArray(line.allergens) && line.allergens.length) {
      setValue("allergens", line.allergens.join(", "), { shouldDirty: true });
    } else {
      setValue("allergens", "", { shouldDirty: true });
    }
    if (line.packagingCondition) {
      setValue("packagingCondition", line.packagingCondition, {
        shouldDirty: true,
      });
    }
  }

  // Toggle °C/°F (avec conversion si valeur numérique présente)
  const toggleTempUnit = () => {
    const curU = tempUnitWatch; // "C" | "F"
    const nextU = curU === "C" ? "F" : "C";
    const raw = Number(watch("tempOnArrival"));
    if (Number.isFinite(raw)) {
      const converted = curU === "C" ? cToF(raw) : fToC(raw);
      setValue("tempOnArrival", String(round1(converted)), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    setValue("tempOnArrivalUnit", nextU, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  // Soumission
  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      receptionId: data.receptionId || undefined,

      productName: data.productName || undefined,
      supplier: data.supplier || undefined,
      lotNumber: data.lotNumber || undefined,

      dlc: data.dlc ? new Date(data.dlc) : undefined,
      ddm: data.ddm ? new Date(data.ddm) : undefined,
      allergens:
        typeof data.allergens === "string" && data.allergens.trim().length
          ? data.allergens
              .split(/[;,]/g)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],

      qtyReceived:
        data.qtyReceived !== "" && data.qtyReceived != null
          ? Number(String(data.qtyReceived).replace(",", "."))
          : undefined,

      // Qté restante: même unité que "Quantité" (pas de conversion)
      qtyRemaining:
        initial?._id && data.qtyRemaining !== "" && data.qtyRemaining != null
          ? Number(String(data.qtyRemaining).replace(",", "."))
          : undefined,

      unit: data.unit || undefined,

      tempOnArrival:
        data.tempOnArrival !== "" && data.tempOnArrival != null
          ? Number(String(data.tempOnArrival).replace(",", "."))
          : undefined,
      tempOnArrivalUnit: data.tempOnArrivalUnit === "F" ? "F" : "C",

      packagingCondition: data.packagingCondition || "compliant",
      storageArea: data.storageArea || undefined,

      openedAt: data.openedAt ? new Date(data.openedAt) : undefined,
      internalUseBy: data.internalUseBy
        ? new Date(data.internalUseBy)
        : undefined,

      status: data.status || "in_stock",
      disposalReason:
        data.disposalReason && data.disposalReason.trim().length
          ? data.disposalReason
          : undefined,

      labelCode: data.labelCode || undefined,
      notes: data.notes || undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/inventory-lots/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/inventory-lots`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    reset(buildFormDefaults(null));
    setSelectedReception(null);
    setProductOptions([]);
    setSelectedProductKey("");
    onSuccess?.(saved);
  };

  const isCompliant = (packCond || "compliant") !== "non-compliant";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Réception associée */}
      <div className="grid grid-cols-1 gap-2">
        <div className={fieldWrap}>
          <label className={labelCls}>Réception associée</label>
          <div className="relative">
            <select
              {...register("receptionId")}
              className={`${selectBase} ${okBorder}`}
            >
              <option value="">
                {receptionsLoading ? "Chargement…" : "Aucune réception liée"}
              </option>
              {receptionOptions.map((reception) => (
                <option key={reception._id} value={String(reception._id)}>
                  {formatReceptionLabel(reception)}
                </option>
              ))}
            </select>
            <ChevronDown className={selectChevron} />
          </div>
          {receptionsError && (
            <p className="mt-1 text-xs text-red">
              Erreur lors du chargement des réceptions.
            </p>
          )}
        </div>
      </div>

      {/* Produit & Fournisseur */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <PackageIcon className="size-4" />
            Produit *
          </label>

          {!selectedReception ? (
            <input
              type="text"
              placeholder="Désignation"
              {...register("productName", { required: true })}
              className={`${inputCls} ${errors.productName ? errCls : okBorder}`}
              autoComplete="off"
              spellCheck={false}
              autoCorrect="off"
            />
          ) : (
            <>
              <div className="relative">
                <select
                  value={selectedProductKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    setSelectedProductKey(key);
                    const opt = productOptions.find((o) => o.key === key);
                    if (opt)
                      prefillFromReceptionLine(opt.line, selectedReception);
                    setValue("productName", opt?.line?.productName || "", {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                  className={`${selectBase} ${errors.productName ? errCls : okBorder}`}
                >
                  <option value="">Choisir un produit…</option>
                  {productOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {formatLineOptionLabel(opt.line)}
                    </option>
                  ))}
                </select>
                <ChevronDown className={selectChevron} />
              </div>
              {/* contrainte "required" via hidden */}
              <input
                type="hidden"
                {...register("productName", { required: true })}
              />
            </>
          )}
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Fournisseur</label>
          <input
            type="text"
            placeholder="Nom du fournisseur"
            {...register("supplier")}
            className={`${inputCls} ${okBorder} ${
              isPrefilledLock ? "opacity-60 pointer-events-none" : ""
            }`}
            readOnly={isPrefilledLock}
            aria-readonly={isPrefilledLock}
            tabIndex={isPrefilledLock ? -1 : undefined}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Traçabilité */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Hash className="size-4" />
            N° lot *
          </label>
          <input
            type="text"
            placeholder="Lot"
            {...register("lotNumber", { required: true })}
            className={`${inputCls} ${
              errors.lotNumber ? errCls : okBorder
            } ${isPrefilledLock ? "opacity-60 pointer-events-none" : ""}`}
            readOnly={isPrefilledLock}
            aria-readonly={isPrefilledLock}
            tabIndex={isPrefilledLock ? -1 : undefined}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarDays className="size-4" />
            DLC
          </label>
          <input
            type="date"
            {...register("dlc")}
            className={`${selectBase} ${okBorder} ${
              isPrefilledLock ? "opacity-60 pointer-events-none" : ""
            }`}
            aria-disabled={isPrefilledLock}
            tabIndex={isPrefilledLock ? -1 : undefined}
            onFocus={(e) => {
              if (isPrefilledLock) e.target.blur();
            }}
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarDays className="size-4" />
            DDM
          </label>
          <input
            type="date"
            {...register("ddm")}
            className={`${selectBase} ${okBorder} ${
              isPrefilledLock ? "opacity-60 pointer-events-none" : ""
            }`}
            aria-disabled={isPrefilledLock}
            tabIndex={isPrefilledLock ? -1 : undefined}
            onFocus={(e) => {
              if (isPrefilledLock) e.target.blur();
            }}
          />
        </div>
      </div>

      {/* Quantités */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>Quantité *</label>

          {showCombinedQty ? (
            <>
              {/* combiné en lecture seule */}
              <input
                type="text"
                readOnly
                value={`${qtyReceivedWatch || ""}${
                  unitWatch ? ` ${unitWatch}` : ""
                }`}
                className={`${inputCls} ${okBorder} opacity-80`}
                title={
                  isEditing
                    ? "Non modifiable en édition"
                    : "Prérempli depuis la réception"
                }
              />
              {/* cachés */}
              <input type="hidden" {...register("qtyReceived")} />
              <input type="hidden" {...register("unit")} />
            </>
          ) : (
            <input
              type="number"
              step="0.001"
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="ex: 5"
              {...register("qtyReceived", {
                validate: (v) => v !== "" && v != null, // requis seulement si pas combiné
              })}
              className={`${inputCls} ${errors.qtyReceived ? errCls : okBorder}`}
            />
          )}
        </div>

        {/* Unité (masquée si combiné) */}
        {!showCombinedQty ? (
          <div className={fieldWrap}>
            <label className={labelCls}>Unité *</label>
            <div className="relative">
              <select
                {...register("unit", {
                  validate: (v) => !!v, // requis seulement si pas combiné
                })}
                className={`${selectBase} ${errors.unit ? errCls : okBorder}`}
              >
                <option value="">—</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
                <option value="mL">mL</option>
                <option value="unit">unité</option>
              </select>
              <ChevronDown className={selectChevron} />
            </div>
          </div>
        ) : (
          <div className="h-0 midTablet:h-[80px]" />
        )}

        {/* Qté restante (édition) — même unité que "Quantité" */}
        {isEditing ? (
          <div className={fieldWrap}>
            <label className={labelCls}>Qté restante</label>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="ex: 3"
                {...register("qtyRemaining")}
                className={`${inputCls} ${okBorder} pr-6 text-right`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-darkBlue/50">
                {unitWatch || "—"}
              </span>
            </div>
            
          </div>
        ) : (
          <div className="h-0 midTablet:h-[80px]" />
        )}
      </div>

      {/* Conditions & Allergènes & Toggle emballage */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Thermometer className="size-4" />
            T° à l’arrivée
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              placeholder="ex: 4.5"
              onWheel={(e) => e.currentTarget.blur()}
              {...register("tempOnArrival")}
              className={`${inputCls} ${okBorder} pr-8 text-right ${
                isPrefilledLock ? "opacity-60 pointer-events-none" : ""
              }`}
              readOnly={isPrefilledLock}
              aria-readonly={isPrefilledLock}
              tabIndex={isPrefilledLock ? -1 : undefined}
            />
            {/* Toggle °C/°F au clic */}
            <button
              type="button"
              onClick={toggleTempUnit}
              className={`absolute right-3 top-1/2 -translate-y-1/2 select-none rounded-md bg-darkBlue/10 px-2 py-1 text-xs text-darkBlue/60 hover:bg-darkBlue/15 ${
                isPrefilledLock ? "opacity-50 pointer-events-none" : ""
              }`}
              aria-disabled={isPrefilledLock}
              tabIndex={isPrefilledLock ? -1 : undefined}
              title="Changer l’unité"
            >
              {tempUnitWatch === "F" ? "°F" : "°C"}
            </button>
            {/* champ caché pour soumettre l’unité */}
            <input type="hidden" {...register("tempOnArrivalUnit")} />
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Allergènes</label>
          <input
            type="text"
            placeholder="séparés par virgules (ex: gluten, lait)"
            {...register("allergens")}
            className={`${inputCls} ${okBorder} ${
              isPrefilledLock ? "opacity-60 pointer-events-none" : ""
            }`}
            readOnly={isPrefilledLock}
            aria-readonly={isPrefilledLock}
            tabIndex={isPrefilledLock ? -1 : undefined}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        {/* Switch Emballage */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <PackageIcon className="size-4" />
            Emballage
          </label>

          <label
            role="switch"
            aria-checked={isCompliant}
            className={`group inline-flex justify-between h-11 w-full items-center gap-3 rounded-xl border border-darkBlue/20 bg-white px-3 py-2 select-none ${
              isPrefilledLock ? "opacity-60 pointer-events-none" : "cursor-pointer"
            }`}
          >
            <span className="text-sm text-darkBlue/70">
              {isCompliant ? "Conforme" : "Non conforme"}
            </span>

            <input
              type="checkbox"
              className="sr-only"
              checked={isCompliant}
              tabIndex={isPrefilledLock ? -1 : undefined}
              onChange={(e) => {
                if (isPrefilledLock) return;
                setValue(
                  "packagingCondition",
                  e.target.checked ? "compliant" : "non-compliant",
                  { shouldDirty: true }
                );
              }}
            />

            <span className="relative inline-flex h-6 w-11 items-center rounded-full bg-darkBlue/20 transition-colors group-aria-checked:bg-darkBlue/80">
              <span className="absolute left-1 top-1/2 -translate-y-1/2 size-4 rounded-full bg-white shadow transition-transform will-change-transform translate-x-0 group-aria-checked:translate-x-5" />
            </span>
          </label>
        </div>
      </div>

      {/* Stockage & dates d’ouverture */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>Zone de stockage</label>
          <input
            type="text"
            placeholder="ex: fridge-1, dry, freezer-2"
            {...register("storageArea")}
            className={`${inputCls} ${okBorder}`}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarDays className="size-4" />
            Ouvert le
          </label>
          <input
            type="date"
            {...register("openedAt")}
            className={`${selectBase} ${okBorder}`}
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarDays className="size-4" />
            DLU après ouverture
          </label>
          <input
            type="date"
            {...register("internalUseBy")}
            className={`${selectBase} ${okBorder}`}
          />
        </div>
      </div>

      {/* Statut & Motif */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>Statut</label>
          <div className="relative">
            <select
              {...register("status")}
              className={`${selectBase} ${okBorder}`}
            >
              <option value="in_stock">En stock</option>
              <option value="used">Utilisé</option>
              <option value="expired">Périmé</option>
              <option value="discarded">Jeté</option>
              <option value="returned">Retourné</option>
              <option value="recalled">Rappel</option>
            </select>
            <ChevronDown className={selectChevron} />
          </div>
        </div>

        <div className={`${fieldWrap} midTablet:col-span-2`}>
          <label className={labelCls}>Motif (si jeté/retourné/rappel)</label>
          <input
            type="text"
            placeholder="motif"
            {...register("disposalReason")}
            className={`${inputCls} ${okBorder}`}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
          {["discarded", "returned", "recalled"].includes(statusWatch) && (
            <p className="mt-1 text-xs text-darkBlue/60">
              Recommandé : renseigner le motif lorsque le statut est{" "}
              {statusWatch}.
            </p>
          )}
        </div>
      </div>

      {/* Code étiquette & Notes */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>Code étiquette</label>
          <input
            type="text"
            placeholder="ex: QR-ABC123"
            {...register("labelCode")}
            className={`${inputCls} ${okBorder}`}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <FileText className="size-4" />
            Notes
          </label>
          <div className="relative">
            <textarea
              rows={1}
              {...register("notes")}
              className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40"
              placeholder="Observations, info d’étiquette interne…"
            />
            <span className="pointer-events-none absolute bottom-2 right-3 select-none text-[11px] text-darkBlue/40">
              {(notesVal?.length ?? 0).toString()}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-3 mobile:flex-row">
        <button type="submit" disabled={isSubmitting} className={btnPrimary}>
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
              setSelectedReception(null);
              setProductOptions([]);
              setSelectedProductKey("");
              onCancel?.();
            }}
            className={btnSecondary}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
