"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";

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
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      {/* Ligne 1 : Fournisseur / Type */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <label className="text-sm font-medium">Fournisseur *</label>
          <input
            type="text"
            {...register("supplierName", { required: "Requis" })}
            className={`border rounded p-2 h-[44px] w-full ${errors.supplierName ? "border-red ring-1 ring-red" : ""}`}
            placeholder="Nom du fournisseur"
          />
          {errors.supplierName && (
            <p className="text-xs text-red mt-1">
              {errors.supplierName.message}
            </p>
          )}
        </div>
        <div className="w-full mobile:w-72">
          <label className="text-sm font-medium">Type *</label>
          <input
            type="text"
            {...register("type", { required: "Requis" })}
            className={`border rounded p-2 h-[44px] w-full ${errors.type ? "border-red ring-1 ring-red" : ""}`}
            placeholder="Ex: IFS/BRC, Allergènes, HACCP…"
          />
          {errors.type && (
            <p className="text-xs text-red mt-1">{errors.type.message}</p>
          )}
        </div>
      </div>

      {/* Ligne 2 : Référence / URL */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="w-full mobile:w-64">
          <label className="text-sm font-medium">N° Certificat</label>
          <input
            type="text"
            {...register("certificateNumber")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1 min-w-[240px]">
          <label className="text-sm font-medium">URL du document</label>
          <input
            type="url"
            {...register("fileUrl")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="https://…/certificate.pdf"
          />
        </div>
      </div>

      {/* Ligne 3 : Validité */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="w-full mobile:w-48">
          <label className="text-sm font-medium">Valide du</label>
          <input
            type="date"
            {...register("validFrom")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="w-full mobile:w-48">
          <label className="text-sm font-medium">Au</label>
          <input
            type="date"
            {...register("validUntil")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-sm font-medium">Notes</label>
        <textarea
          rows={3}
          {...register("notes")}
          className="border rounded p-2 resize-none w-full"
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
