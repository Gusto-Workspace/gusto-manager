"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";

// ICONS
import {
  CalendarClock,
  FileText,
  Link as LinkIcon,
  Package as PackageIcon,
  Tag,
  Hash,
  Building2,
  Search,
  Loader2,
  ShieldCheck,
  Camera,
  Upload,
  Trash2,
  Download,
  XCircle,
} from "lucide-react";

/* ---------- Utils dates ---------- */
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
function decimalsForUnit(u) {
  return String(u || "").trim() === "unit" ? 0 : 3;
}
function roundByUnit(val, unit) {
  const n = Number(val);
  if (!Number.isFinite(n)) return n;
  const f = Math.pow(10, decimalsForUnit(unit));
  return Math.round(n * f) / f;
}

/* ---------- Helpers fichiers (comme maintenance) ---------- */
function normalizeFilename(name) {
  if (!name) return "";
  try {
    if (typeof TextDecoder === "undefined") return name;
    const bytes = Uint8Array.from([...name].map((ch) => ch.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded;
  } catch {
    return name;
  }
}
function truncate(text, max = 26) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 3)}…` : text;
}
function mimeBadgeLabel(mimeOrName) {
  if (!mimeOrName) return "FILE";
  const lower = String(mimeOrName).toLowerCase();

  if (lower.includes("pdf")) return "PDF";
  if (lower.startsWith("image/")) {
    const sub = lower.split("/")[1] || "img";
    if (sub === "jpeg") return "JPG";
    return sub.slice(0, 4).toUpperCase();
  }
  if (lower.includes("word")) return "DOC";
  if (lower.includes("excel") || lower.includes("sheet")) return "XLS";
  if (lower.includes("zip")) return "ZIP";
  return lower.split("/")[1]?.slice(0, 4).toUpperCase() || "FILE";
}

/* ---------- Defaults ---------- */
function buildDefaults(rec) {
  const it = rec?.item || {};
  return {
    initiatedAt: toDatetimeLocal(rec?.initiatedAt ?? new Date()),
    actionsTaken: rec?.actionsTaken ?? "",
    closed: !!rec?.closedAt,
    closedAt: toDatetimeLocal(rec?.closedAt),

    // produit/lot
    inventoryLotId: it?.inventoryLotId ? String(it.inventoryLotId) : "",
    productSearch: it?.productName ?? "",
    lotMaxRemaining: "",
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

/* ---------- STYLES (alignés) ---------- */
const fieldWrap =
  "group relative rounded-xl bg-white/50 px-3 py-2 h-[80px] transition-shadow";
const labelCls =
  "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
const inputCls =
  "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
const selectCls =
  "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
const textareaCls =
  "w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] text-[15px] outline-none transition placeholder:text-darkBlue/40";
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98]";

/* ---------- Autocomplete config ---------- */
const MIN_CHARS = 1;
const DEBOUNCE_MS = 250;

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

  /* ---------- Pièces jointes Cloudinary ---------- */
  const [existingAttachments, setExistingAttachments] = useState(
    Array.isArray(initial?.attachments) ? initial.attachments : []
  );
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState([]);
  const [newFiles, setNewFiles] = useState([]);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    reset(buildDefaults(initial));
    setExistingAttachments(
      Array.isArray(initial?.attachments) ? initial.attachments : []
    );
    setRemovedAttachmentIds([]);
    setNewFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const downloadUrlForAttachment = (att) => {
    if (!att?.public_id) return att?.url || "#";
    const encodedPublicId = encodeURIComponent(att.public_id);
    return `${process.env.NEXT_PUBLIC_API_URL}/haccp/recalls/${restaurantId}/documents/${encodedPublicId}/download`;
  };

  const handleFilesSelected = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setNewFiles((prev) => [...prev, ...files]);
    event.target.value = "";
  };

  const removeNewFile = (index) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleExistingAttachmentRemoval = (public_id) => {
    setRemovedAttachmentIds((prev) => {
      const id = String(public_id);
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  };

  /* ---------- Auto date de clôture via switch ---------- */
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

  /* ---------- Autocomplete lots ---------- */
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchTimer = useRef(null);
  const reqCtrlRef = useRef(null);
  const lastQueryRef = useRef("");
  const cacheRef = useRef(new Map());

  async function fetchLots(query) {
    const q = (query || "").trim();
    lastQueryRef.current = q;

    if (cacheRef.current.has(q)) {
      setIsLoading(false);
      setOptions(cacheRef.current.get(q) || []);
      return;
    }

    try {
      if (reqCtrlRef.current) reqCtrlRef.current.abort();
      const ctrl = new AbortController();
      reqCtrlRef.current = ctrl;

      setIsLoading(true);

      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recalls/select/inventory-lots`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { q, limit: 12, status: "in_stock" },
        signal: ctrl.signal,
      });

      if (lastQueryRef.current !== q) return;

      const items = Array.isArray(data?.items) ? data.items : [];
      cacheRef.current.set(q, items);

      setOptions(items);
      setIsLoading(false);
    } catch (e) {
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return;
      console.error("fetch lot options:", e);
      cacheRef.current.set(q, []);
      setOptions([]);
      setIsLoading(false);
    }
  }

  function onProductInputChange(val) {
    const q = (val || "").trim();

    setValue("productSearch", val, { shouldDirty: true });
    setValue("productName", val, { shouldDirty: true, shouldValidate: true });
    setValue("inventoryLotId", "", { shouldDirty: true, shouldValidate: true });
    setValue("lotMaxRemaining", "", { shouldDirty: true });
    setValue("lotBaseUnit", "", { shouldDirty: true });

    const allowOpen = q.length >= MIN_CHARS;
    setDropdownOpen(allowOpen);

    clearTimeout(searchTimer.current);

    if (!allowOpen) {
      if (reqCtrlRef.current) reqCtrlRef.current.abort();
      setIsLoading(false);
      setOptions([]);
      return;
    }

    if (cacheRef.current.has(q)) {
      setIsLoading(false);
      setOptions(cacheRef.current.get(q) || []);
    } else {
      setIsLoading(true);
      setOptions([]);
    }

    searchTimer.current = setTimeout(() => fetchLots(q), DEBOUNCE_MS);
  }

  function onProductFocus() {
    const q = (getValues("productSearch") || "").trim();
    const allowOpen = q.length >= MIN_CHARS;
    setDropdownOpen(allowOpen);

    if (allowOpen) {
      if (cacheRef.current.has(q)) {
        setIsLoading(false);
        setOptions(cacheRef.current.get(q) || []);
      } else {
        setIsLoading(true);
        setOptions([]);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => fetchLots(q), 0);
      }
    }
  }

  function onProductBlur() {
    setTimeout(() => setDropdownOpen(false), 120);
    if (reqCtrlRef.current) reqCtrlRef.current.abort();
    clearErrors(["productSearch", "inventoryLotId"]);
  }

  // Cap autorisé = stock restant du lot (converti)
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
    setValue("inventoryLotId", lot?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("productSearch", lot?.productName || "", { shouldDirty: true });

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

    const curQ = (getValues("quantity") || "").trim();
    if (!curQ && Number.isFinite(lotMax)) {
      setValue("quantity", String(lotMax), {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
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
    setValue("inventoryLotId", "", { shouldDirty: true, shouldValidate: true });
    setValue("lotMaxRemaining", "", { shouldDirty: true });
    setValue("lotBaseUnit", "", { shouldDirty: true });

    setValue("productSearch", "", { shouldDirty: true, shouldValidate: true });
    setValue("productName", "", { shouldDirty: true, shouldValidate: true });
    setValue("supplierName", "", { shouldDirty: true });
    setValue("lotNumber", "", { shouldDirty: true });
    setValue("unit", "", { shouldDirty: true, shouldValidate: true });
    setValue("bestBefore", "", { shouldDirty: true });
    setValue("quantity", "", { shouldDirty: true, shouldValidate: true });

    setValue("note", "", { shouldDirty: true, shouldValidate: true });
    setValue("actionsTaken", "", { shouldDirty: true, shouldValidate: true });

    setOptions([]);
    setIsLoading(false);
    setDropdownOpen(false);
    if (reqCtrlRef.current) reqCtrlRef.current.abort();
    clearErrors(["productSearch", "productName", "inventoryLotId", "quantity"]);
  }

  // Sécurité unité
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

  /* --- HYDRAT LOT sur edit --- */
  useEffect(() => {
    const curLotId = getValues("inventoryLotId");
    if (!restaurantId || !token || !curLotId) return;

    let canceled = false;
    (async () => {
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/inventory-lots/${curLotId}`;
        const { data: lot } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (canceled || !lot) return;

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
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, token, watch("inventoryLotId")]);

  /* ---------- Submit (FormData + fichiers) ---------- */
  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const pname =
      (data.productName || "").trim() || (data.productSearch || "").trim();
    if (!pname) {
      setError("productName", { type: "manual" });
      return;
    }
    clearErrors("productName");

    const a = allowedMax();
    const n = Number(data.quantity);
    const safeUnitLocal = safeUnit;
    if (data.inventoryLotId && a != null && Number.isFinite(n) && n > a) {
      setError("quantity", {
        type: "manual",
        message: `Quantité > stock restant (${a} ${safeUnitLocal || ""})`,
      });
      return;
    }

    const formData = new FormData();

    // Champs racine
    formData.append(
      "initiatedAt",
      data.initiatedAt || new Date().toISOString()
    );
    if (data.actionsTaken) formData.append("actionsTaken", data.actionsTaken);

    if (data.closed) {
      formData.append(
        "closedAt",
        data.closedAt || new Date().toISOString()
      );
    } else {
      formData.append("closedAt", "");
    }

    // Item (JSON string)
    const itemPayload = {
      inventoryLotId: data.inventoryLotId || undefined,
      productName: pname,
      supplierName: data.supplierName || undefined,
      lotNumber: data.lotNumber || undefined,
      quantity:
        data.quantity !== "" && data.quantity != null
          ? Number(data.quantity)
          : undefined,
      unit: data.unit || undefined,
      bestBefore: data.bestBefore || undefined,
      note: data.note || undefined,
    };
    formData.append("item", JSON.stringify(itemPayload));

    // Pièces existantes gardées
    existingAttachments.forEach((att) => {
      if (
        att.public_id &&
        !removedAttachmentIds.includes(String(att.public_id))
      ) {
        formData.append("keepAttachments", att.public_id);
      }
    });

    // Nouveaux fichiers
    newFiles.forEach((file) => {
      formData.append("attachments", file);
    });

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recalls/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/recalls`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
    });

    window.dispatchEvent(
      new CustomEvent("recall:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    setExistingAttachments([]);
    setRemovedAttachmentIds([]);
    setNewFiles([]);
    onSuccess?.(saved);
  };

  /* ---------- Render ---------- */
  const productQ = (watch("productSearch") || "").trim();
  const hasSearch = productQ.length > 0;
  const hasCacheForQ = cacheRef.current.has(productQ);
  const shouldShowList =
    dropdownOpen &&
    productQ.length >= MIN_CHARS &&
    (isLoading || hasCacheForQ || options.length > 0);

  const notesVal = watch("actionsTaken") || "";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Déclaré le */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Déclaré le *
          </label>
          <input
            type="datetime-local"
            {...register("initiatedAt", { required: true })}
            className={`${selectCls} ${
              errors.initiatedAt ? "border-red focus:ring-red/20" : ""
            }`}
          />
        </div>
      </div>

      {/* Ligne 2 : Produit (autocomplete lots) */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} relative z-[50]`}>
          <label className={labelCls}>
            <PackageIcon className="size-4" /> Produit *
          </label>
          <div className="relative">
            <input
              type="text"
              {...register("productSearch")}
              onFocus={onProductFocus}
              onBlur={onProductBlur}
              autoComplete="off"
              spellCheck={false}
              autoCorrect="off"
              onChange={(e) => onProductInputChange(e.target.value)}
              className={`${inputCls} pr-10 ${
                errors?.productName ? "border-red ring-1 ring-red/30" : ""
              }`}
              placeholder="Rechercher un produit/lot…"
            />
            <Search
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 size-4 text-darkBlue/40 ${
                hasSearch ? "right-10" : "right-2"
              }`}
            />
            {hasSearch && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearPickedLot}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/30 text-white rounded-full grid place-items-center"
                title="Effacer"
              >
                &times;
              </button>
            )}

            {shouldShowList && (
              <ul
                className="absolute z-[60] left-0 right-0 mt-1 bg-white border border-darkBlue/20 rounded shadow-xl max-h-56 overflow-auto"
                onMouseDown={(e) => e.preventDefault()}
              >
                {isLoading ? (
                  <li className="px-3 py-2 text-sm flex items-center gap-2 text-darkBlue/70">
                    <Loader2 className="size-4 animate-spin" />
                    Recherche…
                  </li>
                ) : options.length === 0 && hasCacheForQ ? (
                  <li className="px-3 py-2 text-sm opacity-70 italic">
                    Aucun résultat
                  </li>
                ) : (
                  options.map((lot) => (
                    <li
                      key={lot._id}
                      onClick={() => pickLot(lot)}
                      className="px-3 py-[8px] cursor-pointer text-darkBlue/80 border-b border-b-darkBlue/10 last:border-none hover:bg-lightGrey"
                    >
                      <div className="font-medium">{lot.productName}</div>
                      <div className="text-xs opacity-70">
                        Lot: {lot.lotNumber || "—"} • {lot.qtyRemaining ?? "?"}{" "}
                        {lot.unit || ""} • {lot.supplier || "—"}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          <input
            type="hidden"
            {...register("productName", { required: true })}
          />
          <input type="hidden" {...register("inventoryLotId")} />
          <input type="hidden" {...register("lotMaxRemaining")} />
          <input type="hidden" {...register("lotBaseUnit")} />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Building2 className="size-4" /> Fournisseur
          </label>
          <input
            type="text"
            {...register("supplierName")}
            className={inputCls}
            placeholder="Prérempli si sélection d’un lot"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Ligne 3 : Lot / quantité / unité / DLC-DDM */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2 ultraWild:grid-cols-4">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <PackageIcon className="size-4" /> Quantité
          </label>
          <input
            type="number"
            step="any"
            onWheel={(e) => e.currentTarget.blur()}
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
            className={`${inputCls} ${
              errors.quantity ? "border-red focus:ring-red/20" : ""
            }`}
          />
          {allowedMax() != null && (
            <div className="text-xs opacity-60 mt-1">
              Max restant : {allowedMax()} {safeUnit || ""}
            </div>
          )}
          {errors.quantity?.message && (
            <p className="text-xs text-red mt-1">{errors.quantity.message}</p>
          )}
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Hash className="size-4" /> Unité
          </label>
          <div className="relative">
            <select
              value={safeUnit}
              onChange={(e) =>
                setValue("unit", e.target.value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              className={selectCls}
              disabled={lotBaseUnit ? unitOpts.length === 1 : false}
            >
              {(lotBaseUnit ? unitOpts : ALL_UNITS).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Tag className="size-4" /> N° lot
          </label>
          <input
            type="text"
            {...register("lotNumber")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> DLC/DDM
          </label>
          <input
            type="date"
            {...register("bestBefore")}
            className={selectCls}
          />
        </div>
      </div>

      {/* Ligne 4 : Note */}
      <div className="grid grid-cols-1">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <FileText className="size-4" /> Note
          </label>
          <input
            type="text"
            {...register("note")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Ligne 5 : Actions / Pièces jointes (fichiers) */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap.replace("h-[80px]", "h-auto")}>
          <label className={labelCls}>
            <FileText className="size-4" /> Actions menées
          </label>
          <textarea
            rows={7}
            {...register("actionsTaken")}
            className={textareaCls}
          />
          <span className="pointer-events-none absolute bottom-4 right-6 select-none text-[11px] text-darkBlue/40">
              {(notesVal?.length ?? 0).toString()}
          </span>
        </div>

        <div className={fieldWrap.replace("h-[80px]", "h-auto")}>
          <label className={labelCls}>
            <LinkIcon className="size-4" /> Pièces jointes (PDF, photos)
          </label>

          {/* Boutons d'action */}
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`${btnBase} border border-darkBlue/15 bg-white text-darkBlue/80 hover:border-darkBlue/40 hover:bg-darkBlue/[0.03]`}
            >
              <Upload className="size-4" />
              Importer un fichier
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className={`${btnBase} border border-blue/40 bg-blue/5 text-blue hover:border-blue/70 hover:bg-blue/10`}
            >
              <Camera className="size-4" />
              Prendre une photo
            </button>
          </div>

          {/* Inputs file cachés */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFilesSelected}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFilesSelected}
          />

          {/* Liste des pièces */}
          <div className="space-y-2 max-h-[135px] overflow-y-scroll">
            {/* Nouveaux fichiers */}
            {newFiles.length > 0 && (
              <div className="rounded-lg bg-blue/5 px-2 py-2">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-blue/80">
                  Fichiers à ajouter
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {newFiles.map((file, idx) => {
                    const prettyName = normalizeFilename(file.name);
                    const label = mimeBadgeLabel(file.type || file.name);
                    return (
                      <div
                        key={`${file.name}-${idx}`}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] text-blue-950 shadow-sm border border-blue/20"
                      >
                        <span className="flex h-6 w-8 items-center justify-center rounded-md bg-blue/5 text-[10px] font-semibold text-blue">
                          {label}
                        </span>
                        <span title={prettyName}>
                          {truncate(prettyName, 25)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeNewFile(idx)}
                          className="ml-1 inline-flex items-center justify-center rounded-full bg-red/10 p-[3px] text-red hover:bg-red/20"
                          title="Retirer"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pièces existantes (Cloudinary) */}
            {existingAttachments.length > 0 && (
              <div className="rounded-lg bg-darkBlue/[0.03] px-2 py-2">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-darkBlue/50">
                  Pièces déjà enregistrées
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {existingAttachments.map((att) => {
                    const prettyName = normalizeFilename(att.filename);
                    const label = mimeBadgeLabel(att.mimetype || att.filename);
                    const isMarked = removedAttachmentIds.includes(
                      String(att.public_id)
                    );

                    return (
                      <div
                        key={att.public_id}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] shadow-sm border ${
                          isMarked
                            ? "bg-red/5 border-red/40 text-red/70 opacity-70"
                            : "bg-white border-darkBlue/10 text-darkBlue/80"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-8 items-center justify-center rounded-md text-[10px] font-semibold ${
                            isMarked
                              ? "bg-red/10 text-red"
                              : "bg-darkBlue/5 text-darkBlue/70"
                          }`}
                        >
                          {label}
                        </span>

                        <a
                          href={
                            isMarked ? undefined : downloadUrlForAttachment(att)
                          }
                          target={isMarked ? undefined : "_blank"}
                          rel={isMarked ? undefined : "noreferrer"}
                          className={`flex items-center gap-1 ${
                            isMarked
                              ? "cursor-not-allowed line-through text-red/70"
                              : "hover:underline"
                          }`}
                          title={
                            isMarked ? "Marquée pour suppression" : prettyName
                          }
                        >
                          <Download className="size-3" />
                          <span>{truncate(prettyName, 25)}</span>
                        </a>

                        <button
                          type="button"
                          onClick={() =>
                            toggleExistingAttachmentRemoval(att.public_id)
                          }
                          className={`ml-1 inline-flex items-center justify-center rounded-full p-[3px] ${
                            isMarked
                              ? "bg-red text-white hover:bg-red/80"
                              : "bg-red/10 text-red hover:bg-red/20"
                          }`}
                          title={
                            isMarked
                              ? "Annuler la suppression"
                              : "Marquer pour suppression"
                          }
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hint si aucun doc */}
            {existingAttachments.length === 0 && newFiles.length === 0 && (
              <p className="text-[11px] text-darkBlue/40">
                Ajoutez la notification du fournisseur, un bon de retour ou des
                photos pour tracer ce rappel / retrait.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Ligne 6 : Clôture (switch) */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <ShieldCheck className="size-4" /> Clôture
          </label>
          <div className="flex items-center h-11">
            <label
              role="switch"
              aria-checked={!!closedWatch}
              className="group inline-flex justify-between h-11 w-full items-center gap-3 rounded-lg border border-darkBlue/20 bg-white px-3 py-2 cursor-pointer select-none"
              title="Basculer Clôturé / Ouvert"
            >
              <span className="text-sm text-darkBlue/70">
                {closedWatch ? "Clôturé" : "Ouvert"}
              </span>
              <input
                type="checkbox"
                {...register("closed")}
                className="sr-only peer"
              />
              <span className="relative inline-flex h-6 w-11 items-center rounded-full bg-darkBlue/20 transition-colors peer-checked:bg-darkBlue/80 group-aria-checked:bg-darkBlue/80">
                <span className="absolute left-1 top-1/2 -translate-y-1/2 size-4 rounded-full bg-white shadow transition-transform will-change-transform translate-x-0 peer-checked:translate-x-5 group-aria-checked:translate-x-5" />
              </span>
            </label>
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Clôturé le
          </label>
          <input
            type="datetime-local"
            {...register("closedAt")}
            className={`${selectCls} ${
              !closedWatch ? "opacity-60 cursor-not-allowed" : ""
            }`}
            disabled={!closedWatch}
          />
        </div>
      </div>

      {/* Actions form */}
      <div className="flex flex-col mt-3 gap-2 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`text-nowrap ${btnBase} h-[38px] text-white shadow ${
            isSubmitting ? "bg-darkBlue/40" : "bg-blue"
          }`}
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Enregistrement…</span>
            </div>
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
              reset(buildDefaults(null));
              setExistingAttachments([]);
              setRemovedAttachmentIds([]);
              setNewFiles([]);
              onCancel?.();
            }}
            className={`${btnBase} h-[38px] border border-red bg-white text-red`}
          >
            <XCircle className="size-4" />
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
