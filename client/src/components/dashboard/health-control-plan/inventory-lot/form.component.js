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
import { createPortal } from "react-dom";

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
    receptionLineId: record?.receptionLineId
      ? String(record.receptionLineId)
      : "",

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
  if (!r || !r.receivedAt) return "—";
  const d = new Date(r.receivedAt);
  if (Number.isNaN(d.getTime())) return "—";

  const dateStr = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);

  const timeStr = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

  const supplier = r.supplier ? ` ${r.supplier}` : "";
  return `${dateStr} ${timeStr}${supplier}`;
}

function formatLineLabelFull(line) {
  const name = line?.productName || "Produit";
  const lot = line?.lotNumber ? ` • lot ${line.lotNumber}` : "";
  const unit = line?.unit ? ` ${line.unit}` : "";
  const qty = line?.qty != null ? `${line.qty}${unit}` : "";
  const hasRem = line?.qtyRemaining != null;
  const rem = hasRem
    ? `reste ${line.qtyRemaining}/${line.qty ?? "?"}${unit}`
    : qty;
  return `${name}${lot}${hasRem ? ` • ${rem}` : qty ? ` • ${qty}` : ""}`.trim();
}

function lineKey(line, idx) {
  if (line && line._id) return String(line._id);
  const n = String(line?.productName || "");
  const l = String(line?.lotNumber || "");
  const u = String(line?.unit || "");
  const q = String(line?.qty ?? "");
  return `${n}::${l}::${u}::${q}::${idx}`;
}

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

