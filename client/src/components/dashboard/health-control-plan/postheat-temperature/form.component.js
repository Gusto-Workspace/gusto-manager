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
    location: record?.location ?? "",
    equipmentId: record?.equipmentId ?? "",
    locationId: record?.locationId ?? "",
    value: record?.value ?? "",
    unit: record?.unit ?? "°C",
    phase: record?.phase ?? "postheat",
    note: record?.note ?? "",
    createdAt: toDatetimeLocalValue(record?.createdAt),
  };
}

export default function PostheatTemperatureForm({
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
  } = useForm({
    defaultValues: buildFormDefaults(initial),
  });

  useEffect(() => {
    reset(buildFormDefaults(initial));
  }, [initial, reset]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      location: data.location,
      equipmentId: data.equipmentId || undefined,
      locationId: data.locationId || undefined,
      value: Number(data.value),
      unit: data.unit,
      phase: data.phase || "postheat",
      note: data.note || undefined,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/postheat-temperatures/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/postheat-temperatures`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      <div className="flex flex-col midTablet:flex-row justify-between gap-4">
        {/* Bloc gauche */}
        <div className="flex flex-col gap-4 w-full">
          {/* Ligne 1 : Emplacement */}
          <div className="flex flex-col gap-2 midTablet:flex-row">
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium">Emplacement *</label>
              <input
                type="text"
                placeholder='ex: "Four 1", "Friteuse 1"'
                autoComplete="on"
                {...register("location", { required: "Requis" })}
                className="border rounded p-2 h-[44px]"
              />
              {errors.location && (
                <p className="text-xs text-red mt-1">
                  {errors.location.message}
                </p>
              )}
            </div>
          </div>

          {/* Ligne 2 : Identifiants */}
          <div className="flex flex-col gap-2 midTablet:flex-row">
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium">Identifiant interne</label>
              <input
                type="text"
                placeholder="ID équipement (optionnel)"
                {...register("equipmentId")}
                className="border rounded p-2 h-[44px]"
              />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium">
                Identifiant emplacement
              </label>
              <input
                type="text"
                placeholder="ID emplacement (optionnel)"
                {...register("locationId")}
                className="border rounded p-2 h-[44px]"
              />
            </div>
          </div>

          {/* Ligne 3 : Mesure + phase + date */}
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <div className="flex flex-col w-28">
                <label className="text-sm font-medium">Température *</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="ex: 65"
                  {...register("value", { required: "Requis" })}
                  className="border rounded p-2 h-[44px]"
                />
                {errors.value && (
                  <p className="text-xs text-red mt-1">
                    {errors.value.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col w-fit">
                <label className="text-sm font-medium">Unité</label>
                <select
                  {...register("unit")}
                  className="border rounded p-2 h-[44px]"
                >
                  <option value="°C">°C</option>
                  <option value="°F">°F</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col w-[220px]">
              <label className="text-sm font-medium">Phase</label>
              <select
                {...register("phase")}
                className="border rounded p-2 h-[44px]"
              >
                <option value="postheat">Sortie de chauffe</option>
                <option value="hot-holding">Maintien au chaud</option>
                <option value="serving">Service</option>
              </select>
            </div>

            <div className="flex flex-col w-[240px]">
              <label className="text-sm font-medium">Date/heure mesure</label>
              <input
                type="datetime-local"
                {...register("createdAt")}
                className="border rounded p-2"
              />
            </div>
          </div>
        </div>

        {/* Bloc droit (Note) */}
        <div className="flex flex-col w-full">
          <label className="text-sm font-medium">Note</label>
          <textarea
            rows={4}
            {...register("note")}
            className="border rounded p-2 resize-none h-full min-h-[96px]"
            placeholder="Informations complémentaires…"
          />
        </div>
      </div>

      <div className="flex gap-2 ">
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
