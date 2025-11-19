"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm, useFieldArray } from "react-hook-form";

// AXIOS
import axios from "axios";

// ICONS
import {
  CalendarClock,
  Thermometer,
  Tag,
  Hash,
  Link as LinkIcon,
  FileText,
  PlusCircle,
  Trash2,
  Loader2,
  X,
  ChevronDown,
} from "lucide-react";

/* ---------- Utils ---------- */
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

const normalize = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

const isLineEmpty = (row) =>
  !row?.productName &&
  !row?.supplierProductId &&
  !row?.lotNumber &&
  !row?.dlc &&
  !row?.ddm &&
  !row?.qty &&
  !row?.unit &&
  !row?.tempOnArrival &&
  !(typeof row?.allergens === "string" && row.allergens.trim().length > 0);

const missingQty = (row) => row?.qty === "" || row?.qty == null;
const missingUnit = (row) => !row?.unit;

const isLineValidatedByFields = (row) =>
  !!row?.productName?.trim() &&
  row?.qty !== "" &&
  row?.qty != null &&
  !!row?.unit;

const cToF = (c) => (c * 9) / 5 + 32;
const fToC = (f) => ((f - 32) * 5) / 9;
const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : n);

/* ---------- Defaults ---------- */
function buildFormDefaults(record) {
  return {
    supplier: record?.supplier ?? "",
    receivedAt: toDatetimeLocalValue(record?.receivedAt),
    note: record?.note ?? "",
    billUrl: record?.billUrl ?? "",
    lines:
      Array.isArray(record?.lines) && record.lines.length
        ? record.lines.map((l) => ({
            productName: l?.productName ?? "",
            supplierProductId: l?.supplierProductId ?? "",
            lotNumber: l?.lotNumber ?? "",
            dlc: l?.dlc ? new Date(l.dlc).toISOString().slice(0, 10) : "",
            ddm: l?.ddm ? new Date(l.ddm).toISOString().slice(0, 10) : "",
            qty: l?.qty ?? "",
            unit: l?.unit ?? "",
            tempOnArrival: l?.tempOnArrival ?? "",
            tempOnArrivalUnit: l?.tempOnArrivalUnit === "F" ? "F" : "C",
            allergens: Array.isArray(l?.allergens)
              ? l.allergens.join(", ")
              : "",
            packagingCondition: l?.packagingCondition ?? "compliant",
          }))
        : [
            {
              productName: "",
              supplierProductId: "",
              lotNumber: "",
              dlc: "",
              ddm: "",
              qty: "",
              unit: "",
              tempOnArrival: "",
              tempOnArrivalUnit: "C",
              allergens: "",
              packagingCondition: "compliant",
            },
          ],
  };
}

const stringifyAllergens = (val) =>
  Array.isArray(val) ? val.filter(Boolean).join(", ") : String(val || "");

const applyLatestMeta = (rec, line, at) => {
  const meta = {
    supplierProductId: line?.supplierProductId || "",
    lotNumber: line?.lotNumber || "",
    allergens: stringifyAllergens(line?.allergens),
    at: at ? new Date(at).getTime() : 0,
  };
  if (!rec.last || meta.at >= (rec.last.at || 0)) rec.last = meta;
};