function findMatchingOptionKey(productOptions, initial) {
  if (!initial) return "";
  if (initial.receptionLineId) {
    const byId = productOptions.find(
      (o) => String(o?.line?._id || "") === String(initial.receptionLineId)
    );
    if (byId) return byId.key;
  }
  const targetName = norm(initial.productName);
  const targetLot = norm(initial.lotNumber);
  if (!productOptions?.length || !targetName) return "";
  const byNameLot = productOptions.find(
    (o) =>
      norm(o?.line?.productName) === targetName &&
      norm(o?.line?.lotNumber) === targetLot
  );
  if (byNameLot) return byNameLot.key;
  const byName = productOptions.find(
    (o) => norm(o?.line?.productName) === targetName
  );
  return byName?.key || "";
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

  // ---- Réceptions & produits
  const [selectedReception, setSelectedReception] = useState(null);
  const [productOptions, setProductOptions] = useState([]); // [{key, line}]
  const [selectedProductKey, setSelectedProductKey] = useState("");
  const [receptionMissing, setReceptionMissing] = useState(false);

  const notesVal = watch("notes");
  const packCond = watch("packagingCondition");
  const statusWatch = watch("status");
  const qtyReceivedWatch = watch("qtyReceived");
  const unitWatch = watch("unit");
  const receptionIdWatch = watch("receptionId");
  const tempUnitWatch = watch("tempOnArrivalUnit") === "F" ? "F" : "C";

  const isEditing = !!initial?._id;
  const hasSelectedProduct = !!(selectedReception && selectedProductKey);
  const showCombinedQty = isEditing || hasSelectedProduct;
  const isPrefilledLock = hasSelectedProduct;

  const isMounted = useRef(true);
  useEffect(() => () => void (isMounted.current = false), []);

  // Reset si "initial" change
  useEffect(() => {
    reset(buildFormDefaults(initial));
    setSelectedReception(null);
    setProductOptions([]);
    setSelectedProductKey("");
    setReceptionMissing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // --------- Réception associée : faux select avec infinite scroll ----------
  const [recOpen, setRecOpen] = useState(false);
  const [recItems, setRecItems] = useState([]); // pages cumulées
  const [recError, setRecError] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [recSlowLoading, setRecSlowLoading] = useState(false); // indicateur retardé (1s)

  const recPageRef = useRef(0); // page courante chargée
  const recPagesRef = useRef(1); // total pages côté API
  const recLoadingRef = useRef(false);
  const recAnchorRef = useRef(null); // ancre visuelle
  const recPortalRef = useRef(null); // container portal
  const recScrollerRef = useRef(null);

  // Afficher "Chargement…" seulement si recLoading > 1s d’affilée
  useEffect(() => {
    let t;
    if (recLoading) {
      t = setTimeout(() => setRecSlowLoading(true), 1000);
    } else {
      setRecSlowLoading(false);
    }
    return () => t && clearTimeout(t);
  }, [recLoading]);

  // --------- Produit : faux select ----------
  const [prodOpen, setProdOpen] = useState(false);
  const prodAnchorRef = useRef(null);
  const prodPortalRef = useRef(null);
  const prodScrollerRef = useRef(null);

  // force re-render pour repositionner les portals (scroll/resize)
  const [, forceTick] = useState(0);
  useEffect(() => {
    const onScrollOrResize = () => forceTick((v) => v + 1);
    window.addEventListener("resize", onScrollOrResize, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, []);

  // Fermeture au clic à l’extérieur (réception + produit)
  useEffect(() => {
    const onClickOutside = (e) => {
      const t = e.target;
      const clickInRec =
        recPortalRef.current?.contains(t) || recAnchorRef.current?.contains(t);
      const clickInProd =
        prodPortalRef.current?.contains(t) ||
        prodAnchorRef.current?.contains(t);
      if (!clickInRec) setRecOpen(false);
      if (!clickInProd) setProdOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const loadReceptionPage = useCallback(
    async (page = 1) => {
      if (!restaurantId) return;
      if (recLoadingRef.current) return;
      const token = localStorage.getItem("token");
      if (!token) return;

      recLoadingRef.current = true;
      setRecLoading(true);
      setRecError(false);
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-reception-deliveries`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { page, limit: 25 },
        });

        const items = Array.isArray(data?.items) ? data.items : [];
        const pages = Math.max(1, Number(data?.meta?.pages || 1));

        setRecItems((prev) => {
          const seen = new Set(prev.map((x) => String(x?._id || "")));
          const next = page === 1 ? [] : [...prev];
          for (const it of items) {
            const id = String(it?._id || "");
            if (!id || seen.has(id)) continue;
            seen.add(id);
            next.push(it);
          }
          return next;
        });

        recPageRef.current = page;
        recPagesRef.current = pages;
      } catch (e) {
        setRecError(true);
      } finally {
        recLoadingRef.current = false;
        setRecLoading(false);
      }
    },
    [restaurantId]
  );

  const maybeOpenReceptionMenu = () => {
    setRecOpen((o) => {
      const willOpen = !o;
      if (willOpen && recPageRef.current === 0) {
        loadReceptionPage(1);
      }
      return willOpen;
    });
  };

  const onReceptionScroll = (e) => {
    const el = e.currentTarget;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16;
    const hasMore = recPageRef.current < recPagesRef.current;
    if (nearBottom && hasMore && !recLoadingRef.current) {
      loadReceptionPage(recPageRef.current + 1);
    }
  };

  const pickReception = (rec) => {
    setValue("receptionId", String(rec._id), {
      shouldDirty: true,
      shouldValidate: true,
    });
    setRecOpen(false);
    // Le détail sera fetch par l’effet sur receptionIdWatch
  };

  const selectedReceptionLabel = useMemo(() => {
    if (receptionIdWatch) {
      const found = recItems.find(
        (r) => String(r?._id) === String(receptionIdWatch)
      );
      if (found) return formatReceptionLabel(found);
      if (selectedReception) return formatReceptionLabel(selectedReception);
    }
    return "";
  }, [receptionIdWatch, recItems, selectedReception]);

  // ---------------- Détail d'une réception (pour les lignes) ---------------
  const fetchReception = useCallback(
    async (receptionId) => {
      if (!receptionId) return;
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
          validateStatus: (s) => s >= 200 && s < 300,
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
        setSelectedProductKey(""); // reset choix produit quand la réception change
        setReceptionMissing(false);
      } catch (e) {
        setSelectedReception(null);
        setProductOptions([]);
        setSelectedProductKey("");
        if (e?.response?.status === 404) {
          setReceptionMissing(true);
          setValue("receptionId", "", {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
      }
    },
    [restaurantId, setValue]
  );

  useEffect(() => {
    if (!receptionIdWatch) {
      setSelectedReception(null);
      setProductOptions([]);
      setSelectedProductKey("");
      setReceptionMissing(false);
      return;
    }
    fetchReception(receptionIdWatch);
  }, [receptionIdWatch, fetchReception]);

  // Auto-sélection de la ligne produit en édition
  useEffect(() => {
    if (!isEditing) return;
    if (!initial) return;
    if (!selectedReception) return;
    if (!productOptions?.length) return;
    if (selectedProductKey) return;

    const matchKey = findMatchingOptionKey(productOptions, initial);
    if (matchKey) {
      setSelectedProductKey(matchKey);
      const opt = productOptions.find((o) => o.key === matchKey);
      if (opt)
        prefillFromReceptionLine(opt.line, selectedReception, {
          updateRemaining: false,
        });
    }
  }, [
    isEditing,
    initial,
    selectedReception,
    productOptions,
    selectedProductKey,
  ]);

  // Pré-remplir depuis une ligne de réception
  function prefillFromReceptionLine(
    line,
    reception,
    { updateRemaining = false } = {}
  ) {
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

    if (line._id) {
      setValue("receptionLineId", String(line._id), {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      setValue("receptionLineId", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    if (updateRemaining) {
      const remaining =
        line.qtyRemaining != null ? line.qtyRemaining : line.qty;
      setValue("qtyRemaining", remaining != null ? String(remaining) : "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

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

  // Toggle °C/°F
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
      receptionLineId: data.receptionLineId || undefined,

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

      qtyRemaining:
        (isEditing || true) &&
        data.qtyRemaining !== "" &&
        data.qtyRemaining != null
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
    setReceptionMissing(false);
    onSuccess?.(saved);
  };

  const isCompliant = (packCond || "compliant") !== "non-compliant";

  // ----- Helpers d’affichage (produit sélectionné : nom seul)
  const selectedProductName = useMemo(() => {
    if (!selectedProductKey) return "";
    const opt = productOptions.find((o) => o.key === selectedProductKey);
    return opt?.line?.productName || "";
  }, [selectedProductKey, productOptions]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Réception associée (FAUX SELECT + PORTAL) */}
      <div className="grid grid-cols-1 gap-2">
        <div className={fieldWrap}>
          <label className={labelCls}>Réception associée</label>

          {/* Champ masqué RHF pour la valeur */}
          <input type="hidden" {...register("receptionId")} />

          <div
            ref={recAnchorRef}
            className={`${selectBase} ${okBorder} cursor-pointer flex items-center justify-between`}
            onClick={maybeOpenReceptionMenu}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                maybeOpenReceptionMenu();
              }
              if (e.key === "Escape") setRecOpen(false);
            }}
            aria-expanded={recOpen}
            aria-haspopup="listbox"
            title="Choisir une réception"
          >
            <span className="truncate">
              {receptionIdWatch
                ? selectedReceptionLabel || "Réception sélectionnée"
                : "Aucune réception associée"}
            </span>
            <ChevronDown className="size-4 text-darkBlue/40" />
          </div>

          {/* Menu en portal (même largeur que l’input) */}
          {recOpen &&
            createPortal(
              (() => {
                const a = recAnchorRef.current;
                if (!a) return null;
                const rect = a.getBoundingClientRect();
                const style = {
                  position: "fixed",
                  left: rect.left,
                  top: rect.bottom + 4, // petit espace
                  width: rect.width,
                  zIndex: 1000,
                };
                return (
                  <div
                    ref={recPortalRef}
                    style={style}
                    className="rounded-lg border border-darkBlue/15 bg-white shadow"
                  >
                    <div
                      ref={recScrollerRef}
                      className="max-h-56 overflow-auto"
                      onScroll={onReceptionScroll}
                      role="listbox"
                      aria-label="Réceptions"
                    >
                      {/* Première ligne "aucune" */}
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue/5"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setValue("receptionId", "", {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setRecOpen(false);
                          setSelectedReception(null);
                          setProductOptions([]);
                          setSelectedProductKey("");
                          setReceptionMissing(false);
                        }}
                      >
                        Aucune réception associée
                      </button>

                      {/* Items */}
                      {recItems.map((rec) => {
                        const id = String(rec?._id || "");
                        const active =
                          id &&
                          String(receptionIdWatch || "") === String(id || "");
                        return (
                          <button
                            key={id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickReception(rec)}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-blue/5 ${
                              active ? "bg-blue/5" : ""
                            }`}
                            role="option"
                            aria-selected={active}
                            title={formatReceptionLabel(rec)}
                          >
                            <span className="block truncate">
                              {formatReceptionLabel(rec)}
                            </span>
                          </button>
                        );
                      })}

                      {/* États (chargement lent / erreur) — uniquement dans le menu */}
                      {(recSlowLoading || recError) && (
                        <div className="px-3 py-2 text-xs text-darkBlue/60">
                          {recSlowLoading && "Chargement…"}
                          {recError && "Erreur de chargement"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })(),
              document.body
            )}

          {receptionMissing && (
            <p className="text-xs text-orange-600 mt-1">
              La réception liée à cette saisie n’existe plus. Association
              retirée.
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

          {/* Sans réception : input libre */}
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
              {/* Champ masqué obligatoire */}
              <input
                type="hidden"
                {...register("productName", { required: true })}
              />
              <input type="hidden" {...register("receptionLineId")} />

              {/* Faux select produit */}
              <div
                ref={prodAnchorRef}
                className={`${selectBase} ${
                  errors.productName ? errCls : okBorder
                } cursor-pointer flex items-center justify-between`}
                onClick={() => setProdOpen((v) => !v)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setProdOpen((v) => !v);
                  }
                  if (e.key === "Escape") setProdOpen(false);
                }}
                aria-expanded={prodOpen}
                aria-haspopup="listbox"
                title="Choisir un produit"
              >
                <span className="truncate">
                  {selectedProductKey
                    ? selectedProductName
                    : "Choisir un produit…"}
                </span>
                <ChevronDown className="size-4 text-darkBlue/40" />
              </div>

              {prodOpen &&
                createPortal(
                  (() => {
                    const a = prodAnchorRef.current;
                    if (!a) return null;
                    const rect = a.getBoundingClientRect();
                    const style = {
                      position: "fixed",
                      left: rect.left,
                      top: rect.bottom + 4,
                      width: rect.width,
                      zIndex: 1000,
                    };
                    return (
                      <div
                        ref={prodPortalRef}
                        style={style}
                        className="rounded-lg border border-darkBlue/15 bg-white shadow"
                      >
                        <div
                          ref={prodScrollerRef}
                          className="max-h-56 overflow-auto"
                          role="listbox"
                          aria-label="Produits"
                        >
                          {productOptions.map((opt) => {
                            const active = opt.key === selectedProductKey;
                            const full = formatLineLabelFull(opt.line);
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSelectedProductKey(opt.key);
                                  prefillFromReceptionLine(
                                    opt.line,
                                    selectedReception,
                                    {
                                      updateRemaining: true,
                                    }
                                  );
                                  setValue(
                                    "productName",
                                    opt?.line?.productName || "",
                                    {
                                      shouldValidate: true,
                                      shouldDirty: true,
                                    }
                                  );
                                  setProdOpen(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-blue/5 ${
                                  active ? "bg-blue/5" : ""
                                }`}
                                role="option"
                                aria-selected={active}
                                title={full}
                              >
                                <span className="block truncate">{full}</span>
                              </button>
                            );
                          })}

                          {!productOptions.length && (
                            <div className="px-3 py-2 text-xs text-darkBlue/60">
                              Aucun produit dans cette réception.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })(),
                  document.body
                )}
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
            className={`${inputCls} ${errors.lotNumber ? errCls : okBorder} ${
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
              <input
                type="text"
                readOnly
                value={`${qtyReceivedWatch || ""}${unitWatch ? ` ${unitWatch}` : ""}`}
                className={`${inputCls} ${okBorder} opacity-80`}
                title={
                  isEditing
                    ? "Non modifiable en édition"
                    : "Prérempli depuis la réception"
                }
              />
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
                validate: (v) => v !== "" && v != null,
              })}
              className={`${inputCls} ${errors.qtyReceived ? errCls : okBorder}`}
            />
          )}
        </div>

        {!showCombinedQty ? (
          <div className={fieldWrap}>
            <label className={labelCls}>Unité *</label>
            <div className="relative">
              <select
                {...register("unit", { validate: (v) => !!v })}
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
            aria-checked={(packCond || "compliant") !== "non-compliant"}
            className={`group inline-flex justify-between h-11 w-full items-center gap-3 rounded-lg border border-darkBlue/20 bg-white px-3 py-2 select-none ${
              isPrefilledLock
                ? "opacity-60 pointer-events-none"
                : "cursor-pointer"
            }`}
          >
            <span className="text-sm text-darkBlue/70">
              {(packCond || "compliant") !== "non-compliant"
                ? "Conforme"
                : "Non conforme"}
            </span>

            <input
              type="checkbox"
              className="sr-only"
              checked={(packCond || "compliant") !== "non-compliant"}
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
              setReceptionMissing(false);
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
