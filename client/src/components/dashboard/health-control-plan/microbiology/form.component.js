"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";

function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function buildDefaults(rec) {
  return {
    // Échantillon
    sampleType: rec?.sampleType ?? "surface", // surface | food | water
    sampledAt: toDatetimeLocal(rec?.sampledAt ?? new Date()),
    analysedAt: toDatetimeLocal(rec?.analysedAt),

    // Identif / contexte
    samplingPoint: rec?.samplingPoint ?? "",
    productName: rec?.productName ?? "",
    lotNumber: rec?.lotNumber ?? "",

    // Labo
    labName: rec?.labName ?? "",
    labReference: rec?.labReference ?? "",

    // Méthode / critère
    method: rec?.method ?? "",
    detectionLimit: rec?.detectionLimit ?? "",
    criterion: rec?.criterion ?? "",

    // Résultats
    parameter: rec?.parameter ?? "",
    result: rec?.result ?? "",
    unit: rec?.unit ?? "",
    passed: typeof rec?.passed === "boolean" ? rec.passed : false,

    // Pièces / notes
    reportUrl: rec?.reportUrl ?? "",
    notes: rec?.notes ?? "",
  };
}

export default function MicrobiologyForm({
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
      // Échantillon
      sampleType: data.sampleType || "surface",
      sampledAt: data.sampledAt ? new Date(data.sampledAt) : new Date(),
      analysedAt: data.analysedAt ? new Date(data.analysedAt) : undefined,

      // Identif / contexte
      samplingPoint: data.samplingPoint || undefined,
      productName: data.productName || undefined,
      lotNumber: data.lotNumber || undefined,

      // Labo
      labName: data.labName || undefined,
      labReference: data.labReference || undefined,

      // Méthode / critère
      method: data.method || undefined,
      detectionLimit: data.detectionLimit || undefined,
      criterion: data.criterion || undefined,

      // Résultats
      parameter: data.parameter || undefined,
      result: data.result || undefined,
      unit: data.unit || undefined,
      passed: !!data.passed,

      // Pièces / notes
      reportUrl: data.reportUrl || undefined,
      notes: data.notes || undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/microbiology/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/microbiology`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("microbiology:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      {/* Ligne 1 : Échantillon */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="w-full mobile:w-56">
          <label className="text-sm font-medium">Type d’échantillon *</label>
          <select
            {...register("sampleType", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="surface">Surface</option>
            <option value="food">Aliment</option>
            <option value="water">Eau</option>
          </select>
          {errors.sampleType && (
            <p className="text-xs text-red mt-1">{errors.sampleType.message}</p>
          )}
        </div>
        <div className="w-full mobile:w-72">
          <label className="text-sm font-medium">Prélevé le *</label>
          <input
            type="datetime-local"
            {...register("sampledAt", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.sampledAt && (
            <p className="text-xs text-red mt-1">{errors.sampledAt.message}</p>
          )}
        </div>
        <div className="w-full mobile:w-72">
          <label className="text-sm font-medium">Analysé le</label>
          <input
            type="datetime-local"
            {...register("analysedAt")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* Ligne 2 : Identification / Contexte */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium">
            Point de prélèvement / Surface
          </label>
          <input
            type="text"
            {...register("samplingPoint")}
            className="border rounded p-2 h-[44px] w-full"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium">Produit (si Aliment)</label>
          <input
            type="text"
            {...register("productName")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Ex: Tiramisu"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="w-full mobile:w-48">
          <label className="text-sm font-medium">Lot</label>
          <input
            type="text"
            {...register("lotNumber")}
            className="border rounded p-2 h-[44px] w-full"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 3 : Labo */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium">Laboratoire</label>
          <input
            type="text"
            {...register("labName")}
            className="border rounded p-2 h-[44px] w-full"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium">Référence labo</label>
          <input
            type="text"
            {...register("labReference")}
            className="border rounded p-2 h-[44px] w-full"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 4 : Méthode / Critère */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium">Méthode</label>
          <input
            type="text"
            {...register("method")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Ex: ISO 6579-1"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="w-full mobile:w-48">
          <label className="text-sm font-medium">Limite de détection</label>
          <input
            type="text"
            {...register("detectionLimit")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="<10"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium">Critère de conformité</label>
          <input
            type="text"
            {...register("criterion")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Ex: Absence/25g"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 5 : Paramètre & Résultat */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium">Paramètre</label>
          <input
            type="text"
            {...register("parameter")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Ex: Listeria monocytogenes"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="w-full mobile:w-56">
          <label className="text-sm font-medium">Résultat</label>
          <input
            type="text"
            {...register("result")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="<10 / absent"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="w-full mobile:w-48">
          <label className="text-sm font-medium">Unité</label>
          <input
            type="text"
            {...register("unit")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="CFU/g, abs/25g, …"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="w-full mobile:w-56 flex items-center gap-2">
          <input id="passed" type="checkbox" {...register("passed")} />
          <label htmlFor="passed" className="text-sm font-medium">
            Conforme
          </label>
        </div>
      </div>

      {/* Rapport / Notes */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium">Rapport (URL)</label>
          <input
            type="url"
            {...register("reportUrl")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="https://…/rapport.pdf"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium">Notes</label>
          <textarea
            rows={4}
            {...register("notes")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
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