export default function ReceptionDeliveryForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const isEdit = !!initial?._id;

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = watch("lines");
  const supplierValue = watch("supplier");

  const [openById, setOpenById] = useState({});
  const contentRefs = useRef({});
  const openNewLineRef = useRef(false);

  const [showReqErrById, setShowReqErrById] = useState({});
  const [validatedById, setValidatedById] = useState({});

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );
  const suggestLoadedRef = useRef(false);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const suppliersRef = useRef(new Map());
  const productsBySupplierRef = useRef(new Map());

  const bumpCount = (map, key, label) => {
    const rec = map.get(key);
    if (rec) rec.count += 1;
    else map.set(key, { label: label || key, count: 1 });
  };
  const bumpProduct = (map, key, label, line, at) => {
    const rec = map.get(key);
    if (rec) {
      rec.count += 1;
      applyLatestMeta(rec, line, at);
    } else {
      const base = { label: label || key, count: 1 };
      applyLatestMeta(base, line, at);
      map.set(key, base);
    }
  };

  const indexFromDoc = (doc) => {
    const sup = (doc?.supplier || "").trim();
    if (!sup) return;
    const supKey = normalize(sup);
    bumpCount(suppliersRef.current, supKey, sup);

    const ls = Array.isArray(doc?.lines) ? doc.lines : [];
    if (!productsBySupplierRef.current.has(supKey)) {
      productsBySupplierRef.current.set(supKey, new Map());
    }
    const mapForSup = productsBySupplierRef.current.get(supKey);

    for (const l of ls) {
      const pname = (l?.productName || "").trim();
      if (!pname) continue;
      const pkey = normalize(pname);
      bumpProduct(mapForSup, pkey, pname, l, doc?.receivedAt);
    }
  };

  const fetchSuggestions = async () => {
    if (!restaurantId || !token) return;
    setSuggestLoading(true);
    try {
      suppliersRef.current = new Map();
      productsBySupplierRef.current = new Map();

      const limit = 100;
      let page = 1;
      let pages = 1;
      const maxPages = 5;

      while (page <= pages && page <= maxPages) {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-reception-deliveries`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { page, limit },
        });

        const items = Array.isArray(data?.items) ? data.items : [];
        for (const it of items) indexFromDoc(it);

        pages = Math.max(1, Number(data?.meta?.pages || 1));
        page += 1;
      }
      suggestLoadedRef.current = true;
    } catch (e) {
      console.error("suggestions load error", e);
    } finally {
      setSuggestLoading(false);
    }
  };

  useEffect(() => {
    const onUpsert = (e) => {
      const doc = e?.detail?.doc;
      if (!doc) return;
      if (restaurantId && String(doc.restaurantId) !== String(restaurantId))
        return;
      indexFromDoc(doc);
    };
    window.addEventListener("reception-delivery:upsert", onUpsert);
    return () =>
      window.removeEventListener("reception-delivery:upsert", onUpsert);
  }, [restaurantId]);

  useEffect(() => {
    reset(buildFormDefaults(initial));
    setShowReqErrById({});
    setValidatedById({});
    supplierUserTypedRef.current = false;
    Object.keys(productUserTypedRef.current).forEach((k) => {
      productUserTypedRef.current[k] = false;
    });
    if (!suggestLoadedRef.current) fetchSuggestions();
  }, [initial, reset]); // eslint-disable-line

  useEffect(() => {
    setOpenById((prev) => {
      const next = { ...prev };
      fields.forEach((f, idx) => {
        if (next[f.id] == null) {
          const l = (lines && lines[idx]) || {};
          next[f.id] = isLineEmpty(l);
        }
      });
      for (const k of Object.keys(next)) {
        if (!fields.find((f) => f.id === k)) delete next[k];
      }
      return next;
    });

    setShowReqErrById((prev) => {
      const next = { ...prev };
      fields.forEach((f) => {
        if (next[f.id] == null) next[f.id] = false;
      });
      for (const k of Object.keys(next)) {
        if (!fields.find((f) => f.id === k)) delete next[k];
      }
      return next;
    });

    setValidatedById((prev) => {
      const next = { ...prev };
      fields.forEach((f, idx) => {
        if (next[f.id] == null) {
          const row = (lines && lines[idx]) || {};
          next[f.id] = isEdit && isLineValidatedByFields(row) ? true : false;
        }
      });
      for (const k of Object.keys(next)) {
        if (!fields.find((f) => f.id === k)) delete next[k];
      }
      return next;
    });
  }, [fields, lines, isEdit]);

  useEffect(() => {
    if (!openNewLineRef.current) return;
    const last = fields[fields.length - 1];
    if (last) {
      setOpenById((s) => ({ ...s, [last.id]: true }));
      setTimeout(() => setFocus(`lines.${fields.length - 1}.productName`), 0);
    }
    openNewLineRef.current = false;
  }, [fields, setFocus]);

  const toggleOpen = (id) => setOpenById((s) => ({ ...s, [id]: !s[id] }));

  const validateLine = (id, idx) => {
    const row = (lines && lines[idx]) || {};
    const needProduct = !row?.productName?.trim();
    const needQty = missingQty(row);
    const needUnit = missingUnit(row);

    if (needProduct || needQty || needUnit) {
      setShowReqErrById((s) => ({ ...s, [id]: true }));
      setValidatedById((s) => ({ ...s, [id]: false }));
      setOpenById((s) => ({ ...s, [id]: true }));
      const firstMissing =
        (needProduct && `lines.${idx}.productName`) ||
        (needQty && `lines.${idx}.qty`) ||
        (needUnit && `lines.${idx}.unit`) ||
        null;
      if (firstMissing) setFocus(firstMissing);
      return;
    }
    setShowReqErrById((s) => ({ ...s, [id]: false }));
    setValidatedById((s) => ({ ...s, [id]: true }));
    setOpenById((s) => ({ ...s, [id]: false }));
  };

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payloadLines = [];
    (Array.isArray(data.lines) ? data.lines : []).forEach((l, idx) => {
      const fid = fields[idx]?.id;
      if (!fid || !validatedById[fid]) return;

      payloadLines.push({
        productName: l.productName || undefined,
        supplierProductId: l.supplierProductId || undefined,
        lotNumber: l.lotNumber || undefined,
        dlc: l.dlc ? new Date(l.dlc) : undefined,
        ddm: l.ddm ? new Date(l.ddm) : undefined,
        qty: l.qty !== "" && l.qty != null ? Number(l.qty) : undefined,
        unit: l.unit || undefined,
        tempOnArrival:
          l.tempOnArrival !== "" && l.tempOnArrival != null
            ? Number(l.tempOnArrival)
            : undefined,
        tempOnArrivalUnit: l.tempOnArrivalUnit === "F" ? "F" : "C",
        allergens:
          typeof l.allergens === "string" && l.allergens.trim().length
            ? l.allergens
                .split(/[;,]/g)
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
        packagingCondition: l.packagingCondition || "compliant",
      });
    });

    if (!payloadLines.length) return;

    const payload = {
      supplier: data.supplier,
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : undefined,
      note: data.note || undefined,
      billUrl: data.billUrl || undefined,
      lines: payloadLines,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reception-deliveries/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reception-deliveries`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    reset(buildFormDefaults(null));
    setShowReqErrById({});
    setValidatedById({});
    indexFromDoc(saved);
    onSuccess?.(saved);
  };

  // Styles
  const fieldWrap =
    "group relative rounded-xl bg-white/50   py-2 h-[80px] transition-shadow";
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

  const fmtDate = (d) => {
    try {
      return d ? new Date(d).toLocaleDateString("fr-FR") : "";
    } catch {
      return d || "";
    }
  };

  const toggleTempUnit = (idx) => {
    const row = (lines && lines[idx]) || {};
    const curU = row?.tempOnArrivalUnit === "F" ? "F" : "C";
    const nextU = curU === "C" ? "F" : "C";
    const raw = Number(row?.tempOnArrival);
    if (Number.isFinite(raw)) {
      const converted = curU === "C" ? cToF(raw) : fToC(raw);
      setValue(`lines.${idx}.tempOnArrival`, String(round1(converted)), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    setValue(`lines.${idx}.tempOnArrivalUnit`, nextU, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  /* ----------------- DROPDOWNS (Supplier / Product) ----------------- */

  // Supplier dropdown
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierItems, setSupplierItems] = useState([]);
  const supplierBoxRef = useRef(null); // wrapper (pour outside click)
  const supplierPortalRef = useRef(null); // portal node
  const supplierInputRef = useRef(null); // ⬅️ ancre = INPUT exact

  // Product dropdowns (par ligne)
  const [productOpenById, setProductOpenById] = useState({});
  const productUserTypedRef = useRef({});
  const productDebounceRef = useRef({});
  const productBoxRefs = useRef({});
  const productAnchorRefs = useRef({});
  const [productItemsById, setProductItemsById] = useState({});
  const productPortalRef = useRef(null);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  const [, setDropdownRerender] = useState(0);

  // visualViewport tracking
  const vvRef = useRef({
    offsetTop: 0,
    offsetLeft: 0,
    width: 0,
    height: 0,
    scale: 1,
  });
  const [, bumpVvTick] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      vvRef.current = {
        offsetTop: vv.offsetTop || 0,
        offsetLeft: vv.offsetLeft || 0,
        width: vv.width || window.innerWidth,
        height: vv.height || window.innerHeight,
        scale: vv.scale || 1,
      };
      bumpVvTick((n) => n + 1);
    };
    sync();
    vv.addEventListener("scroll", sync);
    vv.addEventListener("resize", sync);
    return () => {
      vv.removeEventListener("scroll", sync);
      vv.removeEventListener("resize", sync);
    };
  }, []);

  function getDropdownStyle(anchorEl, { margin = 4, maxListPx = 256 } = {}) {
    if (!anchorEl) return null;
    const rect = anchorEl.getBoundingClientRect();
    const { offsetTop, offsetLeft, height: vvH } = vvRef.current;

    let top = rect.bottom + offsetTop - margin;
    let left = rect.left + offsetLeft;
    const width = rect.width;

    const spaceBelow = vvH - (rect.bottom + margin);
    const willFlip = spaceBelow < 120;

    if (willFlip) {
      top = rect.top + offsetTop - Math.min(maxListPx, rect.top - margin);
    }

    const maxHeight = willFlip
      ? Math.min(maxListPx, rect.top - margin)
      : Math.min(maxListPx, vvH - (rect.bottom + margin));

    return {
      position: "fixed",
      left,
      top,
      width, // ⬅️ largeur exacte de l'ancre
      zIndex: 1000,
      maxHeight: Math.max(120, maxHeight),
      overflow: "auto",
      WebkitOverflowScrolling: "touch",
      overscrollBehavior: "contain",
      willChange: "transform",
      transform: "translateZ(0)",
    };
  }

  useEffect(() => {
    const onScrollOrResize = () => setDropdownRerender((v) => v + 1);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, []);

  const pointerInPortalRef = useRef(false);
  useEffect(() => {
    const down = (e) => {
      if (
        productPortalRef.current?.contains(e.target) ||
        supplierPortalRef.current?.contains(e.target)
      ) {
        pointerInPortalRef.current = true;
      }
    };
    const up = () => {
      setTimeout(() => (pointerInPortalRef.current = false), 0);
    };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("mouseup", up, true);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("mouseup", up, true);
    };
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => {
      // products
      if (productPortalRef.current?.contains(e.target)) return;
      const pRefs = productBoxRefs.current;
      for (const key of Object.keys(pRefs)) {
        const el = pRefs[key];
        if (el && el.contains(e.target)) return;
      }
      setProductOpenById({});
      // supplier
      if (supplierPortalRef.current?.contains(e.target)) return;
      if (supplierBoxRef.current?.contains(e.target)) return;
      setSupplierOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const openProductDropdownFor = (fid, open) =>
    setProductOpenById((s) => ({ ...s, [fid]: !!open }));
  const setProductItemsFor = (fid, items) =>
    setProductItemsById((s) => ({ ...s, [fid]: items }));

  // Suggestions produits filtrées par fournisseur
  const computeProductMatches = (supplier, q) => {
    const qn = normalize(q);
    if (!qn) return [];
    const supKey = normalize(supplier);
    if (!supKey) return [];
    const bag = productsBySupplierRef.current.get(supKey);
    if (!bag) return [];

    const list = [];
    bag.forEach((v, key) => {
      if (key.includes(qn)) list.push(v);
    });

    list.sort((a, b) =>
      String(a.label).localeCompare(String(b.label), "fr", {
        sensitivity: "base",
      })
    );

    return list
      .slice(0, 8)
      .map((x) => ({ label: x.label, meta: x.last || null }));
  };

  const handleProductTyping = (fid, idx) => {
    productUserTypedRef.current[fid] = true;

    const row = (lines && lines[idx]) || {};
    const q = String(row?.productName || "").trim();
    if (productDebounceRef.current[fid])
      clearTimeout(productDebounceRef.current[fid]);

    if (q.length < 1) {
      setProductItemsFor(fid, []);
      openProductDropdownFor(fid, false);
      return;
    }

    productDebounceRef.current[fid] = setTimeout(() => {
      const matches = computeProductMatches(supplierValue, q);
      setProductItemsFor(fid, matches);
      openProductDropdownFor(fid, matches.length > 0);
      setDropdownRerender((v) => v + 1);
    }, 160);
  };

  const pickProduct = (fid, idx, suggestion) => {
    const name =
      typeof suggestion === "string" ? suggestion : suggestion?.label || "";
    const meta =
      suggestion && typeof suggestion === "object" ? suggestion.meta : null;

    setValue(`lines.${idx}.productName`, name, {
      shouldDirty: true,
      shouldTouch: true,
    });
    setValue(`lines.${idx}.supplierProductId`, meta?.supplierProductId || "", {
      shouldDirty: true,
      shouldTouch: true,
    });
    setValue(`lines.${idx}.lotNumber`, meta?.lotNumber || "", {
      shouldDirty: true,
      shouldTouch: true,
    });
    setValue(`lines.${idx}.allergens`, meta?.allergens || "", {
      shouldDirty: true,
      shouldTouch: true,
    });

    setValidatedById((s) => (s[fid] ? { ...s, [fid]: false } : s));
    openProductDropdownFor(fid, false);
    productUserTypedRef.current[fid] = false;
  };

  useEffect(() => {
    setProductOpenById({});
    setProductItemsById({});
  }, [supplierValue]);

  const computeSupplierMatches = (q) => {
    const qn = normalize(q);
    if (!qn) return [];
    const list = [];
    suppliersRef.current.forEach((v, key) => {
      if (key.includes(qn)) list.push(v);
    });
    list.sort((a, b) => b.count - a.count);
    return list.slice(0, 8).map((x) => x.label);
  };

  const supplierUserTypedRef = useRef(false);
  const supplierDebounceRef = useRef(null);

  useEffect(() => {
    if (!supplierUserTypedRef.current) {
      setSupplierOpen(false);
      return;
    }
    if (supplierDebounceRef.current) clearTimeout(supplierDebounceRef.current);

    const q = String(supplierValue || "");
    if (q.trim().length < 1) {
      setSupplierItems([]);
      setSupplierOpen(false);
      return;
    }

    supplierDebounceRef.current = setTimeout(() => {
      const matches = computeSupplierMatches(q);
      setSupplierItems(matches);
      setSupplierOpen(matches.length > 0);
      setDropdownRerender((v) => v + 1);
    }, 180);

    return () => {
      if (supplierDebounceRef.current)
        clearTimeout(supplierDebounceRef.current);
    };
  }, [supplierValue]);

  const anyDropdownOpen =
    supplierOpen || Object.values(productOpenById).some(Boolean);
  useEffect(() => {
    const html = document.documentElement;
    const prevY = html.style.overscrollBehaviorY;
    const prevX = html.style.overscrollBehaviorX;
    if (anyDropdownOpen) {
      html.style.overscrollBehaviorY = "contain";
      html.style.overscrollBehaviorX = "none";
    } else {
      html.style.overscrollBehaviorY = prevY || "";
      html.style.overscrollBehaviorX = prevX || "";
    }
    return () => {
      html.style.overscrollBehaviorY = prevY || "";
      html.style.overscrollBehaviorX = prevX || "";
    };
  }, [anyDropdownOpen]);

  const hasValidatedLine =
    Array.isArray(fields) && fields.some((f) => validatedById[f.id]);
  const submitDisabled = isSubmitting || !hasValidatedLine;

  const lastField = fields.length ? fields[fields.length - 1] : null;
  const addDisabled = lastField ? !validatedById[lastField.id] : false;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-5"
    >
      {/* En-tête réception */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`} ref={supplierBoxRef}>
          <label className={labelCls}>
            <FileText className="size-4" /> Fournisseur *
          </label>
          <div className="relative">
            {(() => {
              // chaîner la ref RHF + notre ref input
              const supplierReg = register("supplier", {
                required: true,
                onChange: () => {
                  supplierUserTypedRef.current = true;
                },
              });
              return (
                <input
                  type="text"
                  placeholder="Nom du fournisseur"
                  autoComplete="off"
                  spellCheck={false}
                  {...supplierReg}
                  ref={(el) => {
                    supplierInputRef.current = el; // ⬅️ ancre exacte
                    supplierReg.ref(el); // garder la ref RHF
                  }}
                  className={`${inputCls} ${errors.supplier ? "border-red focus:ring-red/20" : ""}`}
                  onFocus={() => {
                    const q = String(supplierValue || "");
                    if (q.trim().length >= 2) {
                      const matches = computeSupplierMatches(q);
                      setSupplierItems(matches);
                      setSupplierOpen(matches.length > 0);
                      setDropdownRerender((v) => v + 1);
                    }
                  }}
                  onBlur={() =>
                    setTimeout(() => {
                      if (!pointerInPortalRef.current) setSupplierOpen(false);
                    }, 0)
                  }
                />
              );
            })()}

            {/* Suggestions fournisseur via PORTAL — ancre = INPUT */}
            {isClient &&
              supplierOpen &&
              createPortal(
                (() => {
                  const anchor = supplierInputRef.current;
                  if (!anchor) return null;
                  const style = getDropdownStyle(anchor, {
                    margin: -4,
                    maxListPx: 256,
                  });
                  return (
                    <div
                      ref={supplierPortalRef}
                      style={style}
                      className="rounded-lg border border-darkBlue/15 bg-white shadow"
                      role="listbox"
                      aria-label="Suggestions fournisseurs"
                    >
                      {suggestLoading ? (
                        <div className="px-3 py-2 text-sm text-darkBlue/60">
                          Chargement…
                        </div>
                      ) : supplierItems.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-darkBlue/40">
                          Aucun fournisseur
                        </div>
                      ) : (
                        supplierItems.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setValue("supplier", name, {
                                shouldDirty: true,
                                shouldTouch: true,
                              });
                              setSupplierOpen(false);
                              supplierUserTypedRef.current = false;
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-blue/5 text-sm"
                            title="Choisir ce fournisseur"
                          >
                            {name}
                          </button>
                        ))
                      )}
                    </div>
                  );
                })(),
                document.body
              )}
          </div>
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Date / heure réception *
          </label>
          <input
            type="datetime-local"
            {...register("receivedAt")}
            className={selectCls}
          />
        </div>
      </div>

      {/* Lignes produits */}
      <div className="rounded-2xl bg-white/50 p-3 pb-0">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-darkBlue flex items-center gap-2">
            <FileText className="size-4" /> Produits reçus
          </h3>

          <button
            type="button"
            disabled={addDisabled}
            aria-disabled={addDisabled}
            onClick={() => {
              if (addDisabled) return;
              openNewLineRef.current = true;
              append({
                productName: "",
                supplierProductId: "",
                lotNumber: "",
                dlc: "",
                ddm: "",
                qty: "",
                unit: "",
                tempOnArrival: "",
                tempOnArrivalUnit: "C",
                allergens: "",
                packagingCondition: "compliant",
              });
            }}
            className={`${btnBase} border border-violet/20 bg-white text-violet hover:bg-violet/5 disabled:opacity-60 disabled:cursor-not-allowed`}
            title={
              addDisabled
                ? "Validez la ligne précédente pour ajouter un produit"
                : undefined
            }
          >
            <PlusCircle className="size-4" /> Ajouter un produit
          </button>
        </div>

        <div className="space-y-3 mb-3">
          {fields.map((field, idx) => {
            const id = field.id;
            const isOpen = !!openById[id];
            const l = (lines && lines[idx]) || {};
            const pkg = l?.packagingCondition || "compliant";
            const tempUnit = l?.tempOnArrivalUnit === "F" ? "F" : "C";

            const needProduct = !l?.productName?.trim();
            const needQty = missingQty(l);
            const needUnit = missingUnit(l);

            const showErr = !!showReqErrById[id];
            const hasProdErr = showErr && needProduct;
            const hasQtyErr = showErr && needQty;
            const hasUnitErr = showErr && needUnit;

            const rowZ =
              productOpenById[id] || false ? "z-40 relative" : "relative";

            return (
              <div
                key={id}
                className={`rounded-xl border border-darkBlue/10 bg-white ${rowZ}`}
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
                        {l?.productName?.trim() || "Nouveau produit"}
                      </span>
                      {!isOpen && (
                        <span className="text-[11px] text-darkBlue/60">
                          Cliquez pour voir/modifier le détail
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {!!l?.qty && (
                      <span className={chip}>
                        {l.qty} {l.unit || ""}
                      </span>
                    )}
                    {!!l?.lotNumber && (
                      <span className={chip}>Lot {l.lotNumber}</span>
                    )}
                    {!!l?.dlc && (
                      <span className={chip}>DLC {fmtDate(l.dlc)}</span>
                    )}
                    {!!l?.tempOnArrival && (
                      <span className={chip}>
                        {l.tempOnArrival}
                        {tempUnit === "F" ? "°F" : "°C"}
                      </span>
                    )}
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] ${
                        pkg === "compliant"
                          ? "bg-green/10 text-green"
                          : "bg-red/10 text-red"
                      }`}
                    >
                      {pkg === "compliant" ? "Conforme" : "Non conforme"}
                    </span>
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
                    {/* Ligne 1 */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
                      <div
                        className={fieldWrap}
                        ref={(el) => {
                          productBoxRefs.current[id] = el;
                          productAnchorRefs.current[id] = el;
                        }}
                      >
                        <label className={labelCls}>
                          <Tag className="size-4" /> Produit *
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Désignation"
                            autoComplete="off"
                            spellCheck={false}
                            {...register(`lines.${idx}.productName`, {
                              onChange: () => {
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                );
                                handleProductTyping(id, idx);
                              },
                            })}
                            className={`${inputCls} ${hasProdErr ? "border-red focus:ring-red/20" : ""}`}
                            aria-invalid={hasProdErr ? "true" : "false"}
                            onFocus={() => {
                              const row = (lines && lines[idx]) || {};
                              const q = String(row?.productName || "").trim();
                              if (q.length >= 2) {
                                const matches = computeProductMatches(
                                  supplierValue,
                                  q
                                );
                                setProductItemsFor(id, matches);
                                openProductDropdownFor(id, matches.length > 0);
                                setDropdownRerender((v) => v + 1);
                              }
                            }}
                            onBlur={() =>
                              setTimeout(() => {
                                if (!pointerInPortalRef.current) {
                                  openProductDropdownFor(id, false);
                                }
                              }, 0)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                openProductDropdownFor(id, false);
                              }
                            }}
                          />
                          {/* Dropdown suggestions produit (PORTAL) */}
                          {isClient &&
                            productOpenById[id] &&
                            createPortal(
                              (() => {
                                const anchor = productAnchorRefs.current[id];
                                if (!anchor) return null;
                                const style = getDropdownStyle(anchor, {
                                  margin: 4,
                                  maxListPx: 256,
                                });
                                const items = productItemsById[id] || [];
                                return (
                                  <div
                                    ref={productPortalRef}
                                    style={style}
                                    className="rounded-lg border border-darkBlue/15 bg-white shadow"
                                    role="listbox"
                                    aria-label="Suggestions produits"
                                  >
                                    {items.length === 0 ? (
                                      <div className="px-3 py-2 text-sm text-darkBlue/40">
                                        Aucun produit
                                      </div>
                                    ) : (
                                      items.map((sug) => (
                                        <button
                                          key={sug.label}
                                          type="button"
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                          onClick={() =>
                                            pickProduct(id, idx, sug)
                                          }
                                          className="w-full text-left px-3 py-2 hover:bg-blue/5 text-sm"
                                          role="option"
                                          title="Choisir ce produit"
                                        >
                                          <div className="flex flex-col">
                                            <span>{sug.label}</span>
                                            {sug.meta &&
                                              (sug.meta.supplierProductId ||
                                                sug.meta.lotNumber) && (
                                                <span className="text-[11px] text-darkBlue/50">
                                                  {sug.meta.supplierProductId
                                                    ? `Ref: ${sug.meta.supplierProductId} `
                                                    : ""}
                                                  {sug.meta.lotNumber
                                                    ? `Lot: ${sug.meta.lotNumber} `
                                                    : ""}
                                                </span>
                                              )}
                                          </div>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                );
                              })(),
                              document.body
                            )}
                        </div>
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <Hash className="size-4" /> Réf. fournisseur
                        </label>
                        <input
                          type="text"
                          placeholder="Code article fournisseur"
                          autoComplete="off"
                          spellCheck={false}
                          {...register(`lines.${idx}.supplierProductId`)}
                          className={inputCls}
                        />
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <Hash className="size-4" /> N° lot
                        </label>
                        <input
                          type="text"
                          placeholder="Lot"
                          autoComplete="off"
                          spellCheck={false}
                          {...register(`lines.${idx}.lotNumber`)}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    {/* Ligne 2 */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
                      <div className={fieldWrap}>
                        <label className={labelCls}>DLC</label>
                        <input
                          type="date"
                          {...register(`lines.${idx}.dlc`)}
                          className={selectCls}
                        />
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>DDM</label>
                        <input
                          type="date"
                          {...register(`lines.${idx}.ddm`)}
                          className={selectCls}
                        />
                      </div>

                      <div className="grid grid-cols-5 gap-2">
                        <div className={`col-span-3 ${fieldWrap}`}>
                          <label className={labelCls}>Qté *</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="ex: 5"
                            onWheel={(e) => e.currentTarget.blur()}
                            {...register(`lines.${idx}.qty`, {
                              onChange: () => {
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                );
                              },
                            })}
                            className={`${inputCls} ${hasQtyErr ? "border-red focus:ring-red/20" : ""}`}
                            aria-invalid={hasQtyErr ? "true" : "false"}
                          />
                        </div>
                        <div className={`col-span-2 ${fieldWrap}`}>
                          <label className={labelCls}>Unité *</label>
                          <select
                            {...register(`lines.${idx}.unit`, {
                              onChange: () => {
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                );
                              },
                            })}
                            className={`${selectCls} ${hasUnitErr ? "border-red focus:ring-red/20" : ""}`}
                            aria-invalid={hasUnitErr ? "true" : "false"}
                          >
                            <option value="">—</option>
                            <option value="kg">kg</option>
                            <option value="g">g</option>
                            <option value="L">L</option>
                            <option value="mL">mL</option>
                            <option value="unit">unité</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-4 top-[58px] -translate-y-1/2 size-4 text-darkBlue/40" />
                        </div>
                      </div>
                    </div>

                    {/* Ligne 3 */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <Thermometer className="size-4" /> T° à l’arrivée
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            placeholder="ex: 4.5"
                            onWheel={(e) => e.currentTarget.blur()}
                            {...register(`lines.${idx}.tempOnArrival`)}
                            className={`${inputCls} pr-16 text-right`}
                          />
                          <button
                            type="button"
                            onClick={() => toggleTempUnit(idx)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 select-none rounded-md bg-darkBlue/10 px-2 py-1 text-xs text-darkBlue/60 hover:bg-darkBlue/15"
                            title="Changer l’unité"
                          >
                            {tempUnit === "F" ? "°F" : "°C"}
                          </button>
                          <input
                            type="hidden"
                            {...register(`lines.${idx}.tempOnArrivalUnit`)}
                            value={tempUnit}
                            readOnly
                          />
                        </div>
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>Allergènes</label>
                        <input
                          type="text"
                          placeholder="séparés par virgules (ex: gluten, lait)"
                          autoComplete="off"
                          spellCheck={false}
                          {...register(`lines.${idx}.allergens`)}
                          className={inputCls}
                        />
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>Emballage</label>

                        <label
                          role="switch"
                          aria-checked={pkg === "compliant"}
                          className="group inline-flex justify-between h-11 w-full items-center gap-3 rounded-lg border border-darkBlue/20 bg-white px-3 py-2 cursor-pointer select-none"
                          title="Basculer conforme / non conforme"
                        >
                          <span className="text-sm text-darkBlue/70">
                            {pkg === "compliant" ? "Conforme" : "Non conforme"}
                          </span>

                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={pkg === "compliant"}
                            onChange={() =>
                              setValue(
                                `lines.${idx}.packagingCondition`,
                                pkg === "compliant"
                                  ? "non-compliant"
                                  : "compliant",
                                { shouldDirty: true, shouldTouch: true }
                              )
                            }
                          />

                          <span className="relative inline-flex h-6 w-11 items-center rounded-full bg-darkBlue/20 transition-colors peer-checked:bg-darkBlue/80">
                            <span className="absolute left-1 top-1/2 -translate-y-1/2 size-4 rounded-full bg-white shadow transition-transform will-change-transform translate-x-0 peer-checked:translate-x-5" />
                          </span>
                        </label>

                        <select
                          {...register(`lines.${idx}.packagingCondition`)}
                          className="hidden"
                          defaultValue={pkg}
                        >
                          <option value="compliant">conforme</option>
                          <option value="non-compliant">non conforme</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col mobile:flex-row justify-between mt-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowReqErrById((s) => {
                            const n = { ...s };
                            delete n[id];
                            return n;
                          });
                          setValidatedById((s) => {
                            const n = { ...s };
                            delete n[id];
                            return n;
                          });
                          remove(idx);
                        }}
                        className={`${btnBase} border border-red bg-white text-red hover:border-red/80`}
                      >
                        <Trash2 className="size-4" /> Supprimer la ligne
                      </button>

                      {isOpen && (
                        <button
                          type="button"
                          onClick={() => validateLine(id, idx)}
                          className={`${btnBase} border border-blue bg-blue text-white hover:border-darkBlue/30`}
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

      {/* Pièce jointe + Note */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <LinkIcon className="size-4" /> Lien du bon de livraison (URL)
          </label>
          <input
            type="url"
            placeholder="https://… (optionnel)"
            autoComplete="off"
            spellCheck={false}
            {...register("billUrl")}
            className={inputCls}
          />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Note
          </label>
          <textarea
            rows={1}
            {...register("note")}
            className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40"
            placeholder="Observations à la réception…"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mobile:flex-row items-start">
        <button
          type="submit"
          disabled={submitDisabled}
          aria-disabled={submitDisabled}
          className={`text-nowrap inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60 ${
            submitDisabled ? "bg-darkBlue/40" : "bg-blue"
          }`}
          title={
            submitDisabled
              ? "Validez au moins une ligne (Produit, Qté, Unité)"
              : undefined
          }
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Enregistrement…</span>
            </div>
          ) : isEdit ? (
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

        {isEdit && (
          <button
            type="button"
            onClick={() => {
              reset(buildFormDefaults(null));
              setShowReqErrById({});
              setValidatedById({});
              setSupplierOpen(false);
              setProductOpenById({});
              supplierUserTypedRef.current = false;
              Object.keys(productUserTypedRef.current).forEach((k) => {
                productUserTypedRef.current[k] = false;
              });
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
