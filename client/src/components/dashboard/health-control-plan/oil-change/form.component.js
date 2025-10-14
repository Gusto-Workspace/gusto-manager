"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";

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
    fryerId: record?.fryerId ?? "",
    performedAt: toDatetimeLocalValue(record?.performedAt),
    litersRemoved:
      record?.litersRemoved !== undefined && record?.litersRemoved !== null
        ? String(record.litersRemoved)
        : "",

    // Huile neuve
    batchNumber: record?.newOilBatch?.batchNumber ?? "",
    supplier: record?.newOilBatch?.supplier
      ? String(record.newOilBatch.supplier)
      : "",

    // Qualité
    tpmPercent:
      record?.tpmPercent !== undefined && record?.tpmPercent !== null
        ? String(record.tpmPercent)
        : "",
    filteredBeforeChange: Boolean(record?.filteredBeforeChange ?? false),
    colorIndex: record?.colorIndex ?? "",
    odorCheck: record?.odorCheck ?? "",
    oilBrand: record?.oilBrand ?? "",

    qualityNotes: record?.qualityNotes ?? "",
    disposalDocumentUrl: record?.disposalDocumentUrl ?? "",
  };
}

export default function OilChangeForm({
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
    setValue,
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  useEffect(() => {
    reset(buildFormDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      fryerId: data.fryerId || undefined,
      performedAt: data.performedAt ? new Date(data.performedAt) : undefined,
      litersRemoved:
        data.litersRemoved !== "" && data.litersRemoved != null
          ? Number(data.litersRemoved)
          : undefined,

      newOilBatch:
        data.batchNumber || data.supplier
          ? {
              ...(data.batchNumber ? { batchNumber: data.batchNumber } : {}),
              ...(data.supplier ? { supplier: data.supplier } : {}),
            }
          : undefined,

      tpmPercent:
        data.tpmPercent !== "" && data.tpmPercent != null
          ? Number(data.tpmPercent)
          : undefined,
      filteredBeforeChange: !!data.filteredBeforeChange,
      colorIndex: data.colorIndex || undefined,
      odorCheck: data.odorCheck || undefined,
      oilBrand: data.oilBrand || undefined,

      qualityNotes: data.qualityNotes || undefined,
      disposalDocumentUrl: data.disposalDocumentUrl || undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/oil-changes/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/oil-changes`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // event live (si la page parent ne le fait pas déjà)
    window.dispatchEvent(
      new CustomEvent("oil-change:upsert", { detail: { doc: saved } })
    );

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Friteuse / Équipement</label>
          <input
            type="text"
            placeholder="ex: fryer-1 / cuisine"
            {...register("fryerId")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Date/heure *</label>
          <input
            type="datetime-local"
            {...register("performedAt")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="w-48">
          <label className="text-sm font-medium">Litres retirés</label>
          <input
            type="number"
            step="0.1"
            placeholder="ex: 12.5"
            {...register("litersRemoved")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">N° lot (huile neuve)</label>
          <input
            type="text"
            placeholder="ex: OIL-2025-07-18-A"
            {...register("batchNumber")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Fournisseur</label>
          <input
            type="text"
            placeholder="Nom du fournisseur"
            {...register("supplier")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      <div className="flex flex-col items-end gap-4 midTablet:flex-row">
        <div className="w-40">
          <label className="text-sm font-medium">% TPM</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            placeholder="ex: 22.5"
            {...register("tpmPercent")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex items-center gap-2 h-[44px]">
          <input
            id="filteredBeforeChange"
            type="checkbox"
            {...register("filteredBeforeChange")}
            className="border rounded"
          />
          <label htmlFor="filteredBeforeChange" className="text-sm font-medium">
            Filtrée avant / pendant le service
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Couleur / Indice</label>
          <input
            type="text"
            placeholder="ex: dorée / ambrée / foncée…"
            {...register("colorIndex")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Odeur</label>
          <input
            type="text"
            placeholder="ex: neutre, ok, rance…"
            {...register("odorCheck")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Marque d’huile</label>
          <input
            type="text"
            placeholder="ex: XYZ ProFry"
            {...register("oilBrand")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      <div className="flex flex-col midTablet:flex-row gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium">Observations qualité</label>
          <textarea
            rows={4}
            {...register("qualityNotes")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
            placeholder="Couleur, odeur, particules, filtrage, seuil TPM, etc."
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">
            Lien doc. élimination (URL)
          </label>
          <input
            type="url"
            placeholder="https://… (BSDA, ticket collecte, etc.)"
            {...register("disposalDocumentUrl")}
            className="border rounded p-2 h-[44px] w-full"
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
              reset(buildFormDefaults(null));
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
