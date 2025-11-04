"use client";
import { useEffect, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";
import {
  Package,
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
            allergens: Array.isArray(l?.allergens) ? l.allergens.join(", ") : "",
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
              allergens: "",
              packagingCondition: "compliant",
            },
          ],
  };
}

export default function ReceptionDeliveryForm({
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

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = watch("lines");

  // --- Collapsible state per line (keyed by field.id)
  const [openById, setOpenById] = useState({});
  const contentRefs = useRef({});

  // Init/reset form
  useEffect(() => {
    reset(buildFormDefaults(initial));
  }, [initial, reset]);

  // Ensure open state exists for each field (new lines open if empty)
  useEffect(() => {
    setOpenById((prev) => {
      const next = { ...prev };
      fields.forEach((f, idx) => {
        if (next[f.id] == null) {
          const l = (lines && lines[idx]) || {};
          const isEmpty =
            !l?.productName &&
            !l?.qty &&
            !l?.unit &&
            !l?.lotNumber &&
            !l?.dlc &&
            !l?.ddm &&
            !l?.tempOnArrival &&
            !l?.allergens;
          next[f.id] = isEmpty ? true : false; // new/empty => open
        }
      });
      Object.keys(next).forEach((k) => {
        if (!fields.find((f) => f.id === k)) delete next[k];
      });
      return next;
    });
  }, [fields, lines]);

  const toggleOpen = (id) => setOpenById((s) => ({ ...s, [id]: !s[id] }));

  // ✅ Valide la ligne : exige "Produit" non vide
  const validateLine = (id, idx) => {
    const value = (lines?.[idx]?.productName || "").trim();
    if (!value) {
      setOpenById((s) => ({ ...s, [id]: true }));
      setError(`lines.${idx}.productName`, { type: "manual", message: "Requis" });
      setFocus(`lines.${idx}.productName`);
      return;
    }
    setOpenById((s) => ({ ...s, [id]: false }));
  };

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      supplier: data.supplier,
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : undefined,
      note: data.note || undefined,
      billUrl: data.billUrl || undefined,
      lines: (Array.isArray(data.lines) ? data.lines : [])
        .map((l) => ({
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
          allergens:
            typeof l.allergens === "string" && l.allergens.trim().length
              ? l.allergens
                  .split(/[;,]/g)
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
          packagingCondition: l.packagingCondition || "compliant",
        }))
        .filter((x) => Object.values(x).some((v) => v !== undefined && v !== "")),
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reception-deliveries/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reception-deliveries`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  // Styles
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-1 text-[15px] outline-none transition";
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="relative flex flex-col gap-5">
      {/* En-tête réception */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Fournisseur *
          </label>
          <input
            type="text"
            placeholder="Nom du fournisseur"
            autoComplete="off"
            spellCheck={false}
            {...register("supplier", { required: "Requis" })}
            className={inputCls}
          />
          {errors.supplier && (
            <p className="mt-1 text-xs text-red">{errors.supplier.message}</p>
          )}
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Date / heure réception *
          </label>
          <input type="datetime-local" {...register("receivedAt")} className={selectCls} />
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
            onClick={() =>
              append({
                productName: "",
                supplierProductId: "",
                lotNumber: "",
                dlc: "",
                ddm: "",
                qty: "",
                unit: "",
                tempOnArrival: "",
                allergens: "",
                packagingCondition: "compliant",
              })
            }
            className={`${btnBase} border border-violet/20 bg-white text-violet hover:bg-violet/5`}
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

            // register avec clearErrors quand on tape
            const productReg = register(`lines.${idx}.productName`);
            const hasProdErr = !!(errors?.lines && errors.lines[idx]?.productName);

            return (
              <div key={id} className="rounded-xl border border-darkBlue/10 bg-white">
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

                  {/* Résumé compact quand replié */}
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {!!l?.qty && <span className={chip}>{l.qty} {l.unit || ""}</span>}
                    {!!l?.lotNumber && <span className={chip}>Lot {l.lotNumber}</span>}
                    {!!l?.dlc && <span className={chip}>DLC {fmtDate(l.dlc)}</span>}
                    {!!l?.tempOnArrival && <span className={chip}>{l.tempOnArrival}°C</span>}
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] ${
                        pkg === "compliant" ? "bg-green/10 text-green" : "bg-red/10 text-red"
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
                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <Tag className="size-4" /> Produit *
                        </label>
                        <input
                          type="text"
                          placeholder="Désignation"
                          autoComplete="off"
                          spellCheck={false}
                          {...productReg}
                          onChange={(e) => {
                            productReg.onChange(e);
                            if (e.target.value.trim()) {
                              clearErrors(`lines.${idx}.productName`);
                            }
                          }}
                          className={`${inputCls} ${
                            hasProdErr ? "border-red focus:ring-red/20" : ""
                          }`}
                          aria-invalid={hasProdErr ? "true" : "false"}
                        />
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
                        <input type="date" {...register(`lines.${idx}.dlc`)} className={selectCls} />
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>DDM</label>
                        <input type="date" {...register(`lines.${idx}.ddm`)} className={selectCls} />
                      </div>

                      <div className="grid grid-cols-5 gap-2">
                        <div className={`col-span-3 ${fieldWrap}`}>
                          <label className={labelCls}>Qté</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="ex: 5"
                            onWheel={(e) => e.currentTarget.blur()}
                            {...register(`lines.${idx}.qty`)}
                            className={inputCls}
                          />
                        </div>
                        <div className={`col-span-2 ${fieldWrap}`}>
                          <label className={labelCls}>Unité</label>
                          <select {...register(`lines.${idx}.unit`)} className={selectCls}>
                            <option value="">—</option>
                            <option value="kg">kg</option>
                            <option value="g">g</option>
                            <option value="L">L</option>
                            <option value="mL">mL</option>
                            <option value="unit">unité</option>
                          </select>
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
                            className={`${inputCls} pr-12 text-right`}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none rounded-md bg-darkBlue/10 px-2 py-1 text-xs text-darkBlue/60">
                            °C
                          </span>
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

                      {/* Segmented control Emballage */}
                      <div className={fieldWrap}>
                        <label className={labelCls}>Emballage</label>
                        <div className="flex h-11 w-full items-center gap-2 rounded-lg border border-darkBlue/20 p-1">
                          <button
                            type="button"
                            onClick={() =>
                              setValue(`lines.${idx}.packagingCondition`, "compliant", {
                                shouldDirty: true,
                                shouldTouch: true,
                              })
                            }
                            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs transition ${
                              pkg === "compliant"
                                ? "bg-darkBlue/80 text-white shadow"
                                : "text-darkBlue/60 hover:bg-darkBlue/10 bg-white"
                            }`}
                          >
                            conforme
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setValue(`lines.${idx}.packagingCondition`, "non-compliant", {
                                shouldDirty: true,
                                shouldTouch: true,
                              })
                            }
                            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs transition ${
                              pkg === "non-compliant"
                                ? "bg-darkBlue/80 text-white shadow"
                                : "text-darkBlue/60 hover:bg-darkBlue/10 bg-white"
                            }`}
                          >
                            non conforme
                          </button>
                        </div>
                        <select {...register(`lines.${idx}.packagingCondition`)} className="hidden">
                          <option value="compliant">conforme</option>
                          <option value="non-compliant">non conforme</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-between mt-2 gap-2 px-3">
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

      {/* Pièce jointe simple + Note */}
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
