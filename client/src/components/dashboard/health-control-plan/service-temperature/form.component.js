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
    serviceArea: record?.serviceArea ?? "",
    serviceId: record?.serviceId ?? "",
    plateId: record?.plateId ?? "",
    dishName: record?.dishName ?? "",
    servingMode: record?.servingMode ?? "pass",
    serviceType: record?.serviceType ?? "unknown",
    location: record?.location ?? "",
    locationId: record?.locationId ?? "",
    value: record?.value ?? "",
    unit: record?.unit ?? "°C",
    note: record?.note ?? "",
    createdAt: toDatetimeLocalValue(record?.createdAt),
  };
}

export default function ServiceTemperatureForm({
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
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  useEffect(() => {
    reset(buildFormDefaults(initial));
  }, [initial, reset]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      serviceArea: data.serviceArea,
      serviceId: data.serviceId || undefined,
      plateId: data.plateId || undefined,
      dishName: data.dishName || undefined,
      servingMode: data.servingMode || undefined,
      serviceType: data.serviceType || undefined,
      location: data.location || undefined,
      locationId: data.locationId || undefined,
      value: Number(data.value),
      unit: data.unit,
      note: data.note || undefined,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/service-temperatures/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/service-temperatures`;
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
          {/* Ligne 1: Zone + Plat */}
          <div className="flex flex-col gap-2 midTablet:flex-row">
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium">Zone de service *</label>
              <input
                type="text"
                placeholder='ex: "Pass 1", "Salle"'
                {...register("serviceArea", { required: "Requis" })}
                className="border rounded p-2 h-[44px]"
              />
              {errors.serviceArea && (
                <p className="text-xs text-red mt-1">
                  {errors.serviceArea.message}
                </p>
              )}
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium">Plat / préparation</label>
              <input
                type="text"
                placeholder="ex: Lasagnes bœuf, Velouté potimarron…"
                {...register("dishName")}
                className="border rounded p-2 h-[44px]"
              />
            </div>
          </div>

          {/* Ligne 2: Identifiants (service/plat) */}
          <div className="flex flex-col gap-2 midTablet:flex-row">
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium">Identifiant service</label>
              <input
                type="text"
                placeholder="ID service (optionnel)"
                {...register("serviceId")}
                className="border rounded p-2 h-[44px]"
              />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium">Identifiant plat</label>
              <input
                type="text"
                placeholder="ID plat / lot (optionnel)"
                {...register("plateId")}
                className="border rounded p-2 h-[44px]"
              />
            </div>
          </div>

          {/* Ligne 3: Emplacement + Mode/Type */}
          <div className="flex flex-col gap-2 midTablet:flex-row">
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium">Emplacement</label>
              <input
                type="text"
                placeholder="Zone précise (optionnel)"
                {...register("location")}
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

          <div className="flex flex-col gap-2 midTablet:flex-row">
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium">Mode de service</label>
              <select
                {...register("servingMode")}
                className="border rounded p-2 h-[44px]"
              >
                <option value="pass">pass</option>
                <option value="buffet-hot">buffet-hot</option>
                <option value="buffet-cold">buffet-cold</option>
                <option value="table">table</option>
                <option value="delivery">delivery</option>
                <option value="takeaway">takeaway</option>
                <option value="room-service">room-service</option>
                <option value="catering">catering</option>
                <option value="other">other</option>
              </select>
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium">Type de service</label>
              <select
                {...register("serviceType")}
                className="border rounded p-2 h-[44px]"
              >
                <option value="unknown">unknown</option>
                <option value="hot">hot</option>
                <option value="cold">cold</option>
              </select>
            </div>
          </div>

          {/* Mesure */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col w-28">
              <label className="text-sm font-medium">Température *</label>
              <input
                type="number"
                step="0.1"
                placeholder="ex: 63.0"
                onWheel={(e) => e.currentTarget.blur()}
                {...register("value", { required: "Requis" })}
                className="border rounded p-2 h-[44px]"
              />
              {errors.value && (
                <p className="text-xs text-red mt-1">{errors.value.message}</p>
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

          {/* Date/heure */}
          <div className="flex flex-col w-fit">
            <label className="text-sm font-medium">Date/heure mesure</label>
            <input
              type="datetime-local"
              {...register("createdAt")}
              className="border rounded p-2 h-[44px]"
            />
          </div>
        </div>

        {/* Bloc droit: Note */}
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
