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
    deviceIdentifier: rec?.deviceIdentifier ?? "",
    deviceType: rec?.deviceType ?? "",
    calibratedAt: toDatetimeLocal(rec?.calibratedAt ?? new Date()),
    nextCalibrationDue: toDateValue(rec?.nextCalibrationDue),
    method: rec?.method ?? "",
    certificateUrl: rec?.certificateUrl ?? "",
    provider: rec?.provider ?? "",
    notes: rec?.notes ?? "",
  };
}

export default function CalibrationsForm({
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
    () => (typeof window !== "undefined" ? localStorage.getItem("token") : null),
    []
  );

  useEffect(() => {
    reset(buildDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    if (!token) return;

    const payload = {
      deviceIdentifier: data.deviceIdentifier,
      deviceType: data.deviceType || undefined,
      calibratedAt: data.calibratedAt ? new Date(data.calibratedAt) : new Date(),
      nextCalibrationDue: data.nextCalibrationDue
        ? new Date(data.nextCalibrationDue)
        : undefined,
      method: data.method || undefined,
      certificateUrl: data.certificateUrl || undefined,
      provider: data.provider || undefined,
      notes: data.notes || undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/calibrations/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/calibrations`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // live update
    window.dispatchEvent(
      new CustomEvent("calibrations:upsert", { detail: { doc: saved } })
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
          <label className="text-sm font-medium">Identifiant appareil *</label>
          <input
            type="text"
            {...register("deviceIdentifier", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="ex: THERMO-001 / SONDE-12A"
          />
          {errors.deviceIdentifier && (
            <p className="text-xs text-red mt-1">
              {errors.deviceIdentifier.message}
            </p>
          )}
        </div>
        <div className="w-full midTablet:w-64">
          <label className="text-sm font-medium">Type</label>
          <input
            type="text"
            {...register("deviceType")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder='ex: "thermometer"'
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="w-full midTablet:w-72">
          <label className="text-sm font-medium">Calibré le *</label>
          <input
            type="datetime-local"
            {...register("calibratedAt", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.calibratedAt && (
            <p className="text-xs text-red mt-1">{errors.calibratedAt.message}</p>
          )}
        </div>
        <div className="w-full midTablet:w-72">
          <label className="text-sm font-medium">Prochaine échéance</label>
          <input
            type="date"
            {...register("nextCalibrationDue")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Méthode</label>
          <input
            type="text"
            {...register("method")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder='ex: "ice point", "wet bath"'
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Fournisseur</label>
          <input
            type="text"
            {...register("provider")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="ex: Acme Labs"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Certificat (URL)</label>
          <input
            type="url"
            {...register("certificateUrl")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="https://…/certificat.pdf"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <textarea
          rows={4}
          {...register("notes")}
          className="border rounded p-2 resize-none w-full min-h-[96px]"
          placeholder="Observations, numéro de certificat, etc."
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
