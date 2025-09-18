"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";

export default function ReceptionTemperatureForm({
  restaurantId,
  initial = null, // doc existant pour édition
  onSuccess, // callback après succès
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: initial || {
      value: "",
      unit: "°C",
      packagingCondition: "unknown",
      note: "",
      receptionId: "",
      lineId: "",
      receivedAt: new Date().toISOString().slice(0, 16), // datetime-local
    },
  });

  useEffect(() => {
    if (initial) {
      reset({
        ...initial,
        receivedAt: initial?.receivedAt
          ? new Date(initial.receivedAt).toISOString().slice(0, 16)
          : new Date().toISOString().slice(0, 16),
      });
    }
  }, [initial, reset]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    const payload = {
      ...data,
      // back attend un Date -> convertir le datetime-local (string) en Date
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}/temperature-receptions/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}/temperature-receptions`;

    const method = initial?._id ? "put" : "post";

    await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    reset();
    onSuccess?.();
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4"
    >
      <div>
        <label className="text-sm font-medium">Température</label>
        <input
          type="number"
          step="0.1"
          placeholder="ex: 4.5"
          {...register("value", { required: "Requis" })}
          className="w-full border rounded p-2"
        />
        {errors.value && (
          <p className="text-xs text-red-600 mt-1">{errors.value.message}</p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium">Unité</label>
        <select {...register("unit")} className="w-full border rounded p-2">
          <option value="°C">°C</option>
          <option value="°F">°F</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Date/heure mesure</label>
        <input
          type="datetime-local"
          {...register("receivedAt")}
          className="w-full border rounded p-2"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Condition emballage</label>
        <select
          {...register("packagingCondition")}
          className="w-full border rounded p-2"
        >
          <option value="ok">ok</option>
          <option value="damaged">damaged</option>
          <option value="wet">wet</option>
          <option value="unknown">unknown</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Réception (ID)</label>
        <input
          type="text"
          placeholder="optional: Reception ObjectId"
          {...register("receptionId")}
          className="w-full border rounded p-2"
        />
      </div>

      <div>
        <label className="text-sm font-medium">
          Ligne de réception (lineId)
        </label>
        <input
          type="text"
          placeholder="optional: custom lineId"
          {...register("lineId")}
          className="w-full border rounded p-2"
        />
      </div>

      <div className="md:col-span-3">
        <label className="text-sm font-medium">Note</label>
        <textarea
          rows={2}
          {...register("note")}
          className="w-full border rounded p-2"
          placeholder="Informations complémentaires…"
        />
      </div>

      <div className="md:col-span-3 flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 rounded bg-[#131E36] text-white disabled:opacity-50"
        >
          {initial?._id ? "Mettre à jour" : "Enregistrer"}
        </button>
        {initial?._id && (
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 rounded border"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
