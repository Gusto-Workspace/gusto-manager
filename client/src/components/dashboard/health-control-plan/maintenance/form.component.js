"use client";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";

function toDatetimeLocal(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function buildDefaults(rec) {
  return {
    equipment: rec?.equipment ?? "",
    equipmentId: rec?.equipmentId ?? "",
    type: rec?.type ?? "inspection",
    performedAt: toDatetimeLocal(rec?.performedAt ?? new Date()),
    nextDue: toDateValue(rec?.nextDue),
    provider: rec?.provider ?? "",
    notes: rec?.notes ?? "",
    proofUrlsText:
      Array.isArray(rec?.proofUrls) && rec.proofUrls.length
        ? rec.proofUrls.join("\n")
        : "",
  };
}

export default function MaintenanceForm({
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

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  useEffect(() => {
    reset(buildDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    if (!token) return;

    const proofs =
      typeof data.proofUrlsText === "string" && data.proofUrlsText.trim().length
        ? data.proofUrlsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const payload = {
      equipment: data.equipment,
      equipmentId: data.equipmentId || undefined,
      type: data.type || "inspection",
      performedAt: data.performedAt ? new Date(data.performedAt) : new Date(),
      nextDue:
        data.nextDue === "" || data.nextDue == null
          ? null
          : new Date(data.nextDue),
      provider: data.provider || undefined,
      notes: data.notes || undefined,
      proofUrls: proofs,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // live update
    window.dispatchEvent(
      new CustomEvent("maintenance:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Équipement *</label>
          <input
            type="text"
            {...register("equipment", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
            placeholder='ex: "Friteuse 1"'
          />
          {errors.equipment && (
            <p className="text-xs text-red mt-1">{errors.equipment.message}</p>
          )}
        </div>
        <div className="w-full midTablet:w-64">
          <label className="text-sm font-medium">ID interne</label>
          <input
            type="text"
            {...register("equipmentId")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="ex: EQ-001"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="w-full midTablet:w-56">
          <label className="text-sm font-medium">Type</label>
          <select
            {...register("type")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="filter_change">Changement filtre</option>
            <option value="inspection">Inspection</option>
            <option value="repair">Réparation</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div className="w-full midTablet:w-72">
          <label className="text-sm font-medium">Effectué le *</label>
          <input
            type="datetime-local"
            {...register("performedAt", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.performedAt && (
            <p className="text-xs text-red mt-1">
              {errors.performedAt.message}
            </p>
          )}
        </div>
        <div className="w-full midTablet:w-72">
          <label className="text-sm font-medium">Prochaine échéance</label>
          <input
            type="date"
            {...register("nextDue")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* (retiré) ligne Batch / Quantité / Unité */}

      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Prestataire</label>
          <input
            type="text"
            {...register("provider")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="ex: Acme Services"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">
            Preuves (URLs, 1 par ligne)
          </label>
          <textarea
            rows={4}
            {...register("proofUrlsText")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
            placeholder={"https://…/rapport.pdf\nhttps://…/photo.jpg"}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <textarea
          rows={4}
          {...register("notes")}
          className="border rounded p-2 resize-none w-full min-h-[96px]"
          placeholder="Observations, références des pièces, etc."
        />
      </div>

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
