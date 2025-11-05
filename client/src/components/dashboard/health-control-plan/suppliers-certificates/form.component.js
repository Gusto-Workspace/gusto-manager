// app/(components)/haccp/suppliers/SupplierCertificateForm.jsx
"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  FileText,
  X,
  Link as LinkIcon,
  Hash,
  Building2,
  Tag,
  CalendarDays,
} from "lucide-react";

/* ---------- Utils ---------- */
function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function buildDefaults(rec) {
  return {
    supplierName: rec?.supplierName ?? "",
    type: rec?.type ?? "",
    certificateNumber: rec?.certificateNumber ?? "",
    fileUrl: rec?.fileUrl ?? "",
    validFrom: toDateValue(rec?.validFrom),
    validUntil: toDateValue(rec?.validUntil),
    notes: rec?.notes ?? "",
  };
}

export default function SupplierCertificateForm({
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
  } = useForm({ defaultValues: buildDefaults(initial) });

  /* ---------- Styles alignés ---------- */
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm py-2 min-h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[0.98]";

  useEffect(() => {
    reset(buildDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      supplierName: data.supplierName || undefined,
      type: data.type || undefined,
      certificateNumber: data.certificateNumber || undefined,
      fileUrl: data.fileUrl || undefined,
      validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      notes: data.notes || undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/supplier-certificates/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/supplier-certificates`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("suppliers-certificates:upsert", {
        detail: { doc: saved },
      })
    );
    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-5"
    >
      {/* Ligne 1 : Fournisseur / Type */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Building2 className="size-4" />
            Fournisseur *
          </label>
          <input
            type="text"
            placeholder="Nom du fournisseur"
            autoComplete="off"
            spellCheck={false}
            {...register("supplierName", { required: "Requis" })}
            className={`${inputCls} ${errors.supplierName ? "border-red focus:ring-red/20" : ""}`}
          />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Tag className="size-4" />
            Type *
          </label>
          <input
            type="text"
            placeholder="Ex: IFS/BRC, Allergènes, HACCP…"
            autoComplete="off"
            spellCheck={false}
            {...register("type", { required: "Requis" })}
            className={`${inputCls} ${errors.type ? "border-red focus:ring-red/20" : ""}`}
          />
        </div>
      </div>

      {/* Ligne 2 : Référence / URL */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Hash className="size-4" />
            N° Certificat
          </label>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            {...register("certificateNumber")}
            className={inputCls}
          />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <LinkIcon className="size-4" />
            URL du document
          </label>
          <input
            type="url"
            placeholder="https://…/certificate.pdf"
            autoComplete="off"
            spellCheck={false}
            {...register("fileUrl")}
            className={inputCls}
          />
        </div>
      </div>

      {/* Ligne 3 : Validité */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarDays className="size-4" />
            Valide du
          </label>
          <input type="date" {...register("validFrom")} className={selectCls} />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarDays className="size-4" />
            Au
          </label>
          <input
            type="date"
            {...register("validUntil")}
            className={selectCls}
          />
        </div>
      </div>

      {/* Notes */}
      <div className={`${fieldWrap} px-3`}>
        <label className={labelCls}>
          <FileText className="size-4" />
          Notes
        </label>
        <textarea
          rows={3}
          {...register("notes")}
          className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] text-[15px] outline-none transition placeholder:text-darkBlue/40"
          placeholder="Observations, portée du certificat, etc."
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mobile:flex-row items-start">
        <button
          type="submit"
          disabled={isSubmitting}
          aria-disabled={isSubmitting}
          className={`${btnBase} text-nowrap text-white shadow ${
            isSubmitting ? "bg-darkBlue/40" : "bg-blue border border-blue"
          } disabled:opacity-60`}
        >
          {isSubmitting ? (
            <>
              <FileText className="size-4 animate-spin" />
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
              reset(buildDefaults(null));
              onCancel?.();
            }}
            className={`${btnBase} border border-red bg-white text-red`}
          >
            <X className="size-4" />
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
